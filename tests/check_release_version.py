"""Reject a release whose tag doesn't match the Marketplace manifest."""
import json
import os
from pathlib import Path
version = json.loads(Path('custom_components/shopping_history/manifest.json').read_text())['version']
tag = os.environ['RELEASE_TAG'].removeprefix('v')
if tag != version:
    raise SystemExit(f'Release tag {tag} differs from manifest version {version}')
print('Release version matches:', version)
