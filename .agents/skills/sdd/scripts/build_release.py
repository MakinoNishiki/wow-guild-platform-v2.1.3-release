#!/usr/bin/env python3
"""Build a deterministic, manifest-scoped SDD workbench release."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from privacy_scan import BUILTIN_PATTERNS, scan_paths
from validate_group import (
    bundled_workflows,
    manifest_values,
    release_manifest,
    relevant_files,
    validate_group,
)


def write_json(path: Path, value: dict[str, Any]) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    path.write_text(text, encoding="utf-8", newline="\n")


def installation_text(profile: str, workflows: list[str]) -> str:
    workflow_lines = "\n".join(f"- `{name}`" for name in workflows)
    profile_note = (
        "This minimal profile can create a lifecycle plan. If a selected downstream workflow is absent, "
        "SDD must report the missing capability and point to the full profile."
        if profile == "minimal"
        else "This full profile includes all twelve portable product-lifecycle workflows."
    )
    return f"""> **Document name**: SDD Workbench {profile.title()} Installation
> **Purpose**: Install and verify the {profile} profile without changing project authorization.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Included workflow layer, installation, verification, and upgrade behavior.

---

# Install the {profile} profile

Copy every directory under `skills/` into one Agent Skills discovery root. Keep the seven `sdd*` core directories and the workflow directories as siblings. Restart or open a new session when the runtime requires discovery refresh.

{profile_note}

Bundled workflows:

{workflow_lines}

After installation, invoke `sdd-status` explicitly in a project with a confirmed plan. For a broad requirement without a plan, invoke `sdd-next`; it should route to the `project-scope-breakdown` workflow. Workflow routing never grants execution authorization.

Verify package integrity by recalculating `checksums.sha256` against files below `skills/`. `manifest.json` declares the profile, exact core list, bundled workflows, and upstream lock.
"""


def remove_generated_tree(path: Path, expected_parent: Path) -> None:
    resolved = path.resolve()
    if resolved.parent != expected_parent.resolve():
        raise ValueError(f"refusing to remove path outside output parent: {resolved}")
    if resolved.is_dir():
        shutil.rmtree(resolved)
    elif resolved.exists():
        raise ValueError(f"expected a directory but found a file: {resolved}")


def guard_paths(source_parent: Path, output: Path) -> None:
    source = source_parent.resolve()
    target = output.resolve()
    if source == target or source in target.parents or target in source.parents:
        raise ValueError("source parent and release output must not contain one another")


def build(
    source_parent: Path,
    portable_root: Path,
    profile: str,
    output: Path,
    denied_literals: list[str],
) -> tuple[int, int, int]:
    source_parent = source_parent.resolve()
    portable_root = portable_root.resolve()
    output = output.resolve()
    guard_paths(source_parent, output)
    guard_paths(portable_root, output)
    manifest = manifest_values(source_parent)
    source_manifest, source_errors = validate_group(
        source_parent,
        profile=profile,
        portable_root=portable_root,
    )
    if source_manifest is None or source_errors:
        raise ValueError("source validation failed: " + "; ".join(source_errors))

    output.parent.mkdir(parents=True, exist_ok=True)
    stage = output.with_name(f".{output.name}.building")
    backup = output.with_name(f".{output.name}.previous")
    remove_generated_tree(stage, output.parent)
    remove_generated_tree(backup, output.parent)
    stage.mkdir()
    skill_root = stage / "skills"
    skill_root.mkdir()

    ignore = shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo")
    try:
        for member in manifest["members"]:
            shutil.copytree(
                source_parent / member,
                skill_root / member,
                ignore=ignore,
            )
        for workflow in bundled_workflows(manifest, profile):
            shutil.copytree(
                portable_root / workflow,
                skill_root / workflow,
                ignore=ignore,
            )
        lock_path = portable_root.parent / "upstream-lock.json"
        if not lock_path.is_file():
            raise ValueError(f"missing portable upstream lock: {lock_path}")
        shutil.copy2(lock_path, stage / "upstream-lock.json")
        write_json(stage / "manifest.json", release_manifest(manifest, profile))
        (stage / "INSTALL.md").write_text(
            installation_text(profile, bundled_workflows(manifest, profile)),
            encoding="utf-8",
            newline="\n",
        )

        staged_manifest, staged_errors = validate_group(
            skill_root,
            exact_members=True,
            profile=profile,
        )
        if staged_manifest is None or staged_errors:
            raise ValueError("staged release validation failed: " + "; ".join(staged_errors))

        findings = scan_paths([stage], denied_literals)
        if findings:
            raise ValueError("privacy scan failed: " + "; ".join(findings))
        privacy_report = {
            "schema_version": 1,
            "status": "pass",
            "scope": "entire release package",
            "built_in_checks": sorted(BUILTIN_PATTERNS),
            "additional_denied_literals": {
                "count": len(denied_literals),
                "values_embedded": False,
            },
            "result": "No personal or environment-specific data found.",
        }
        write_json(stage / "privacy-report.json", privacy_report)

        files = relevant_files(skill_root)
        checksum_lines = []
        for rel, path in sorted(files.items()):
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            checksum_lines.append(f"{digest}  skills/{rel}")
        (stage / "checksums.sha256").write_text(
            "\n".join(checksum_lines) + "\n",
            encoding="utf-8",
            newline="\n",
        )

        if output.exists():
            output.rename(backup)
        try:
            stage.rename(output)
        except Exception:
            if backup.exists() and not output.exists():
                backup.rename(output)
            raise
        remove_generated_tree(backup, output.parent)
    except Exception:
        remove_generated_tree(stage, output.parent)
        raise
    return (
        len(manifest["members"]),
        len(bundled_workflows(manifest, profile)),
        len(files),
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-parent",
        type=Path,
        default=SCRIPT_DIR.parents[1],
        help="Directory containing the canonical seven workbench core skill directories",
    )
    parser.add_argument(
        "--portable-root",
        required=True,
        type=Path,
        help="Directory containing portable workflow skill directories",
    )
    parser.add_argument(
        "--profile",
        required=True,
        choices=("minimal", "full"),
        help="Workflow package profile to build",
    )
    parser.add_argument("--output", required=True, type=Path, help="Release output directory")
    parser.add_argument(
        "--deny",
        action="append",
        default=[],
        help="Private literal to reject without embedding it in the package",
    )
    args = parser.parse_args()
    try:
        member_count, companion_count, file_count = build(
            args.source_parent,
            args.portable_root,
            args.profile,
            args.output,
            args.deny,
        )
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}")
        return 1
    print(
        f"OK: built profile {args.profile} with {member_count} core members and "
        f"{companion_count} bundled workflows with "
        f"{file_count} checksummed files at {args.output.resolve()}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
