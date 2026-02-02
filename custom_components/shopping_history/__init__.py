"""The Shopping History integration."""
import sqlite3
import os
import logging
import voluptuous as vol
from datetime import timedelta
import homeassistant.util.dt as dt_util
from dateutil.relativedelta import relativedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN, CONF_FRIENDLY_NAME, SIGNAL_UPDATE_SENSORS

_LOGGER = logging.getLogger(__name__)

# --- SCHEMAS ---
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

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Thiết lập Global (Service chung)."""
    
    # --- 1. HANDLE ADD ORDER ---
    async def handle_add_order(call: ServiceCall):
        entry_id = call.data.get("entry_id")
        
        # Lấy thông tin DB từ bộ nhớ chung dựa trên entry_id gửi lên
        entry_data = hass.data.get(DOMAIN, {}).get(entry_id)
        if not entry_data:
            _LOGGER.error(f"Không tìm thấy cấu hình cho Entry ID: {entry_id}")
            return

        db_path = entry_data["db_path"]
        data = call.data
        
        # Xử lý ngày tháng
        if data.get("purchase_date"):
            purchase_dt = dt_util.parse_date(data["purchase_date"])
        else:
            purchase_dt = dt_util.now().date()
        
        y, m, d = purchase_dt.year, purchase_dt.month, purchase_dt.day
        date_str = purchase_dt.strftime("%Y-%m-%d")

        # Tính toán tiền
        total_pre_tax = data["price"] * data["quantity"]
        vat_amt = total_pre_tax * (data["vat"] / 100) if data["vat"] > 0 else 0
        total_post_tax = total_pre_tax + vat_amt

        # Xử lý bảo hành
        warranty_end_str = ""
        if data["warranty_months"] > 0:
            end_date = purchase_dt + relativedelta(months=data["warranty_months"])
            warranty_end_str = end_date.strftime("%Y-%m-%d")

        def db_insert_work():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            # Insert Purchase
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

            # Recalculate Stats
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
        _LOGGER.info(f"Đã thêm đơn hàng mới vào {db_path}")
        
        # Gửi tín hiệu cập nhật sensor cho đúng entry_id
        async_dispatcher_send(hass, f"{SIGNAL_UPDATE_SENSORS}_{entry_id}")

    # --- 2. HANDLE DELETE ORDER ---
    async def handle_delete_order(call: ServiceCall):
        entry_id = call.data.get("entry_id")
        
        entry_data = hass.data.get(DOMAIN, {}).get(entry_id)
        if not entry_data:
            _LOGGER.error(f"Không tìm thấy cấu hình cho Entry ID: {entry_id}")
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

            # Recalculate Logic (Giữ nguyên như cũ)
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
        _LOGGER.info(f"Đã xóa đơn hàng {order_id} khỏi {db_path}")
        async_dispatcher_send(hass, f"{SIGNAL_UPDATE_SENSORS}_{entry_id}")

    # Đăng ký service một lần duy nhất tại đây
    hass.services.async_register(DOMAIN, "add_order", handle_add_order, schema=SERVICE_ADD_ORDER_SCHEMA)
    hass.services.async_register(DOMAIN, "delete_order", handle_delete_order, schema=SERVICE_DELETE_ORDER_SCHEMA)

    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Thiết lập cho từng Instance (Mỗi khi user thêm 1 bộ theo dõi)."""
    storage_dir = hass.config.path("shopping_history")
    
    if not os.path.exists(storage_dir):
        await hass.async_add_executor_job(os.makedirs, storage_dir)

    db_path = os.path.join(storage_dir, f"shopping_data_{entry.entry_id}.db")
    
    hass.data.setdefault(DOMAIN, {})
    # Lưu path vào hass.data để Service ở trên có thể lấy ra dùng
    hass.data[DOMAIN][entry.entry_id] = {"db_path": db_path}

    _LOGGER.info(f"Shopping History khởi tạo Database tại: {db_path}")

    # Hàm init DB giữ nguyên, chạy 1 lần khi load entry
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
        
        # Migration
        try:
            cursor.execute("PRAGMA table_info(purchases)")
            columns = [info[1] for info in cursor.fetchall()]
            if "noi_mua" not in columns:
                cursor.execute("ALTER TABLE purchases ADD COLUMN noi_mua TEXT DEFAULT 'Không rõ'")
        except Exception as e:
            _LOGGER.error(f"Migration Error: {e}")

        # Stats Tables
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
    
    # Thiết lập Sensor platform
    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
    
    # Lắng nghe sự kiện reload
    entry.async_on_unload(entry.add_update_listener(update_listener))
    
    return True

async def update_listener(hass: HomeAssistant, entry: ConfigEntry):
    await hass.config_entries.async_reload(entry.entry_id)

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Khi unload, có thể xóa key trong hass.data để dọn dẹp (tuỳ chọn)
    if entry.entry_id in hass.data[DOMAIN]:
        hass.data[DOMAIN].pop(entry.entry_id)
    return await hass.config_entries.async_unload_platforms(entry, ["sensor"])
