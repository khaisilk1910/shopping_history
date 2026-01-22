"""Sensor platform for Shopping History."""
import sqlite3
import os
import logging
from homeassistant.components.sensor import (
    SensorEntity,
    SensorDeviceClass,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from .const import DOMAIN, SIGNAL_UPDATE_SENSORS

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback):
    """Set up the sensor platform."""
    # Lấy đúng đường dẫn DB theo entry_id
    db_path = hass.data[DOMAIN][entry.entry_id]["db_path"]
    friendly_name = entry.data.get("friendly_name", "Shopping History")
    
    # Các tập hợp để theo dõi những gì đã được tạo sensor
    known_years = set()
    known_months = set()      
    known_year_cats = set()   # (year, category)
    known_year_places = set() # (year, place)

    # Luôn tạo Sensor Tổng (Global)
    async_add_entities([ShoppingGrandTotalSensor(db_path, f"{friendly_name} Tổng Cộng", entry.entry_id)])

    # --- HÀM QUÉT VÀ TẠO SENSOR MỚI (Dynamic) ---
    async def check_and_add_new_entities():
        if not os.path.exists(db_path): return

        def get_all_keys():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # 1. Lấy danh sách Năm và Tháng
            cursor.execute("SELECT DISTINCT nam FROM yearly_stats")
            db_years = {r[0] for r in cursor.fetchall()}
            
            cursor.execute("SELECT nam, thang FROM monthly_stats")
            db_months = {(r[0], r[1]) for r in cursor.fetchall()}
            
            # 2. Lấy danh sách (Năm, Ngành hàng)
            cursor.execute("SELECT DISTINCT nam, nganh_hang FROM purchases WHERE nganh_hang IS NOT NULL AND nganh_hang != ''")
            db_year_cats = {(r[0], r[1]) for r in cursor.fetchall()}

            # 3. Lấy danh sách (Năm, Nơi mua)
            cursor.execute("SELECT DISTINCT nam, noi_mua FROM purchases WHERE noi_mua IS NOT NULL AND noi_mua != ''")
            db_year_places = {(r[0], r[1]) for r in cursor.fetchall()}

            conn.close()
            return db_years, db_months, db_year_cats, db_year_places

        db_years, db_months, db_year_cats, db_year_places = await hass.async_add_executor_job(get_all_keys)
        new_entities = []

        # 1. Tạo sensor Năm
        for year in db_years:
            if year not in known_years:
                new_entities.append(ShoppingYearlySensor(db_path, f"{friendly_name} Năm {year}", year, entry.entry_id))
                known_years.add(year)
        
        # 2. Tạo sensor Tháng
        for y, m in db_months:
            if (y, m) not in known_months:
                new_entities.append(ShoppingMonthlySensor(db_path, f"{friendly_name} Tháng {m}/{y}", y, m, entry.entry_id))
                known_months.add((y, m))

        # 3. Tạo sensor Ngành hàng THEO NĂM (Đã bỏ dấu "-")
        for y, cat in db_year_cats:
            if (y, cat) not in known_year_cats:
                # Tên mới: Tên Gốc + Ngành Hàng + Năm (Ví dụ: Lịch Sử Mua Sắm Điện tử 2026)
                new_entities.append(ShoppingCategorySensor(db_path, f"{friendly_name} {cat} {y}", cat, y, entry.entry_id))
                known_year_cats.add((y, cat))

        # 4. Tạo sensor Nơi mua THEO NĂM (Đã bỏ dấu "-")
        for y, place in db_year_places:
            if (y, place) not in known_year_places:
                # Tên mới: Tên Gốc + Nơi Mua + Năm (Ví dụ: Lịch Sử Mua Sắm Shopee 2026)
                new_entities.append(ShoppingPlaceSensor(db_path, f"{friendly_name} {place} {y}", place, y, entry.entry_id))
                known_year_places.add((y, place))

        if new_entities:
            async_add_entities(new_entities)

    # Chạy lần đầu
    await check_and_add_new_entities()

    # Đăng ký nhận tín hiệu để check lại khi có dữ liệu mới
    entry.async_on_unload(
        async_dispatcher_connect(hass, f"{SIGNAL_UPDATE_SENSORS}_{entry.entry_id}", check_and_add_new_entities)
    )

# --- SENSOR CLASSES ---
class ShoppingBase(SensorEntity):
    _attr_has_entity_name = False
    
    def __init__(self, db_path, name, entry_id):
        self._db_path = db_path
        self._attr_name = name
        self._entry_id = entry_id
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry_id)},
            "name": entry_id,
            "manufacturer": "Custom Integration",
        }

    async def async_added_to_hass(self):
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(self.hass, f"{SIGNAL_UPDATE_SENSORS}_{self._entry_id}", self._force_update_callback)
        )

    @callback
    def _force_update_callback(self, *args):
        self.async_schedule_update_ha_state(True)

    def _process_details(self, items):
        """Hàm hỗ trợ: Chuyển đổi item sang dict và XÓA ID."""
        results = []
        for item in items:
            d = dict(item)
            d.pop("id", None)  # Xóa ID
            results.append(d)
        return results

class ShoppingGrandTotalSensor(ShoppingBase):
    """Sensor tổng hợp toàn bộ lịch sử (Global)."""
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_native_unit_of_measurement = "đ"
    _attr_icon = "mdi:cart-outline"

    def __init__(self, db_path, name, entry_id):
        super().__init__(db_path, name, entry_id)
        self._attr_unique_id = f"{entry_id}_grand_total"

    def update(self):
        if not os.path.exists(self._db_path): return
        try:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT tong_so_lan_mua, tong_so_luong_hang, tong_tien_sau_vat FROM grand_total WHERE id=1")
            row = cursor.fetchone()
            conn.close()
            
            if row:
                self._attr_native_value = int(row["tong_tien_sau_vat"])
                self._attr_extra_state_attributes = {
                    "tong_so_don_hang": row["tong_so_lan_mua"],
                    "tong_so_luong_san_pham": row["tong_so_luong_hang"],
                    "tong_tien": row["tong_tien_sau_vat"]
                }
            else:
                self._attr_native_value = 0
                self._attr_extra_state_attributes = {}
        except: 
            self._attr_native_value = 0

class ShoppingYearlySensor(ShoppingBase):
    """Sensor thống kê theo năm."""
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_native_unit_of_measurement = "đ"
    _attr_icon = "mdi:calendar-range"

    def __init__(self, db_path, name, year, entry_id):
        super().__init__(db_path, name, entry_id)
        self._year = year
        self._attr_unique_id = f"{entry_id}_year_{year}"

    def update(self):
        if not os.path.exists(self._db_path): return
        try:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT tong_don_hang, tong_so_luong, tong_tien_sau_vat FROM yearly_stats WHERE nam=?", (self._year,))
            row = cursor.fetchone()
            conn.close()

            if row:
                self._attr_native_value = int(row["tong_tien_sau_vat"])
                self._attr_extra_state_attributes = {
                    "nam": self._year,
                    "tong_don_hang": row["tong_don_hang"],
                    "tong_so_luong": row["tong_so_luong"],
                    "tong_tien": row["tong_tien_sau_vat"]
                }
            else: 
                self._attr_native_value = 0
                self._attr_extra_state_attributes = {}
        except: 
            self._attr_native_value = 0

class ShoppingMonthlySensor(ShoppingBase):
    """Sensor thống kê theo tháng."""
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_native_unit_of_measurement = "đ"
    _attr_icon = "mdi:calendar-month"

    def __init__(self, db_path, name, year, month, entry_id):
        super().__init__(db_path, name, entry_id)
        self._year = year
        self._month = month
        self._attr_unique_id = f"{entry_id}_month_{year}_{month}"

    def update(self):
        if not os.path.exists(self._db_path): return
        try:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # 1. Thống kê
            cursor.execute("SELECT tong_tien_sau_vat, tong_don_hang, tong_so_luong FROM monthly_stats WHERE nam=? AND thang=?", (self._year, self._month))
            stat = cursor.fetchone()
            
            # 2. Chi tiết: Sắp xếp theo NGÀY MUA
            cursor.execute("SELECT * FROM purchases WHERE nam=? AND thang=? ORDER BY ngay_mua DESC", (self._year, self._month))
            items = cursor.fetchall()
            conn.close()

            if stat:
                self._attr_native_value = int(stat["tong_tien_sau_vat"])
                details_list = self._process_details(items)
                self._attr_extra_state_attributes = {
                    "tong_don_hang": stat["tong_don_hang"],
                    "tong_so_luong": stat["tong_so_luong"],
                    "tong_tien": stat["tong_tien_sau_vat"],
                    "danh_sach_chi_tiet": details_list
                }
            else: 
                self._attr_native_value = 0
                self._attr_extra_state_attributes = {}
        except: 
            self._attr_native_value = 0

class ShoppingCategorySensor(ShoppingBase):
    """Sensor thống kê theo ngành hàng CỦA TỪNG NĂM."""
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_native_unit_of_measurement = "đ"
    _attr_icon = "mdi:shape"

    def __init__(self, db_path, name, category, year, entry_id):
        super().__init__(db_path, name, entry_id)
        self._category = category
        self._year = year
        self._attr_unique_id = f"{entry_id}_cat_{category}_{year}"

    def update(self):
        if not os.path.exists(self._db_path): return
        try:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # 1. Tính toán thống kê theo NĂM + NGÀNH HÀNG
            cursor.execute("""
                SELECT COUNT(*), SUM(so_luong), SUM(thanh_tien_sau_vat) 
                FROM purchases 
                WHERE nganh_hang=? AND nam=?
            """, (self._category, self._year))
            stat = cursor.fetchone()

            # 2. Chi tiết ngành hàng trong năm đó
            cursor.execute("SELECT * FROM purchases WHERE nganh_hang=? AND nam=? ORDER BY ngay_mua DESC", (self._category, self._year))
            items = cursor.fetchall()

            conn.close()
            
            if stat and stat[0] > 0:
                total_money = stat[2] if stat[2] is not None else 0
                self._attr_native_value = int(total_money)
                details_list = self._process_details(items)

                self._attr_extra_state_attributes = {
                    "nganh_hang": self._category,
                    "nam": self._year,
                    "tong_don_hang": stat[0],
                    "tong_so_luong": stat[1] if stat[1] is not None else 0,
                    "tong_tien": total_money,
                    "danh_sach_chi_tiet": details_list
                }
            else: 
                self._attr_native_value = 0
                self._attr_extra_state_attributes = {}
        except: 
            self._attr_native_value = 0

class ShoppingPlaceSensor(ShoppingBase):
    """Sensor thống kê theo Nơi mua CỦA TỪNG NĂM."""
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_native_unit_of_measurement = "đ"
    _attr_icon = "mdi:store-marker"

    def __init__(self, db_path, name, place, year, entry_id):
        super().__init__(db_path, name, entry_id)
        self._place = place
        self._year = year
        self._attr_unique_id = f"{entry_id}_place_{place}_{year}"

    def update(self):
        if not os.path.exists(self._db_path): return
        try:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # 1. Tính toán thống kê theo NĂM + NƠI MUA
            cursor.execute("""
                SELECT COUNT(*), SUM(so_luong), SUM(thanh_tien_sau_vat) 
                FROM purchases 
                WHERE noi_mua=? AND nam=?
            """, (self._place, self._year))
            stat = cursor.fetchone()

            # 2. Chi tiết nơi mua trong năm đó
            cursor.execute("SELECT * FROM purchases WHERE noi_mua=? AND nam=? ORDER BY ngay_mua DESC", (self._place, self._year))
            items = cursor.fetchall()

            conn.close()
            
            if stat and stat[0] > 0:
                total_money = stat[2] if stat[2] is not None else 0
                self._attr_native_value = int(total_money)
                details_list = self._process_details(items)

                self._attr_extra_state_attributes = {
                    "noi_mua": self._place,
                    "nam": self._year,
                    "tong_don_hang": stat[0],
                    "tong_so_luong": stat[1] if stat[1] is not None else 0,
                    "tong_tien": total_money,
                    "danh_sach_chi_tiet": details_list
                }
            else: 
                self._attr_native_value = 0
                self._attr_extra_state_attributes = {}
        except: 
            self._attr_native_value = 0
