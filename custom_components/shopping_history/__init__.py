"""The Shopping History integration."""
import sqlite3
import os
import logging
import voluptuous as vol
from datetime import timedelta
import homeassistant.util.dt as dt_util
from dateutil.relativedelta import relativedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, CoreState
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.loader import async_get_integration

# --- THÊM CÁC IMPORT CHO GIAO DIỆN UI LÊN LOVELACE ---
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.lovelace.resources import ResourceStorageCollection

from .const import DOMAIN, CONF_FRIENDLY_NAME, SIGNAL_UPDATE_SENSORS

_LOGGER = logging.getLogger(__name__)

# Khai báo đường dẫn ảo trên web và thư mục thực tế chứa UI thẻ Card
UI_URL_BASE = "/shopping_history_ui"
UI_DIR_PATH = "frontend"

# --- VALIDATE DỮ LIỆU ĐẦU VÀO ---
SERVICE_ADD_ORDER_SCHEMA = vol.Schema({
    vol.Required("entry_id"): cv.string,
    vol.Required("name"): cv.string,
    vol.Required("place"): cv.string,
    vol.Required("category"): cv.string,
    vol.Required("price"): vol.Coerce(float),
    vol.Required("quantity"): vol.Coerce(float),
    vol.Optional("vat", default=0): vol.Coerce(float),
    vol.Required("status"): cv.string,
    vol.Optional("model", default=""): cv.string,
    vol.Optional("manufacturer", default=""): cv.string,
    vol.Optional("warranty_months", default=0): vol.Coerce(int),
    vol.Optional("purchase_date"): cv.string,
})

SERVICE_DELETE_ORDER_SCHEMA = vol.Schema({
    vol.Required("entry_id"): cv.string,
    vol.Required("order_id"): vol.Coerce(int),
})

# =========================================================
# HÀM TỰ ĐỘNG THÊM THẺ VÀO LOVELACE RESOURCES (ĐÃ NÂNG CẤP)
# =========================================================
async def init_resource(hass: HomeAssistant, url: str, ver: str) -> None:
    """Đảm bảo Resource được đăng ký vào Lovelace một cách an toàn và triệt để."""
    url_with_version = f"{url}?hacstag={ver}"

    # 1. Luôn chèn tạm thời vào session hiện tại (Tác dụng tức thì, hỗ trợ cả YAML mode)
    add_extra_js_url(hass, url_with_version)

    # 2. Hàm đăng ký vĩnh viễn vào Database của Lovelace (Storage Mode)
    async def _register_resource(*args):
        lovelace = hass.data.get("lovelace")
        if not lovelace:
            _LOGGER.debug("Lovelace không được tìm thấy, bỏ qua đăng ký Storage.")
            return

        resources = getattr(lovelace, "resources", None) or lovelace.get("resources")
        if not isinstance(resources, ResourceStorageCollection):
            _LOGGER.debug("Lovelace đang ở chế độ YAML, không thể ghi vào Storage.")
            return

        # Đảm bảo Resource collection đã được load từ file storage
        if not resources.loaded:
            await resources.async_load()

        for item in resources.async_items():
            item_url = item.get("url", "")
            base_url = item_url.split("?")[0]
            
            # Nếu URL đã tồn tại
            if base_url == url:
                # Nếu version khác (bản cập nhật mới) thì tiến hành Update
                if item_url != url_with_version:
                    _LOGGER.info(f"Cập nhật version Lovelace resource: {url_with_version}")
                    await resources.async_update_item(item["id"], {"res_type": "module", "url": url_with_version})
                return # Thoát hàm nếu đã có (hoặc đã cập nhật)

        # Nếu quét xong không thấy URL này, tiến hành tạo mới
        _LOGGER.info(f"Thêm mới Lovelace resource: {url_with_version}")
        await resources.async_create_item({"res_type": "module", "url": url_with_version})

    # 3. Kích hoạt đúng thời điểm:
    # Nếu HA đã khởi động xong thì chạy luôn, nếu chưa thì đợi Event Started
    if hass.state == CoreState.running:
        await _register_resource()
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _register_resource)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Thiết lập Global cho Integration (Chứa Service xử lý chung)."""
    
    # --- ĐĂNG KÝ WEB URL TĨNH CHO UI CARD ---
    await hass.http.async_register_static_paths([
        StaticPathConfig(
            UI_URL_BASE,
            hass.config.path("custom_components", DOMAIN, UI_DIR_PATH),
            False
        )
    ])
    
    # ------------------------------------------------------------------
    # 1. SERVICE: THÊM ĐƠN HÀNG (ADD ORDER)
    # ------------------------------------------------------------------
    async def handle_add_order(call: ServiceCall):
        entry_id = call.data.get("entry_id")
        
        entry_data = hass.data.get(DOMAIN, {}).get(entry_id)
        if not entry_data:
            _LOGGER.error(f"Không tìm thấy cấu hình Shopping History cho Entry ID: {entry_id}")
            return

        db_path = entry_data["db_path"]
        data = call.data
        
        if data.get("purchase_date"):
            purchase_dt = dt_util.parse_date(data["purchase_date"])
        else:
            purchase_dt = dt_util.now().date()
        
        y, m, d = purchase_dt.year, purchase_dt.month, purchase_dt.day
        date_str = purchase_dt.strftime("%Y-%m-%d")

        total_pre_tax = data["price"] * data["quantity"]
        vat_amt = total_pre_tax * (data["vat"] / 100) if data["vat"] > 0 else 0
        total_post_tax = total_pre_tax + vat_amt

        warranty_end_str = ""
        if data["warranty_months"] > 0:
            end_date = purchase_dt + relativedelta(months=data["warranty_months"])
            warranty_end_str = end_date.strftime("%Y-%m-%d")

        def db_insert_work():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO purchases (
                    ngay_mua, nam, thang, ngay, 
                    ten_hang, noi_mua, so_luong, don_gia, thanh_tien, 
                    vat_percent, tien_vat, thanh_tien_sau_vat, 
                    model, tinh_trang, nganh_hang, hang_sx, 
                    thoi_gian_bh_thang, ngay_het_bh
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                date_str, y, m, d,
                data["name"], data["place"], data["quantity"], data["price"], total_pre_tax,
                data["vat"], vat_amt, total_post_tax,
                data["model"], data["status"], data["category"], data["manufacturer"],
                data["warranty_months"], warranty_end_str
            ))

            cursor.execute("SELECT COUNT(*), SUM(so_luong), SUM(thanh_tien_sau_vat) FROM purchases WHERE nam=? AND thang=?", (y, m))
            m_res = cursor.fetchone()
            cursor.execute("INSERT OR REPLACE INTO monthly_stats VALUES (?, ?, ?, ?, ?)", (y, m, m_res[0] or 0, m_res[1] or 0, m_res[2] or 0))

            cursor.execute("SELECT COUNT(*), SUM(so_luong), SUM(thanh_tien_sau_vat) FROM purchases WHERE nam=?", (y,))
            y_res = cursor.fetchone()
            cursor.execute("INSERT OR REPLACE INTO yearly_stats VALUES (?, ?, ?, ?)", (y, y_res[0] or 0, y_res[1] or 0, y_res[2] or 0))

            cat = data["category"]
            cursor.execute("SELECT SUM(so_luong), SUM(thanh_tien_sau_vat) FROM purchases WHERE nganh_hang=?", (cat,))
            c_res = cursor.fetchone()
            cursor.execute("INSERT OR REPLACE INTO category_stats VALUES (?, ?, ?)", (cat, c_res[0] or 0, c_res[1] or 0))

            cursor.execute("SELECT COUNT(*), SUM(so_luong), SUM(thanh_tien_sau_vat) FROM purchases")
            g_res = cursor.fetchone()
            cursor.execute("DELETE FROM grand_total")
            cursor.execute("INSERT INTO grand_total VALUES (1, ?, ?, ?)", (g_res[0] or 0, g_res[1] or 0, g_res[2] or 0))

            conn.commit()
            conn.close()

        await hass.async_add_executor_job(db_insert_work)
        _LOGGER.info(f"Đã thêm đơn hàng mới vào DB: {db_path}")
        async_dispatcher_send(hass, f"{SIGNAL_UPDATE_SENSORS}_{entry_id}")

    # ------------------------------------------------------------------
    # 2. SERVICE: XÓA ĐƠN HÀNG (DELETE ORDER)
    # ------------------------------------------------------------------
    async def handle_delete_order(call: ServiceCall):
        entry_id = call.data.get("entry_id")
        
        entry_data = hass.data.get(DOMAIN, {}).get(entry_id)
        if not entry_data:
            _LOGGER.error(f"Không tìm thấy cấu hình Shopping History cho Entry ID: {entry_id}")
            return

        db_path = entry_data["db_path"]
        order_id = call.data["order_id"]

        def db_delete_work():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            cursor.execute("SELECT nam, thang, nganh_hang FROM purchases WHERE id=?", (order_id,))
            row = cursor.fetchone()
            
            if not row:
                conn.close()
                _LOGGER.warning(f"Không tìm thấy đơn hàng ID: {order_id} để xóa.")
                return

            y, m, cat = row[0], row[1], row[2]

            cursor.execute("DELETE FROM purchases WHERE id=?", (order_id,))

            cursor.execute("SELECT COUNT(*), SUM(so_luong), SUM(thanh_tien_sau_vat) FROM purchases WHERE nam=? AND thang=?", (y, m))
            m_res = cursor.fetchone()
            cursor.execute("INSERT OR REPLACE INTO monthly_stats VALUES (?, ?, ?, ?, ?)", (y, m, m_res[0] or 0, m_res[1] or 0, m_res[2] or 0))

            cursor.execute("SELECT COUNT(*), SUM(so_luong), SUM(thanh_tien_sau_vat) FROM purchases WHERE nam=?", (y,))
            y_res = cursor.fetchone()
            cursor.execute("INSERT OR REPLACE INTO yearly_stats VALUES (?, ?, ?, ?)", (y, y_res[0] or 0, y_res[1] or 0, y_res[2] or 0))

            if cat:
                cursor.execute("SELECT SUM(so_luong), SUM(thanh_tien_sau_vat) FROM purchases WHERE nganh_hang=?", (cat,))
                c_res = cursor.fetchone()
                cursor.execute("INSERT OR REPLACE INTO category_stats VALUES (?, ?, ?)", (cat, c_res[0] or 0, c_res[1] or 0))

            cursor.execute("SELECT COUNT(*), SUM(so_luong), SUM(thanh_tien_sau_vat) FROM purchases")
            g_res = cursor.fetchone()
            cursor.execute("DELETE FROM grand_total")
            cursor.execute("INSERT INTO grand_total VALUES (1, ?, ?, ?)", (g_res[0] or 0, g_res[1] or 0, g_res[2] or 0))

            conn.commit()
            conn.close()

        await hass.async_add_executor_job(db_delete_work)
        _LOGGER.info(f"Đã xóa đơn hàng {order_id} khỏi DB: {db_path}")
        async_dispatcher_send(hass, f"{SIGNAL_UPDATE_SENSORS}_{entry_id}")

    hass.services.async_register(DOMAIN, "add_order", handle_add_order, schema=SERVICE_ADD_ORDER_SCHEMA)
    hass.services.async_register(DOMAIN, "delete_order", handle_delete_order, schema=SERVICE_DELETE_ORDER_SCHEMA)

    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Thiết lập cho từng 'bộ' (Instance) Lịch sử mua sắm."""
    
    # ---------------------------------------------------------
    # AUTO CACHE BUSTING KẾT HỢP MANIFEST FALLBACK (Dành cho thẻ UI)
    # ---------------------------------------------------------
    # Sử dụng async_get_integration để lấy chính xác thông tin từ manifest
    integration = await async_get_integration(hass, DOMAIN)
    fallback_version = integration.version if integration and integration.version else "1.0"
    
    def get_file_version(file_name, fallback):
        try:
            file_path = hass.config.path("custom_components", DOMAIN, UI_DIR_PATH, file_name)
            return str(int(os.path.getmtime(file_path)))
        except Exception as e:
            _LOGGER.warning(f"Không thể đọc file {file_name} để tạo hacstag ({e}). Dùng version dự phòng: {fallback}")
            return fallback

    ver_card = await hass.async_add_executor_job(
        get_file_version, "shopping-history-card.js", fallback_version
    )

    await init_resource(hass, f"{UI_URL_BASE}/shopping-history-card.js", ver_card)
    # ---------------------------------------------------------

    # --- CẤU HÌNH ĐƯỜNG DẪN AN TOÀN ---
    storage_dir = hass.config.path("shopping_history")
    
    def create_dir():
        os.makedirs(storage_dir, exist_ok=True)
    await hass.async_add_executor_job(create_dir)

    # File DB riêng biệt cho từng entry_id
    db_path = os.path.join(storage_dir, f"shopping_data_{entry.entry_id}.db")
    
    hass.data.setdefault(DOMAIN, {})
    # Lưu path vào bộ nhớ chung để Service ở trên có thể truy xuất
    hass.data[DOMAIN][entry.entry_id] = {"db_path": db_path}

    _LOGGER.info(f"Shopping History Database stored at: {db_path}")

    # --- HÀM KHỞI TẠO DATABASE (Nếu chưa có) ---
    def init_db():
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS purchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ngay_mua TEXT,
                nam INTEGER, thang INTEGER, ngay INTEGER,
                ten_hang TEXT,
                noi_mua TEXT,
                so_luong REAL,
                don_gia REAL,
                thanh_tien REAL,
                vat_percent REAL,
                tien_vat REAL,
                thanh_tien_sau_vat REAL,
                model TEXT,
                tinh_trang TEXT,
                nganh_hang TEXT,
                hang_sx TEXT,
                thoi_gian_bh_thang INTEGER,
                ngay_het_bh TEXT
            )
        """)
        
        try:
            cursor.execute("PRAGMA table_info(purchases)")
            columns = [info[1] for info in cursor.fetchall()]
            if "noi_mua" not in columns:
                cursor.execute("ALTER TABLE purchases ADD COLUMN noi_mua TEXT DEFAULT 'Không rõ'")
        except Exception as e:
            _LOGGER.error(f"Migration Error: {e}")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS monthly_stats (
                nam INTEGER, thang INTEGER,
                tong_don_hang INTEGER, tong_so_luong REAL, tong_tien_sau_vat REAL,
                PRIMARY KEY (nam, thang)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS yearly_stats (
                nam INTEGER,
                tong_don_hang INTEGER, tong_so_luong REAL, tong_tien_sau_vat REAL,
                PRIMARY KEY (nam)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS category_stats (
                nganh_hang TEXT, tong_so_luong REAL, tong_tien_sau_vat REAL,
                PRIMARY KEY (nganh_hang)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS grand_total (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                tong_so_lan_mua INTEGER, tong_so_luong_hang REAL, tong_tien_sau_vat REAL
            )
        """)
        
        conn.commit()
        conn.close()

    await hass.async_add_executor_job(init_db)

    # Khởi tạo Sensor Platform
    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
    
    # Đăng ký listener khi thay đổi cấu hình
    entry.async_on_unload(entry.add_update_listener(update_listener))
    
    return True

async def update_listener(hass: HomeAssistant, entry: ConfigEntry):
    await hass.config_entries.async_reload(entry.entry_id)

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if entry.entry_id in hass.data[DOMAIN]:
        hass.data[DOMAIN].pop(entry.entry_id)
    return await hass.config_entries.async_unload_platforms(entry, ["sensor"])
