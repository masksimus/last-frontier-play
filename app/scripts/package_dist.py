"""Package the Vite build for Yandex Games with real third-party notices.

This is a packaging/provenance check, not store approval or device testing.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from shutil import copy2, copytree
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
assert (DIST / 'index.html').is_file(), 'Vite output missing index.html'
copytree(ROOT / 'assets', DIST / 'assets', dirs_exist_ok=True)
copy2(ROOT / 'THIRD_PARTY_NOTICES.md', DIST / 'THIRD_PARTY_NOTICES.md')
(DIST / 'src').mkdir(exist_ok=True)
for name in ('core.js', 'animation.js', 'combat-v8.js', 'game.js'):
    copy2(ROOT / 'src' / name, DIST / 'src' / name)

notices = DIST / 'THIRD_PARTY_LICENSES'
notices.mkdir(exist_ok=True)
entries = []
for name in ('pixi.js', 'howler', 'vite', 'three', '@dimforge/rapier3d-compat'):
    package_dir = ROOT / 'node_modules' / name
    manifest = json.loads((package_dir / 'package.json').read_text(encoding='utf-8'))
    candidates = [path for path in package_dir.iterdir() if path.is_file() and
                  path.name.lower().startswith(('license', 'licence', 'copying'))]
    if not candidates and name == '@dimforge/rapier3d-compat':
        candidates = [ROOT / 'assets/models/RAPIER-LICENSE.txt']
    if not candidates:
        raise RuntimeError('Missing source license notice for ' + name)
    candidate = sorted(candidates, key=lambda path: (not path.name.lower().startswith('license'), path.name))[0]
    dest = notices / (name.replace('.', '_').replace('/', '_').replace('@', '') + '-LICENSE.txt')
    copy2(candidate, dest)
    entries.append({'package': name, 'version': manifest['version'],
                    'license': manifest.get('license', 'SEE LICENSE'),
                    'file': str(dest.relative_to(DIST))})
(notices / 'PACKAGES.json').write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding='utf-8')

assert (DIST / 'src/game.js').is_file()
assert any((DIST / 'assets/characters').glob('*.webp'))

files = sorted(path for path in DIST.rglob('*') if path.is_file() and path.name != 'build-manifest.json')
records = [{'path': path.relative_to(DIST).as_posix(),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'bytes': path.stat().st_size} for path in files]
(DIST / 'build-manifest.json').write_text(
    json.dumps({'files': records}, indent=2, ensure_ascii=False), encoding='utf-8')

output = ROOT / 'last-frontier-v9-yandex.zip'
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=7) as archive:
    for file in sorted(path for path in DIST.rglob('*') if path.is_file()):
        archive.write(file, file.relative_to(DIST).as_posix())
with ZipFile(output) as archive:
    names = set(archive.namelist())
    required = {'index.html', 'src/game.js', 'build-manifest.json', 'THIRD_PARTY_LICENSES/PACKAGES.json'}
    assert required.issubset(names), required - names
    assert any(n.startswith('assets/index-') and n.endswith('.js') for n in names), 'No bundled PixiJS entrypoint'
    assert not any(n.startswith('/') or '..' in Path(n).parts for n in names)
    assert not any(n.lower().endswith('.map') for n in names), 'Unexpected source map'
    assert all(hashlib.sha256(archive.read(item['path'])).hexdigest() == item['sha256'] for item in records)
print(json.dumps({'archive': str(output), 'bytes': output.stat().st_size,
                  'files': len(names), 'licenses': entries}, ensure_ascii=False))
