"""The Shopping History integration."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
import hashlib
import logging
import os
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration
from homeassistant.util import dt as dt_util

from .const import DOMAIN, SIGNAL_UPDATE_SENSORS
from .storage import OrderNotFoundError, ShoppingHistoryStore

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR]
UI_URL_BASE = "/shopping_history_ui"
UI_DIR_PATH = "frontend"


@dataclass(slots=True)
class ShoppingHistoryData:
    """Runtime data attached to a config entry."""

    store: ShoppingHistoryStore


ShoppingHistoryConfigEntry = ConfigEntry[ShoppingHistoryData]


def _validate_purchase_date(value: Any) -> date:
    """Validate a service date value."""
    if isinstance(value, date):
        return value
    parsed = dt_util.parse_date(str(value))
    if parsed is None:
        raise vol.Invalid("purchase_date must use YYYY-MM-DD")
    return parsed


_NON_NEGATIVE_FLOAT = vol.All(vol.Coerce(float), vol.Range(min=0))
_POSITIVE_FLOAT = vol.All(vol.Coerce(float), vol.Range(min=0.000001))
_NON_NEGATIVE_INT = vol.All(vol.Coerce(int), vol.Range(min=0))
_VAT_PERCENT = vol.All(vol.Coerce(float), vol.Range(min=0, max=100))

SERVICE_ADD_ORDER_SCHEMA = vol.Schema(
    {
        vol.Required("entry_id"): cv.string,
        vol.Required("name"): cv.string,
        vol.Required("place"): cv.string,
        vol.Required("category"): cv.string,
        vol.Required("price"): _NON_NEGATIVE_FLOAT,
        vol.Required("quantity"): _POSITIVE_FLOAT,
        vol.Optional("vat", default=0): _VAT_PERCENT,
        vol.Required("status"): cv.string,
        vol.Optional("model", default=""): cv.string,
        vol.Optional("manufacturer", default=""): cv.string,
        vol.Optional("warranty_months", default=0): _NON_NEGATIVE_INT,
        vol.Optional("purchase_date"): _validate_purchase_date,
        vol.Optional("note", default=""): cv.string,
    }
)

SERVICE_EDIT_ORDER_SCHEMA = vol.Schema(
    {
        **SERVICE_ADD_ORDER_SCHEMA.schema,
        vol.Required("order_id"): vol.All(vol.Coerce(int), vol.Range(min=1)),
    }
)

SERVICE_DELETE_ORDER_SCHEMA = vol.Schema(
    {
        vol.Required("entry_id"): cv.string,
        vol.Required("order_id"): vol.All(vol.Coerce(int), vol.Range(min=1)),
    }
)


def _add_months(value: date, months: int) -> date:
    """Add calendar months without relying on an external date library."""
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


def _build_order(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize service data into the SQLite row format."""
    purchase_date = data.get("purchase_date") or dt_util.now().date()
    if not isinstance(purchase_date, date):
        raise HomeAssistantError("Ngày mua không hợp lệ")

    quantity = float(data["quantity"])
    price = float(data["price"])
    vat_percent = float(data["vat"])
    pre_tax = price * quantity
    vat_amount = pre_tax * vat_percent / 100 if vat_percent else 0.0
    post_tax = pre_tax + vat_amount

    warranty_months = int(data["warranty_months"])
    warranty_end = (
        _add_months(purchase_date, warranty_months).isoformat()
        if warranty_months > 0
        else ""
    )

    return {
        "ngay_mua": purchase_date.isoformat(),
        "nam": purchase_date.year,
        "thang": purchase_date.month,
        "ngay": purchase_date.day,
        "ten_hang": data["name"].strip(),
        "noi_mua": data["place"].strip(),
        "so_luong": quantity,
        "don_gia": price,
        "thanh_tien": pre_tax,
        "vat_percent": vat_percent,
        "tien_vat": vat_amount,
        "thanh_tien_sau_vat": post_tax,
        "model": data["model"].strip(),
        "tinh_trang": data["status"].strip(),
        "nganh_hang": data["category"].strip(),
        "hang_sx": data["manufacturer"].strip(),
        "thoi_gian_bh_thang": warranty_months,
        "ngay_het_bh": warranty_end,
        "ghi_chu": data.get("note", "").strip(),
    }


def _get_store(hass: HomeAssistant, entry_id: str) -> ShoppingHistoryStore:
    """Resolve a loaded Shopping History config entry to its store."""
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN or entry.runtime_data is None:
        raise HomeAssistantError(
            "Không tìm thấy hồ sơ Shopping History đang hoạt động"
        )
    return entry.runtime_data.store


async def _async_register_frontend_resource(hass: HomeAssistant) -> None:
    """Hash and register the frontend resource outside config-entry setup."""
    try:
        integration = await async_get_integration(hass, DOMAIN)
        fallback_version = integration.version or "1.0"

        def _get_file_version() -> str:
            file_path = hass.config.path(
                "custom_components", DOMAIN, UI_DIR_PATH, "shopping-history-card.js"
            )
            try:
                stat = os.stat(file_path)
                with open(file_path, "rb") as file_obj:
                    digest = hashlib.sha256(file_obj.read()).hexdigest()[:12]
                return (
                    f"{fallback_version}-{int(stat.st_mtime)}-"
                    f"{stat.st_size}-{digest}"
                )
            except OSError:
                return fallback_version

        version = await hass.async_add_executor_job(_get_file_version)
        add_extra_js_url(
            hass, f"{UI_URL_BASE}/shopping-history-card.js?v={version}"
        )
    except Exception:
        # The card is optional; frontend registration must never fail HA startup.
        _LOGGER.exception("Unable to register Shopping History frontend resource")


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/get_data",
        vol.Required("entry_id"): cv.string,
        vol.Optional("year"): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def websocket_get_data(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return purchase details to the card without putting them in entity state."""
    try:
        store = _get_store(hass, msg["entry_id"])
        result = await hass.async_add_executor_job(
            store.get_dashboard_data, msg.get("year")
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "entry_not_found", str(err))
        return
    except Exception as err:  # Keep websocket failures isolated from Home Assistant.
        _LOGGER.exception("Failed to read Shopping History dashboard data")
        connection.send_error(msg["id"], "read_failed", str(err))
        return

    connection.send_result(msg["id"], result)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up integration-level HTTP, WebSocket and service actions."""
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                UI_URL_BASE,
                hass.config.path("custom_components", DOMAIN, UI_DIR_PATH),
                False,
            )
        ]
    )

    websocket_api.async_register_command(hass, websocket_get_data)

    async def handle_add_order(call: ServiceCall) -> None:
        store = _get_store(hass, call.data["entry_id"])
        order = _build_order(call.data)
        await hass.async_add_executor_job(store.add_order, order)
        async_dispatcher_send(
            hass, f"{SIGNAL_UPDATE_SENSORS}_{call.data['entry_id']}"
        )

    async def handle_edit_order(call: ServiceCall) -> None:
        store = _get_store(hass, call.data["entry_id"])
        order = _build_order(call.data)
        try:
            await hass.async_add_executor_job(
                store.edit_order, call.data["order_id"], order
            )
        except OrderNotFoundError as err:
            raise HomeAssistantError("Không tìm thấy đơn hàng cần sửa") from err
        async_dispatcher_send(
            hass, f"{SIGNAL_UPDATE_SENSORS}_{call.data['entry_id']}"
        )

    async def handle_delete_order(call: ServiceCall) -> None:
        store = _get_store(hass, call.data["entry_id"])
        try:
            await hass.async_add_executor_job(store.delete_order, call.data["order_id"])
        except OrderNotFoundError as err:
            raise HomeAssistantError("Không tìm thấy đơn hàng cần xóa") from err
        async_dispatcher_send(
            hass, f"{SIGNAL_UPDATE_SENSORS}_{call.data['entry_id']}"
        )

    hass.services.async_register(
        DOMAIN, "add_order", handle_add_order, schema=SERVICE_ADD_ORDER_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, "edit_order", handle_edit_order, schema=SERVICE_EDIT_ORDER_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, "delete_order", handle_delete_order, schema=SERVICE_DELETE_ORDER_SCHEMA
    )

    # Frontend registration is optional and must not hold up config-entry startup.
    hass.async_create_background_task(
        _async_register_frontend_resource(hass),
        f"{DOMAIN}: register frontend resource",
    )
    return True


async def async_setup_entry(
    hass: HomeAssistant, entry: ShoppingHistoryConfigEntry
) -> bool:
    """Set up Shopping History from a config entry."""
    db_path = hass.config.path(
        "shopping_history", f"shopping_data_{entry.entry_id}.db"
    )
    store = ShoppingHistoryStore(db_path)

    # SQLite and filesystem work is intentionally off the event loop. Initialization
    # only performs schema/index checks; purchase rows are not loaded during startup.
    await hass.async_add_executor_job(store.initialize)
    entry.runtime_data = ShoppingHistoryData(store=store)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: ShoppingHistoryConfigEntry
) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
