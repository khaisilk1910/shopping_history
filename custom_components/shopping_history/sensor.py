"""Event-driven, recorder-safe yearly shopping totals."""

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
_ZERO_SUMMARY = {"orders": 0, "quantity": 0.0, "total": 0}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ShoppingHistoryConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Create all yearly sensors from one SQLite query at setup."""
    store = entry.runtime_data.store
    sensors: dict[int, ShoppingYearlySensor] = {}
    refresh_running = False
    refresh_again = False

    async def refresh() -> None:
        nonlocal refresh_running, refresh_again
        if refresh_running:
            refresh_again = True
            return
        refresh_running = True
        try:
            while True:
                refresh_again = False
                try:
                    summaries, revision = await hass.async_add_executor_job(
                        store.get_year_summaries
                    )
                except Exception:
                    _LOGGER.exception("Shopping History: failed to refresh yearly sensors")
                    return

                added: list[ShoppingYearlySensor] = []
                for year, summary in summaries.items():
                    if year not in sensors:
                        entity = ShoppingYearlySensor(entry, year)
                        sensors[year] = entity
                        added.append(entity)
                    sensors[year].apply_summary(summary)

                # Keep a sensor at zero if the last purchase for that year was removed.
                for year, entity in sensors.items():
                    if year not in summaries:
                        entity.apply_summary({**_ZERO_SUMMARY, "revision": revision})
                    if entity.hass is not None and entity not in added:
                        entity.async_write_ha_state()

                if added:
                    async_add_entities(added, update_before_add=False)
                    _LOGGER.debug("Shopping History created %s yearly sensors", len(added))
                if not refresh_again:
                    break
        finally:
            refresh_running = False

    @callback
    def schedule_refresh() -> None:
        # Integration-level dispatch is a cheap signal: only the executor reads disk.
        hass.async_create_task(refresh(), f"{DOMAIN}: refresh yearly sensors")

    entry.async_on_unload(
        async_dispatcher_connect(
            hass, f"{SIGNAL_UPDATE_SENSORS}_{entry.entry_id}", schedule_refresh
        )
    )
    await refresh()


class ShoppingYearlySensor(SensorEntity):
    """Compact yearly aggregate, with no purchase details in Recorder."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_state_class = SensorStateClass.TOTAL
    # Preserve historic unit for existing charts and Recorder statistics.
    _attr_native_unit_of_measurement = "đ"
    _attr_suggested_display_precision = 0
    _attr_icon = "mdi:calendar-range"

    def __init__(self, entry: ShoppingHistoryConfigEntry, year: int) -> None:
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
        self._summary: dict[str, int | float] = {**_ZERO_SUMMARY, "revision": 0}

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Only small aggregates to avoid bloating Recorder."""
        return {
            "shopping_history": True,
            "config_entry_id": self._entry_id,
            "nam": self._year,
            "tong_don_hang": self._summary["orders"],
            "tong_so_luong": self._summary["quantity"],
            "tong_tien": self._summary["total"],
            "data_revision": self._summary["revision"],
        }

    @callback
    def apply_summary(self, summary: dict[str, int | float]) -> None:
        """Update entity state using an already aggregated summary."""
        self._summary = summary
        self._attr_native_value = int(summary["total"])
