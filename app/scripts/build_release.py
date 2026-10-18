"""Build the complete Canvas game without network access or npm dependencies."""
from __future__ import annotations

import json
import re
from pathlib import Path
from shutil import copy2, rmtree

from package_dist import ARCHIVE_NAME, ROOT, copy_game_assets, package_distribution


def build(root: Path = ROOT) -> dict:
    dist = root / 'dist'
    for name in ('index.html', 'styles.css', 'assets', 'src'):
        source = root / name
        if source.is_symlink() or any(path.is_symlink() for path in source.rglob('*')):
            raise ValueError(f'Symlink in release source: {name}')
    # Refuse a symlink rather than removing or writing outside the project.
    if dist.is_symlink():
        raise ValueError('dist must not be a symlink')
    if dist.exists():
        rmtree(dist)
    dist.mkdir()
    html = (root / 'index.html').read_text(encoding='utf-8')
    # Pixi's optional enhancement needs npm bundles. Canvas is the fully local
    # renderer; do not ship a module with unresolved browser package imports.
    html = re.sub(r'<script\b[^>]*\bsrc=["\'](?:\./)?src/(?:pixi-layer|outbreak-pixi)\.mjs["\'][^>]*>\s*</script>',
                  '', html, flags=re.IGNORECASE)
    (dist / 'index.html').write_text(html, encoding='utf-8')
    copy2(root / 'styles.css', dist / 'styles.css')
    copy_game_assets(root, dist)
    (dist / 'src').mkdir()
    for source in sorted((root / 'src').iterdir()):
        if source.is_file() and source.suffix in ('.js', '.mjs') and source.name not in ('pixi-layer.mjs', 'outbreak-pixi.mjs'):
            copy2(source, dist / 'src' / source.name)
    version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
    return package_distribution(dist, root / ARCHIVE_NAME, 'canvas', version, root)


if __name__ == '__main__':
    print(json.dumps(build(), ensure_ascii=False))
