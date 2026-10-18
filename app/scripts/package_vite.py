"""Add classic game scripts/assets to Vite's optional enhanced build."""
import json
from shutil import copy2

from package_dist import ARCHIVE_NAME, ROOT, copy_game_assets, package_distribution

dist = ROOT / 'dist'
copy_game_assets(ROOT, dist)
(dist / 'src').mkdir(exist_ok=True)
for source in sorted((ROOT / 'src').glob('*.js')):
    copy2(source, dist / 'src' / source.name)
version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
print(json.dumps(package_distribution(dist, ROOT / ARCHIVE_NAME, 'vite', version), ensure_ascii=False))
