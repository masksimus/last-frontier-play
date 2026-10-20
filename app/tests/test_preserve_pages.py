"""Pages publication safety: old bytes survive and bad inputs abort before add."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "preserve_pages.py"
SPEC = importlib.util.spec_from_file_location("preserve_pages", SCRIPT)
preserver = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preserver)


def manifest(files):
    return (json.dumps({"schemaVersion": 1, "files": [
        {"path": name, "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
        for name, payload in files.items()]}, indent=2) + "\n").encode()


class PagesPreservationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "dist"
        self.source.mkdir()
        self.new_files = {"index.html": b"new isometric game", "src/game.js": b"new engine"}
        self.new_manifest = manifest(self.new_files)
        for name, payload in self.new_files.items():
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)
        (self.source / "build-manifest.json").write_bytes(self.new_manifest)
        self.archive = self.root / "new.zip"
        with ZipFile(self.archive, "w") as archive:
            for name, payload in self.new_files.items():
                archive.writestr(name, payload)
            archive.writestr("build-manifest.json", self.new_manifest)
        self.output = self.root / "pages"
        self.responses = {}
        for prefix in preserver.PREFIXES:
            files = {"index.html": (prefix + "historical entry").encode(),
                     "assets/old.bin": b"\x00\x01original media\xff"}
            self.responses[prefix + "build-manifest.json"] = manifest(files)
            self.responses.update({prefix + name: payload for name, payload in files.items()})
        for name in preserver.EXTRA_ARCHIVES:
            self.responses[name] = self.archive.read_bytes()

    def publish(self):
        def fetch(url):
            self.assertTrue(url.startswith("https://example.test/game/"))
            return self.responses[url.removeprefix("https://example.test/game/")]
        with patch.object(preserver, "fetch", side_effect=fetch):
            return preserver.preserve("https://example.test/game/", self.output,
                                      self.source, self.archive)

    def test_all_historical_versions_and_archives_preserved_exactly(self):
        report = self.publish()
        self.assertTrue(report["verified"])
        self.assertEqual(len(report["preserved"]), 6)
        self.assertEqual(len(report["archives"]), 5)
        for name, payload in self.responses.items():
            self.assertEqual((self.output / name).read_bytes(), payload, name)
        for name, payload in self.new_files.items():
            self.assertEqual((self.output / "outbreak" / name).read_bytes(), payload)
        self.assertEqual((self.output / "outbreak/build-manifest.json").read_bytes(), self.new_manifest)
        self.assertEqual((self.output / "outbreak/last-frontier-outbreak.zip").read_bytes(),
                         self.archive.read_bytes())
        self.assertTrue((self.output / ".nojekyll").is_file())

    def test_unsafe_or_duplicate_manifest_path_aborts(self):
        for name in ("../escape", "/absolute", "a/../b", "a//b", "a\\b", "a\x00b"):
            with self.subTest(name=name):
                raw = manifest({"index.html": b"old", name: b"bad"})
                with self.assertRaises(ValueError):
                    preserver.manifest_records(raw)
        record = json.loads(manifest({"index.html": b"old"}))["files"][0]
        with self.assertRaises(ValueError):
            preserver.manifest_records(json.dumps({"files": [record, record]}).encode())
        self.assertFalse((self.root / "escape").exists())

    def test_changed_historical_sha_aborts_before_new_game_is_added(self):
        self.responses["v9-2/assets/old.bin"] = b"unexpected replacement"
        with self.assertRaisesRegex(ValueError, "differs from its manifest"):
            self.publish()
        self.assertFalse((self.output / "outbreak").exists())
        self.assertFalse((self.output / ".nojekyll").exists())

    def test_tampered_distribution_is_rejected_before_fetch(self):
        (self.source / "src/game.js").write_bytes(b"tampered")
        with patch.object(preserver, "fetch") as fetch:
            with self.assertRaisesRegex(ValueError, "differs from its manifest"):
                preserver.preserve("https://example.test/game/", self.output,
                                    self.source, self.archive)
            fetch.assert_not_called()

    def test_current_archive_must_match_distribution(self):
        with ZipFile(self.archive, "w") as archive:
            archive.writestr("index.html", b"wrong release")
        with self.assertRaisesRegex(ValueError, "different files"):
            self.publish()
        self.assertFalse(self.output.exists())

    def test_nonempty_output_and_symlink_source_are_rejected(self):
        self.output.mkdir()
        old = self.output / "index.html"
        old.write_bytes(b"existing entry")
        with self.assertRaisesRegex(ValueError, "new or empty"):
            self.publish()
        self.assertEqual(old.read_bytes(), b"existing entry")
        link = self.root / "linked-dist"
        link.symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(ValueError):
            preserver.preserve("https://example.test/game/", self.root / "elsewhere",
                                link, self.archive)

    def test_unsafe_legacy_archive_aborts_before_new_game_is_added(self):
        bad_zip = self.root / "bad.zip"
        with ZipFile(bad_zip, "w") as archive:
            archive.writestr("../escape.txt", b"bad")
        self.responses[preserver.EXTRA_ARCHIVES[0]] = bad_zip.read_bytes()
        with self.assertRaisesRegex(ValueError, "Unsafe or duplicate ZIP"):
            self.publish()
        self.assertFalse((self.output / "outbreak").exists())


if __name__ == "__main__":
    unittest.main()
