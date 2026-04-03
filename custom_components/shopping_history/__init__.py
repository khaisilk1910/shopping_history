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

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.lovelace.resources import ResourceStorageCollection

from .const import DOMAIN, CONF_FRIENDLY_NAME, SIGNAL_UPDATE_SENSORS

_LOGGER = logging.getLogger(__name__)

UI_URL_BASE = "/shopping_history_ui"
UI_DIR_PATH = "frontend"

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
    vol.Optional("note", default=""): cv.string,
})

SERVICE_EDIT_ORDER_SCHEMA = vol.Schema({
    vol.Required("entry_id"): cv.string,
    vol.Required("order_id"): vol.Coerce(int),
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
    vol.Optional("note", default=""): cv.string,
})

SERVICE_DELETE_ORDER_SCHEMA = vol.Schema({
    vol.Required("entry_id"): cv.string,
    vol.Required("order_id"): vol.Coerce(int),
})

async def init_resource(hass: HomeAssistant, url: str, ver: str) -> None:
    url_with_version = f"{url}?hacstag={ver}"

    add_extra_js_url(hass, url_with_version)

    async def _register_resource(*args):
        lovelace = hass.data.get("lovelace")
        if not lovelace:
            return

        resources = getattr(lovelace, "resources", None) or lovelace.get("resources")
        if not isinstance(resources, ResourceStorageCollection):
            return

        if not resources.loaded:
            await resources.async_load()

        for item in resources.async_items():
            item_url = item.get("url", "")
            base_url = item_url.split("?")[0]
            
            if base_url == url:
                if item_url != url_with_version:
                    await resources.async_update_item(item["id"], {"res_type": "module", "url": url_with_version})
                return

        await resources.async_create_item({"res_type": "module", "url": url_with_version})

    if hass.state == CoreState.running:
        await _register_resource()
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _register_resource)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    
    await hass.http.async_register_static_paths([
        StaticPathConfig(
            UI_URL_BASE,
            hass.config.path("custom_components", DOMAIN, UI_DIR_PATH),
            False
        )
    ])
    
    async def handle_add_order(call: ServiceCall):
        entry_id = call.data.get("entry_id")
        entry_data = hass.data.get(DOMAIN, {}).get(entry_id)
        if not entry_data: return
        db_path = entry_data["db_path"]
        data = call.data
        
        purchase_dt = dt_util.parse_date(data["purchase_date"]) if data.get("purchase_date") else dt_util.now().date()
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
                    thoi_gian_bh_thang, ngay_het_bh, ghi_chu
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                date_str, y, m, d,
                data["name"], data["place"], data["quantity"], data["price"], total_pre_tax,
                data["vat"], vat_amt, total_post_tax,
                data["model"], data["status"], data["category"], data["manufacturer"],
                data["warranty_months"], warranty_end_str, data.get("note", "")
            ))
            conn.commit()
            conn.close()

        await hass.async_add_executor_job(db_insert_work)
        async_dispatcher_send(hass, f"{SIGNAL_UPDATE_SENSORS}_{entry_id}")

    async def handle_edit_order(call: ServiceCall):
        entry_id = call.data.get("entry_id")
        entry_data = hass.data.get(DOMAIN, {}).get(entry_id)
        if not entry_data: return
        db_path = entry_data["db_path"]
        data = call.data
        order_id = data["order_id"]
        
        purchase_dt = dt_util.parse_date(data["purchase_date"]) if data.get("purchase_date") else dt_util.now().date()
        y, m, d = purchase_dt.year, purchase_dt.month, purchase_dt.day
        date_str = purchase_dt.strftime("%Y-%m-%d")

        total_pre_tax = data["price"] * data["quantity"]
        vat_amt = total_pre_tax * (data["vat"] / 100) if data["vat"] > 0 else 0
        total_post_tax = total_pre_tax + vat_amt

        warranty_end_str = ""
        if data["warranty_months"] > 0:
            end_date = purchase_dt + relativedelta(months=data["warranty_months"])
            warranty_end_str = end_date.strftime("%Y-%m-%d")

        def db_update_work():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE purchases SET
                    ngay_mua=?, nam=?, thang=?, ngay=?, 
                    ten_hang=?, noi_mua=?, so_luong=?, don_gia=?, thanh_tien=?, 
                    vat_percent=?, tien_vat=?, thanh_tien_sau_vat=?, 
                    model=?, tinh_trang=?, nganh_hang=?, hang_sx=?, 
                    thoi_gian_bh_thang=?, ngay_het_bh=?, ghi_chu=?
                WHERE id=?
            """, (
                date_str, y, m, d,
                data["name"], data["place"], data["quantity"], data["price"], total_pre_tax,
                data["vat"], vat_amt, total_post_tax,
                data["model"], data["status"], data["category"], data["manufacturer"],
                data["warranty_months"], warranty_end_str, data.get("note", ""),
                order_id
            ))
            conn.commit()
            conn.close()

        await hass.async_add_executor_job(db_update_work)
        async_dispatcher_send(hass, f"{SIGNAL_UPDATE_SENSORS}_{entry_id}")

    async def handle_delete_order(call: ServiceCall):
        entry_id = call.data.get("entry_id")
        entry_data = hass.data.get(DOMAIN, {}).get(entry_id)
        if not entry_data: return
        db_path = entry_data["db_path"]
        order_id = call.data["order_id"]

        def db_delete_work():
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM purchases WHERE id=?", (order_id,))
            conn.commit()
            conn.close()

        await hass.async_add_executor_job(db_delete_work)
        async_dispatcher_send(hass, f"{SIGNAL_UPDATE_SENSORS}_{entry_id}")

    hass.services.async_register(DOMAIN, "add_order", handle_add_order, schema=SERVICE_ADD_ORDER_SCHEMA)
    hass.services.async_register(DOMAIN, "edit_order", handle_edit_order, schema=SERVICE_EDIT_ORDER_SCHEMA)
    hass.services.async_register(DOMAIN, "delete_order", handle_delete_order, schema=SERVICE_DELETE_ORDER_SCHEMA)

    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    integration = await async_get_integration(hass, DOMAIN)
    fallback_version = integration.version if integration and integration.version else "1.0"
    
    def get_file_version(file_name, fallback):
        try:
            file_path = hass.config.path("custom_components", DOMAIN, UI_DIR_PATH, file_name)
            return str(int(os.path.getmtime(file_path)))
        except Exception:
            return fallback

    ver_card = await hass.async_add_executor_job(
        get_file_version, "shopping-history-card.js", fallback_version
    )

    await init_resource(hass, f"{UI_URL_BASE}/shopping-history-card.js", ver_card)

    storage_dir = hass.config.path("shopping_history")
    
    def create_dir():
        os.makedirs(storage_dir, exist_ok=True)
    await hass.async_add_executor_job(create_dir)

    db_path = os.path.join(storage_dir, f"shopping_data_{entry.entry_id}.db")
    
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {"db_path": db_path}

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
                ngay_het_bh TEXT,
                ghi_chu TEXT
            )
        """)
        
        try:
            cursor.execute("PRAGMA table_info(purchases)")
            columns = [info[1] for info in cursor.fetchall()]
            if "noi_mua" not in columns:
                cursor.execute("ALTER TABLE purchases ADD COLUMN noi_mua TEXT DEFAULT ''")
            if "ghi_chu" not in columns:
                cursor.execute("ALTER TABLE purchases ADD COLUMN ghi_chu TEXT DEFAULT ''")
        except Exception as e:
            _LOGGER.error(f"Migration Error: {e}")
        
        conn.commit()
        conn.close()

    await hass.async_add_executor_job(init_db)

    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
    entry.async_on_unload(entry.add_update_listener(update_listener))
    
    return True

async def update_listener(hass: HomeAssistant, entry: ConfigEntry):
    await hass.config_entries.async_reload(entry.entry_id)

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if entry.entry_id in hass.data[DOMAIN]:
        hass.data[DOMAIN].pop(entry.entry_id)
    return await hass.config_entries.async_unload_platforms(entry, ["sensor"])
