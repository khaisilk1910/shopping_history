"""Sensor platform for Shopping History."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import ShoppingHistoryConfigEntry
from .const import DOMAIN, SIGNAL_UPDATE_SENSORS
from .storage import ShoppingHistoryStore

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ShoppingHistoryConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up yearly Shopping History sensors."""
    store = entry.runtime_data.store
    known_years: set[int] = set()

    async def check_and_add_new_entities(*_args: Any) -> None:
        """Create a yearly sensor only when a new purchase year appears."""
        try:
            db_years = await hass.async_add_executor_job(store.get_years)
        except Exception:
            _LOGGER.exception("Unable to read Shopping History years")
            return

        new_entities: list[ShoppingYearlySensor] = []
        for year in db_years:
            if year in known_years:
                continue
            new_entities.append(ShoppingYearlySensor(store, entry, year))
            known_years.add(year)

        if new_entities:
            async_add_entities(new_entities, update_before_add=True)

    await check_and_add_new_entities()

    entry.async_on_unload(
        async_dispatcher_connect(
            hass,
            f"{SIGNAL_UPDATE_SENSORS}_{entry.entry_id}",
            check_and_add_new_entities,
        )
    )


class ShoppingYearlySensor(SensorEntity):
    """Recorder-safe yearly purchase total sensor."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_state_class = SensorStateClass.TOTAL
    # Keep the historic unit exactly as recorded by existing installations. We do not
    # declare MONETARY because current HA documents that device class as ISO-4217 only.
    _attr_native_unit_of_measurement = "đ"
    _attr_suggested_display_precision = 0
    _attr_icon = "mdi:calendar-range"

    def __init__(
        self,
        store: ShoppingHistoryStore,
        entry: ShoppingHistoryConfigEntry,
        year: int,
    ) -> None:
        self._store = store
        self._entry_id = entry.entry_id
        self._year = year
        self._attr_name = f"Năm {year}"
        self._attr_unique_id = f"{entry.entry_id}_year_{year}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Shopping History",
            model="Local purchase database",
        )
        self._attr_native_value = 0
        self._summary: dict[str, int | float] = {
            "orders": 0,
            "quantity": 0,
            "total": 0,
            "revision": 0,
        }

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose only compact aggregates; purchase rows are served via WebSocket."""
        return {
            "shopping_history": True,
            "config_entry_id": self._entry_id,
            "nam": self._year,
            "tong_don_hang": self._summary["orders"],
            "tong_so_luong": self._summary["quantity"],
            "tong_tien": self._summary["total"],
            "data_revision": self._summary["revision"],
        }

    async def async_added_to_hass(self) -> None:
        """Subscribe to explicit database changes."""
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                f"{SIGNAL_UPDATE_SENSORS}_{self._entry_id}",
                self._schedule_refresh,
            )
        )

    @callback
    def _schedule_refresh(self, *_args: Any) -> None:
        """Refresh this entity after a purchase mutation."""
        self.async_schedule_update_ha_state(force_refresh=True)

    async def async_update(self) -> None:
        """Refresh small aggregate values without polling purchase details."""
        try:
            summary = await self.hass.async_add_executor_job(
                self._store.get_year_summary, self._year
            )
        except Exception:
            _LOGGER.exception("Shopping History yearly sensor update failed")
            return

        self._summary = summary
        self._attr_native_value = int(summary["total"])
