"""Validate and reproducibly package a static game. Requires only Python 3.

The archive is a local release candidate, not a store certification. Vite builds
must include licenses from the exact installed dependency versions.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import stat
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from shutil import copy2, copytree, ignore_patterns
from urllib.parse import unquote, urlsplit
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_NAME = 'last-frontier-release.zip'
MANIFEST_NAME = 'build-manifest.json'
REQUIRED_FILES = {'index.html', 'src/core.js', 'src/animation.js',
                  'src/combat-v8.js', 'src/game.js', 'assets/icon.svg'}


def copy_game_assets(root: Path, dist: Path) -> None:
    """Keep Blender working files outside downloadable browser artifacts."""
    copytree(root / 'assets', dist / 'assets', dirs_exist_ok=True,
             ignore=ignore_patterns('.*', 'art-source', '*.blend', '*.blend[0-9]', '__pycache__', '*.pyc'))


class ReleaseError(ValueError):
    """A release is incomplete or contains an unsafe file."""


def safe_name(name: str) -> bool:
    path = PurePosixPath(name)
    return (bool(name) and not path.is_absolute() and '\\' not in name
            and not any(ord(char) < 32 for char in name)
            and not any(not part or part.startswith('.') or ':' in part for part in name.split('/'))
            and path.suffix.lower() not in ('.map', '.zip'))


def release_files(dist: Path) -> list[Path]:
    files = []
    for path in sorted(dist.rglob('*')):
        if path.is_symlink():
            raise ReleaseError(f'Symlinks are not allowed in a release: {path}')
        if not path.is_file():
            continue
        name = path.relative_to(dist).as_posix()
        if not safe_name(name) or any(p.startswith('.') for p in Path(name).parts):
            raise ReleaseError(f'Unsafe release path: {name}')
        if path.suffix.lower() in ('.map', '.zip'):
            raise ReleaseError(f'Unexpected development/archive file: {name}')
        files.append(path)
    return files


class LocalReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == 'src' or (tag == 'link' and key == 'href'):
                if value:
                    self.urls.append(value)


def validate_distribution(dist: Path) -> None:
    for name in sorted(REQUIRED_FILES):
        if not (dist / name).is_file():
            raise ReleaseError(f'Missing game file: {name}')
    parser = LocalReferences()
    parser.feed((dist / 'index.html').read_text(encoding='utf-8'))
    for url in parser.urls:
        parts = urlsplit(url)
        if parts.scheme == 'data':
            continue
        if parts.scheme or parts.netloc or parts.path.startswith('/'):
            raise ReleaseError(f'Release resources must use local relative URLs: {url}')
        name = unquote(parts.path)
        while name.startswith('./'):
            name = name[2:]
        if not safe_name(name) or not (dist / name).is_file():
            raise ReleaseError(f'Missing or unsafe HTML resource: {url}')
    release_files(dist)


def write_notices(dist: Path, mode: str, root: Path = ROOT) -> list[dict]:
    notices = dist / 'THIRD_PARTY_LICENSES'
    notices.mkdir(exist_ok=True)
    entries = []
    if mode == 'vite':
        for name in ('pixi.js', 'howler', 'vite'):
            package_dir = root / 'node_modules' / name
            manifest_file = package_dir / 'package.json'
            if not manifest_file.is_file():
                raise ReleaseError(f'Installed package metadata missing: {name}')
            manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
            candidates = sorted(path for path in package_dir.iterdir()
                                if path.is_file() and path.name.lower().startswith(
                                    ('license', 'licence', 'copying')))
            if not candidates:
                raise ReleaseError(f'Missing source license notice: {name}')
            dest = notices / (name.replace('.', '_') + '-LICENSE.txt')
            copy2(candidates[0], dest)
            entries.append({'package': name, 'version': manifest['version'],
                            'license': manifest.get('license', 'SEE LICENSE'),
                            'file': dest.relative_to(dist).as_posix(),
                            'usage': 'build-tool' if name == 'vite' else 'runtime'})
    (notices / 'PACKAGES.json').write_text(
        json.dumps(entries, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return entries


def write_manifest(dist: Path, mode: str, version: str) -> dict:
    records = [{'path': path.relative_to(dist).as_posix(),
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'bytes': path.stat().st_size}
               for path in release_files(dist) if path.relative_to(dist).as_posix() != MANIFEST_NAME]
    manifest = {'schemaVersion': 1, 'version': version, 'buildMode': mode, 'files': records}
    (dist / MANIFEST_NAME).write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return manifest


def verify_records(manifest: dict, names: set[str], read) -> None:
    required = REQUIRED_FILES | {MANIFEST_NAME, 'THIRD_PARTY_LICENSES/PACKAGES.json'}
    if not required.issubset(names):
        raise ReleaseError(f'Missing required release files: {sorted(required - names)}')
    records = manifest.get('files')
    if not isinstance(records, list) or not records:
        raise ReleaseError('Empty or invalid build manifest')
    recorded = set()
    for item in records:
        name = item['path']
        if not safe_name(name) or name == MANIFEST_NAME or name in recorded:
            raise ReleaseError(f'Unsafe or duplicate manifest entry: {name}')
        recorded.add(name)
        if name not in names:
            raise ReleaseError(f'Manifest file is missing: {name}')
        payload = read(name)
        if len(payload) != item['bytes'] or hashlib.sha256(payload).hexdigest() != item['sha256']:
            raise ReleaseError(f'File differs from manifest: {name}')
    if names != recorded | {MANIFEST_NAME}:
        raise ReleaseError(f'Unlisted release files: {sorted(names - recorded - {MANIFEST_NAME})}')


def verify_distribution(dist: Path) -> dict:
    validate_distribution(dist)
    manifest = json.loads((dist / MANIFEST_NAME).read_text(encoding='utf-8'))
    names = {path.relative_to(dist).as_posix() for path in release_files(dist)}
    verify_records(manifest, names, lambda name: (dist / name).read_bytes())
    return manifest


def verify_archive(output: Path) -> dict:
    with ZipFile(output) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or any(not safe_name(n) for n in names):
            raise ReleaseError('Unsafe or duplicate archive member')
        if archive.testzip() is not None:
            raise ReleaseError('Archive CRC verification failed')
        manifest = json.loads(archive.read(MANIFEST_NAME))
        verify_records(manifest, set(names), archive.read)
    return manifest


def package_distribution(dist: Path, output: Path, mode: str = 'canvas',
                         version: str = 'development', root: Path = ROOT) -> dict:
    validate_distribution(dist)
    packages = write_notices(dist, mode, root)
    manifest = write_manifest(dist, mode, version)
    verify_distribution(dist)
    # Ignore source timestamps, host permissions and timezone for identical ZIPs.
    with ZipFile(output, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in release_files(dist):
            info = ZipInfo(path.relative_to(dist).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    verify_archive(output)
    return {'archive': str(output), 'bytes': output.stat().st_size,
            'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
            'files': len(manifest['files']) + 1, 'mode': mode, 'licenses': packages}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=ROOT / 'dist')
    parser.add_argument('--output', type=Path, default=ROOT / ARCHIVE_NAME)
    parser.add_argument('--mode', choices=('canvas', 'vite'), default='canvas')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    if args.verify_only:
        manifest = verify_distribution(args.dist)
        if manifest != verify_archive(args.output):
            raise ReleaseError('Archive and dist describe different builds')
        print(json.dumps({'verified': True, 'files': len(manifest['files'])}, ensure_ascii=False))
        return
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    print(json.dumps(package_distribution(args.dist, args.output, args.mode, version), ensure_ascii=False))


if __name__ == '__main__':
    main()
