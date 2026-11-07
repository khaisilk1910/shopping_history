"""Config flow for Shopping History."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.core import callback

from .const import CONF_FRIENDLY_NAME, CONF_YEARLY_SENSORS, DOMAIN


class ShoppingHistoryConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Shopping History."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> ShoppingHistoryOptionsFlow:
        """Expose the standard Configure dialog for the profile."""
        return ShoppingHistoryOptionsFlow()

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        if user_input is not None:
            friendly_name = str(user_input[CONF_FRIENDLY_NAME]).strip()
            if not friendly_name:
                return self.async_show_form(
                    step_id="user",
                    data_schema=vol.Schema({
                        vol.Required(CONF_FRIENDLY_NAME, default="Lịch Sử Mua Sắm"): str,
                    }),
                    errors={CONF_FRIENDLY_NAME: "name_required"},
                )
            return self.async_create_entry(
                title=friendly_name,
                data={CONF_FRIENDLY_NAME: friendly_name},
            )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_FRIENDLY_NAME, default="Lịch Sử Mua Sắm"
                    ): str,
                }
            ),
        )


class ShoppingHistoryOptionsFlow(config_entries.OptionsFlowWithReload):
    """Offer yearly sensor opt-out without touching the underlying data."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Save sensor preferences and reload only this integration entry."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional(
                    CONF_YEARLY_SENSORS,
                    default=self.config_entry.options.get(CONF_YEARLY_SENSORS, True),
                ): bool,
            }),
        )
