"""The Shopping History integration."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import logging
import math
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration
from homeassistant.util import dt as dt_util

from .const import CONF_YEARLY_SENSORS, DOMAIN, SIGNAL_UPDATE_SENSORS
from .storage import OrderNotFoundError, ShoppingHistoryStore

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR]
UI_URL_BASE = "/shopping_history_ui"
UI_DIR_PATH = "frontend"


@dataclass(slots=True)
class ShoppingHistoryData:
    """Runtime data attached to a config entry."""

    store: ShoppingHistoryStore
    yearly_sensors_loaded: bool = False


ShoppingHistoryConfigEntry = ConfigEntry[ShoppingHistoryData]


def _validate_purchase_date(value: Any) -> date:
    """Validate a service date value."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    parsed = dt_util.parse_date(str(value))
    if parsed is None:
        raise vol.Invalid("purchase_date must use YYYY-MM-DD")
    return parsed


def _finite_non_negative(value: Any) -> float:
    """Reject NaN/infinity before they reach SQLite or financial calculations."""
    number = vol.Coerce(float)(value)
    if not math.isfinite(number) or number < 0:
        raise vol.Invalid("Must be a finite non-negative number")
    return number


def _finite_positive(value: Any) -> float:
    number = _finite_non_negative(value)
    if number <= 0:
        raise vol.Invalid("Must be greater than zero")
    return number


_NON_NEGATIVE_FLOAT = _finite_non_negative
_POSITIVE_FLOAT = _finite_positive
_NON_NEGATIVE_INT = vol.All(vol.Coerce(int), vol.Range(min=0, max=1200))
_VAT_PERCENT = vol.All(_finite_non_negative, vol.Range(max=100))

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

    # Decimal avoids floating-point multiplication artefacts in financial fields.
    try:
        quantity_decimal = Decimal(str(data["quantity"]))
        price_decimal = Decimal(str(data["price"]))
        vat_decimal = Decimal(str(data["vat"]))
        if not all(value.is_finite() for value in (quantity_decimal, price_decimal, vat_decimal)):
            raise ValueError("Non-finite amount")
        if quantity_decimal <= 0 or price_decimal < 0 or not 0 <= vat_decimal <= 100:
            raise ValueError("Amount outside valid range")
        pre_tax_decimal = price_decimal * quantity_decimal
        vat_amount_decimal = pre_tax_decimal * vat_decimal / Decimal(100)
        post_tax_decimal = pre_tax_decimal + vat_amount_decimal
        if not all(value.is_finite() for value in (pre_tax_decimal, vat_amount_decimal, post_tax_decimal)):
            raise ValueError("Invalid amount")
        quantity, price, vat_percent = (
            float(quantity_decimal), float(price_decimal), float(vat_decimal)
        )
        pre_tax, vat_amount, post_tax = (
            float(pre_tax_decimal), float(vat_amount_decimal), float(post_tax_decimal)
        )
        if not all(math.isfinite(value) for value in (pre_tax, vat_amount, post_tax)):
            raise ValueError("Amount exceeds supported range")
    except (InvalidOperation, ValueError, OverflowError) as err:
        raise HomeAssistantError("Giá, số lượng hoặc VAT không hợp lệ") from err

    for key in ("name", "place", "category", "status"):
        if not data[key].strip():
            raise HomeAssistantError(f"Trường {key} không được bỏ trống")

    warranty_months = int(data["warranty_months"])
    try:
        warranty_end = (
            _add_months(purchase_date, warranty_months).isoformat()
            if warranty_months > 0
            else ""
        )
    except ValueError as err:
        raise HomeAssistantError("Thời gian bảo hành vượt quá phạm vi ngày hợp lệ") from err

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
    if entry is None or entry.domain != DOMAIN or entry.state is not ConfigEntryState.LOADED:
        raise HomeAssistantError(
            "Không tìm thấy hồ sơ Shopping History đang hoạt động"
        )
    return entry.runtime_data.store


async def _async_register_frontend_resource(hass: HomeAssistant) -> None:
    """Register a versioned Lovelace module off the startup critical path.

    The resource collection must be loaded before editing to avoid accidentally
    overwriting existing resources on releases with lazy resource loading.
    """
    try:
        from homeassistant.components.lovelace import LOVELACE_DATA, MODE_STORAGE

        integration = await async_get_integration(hass, DOMAIN)
        version = integration.version or "0"
        resource_url = f"{UI_URL_BASE}/shopping-history-card.js?v={version}"
        lovelace = hass.data.get(LOVELACE_DATA)
        if lovelace is None:
            _LOGGER.warning("Lovelace not loaded; add resource manually: %s", resource_url)
            return
        if lovelace.resource_mode != MODE_STORAGE:
            _LOGGER.info(
                "Lovelace uses YAML resources. Add a module resource manually: %s",
                resource_url,
            )
            return

        resources = lovelace.resources
        # Explicitly load, even if Core's collection already has a lazy-load guard.
        if hasattr(resources, "_async_ensure_loaded"):
            await resources._async_ensure_loaded()
        elif not getattr(resources, "loaded", False):
            await resources.async_load()
            resources.loaded = True

        existing = next(
            (
                item for item in resources.async_items()
                if str(item.get("url", "")).split("?", 1)[0]
                == f"{UI_URL_BASE}/shopping-history-card.js"
            ),
            None,
        )
        if existing is None:
            await resources.async_create_item({"url": resource_url, "res_type": "module"})
            _LOGGER.info("Registered Shopping History Lovelace resource %s", resource_url)
        elif existing.get("url") != resource_url or existing.get("type") != "module":
            await resources.async_update_item(
                existing["id"], {"url": resource_url, "res_type": "module"}
            )
            _LOGGER.info("Updated Shopping History Lovelace resource to %s", resource_url)
        else:
            _LOGGER.debug("Shopping History Lovelace resource is up to date")
    except Exception:
        # A failure to register a card must not prevent the integration starting.
        _LOGGER.exception("Unable to register Shopping History Lovelace resource")


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/list_profiles"}
)
@callback
def websocket_list_profiles(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """List loaded profiles, including those with no purchases or yearly sensors."""
    profiles = [
        {"entry_id": entry.entry_id, "title": entry.title}
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.state is ConfigEntryState.LOADED
    ]
    connection.send_result(msg["id"], sorted(profiles, key=lambda p: p["title"].casefold()))


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/subscribe_updates"}
)
@callback
def websocket_subscribe_updates(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Push database change notifications, even when no year sensors exist."""
    @callback
    def _forward(entry_id: str) -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], {"entry_id": entry_id})
        )

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, SIGNAL_UPDATE_SENSORS, _forward
    )
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/get_data",
        vol.Required("entry_id"): cv.string,
        vol.Optional("year"): vol.All(vol.Coerce(int), vol.Range(min=1, max=9999)),
        vol.Optional("if_revision"): vol.All(vol.Coerce(int), vol.Range(min=0)),
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
            store.get_dashboard_data, msg.get("year"), msg.get("if_revision")
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "entry_not_found", str(err))
        return
    except Exception:  # Keep websocket failures isolated from Home Assistant.
        _LOGGER.exception("Failed to read Shopping History dashboard data")
        connection.send_error(msg["id"], "read_failed", "Không thể đọc dữ liệu; xem log Home Assistant")
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
    websocket_api.async_register_command(hass, websocket_list_profiles)
    websocket_api.async_register_command(hass, websocket_subscribe_updates)

    async def handle_add_order(call: ServiceCall) -> None:
        store = _get_store(hass, call.data["entry_id"])
        order = _build_order(call.data)
        try:
            order_id = await hass.async_add_executor_job(store.add_order, order)
        except Exception as err:
            _LOGGER.exception("Could not add Shopping History order")
            raise HomeAssistantError("Không thể thêm đơn hàng; xem log Home Assistant") from err
        _LOGGER.debug("Shopping History order added (id=%s)", order_id)
        async_dispatcher_send(hass, f"{SIGNAL_UPDATE_SENSORS}_{call.data['entry_id']}")
        async_dispatcher_send(hass, SIGNAL_UPDATE_SENSORS, call.data["entry_id"])

    async def handle_edit_order(call: ServiceCall) -> None:
        store = _get_store(hass, call.data["entry_id"])
        order = _build_order(call.data)
        try:
            await hass.async_add_executor_job(
                store.edit_order, call.data["order_id"], order
            )
        except OrderNotFoundError as err:
            raise HomeAssistantError("Không tìm thấy đơn hàng cần sửa") from err
        except Exception as err:
            _LOGGER.exception("Could not edit Shopping History order")
            raise HomeAssistantError("Không thể sửa đơn hàng; xem log Home Assistant") from err
        _LOGGER.debug("Shopping History order edited (id=%s)", call.data["order_id"])
        async_dispatcher_send(hass, f"{SIGNAL_UPDATE_SENSORS}_{call.data['entry_id']}")
        async_dispatcher_send(hass, SIGNAL_UPDATE_SENSORS, call.data["entry_id"])

    async def handle_delete_order(call: ServiceCall) -> None:
        store = _get_store(hass, call.data["entry_id"])
        try:
            await hass.async_add_executor_job(store.delete_order, call.data["order_id"])
        except OrderNotFoundError as err:
            raise HomeAssistantError("Không tìm thấy đơn hàng cần xóa") from err
        except Exception as err:
            _LOGGER.exception("Could not delete Shopping History order")
            raise HomeAssistantError("Không thể xóa đơn hàng; xem log Home Assistant") from err
        _LOGGER.debug("Shopping History order deleted (id=%s)", call.data["order_id"])
        async_dispatcher_send(hass, f"{SIGNAL_UPDATE_SENSORS}_{call.data['entry_id']}")
        async_dispatcher_send(hass, SIGNAL_UPDATE_SENSORS, call.data["entry_id"])

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
    try:
        await hass.async_add_executor_job(store.initialize)
    except Exception as err:
        _LOGGER.exception("Shopping History database initialization failed")
        raise HomeAssistantError("Không thể mở cơ sở dữ liệu Shopping History") from err
    entry.runtime_data = ShoppingHistoryData(store=store)

    if entry.options.get(CONF_YEARLY_SENSORS, True):
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
        entry.runtime_data.yearly_sensors_loaded = True
    _LOGGER.debug("Shopping History profile loaded (entry_id=%s)", entry.entry_id)
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: ShoppingHistoryConfigEntry
) -> bool:
    """Unload a config entry."""
    # OptionsFlowWithReload updates entry.options *before* unloading the old
    # platform. Use the actual runtime state, not the new options value.
    if entry.runtime_data.yearly_sensors_loaded:
        return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    return True
