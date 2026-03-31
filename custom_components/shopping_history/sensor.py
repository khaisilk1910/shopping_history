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
    db_path = hass.data[DOMAIN][entry.entry_id]["db_path"]
    friendly_name = entry.data.get("friendly_name", "Shopping History")
    
    known_years = set()

    async def check_and_add_new_entities():
        if not os.path.exists(db_path): return

        def get_all_years():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            # Chỉ lấy danh sách các Năm từ bảng gốc
            cursor.execute("SELECT DISTINCT nam FROM purchases WHERE nam IS NOT NULL")
            db_years = {r[0] for r in cursor.fetchall()}
            conn.close()
            return db_years

        db_years = await hass.async_add_executor_job(get_all_years)
        new_entities = []

        # Tạo duy nhất Sensor Năm
        for year in db_years:
            if year not in known_years:
                new_entities.append(ShoppingYearlySensor(db_path, f"{friendly_name} Năm {year}", year, entry.entry_id))
                known_years.add(year)

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
        """Chuyển đổi item sang dict, nếu giá trị là None thì gán bằng chuỗi rỗng ''."""
        results = []
        for item in items:
            d = dict(item)
            for k, v in d.items():
                if v is None:
                    d[k] = ""
            results.append(d)
        return results


class ShoppingYearlySensor(ShoppingBase):
    """Sensor gộp thống kê toàn bộ đơn hàng trong 1 NĂM."""
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
            
            # Tính tổng trong năm dựa trực tiếp vào bảng purchases
            cursor.execute("""
                SELECT COUNT(*), SUM(so_luong), SUM(thanh_tien_sau_vat) 
                FROM purchases 
                WHERE nam=?
            """, (self._year,))
            stat = cursor.fetchone()

            # Lấy toàn bộ chi tiết danh sách đơn hàng
            cursor.execute("SELECT * FROM purchases WHERE nam=? ORDER BY ngay_mua DESC", (self._year,))
            items = cursor.fetchall()

            conn.close()

            if stat and stat[0] > 0:
                total_money = stat[2] if stat[2] is not None else 0
                self._attr_native_value = int(total_money)
                details_list = self._process_details(items)

                self._attr_extra_state_attributes = {
                    "nam": self._year,
                    "tong_don_hang": stat[0],
                    "tong_so_luong": stat[1] if stat[1] is not None else 0,
                    "tong_tien": int(total_money),
                    "danh_sach_chi_tiet": details_list
                }
            else: 
                self._attr_native_value = 0
                self._attr_extra_state_attributes = {}
        except Exception as e: 
            _LOGGER.error(f"Shopping History Sensor update error: {e}")
            self._attr_native_value = 0
