#!/usr/bin/env python3
"""Build a deterministic cross-platform ZIP from an SDD workbench release tree."""

from __future__ import annotations

import argparse
import hashlib
import sys
import zipfile
from pathlib import Path


FIXED_TIME = (1980, 1, 1, 0, 0, 0)


def build_zip(release_root: Path, output: Path) -> tuple[int, str]:
    release_root = release_root.resolve()
    output = output.resolve()
    if not release_root.is_dir():
        raise ValueError(f"release root is unavailable: {release_root}")
    if release_root == output or release_root in output.parents:
        raise ValueError("ZIP output must be outside the release tree")
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = output.with_name(f".{output.name}.building")
    if stage.exists():
        stage.unlink()

    files = sorted(
        (path for path in release_root.rglob("*") if path.is_file()),
        key=lambda path: path.relative_to(release_root).as_posix(),
    )
    try:
        with zipfile.ZipFile(
            stage,
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
        ) as archive:
            for path in files:
                name = path.relative_to(release_root).as_posix()
                info = zipfile.ZipInfo(name, FIXED_TIME)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        stage.replace(output)
    except Exception:
        if stage.exists():
            stage.unlink()
        raise
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    return len(files), digest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("release_root", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        count, digest = build_zip(args.release_root, args.output)
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}")
        return 1
    print(f"OK: built cross-platform ZIP with {count} files")
    print(f"SHA256={digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
