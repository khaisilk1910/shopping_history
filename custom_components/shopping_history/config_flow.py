"""Config flow for Shopping History."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult

from .const import CONF_FRIENDLY_NAME, DOMAIN


class ShoppingHistoryConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Shopping History."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        if user_input is not None:
            friendly_name = str(user_input[CONF_FRIENDLY_NAME]).strip()
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
