"""Check config-entry reload decisions without an installed HA runtime.

OptionsFlowWithReload updates options before unloading the old entry; checking the
new option value during unload silently leaves previously created sensors alive.
"""

import ast
import asyncio
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

CODE = Path(__file__).resolve().parents[1] / 'custom_components/shopping_history/__init__.py'
syntax = ast.parse(CODE.read_text())
methods = [
    node for node in syntax.body
    if isinstance(node, ast.AsyncFunctionDef)
    and node.name in {'async_setup_entry', 'async_unload_entry'}
]
functions = ast.Module(body=methods, type_ignores=[])


@dataclass
class ShoppingHistoryData:
    store: object
    yearly_sensors_loaded: bool = False


class FakeStore:
    def __init__(self, db_path):
        self.path = db_path
        self.initialized = False

    def initialize(self):
        self.initialized = True


class FakeConfigEntries:
    def __init__(self):
        self.forwarded = 0
        self.unloaded = 0

    async def async_forward_entry_setups(self, entry, platforms):
        self.forwarded += 1

    async def async_unload_platforms(self, entry, platforms):
        self.unloaded += 1
        return True


class FakeHass:
    def __init__(self):
        self.config = SimpleNamespace(path=lambda *parts: '/tmp/' + '/'.join(parts))
        self.config_entries = FakeConfigEntries()

    async def async_add_executor_job(self, function, *args):
        return function(*args)


namespace = {
    'ShoppingHistoryStore': FakeStore,
    'ShoppingHistoryData': ShoppingHistoryData,
    'CONF_YEARLY_SENSORS': 'yearly_sensors',
    'PLATFORMS': ['sensor'],
    'DOMAIN': 'shopping_history',
    '_LOGGER': SimpleNamespace(debug=lambda *args: None, exception=lambda *args: None),
    'HomeAssistantError': Exception,
    'HomeAssistant': object,
    'ShoppingHistoryConfigEntry': object,
}
exec(compile(functions, str(CODE), 'exec'), namespace)


def test_disabling_sensors_unloads_previous_platform():
    async def scenario():
        hass = FakeHass()
        entry = SimpleNamespace(entry_id='a', options={'yearly_sensors': True})
        assert await namespace['async_setup_entry'](hass, entry) is True
        assert entry.runtime_data.yearly_sensors_loaded is True
        assert hass.config_entries.forwarded == 1
        entry.options = {'yearly_sensors': False}
        assert await namespace['async_unload_entry'](hass, entry) is True
        assert hass.config_entries.unloaded == 1
    asyncio.run(scenario())


def test_enabling_sensors_after_disabled_entry():
    async def scenario():
        hass = FakeHass()
        entry = SimpleNamespace(entry_id='b', options={'yearly_sensors': False})
        assert await namespace['async_setup_entry'](hass, entry) is True
        assert entry.runtime_data.yearly_sensors_loaded is False
        entry.options = {'yearly_sensors': True}
        assert await namespace['async_unload_entry'](hass, entry) is True
        assert hass.config_entries.unloaded == 0
        assert await namespace['async_setup_entry'](hass, entry) is True
        assert hass.config_entries.forwarded == 1
    asyncio.run(scenario())
