#!/usr/bin/env python3
"""Scan a skill package for likely personal or environment-specific data."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


BUILTIN_PATTERNS = {
    "windows-absolute-path": re.compile(r"\b[A-Za-z]:\\(?:Users|Documents and Settings|[^\s\\]+)\\", re.I),
    "unix-home-path": re.compile(r"/(?:Users|home)/[^/\s]+/"),
    "email": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
    "user-open-id": re.compile(r"\bou_[A-Za-z0-9_-]{8,}\b"),
    "secret-assignment": re.compile(r"(?i)\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[^\s'\"]{8,}"),
    "personal-github-url": re.compile(r"https?://github\.com/[^/\s]+(?:/[^\s]+)?", re.I),
}


def text_files(root: Path):
    for path in root.rglob("*"):
        if path.is_file() and ".git" not in path.parts:
            try:
                yield path, path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue


def scan_paths(paths: list[Path], denied_literals: list[str]) -> list[str]:
    findings: list[str] = []
    for root_arg in paths:
        root = root_arg.resolve()
        for path, text in text_files(root):
            for label, pattern in BUILTIN_PATTERNS.items():
                for match in pattern.finditer(text):
                    line = text.count("\n", 0, match.start()) + 1
                    findings.append(f"{path}:{line}: {label}")
            lowered = text.casefold()
            for denied in denied_literals:
                if denied and denied.casefold() in lowered:
                    findings.append(f"{path}: denied literal")
    return sorted(set(findings))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    parser.add_argument("--deny", action="append", default=[], help="Additional literal string to reject")
    args = parser.parse_args()
    findings = scan_paths(args.paths, args.deny)
    if findings:
        for finding in findings:
            print(f"ERROR: {finding}")
        return 1
    print(f"OK: no personal or environment-specific data found in {len(args.paths)} path(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
