"""Privacy-safe diagnostics for Shopping History."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from . import ShoppingHistoryConfigEntry
from .const import CONF_YEARLY_SENSORS


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ShoppingHistoryConfigEntry
) -> dict[str, Any]:
    """Return schema/health metadata, never purchase or profile data."""
    info = await hass.async_add_executor_job(entry.runtime_data.store.get_diagnostics)
    return {
        "yearly_sensors_enabled": entry.options.get(CONF_YEARLY_SENSORS, True),
        "database": info,
    }
