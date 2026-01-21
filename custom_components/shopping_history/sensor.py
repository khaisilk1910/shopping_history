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
    
    entities = []
    
    # Sensor Tổng quan
    entities.append(ShoppingGrandTotalSensor(db_path, f"{friendly_name} Tổng Cộng", entry.entry_id))

    if os.path.exists(db_path):
        # Quét DB trong Executor (Không chặn luồng chính)
        def scan_db():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Lấy danh sách Năm
            cursor.execute("SELECT nam FROM yearly_stats")
            years = [r[0] for r in cursor.fetchall()]
            
            # Lấy danh sách Tháng
            cursor.execute("SELECT nam, thang FROM monthly_stats")
            months = cursor.fetchall()
            
            # Lấy danh sách Ngành hàng
            cursor.execute("SELECT nganh_hang FROM category_stats")
            categories = [r[0] for r in cursor.fetchall()]
            
            conn.close()
            return years, months, categories

        years, months, categories = await hass.async_add_executor_job(scan_db)
        
        # Tạo sensor tương ứng
        for year in years:
            entities.append(ShoppingYearlySensor(db_path, f"{friendly_name} Năm {year}", year, entry.entry_id))
            
        for year, month in months:
            entities.append(ShoppingMonthlySensor(db_path, f"{friendly_name} Tháng {month}/{year}", year, month, entry.entry_id))
            
        for cat in categories:
            entities.append(ShoppingCategorySensor(db_path, f"{friendly_name} - {cat}", cat, entry.entry_id))

    async_add_entities(entities, update_before_add=True)


class ShoppingBase(SensorEntity):
    """Base class cho các sensor shopping."""
    _attr_has_entity_name = False
    
    def __init__(self, db_path, name, entry_id):
        self._db_path = db_path
        self._attr_name = name
        self._entry_id = entry_id
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry_id)},
            "name": entry_id,
            "manufacturer": "Custom HACS Integration",
            "model": "Shopping History DB",
        }

    async def async_added_to_hass(self):
        """Đăng ký nhận tín hiệu cập nhật khi entity được thêm vào HA."""
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, f"{SIGNAL_UPDATE_SENSORS}_{self._entry_id}", self._force_update_callback
            )
        )

    @callback
    def _force_update_callback(self):
        """Buộc cập nhật trạng thái ngay lập tức."""
        self.async_schedule_update_ha_state(True)


class ShoppingGrandTotalSensor(ShoppingBase):
    """Sensor hiển thị tổng tất cả."""
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_native_unit_of_measurement = "đ"
    _attr_icon = "mdi:cart-outline"

    def __init__(self, db_path, name, entry_id):
        super().__init__(db_path, name, entry_id)
        self._attr_unique_id = f"{entry_id}_grand_total"

    def update(self):
        if not os.path.exists(self._db_path): return
        conn = sqlite3.connect(self._db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT tong_so_lan_mua, tong_so_luong_hang, tong_tien_sau_vat FROM grand_total WHERE id=1")
        row = cursor.fetchone()
        conn.close()
        
        if row:
            self._attr_native_value = int(row[2])
            self._attr_extra_state_attributes = {
                "tong_so_don_hang": row[0],
                "tong_so_luong_san_pham": row[1]
            }
        else:
            self._attr_native_value = 0


class ShoppingYearlySensor(ShoppingBase):
    """Sensor Năm: Hiển thị tổng quan và list hàng hóa trong năm."""
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
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Lấy tổng
        cursor.execute("SELECT tong_don_hang, tong_so_luong, tong_tien_sau_vat FROM yearly_stats WHERE nam=?", (self._year,))
        row = cursor.fetchone()
        
        # Lấy chi tiết
        cursor.execute("""
            SELECT ngay, thang, ten_hang, noi_mua, thanh_tien_sau_vat, nganh_hang 
            FROM purchases WHERE nam=? ORDER BY thang DESC, ngay DESC
        """, (self._year,))
        items = cursor.fetchall()
        
        conn.close()
        
        if row:
            self._attr_native_value = int(row["tong_tien_sau_vat"])
            
            detail_list = []
            for item in items:
                detail_list.append({
                    "ngay": f"{item['ngay']}/{item['thang']}",
                    "ten": item["ten_hang"],
                    "noi_mua": item["noi_mua"] or "N/A",
                    "gia": f"{int(item['thanh_tien_sau_vat']):,} đ",
                    "loai": item["nganh_hang"]
                })

            self._attr_extra_state_attributes = {
                "nam": self._year,
                "tong_don_hang": row["tong_don_hang"],
                "tong_so_luong": row["tong_so_luong"],
                "chi_tiet_san_pham_nam": detail_list
            }
        else:
            self._attr_native_value = 0


class ShoppingMonthlySensor(ShoppingBase):
    """Sensor Tháng: Hiển thị chi tiết từng đơn hàng, bảo hành."""
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
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT tong_tien_sau_vat, tong_don_hang, tong_so_luong FROM monthly_stats WHERE nam=? AND thang=?", (self._year, self._month))
        stat = cursor.fetchone()
        
        cursor.execute("""
            SELECT ngay, ten_hang, noi_mua, so_luong, don_gia, thanh_tien_sau_vat, 
                   ngay_het_bh, nganh_hang, thoi_gian_bh_thang
            FROM purchases 
            WHERE nam=? AND thang=? 
            ORDER BY ngay DESC
        """, (self._year, self._month))
        items = cursor.fetchall()
        conn.close()

        if stat:
            self._attr_native_value = int(stat["tong_tien_sau_vat"])
            
            item_list = []
            for item in items:
                item_list.append({
                    "ngay": f"{item['ngay']}/{self._month}",
                    "ten": item["ten_hang"],
                    "noi_mua": item["noi_mua"] or "N/A",
                    "gia_goc": f"{int(item['don_gia']):,} đ",
                    "sl": item["so_luong"],
                    "tong_tien": f"{int(item['thanh_tien_sau_vat']):,} đ",
                    "bao_hanh": f"{item['thoi_gian_bh_thang']} tháng",
                    "het_han_bh": item["ngay_het_bh"] or "Không",
                    "loai": item["nganh_hang"]
                })

            self._attr_extra_state_attributes = {
                "tong_don_hang": stat["tong_don_hang"],
                "tong_so_luong": stat["tong_so_luong"],
                "danh_sach_chi_tiet": item_list
            }
        else:
            self._attr_native_value = 0


class ShoppingCategorySensor(ShoppingBase):
    """Sensor theo Ngành hàng."""
    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_native_unit_of_measurement = "đ"
    _attr_icon = "mdi:shape"

    def __init__(self, db_path, name, category, entry_id):
        super().__init__(db_path, name, entry_id)
        self._category = category
        self._attr_unique_id = f"{entry_id}_cat_{category}"

    def update(self):
        if not os.path.exists(self._db_path): return
        conn = sqlite3.connect(self._db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT tong_so_luong, tong_tien_sau_vat FROM category_stats WHERE nganh_hang=?", (self._category,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            self._attr_native_value = int(row[1])
            self._attr_extra_state_attributes = {
                "nganh_hang": self._category,
                "tong_so_luong_da_mua": row[0]
            }
        else:
            self._attr_native_value = 0
