"""Preserve deployed version manifests byte-for-byte and add /outbreak/.

Used only by Pages CI. A failed download, manifest mismatch, unsafe path or ZIP
aborts the build before an artifact can be deployed.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import shutil
import time
from pathlib import Path, PurePosixPath
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen
from zipfile import ZipFile

PREFIXES = ("", "v9/", "v9-2/", "v9-3/", "v10/", "v11/")
EXTRA_ARCHIVES = (
    "v9/last-frontier-v9.1-rc1-yandex.zip",
    "v9-2/last-frontier-v9-2-experimental-yandex.zip",
    "v9-3/last-frontier-v9-3-art-preview-yandex.zip",
    "v10/last-frontier-v10-blender-hd-yandex.zip",
    "v11/last-frontier-v11-aegis3d-yandex.zip",
)
SHA256 = re.compile(r"[0-9a-f]{64}\Z")


def safe_path(name: str) -> bool:
    if not isinstance(name, str) or not name or "\\" in name:
        return False
    parts = name.split("/")
    return (not PurePosixPath(name).is_absolute()
            and not any(part in ("", ".", "..") or ":" in part for part in parts)
            and not any(ord(char) < 32 or ord(char) == 127 for char in name))


def manifest_records(raw: bytes) -> list[dict]:
    manifest = json.loads(raw)
    records = manifest.get("files")
    if not isinstance(records, list) or not records or len(records) > 10000:
        raise ValueError("Empty or invalid version manifest")
    seen = set()
    for record in records:
        name = record.get("path")
        if not safe_path(name) or name == "build-manifest.json" or name in seen:
            raise ValueError(f"Unsafe or duplicate manifest path: {name!r}")
        if (not isinstance(record.get("bytes"), int) or isinstance(record["bytes"], bool)
                or not 0 <= record["bytes"] <= 200_000_000
                or not isinstance(record.get("sha256"), str)
                or not SHA256.fullmatch(record["sha256"])):
            raise ValueError(f"Invalid manifest record: {name}")
        seen.add(name)
    if "index.html" not in seen:
        raise ValueError("Version manifest has no index.html")
    return records


def verify_payload(payload: bytes, record: dict) -> None:
    if (len(payload) != record["bytes"]
            or hashlib.sha256(payload).hexdigest() != record["sha256"]):
        raise ValueError(f"Published file differs from its manifest: {record['path']}")


def verify_archive(path: Path) -> None:
    with ZipFile(path) as archive:
        names = archive.namelist()
        canonical = [name.rstrip("/") for name in names]
        if len(canonical) != len(set(canonical)) or any(not safe_path(name) for name in canonical):
            raise ValueError(f"Unsafe or duplicate ZIP member: {path.name}")
        if archive.testzip() is not None:
            raise ValueError(f"ZIP CRC verification failed: {path.name}")


def fetch(url: str) -> bytes:
    for attempt in range(4):
        try:
            request = Request(url, headers={"User-Agent": "LastFrontier-Outbreak-Preserver/1"})
            with urlopen(request, timeout=35) as response:
                if response.status != 200:
                    raise ValueError(f"HTTP {response.status}: {url}")
                return response.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(attempt + 1)
    raise AssertionError("Unreachable")


def write_new(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Explicit exclusive mode prevents prefixes from overwriting each other.
    with path.open("xb") as output:
        output.write(payload)


def preserve(base: str, output: Path, source: Path, archive: Path) -> dict:
    parts = urlsplit(base)
    if parts.scheme != "https" or not parts.netloc or parts.query or parts.fragment:
        raise ValueError("Pages base URL must be an HTTPS directory URL")
    base = base.rstrip("/") + "/"
    if output.is_symlink() or (output.exists() and any(output.iterdir())):
        raise ValueError("Pages output must be a new or empty directory")
    if source.is_symlink() or not source.is_dir() or not archive.is_file():
        raise ValueError("Verified game distribution and archive are required")
    if output.resolve().is_relative_to(source.resolve()) or source.resolve().is_relative_to(output.resolve()):
        raise ValueError("Distribution and Pages output must be separate directories")
    current_raw = (source / "build-manifest.json").read_bytes()
    current = manifest_records(current_raw)
    names = set()
    for item in source.rglob("*"):
        if item.is_symlink():
            raise ValueError(f"Distribution contains a symlink: {item}")
        if item.is_file():
            names.add(item.relative_to(source).as_posix())
    if names != {item["path"] for item in current} | {"build-manifest.json"}:
        raise ValueError("Distribution contains missing or unlisted files")
    for record in current:
        verify_payload((source / record["path"]).read_bytes(), record)
    verify_archive(archive)
    with ZipFile(archive) as current_zip:
        if set(current_zip.namelist()) != names:
            raise ValueError("Game archive and distribution contain different files")
        if current_zip.read("build-manifest.json") != current_raw:
            raise ValueError("Game archive manifest differs from distribution")
        for record in current:
            verify_payload(current_zip.read(record["path"]), record)
    output.mkdir(parents=True, exist_ok=True)
    report = {"preserved": [], "archives": [], "added": "outbreak/"}
    for prefix in PREFIXES:
        raw = fetch(base + prefix + "build-manifest.json")
        records = manifest_records(raw)

        def preserve_file(record):
            payload = fetch(base + prefix + quote(record["path"], safe="/"))
            verify_payload(payload, record)
            write_new(output / prefix / record["path"], payload)

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            list(executor.map(preserve_file, records))
        write_new(output / prefix / "build-manifest.json", raw)
        report["preserved"].append({"prefix": prefix or "/", "files": len(records),
                                    "manifestSHA256": hashlib.sha256(raw).hexdigest()})
        print(f"Preserved {prefix or '/'}: {len(records)} verified files", flush=True)
    for name in EXTRA_ARCHIVES:
        path = output / name
        if path.exists():
            # Some historical manifests may already list their downloadable ZIP.
            payload = fetch(base + quote(name, safe="/"))
            if payload != path.read_bytes():
                raise ValueError(f"Archive changed during preservation: {name}")
        else:
            write_new(path, fetch(base + quote(name, safe="/")))
        verify_archive(path)
        report["archives"].append({"path": name, "bytes": path.stat().st_size,
                                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    # All historical files have now passed verification. Add only the new route.
    shutil.copytree(source, output / "outbreak")
    shutil.copy2(archive, output / "outbreak" / "last-frontier-outbreak.zip")
    (output / ".nojekyll").touch(exist_ok=False)
    for prefix in PREFIXES:
        raw = (output / prefix / "build-manifest.json").read_bytes()
        for record in manifest_records(raw):
            verify_payload((output / prefix / record["path"]).read_bytes(), record)
    report["verified"] = True
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="https://masksimus.github.io/last-frontier-play/")
    parser.add_argument("--output", type=Path, default=Path("pages-outbreak"))
    parser.add_argument("--dist", type=Path, default=Path("app/dist"))
    parser.add_argument("--archive", type=Path, default=Path("app/last-frontier-release.zip"))
    parser.add_argument("--report", type=Path, default=Path("outbreak-pages-preservation.json"))
    args = parser.parse_args()
    report = preserve(args.base, args.output, args.dist, args.archive)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
