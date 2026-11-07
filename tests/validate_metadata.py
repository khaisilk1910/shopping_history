"""Check Marketplace repository metadata and static configuration files."""
import json
from pathlib import Path
import yaml
root = Path(__file__).resolve().parents[1]
repo = json.loads((root/'hacs.json').read_text())
manifest = json.loads((root/'custom_components/shopping_history/manifest.json').read_text())
assert manifest['domain'] == 'shopping_history'
assert manifest['config_flow'] is True
assert manifest['version']
assert manifest['documentation'].startswith('https://')
assert manifest['issue_tracker'].startswith('https://')
assert 'lovelace' in manifest['dependencies']
assert 'productivity_information.shopping_groceries' in manifest['categories']
assert repo['name']
assert repo['homeassistant'] == '2026.11.0'
for filename in ['strings.json','translations/vi.json','translations/en.json']:
    content = json.loads((root/'custom_components/shopping_history'/filename).read_text())
    assert content['config']['step']['user']['data']['friendly_name']
    assert content['options']['step']['init']['data']['yearly_sensors']
services = yaml.safe_load((root/'custom_components/shopping_history/services.yaml').read_text())
assert {'add_order','edit_order','delete_order'} <= set(services)
for name in ('add_order', 'edit_order', 'delete_order'):
    assert services[name]['fields']['entry_id']['selector']['config_entry']['integration'] == 'shopping_history'
print('Metadata, options translations and action descriptors OK')
