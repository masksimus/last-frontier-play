"""Release integrity checks; no npm packages, downloads or browser required."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_release import build
from package_dist import (ARCHIVE_NAME, ReleaseError, package_distribution,
                          safe_name, verify_archive, verify_distribution)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'src').mkdir()
        (self.root / 'assets').mkdir()
        (self.root / 'package.json').write_text('{"version":"1.0.0-test"}')
        (self.root / 'styles.css').write_text('body { color: white; }')
        for name in ('core.js', 'animation.js', 'combat-v8.js', 'game.js'):
            (self.root / 'src' / name).write_text('// game code: ' + name)
        (self.root / 'src/pixi-layer.mjs').write_text("import 'pixi.js';")
        (self.root / 'assets/icon.svg').write_text('<svg/>')
        (self.root / 'index.html').write_text(
            '<link rel="stylesheet" href="styles.css">'
            '<script type="module" src="./src/pixi-layer.mjs"></script>'
            '<script src="src/core.js"></script><script src="src/game.js"></script>')

    def test_offline_build_has_only_resolvable_local_scripts(self):
        result = build(self.root)
        self.assertEqual(result['mode'], 'canvas')
        self.assertNotIn('pixi-layer', (self.root / 'dist/index.html').read_text())
        self.assertFalse((self.root / 'dist/src/pixi-layer.mjs').exists())
        self.assertEqual(json.loads((self.root / 'dist/THIRD_PARTY_LICENSES/PACKAGES.json').read_text()), [])
        self.assertEqual(verify_distribution(self.root / 'dist'), verify_archive(self.root / ARCHIVE_NAME))

    def test_rebuild_is_byte_identical_and_removes_stale_output(self):
        first = build(self.root)
        archive_before = (self.root / ARCHIVE_NAME).read_bytes()
        (self.root / 'dist/stale.txt').write_text('old build')
        os.utime(self.root / 'src/game.js', (1234567890, 1234567890))
        second = build(self.root)
        self.assertFalse((self.root / 'dist/stale.txt').exists())
        self.assertEqual(first['sha256'], second['sha256'])
        self.assertEqual(archive_before, (self.root / ARCHIVE_NAME).read_bytes())

    def test_dist_tampering_is_detected(self):
        build(self.root)
        (self.root / 'dist/src/game.js').write_text('tampered game')
        with self.assertRaisesRegex(ReleaseError, 'differs from manifest'):
            verify_distribution(self.root / 'dist')

    def test_unlisted_dist_file_is_detected(self):
        build(self.root)
        (self.root / 'dist/extra.txt').write_text('unexpected')
        with self.assertRaisesRegex(ReleaseError, 'Unlisted'):
            verify_distribution(self.root / 'dist')

    def test_incomplete_archive_is_rejected_even_with_consistent_manifest(self):
        output = self.root / 'incomplete.zip'
        payload = b'hello'
        manifest = {'files': [{'path': 'hello.txt', 'bytes': len(payload),
                               'sha256': hashlib.sha256(payload).hexdigest()}]}
        with ZipFile(output, 'w') as archive:
            archive.writestr('hello.txt', payload)
            archive.writestr('build-manifest.json', json.dumps(manifest))
        with self.assertRaisesRegex(ReleaseError, 'Missing required release files'):
            verify_archive(output)

    def test_archive_tampering_is_detected(self):
        build(self.root)
        source = self.root / ARCHIVE_NAME
        altered = self.root / 'altered.zip'
        with ZipFile(source) as original, ZipFile(altered, 'w') as changed:
            for name in original.namelist():
                changed.writestr(name, b'changed' if name == 'src/game.js' else original.read(name))
        with self.assertRaisesRegex(ReleaseError, 'differs from manifest'):
            verify_archive(altered)

    def test_missing_html_resource_is_detected(self):
        (self.root / 'index.html').write_text('<script src="missing.js"></script>')
        with self.assertRaisesRegex(ReleaseError, 'Missing or unsafe HTML resource'):
            build(self.root)

    def test_external_resources_are_rejected(self):
        (self.root / 'index.html').write_text('<script src="https://cdn.example/game.js"></script>')
        with self.assertRaisesRegex(ReleaseError, 'local relative URLs'):
            build(self.root)

    def test_unsafe_names_are_rejected(self):
        for name in ('../game.js', '/game.js', 'a/../game.js', 'a\\game.js', '.env',
                     'C:/game.js', 'assets/.secret', 'assets/source.map', 'old.zip', 'bad\n.js'):
            with self.subTest(name=name):
                self.assertFalse(safe_name(name))
        self.assertTrue(safe_name('assets/characters/player.webp'))

    def test_symlink_in_source_is_rejected_before_copy(self):
        (self.root / 'assets/linked.svg').symlink_to(self.root / 'package.json')
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            build(self.root)

    def test_unavailable_vite_notices_fail_honestly(self):
        build(self.root)
        with self.assertRaisesRegex(ReleaseError, 'Installed package metadata missing'):
            package_distribution(self.root / 'dist', self.root / 'vite.zip', 'vite', root=self.root)

    def test_blender_source_is_excluded_but_runtime_art_is_packaged(self):
        (self.root / 'assets/art-source').mkdir()
        (self.root / 'assets/art-source/model.blend').write_bytes(b'editable source')
        (self.root / 'assets/relay.blend1').write_bytes(b'backup')
        (self.root / 'assets/relay.png').write_bytes(b'game art')
        build(self.root)
        self.assertFalse((self.root / 'dist/assets/art-source').exists())
        self.assertFalse((self.root / 'dist/assets/relay.blend1').exists())
        self.assertEqual((self.root / 'dist/assets/relay.png').read_bytes(), b'game art')


if __name__ == '__main__':
    unittest.main()
