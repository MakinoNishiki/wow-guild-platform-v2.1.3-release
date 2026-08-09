#!/usr/bin/env python3
"""Test profile routing against real minimal/full release directories."""

from __future__ import annotations

import argparse
import copy
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from privacy_scan import scan_paths
from validate_group import PROJECT_INIT_SUPPORT, validate_companion

CORE = {
    "sdd", "sdd-help", "sdd-project", "sdd-status",
    "sdd-next", "sdd-how", "sdd-check",
}


def load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def installed_skills(release_root: Path) -> set[str]:
    return {
        path.name
        for path in (release_root / "skills").iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    }


def manifest_errors(manifest: dict[str, object], registry: dict[str, object]) -> list[str]:
    errors = []
    members = manifest.get("members", [])
    profiles = manifest.get("workflows", {}).get("profiles", {})
    if set(members) != CORE or len(members) != 7 or manifest.get("core") != "sdd":
        errors.append("core members differ from the exact seven-member set")
    if "project-scope-breakdown" in members:
        errors.append("project-scope-breakdown is a workflow, not core")
    if profiles.get("minimal", {}).get("bundled") != ["project-scope-breakdown"]:
        errors.append("minimal workflow set is invalid")
    if len(profiles.get("full", {}).get("bundled", [])) != 12:
        errors.append("full workflow set must contain twelve skills")
    registry_items = registry.get("skills", [])
    for profile in ("minimal", "full"):
        declared = set(profiles.get(profile, {}).get("bundled", []))
        registered = {item["name"] for item in registry_items if profile in item["package_profiles"]}
        if declared != registered:
            errors.append(f"manifest and registry membership differ: {profile}")
    if registry.get("execution_policy") != "route_only_never_execute":
        errors.append("workflow registry must remain route-only")
    scope = next((item for item in registry_items if item.get("name") == "project-scope-breakdown"), {})
    if scope.get("completion_handoff") != "sdd-status":
        errors.append("scope workflow must hand off to sdd-status")
    return errors


def release_errors(
    release_root: Path,
    canonical: dict[str, object],
    expected_profile: str,
) -> list[str]:
    release = load_json(release_root / "manifest.json")
    actual = installed_skills(release_root)
    expected = set(canonical["members"]) | set(
        canonical["workflows"]["profiles"][expected_profile]["bundled"]
    )
    errors = []
    if release.get("profile") != expected_profile:
        errors.append(f"release profile mismatch: {expected_profile}")
    if release.get("runtime_availability") != "probe_required":
        errors.append(f"release must require runtime availability probing: {expected_profile}")
    if set(release.get("workflows", {}).get("bundled", [])) != expected - set(canonical["members"]):
        errors.append(f"release bundled workflow declaration differs: {expected_profile}")
    if actual != expected:
        errors.append(f"actual installed skill set differs: {expected_profile}")
    return errors


def route(
    registry: dict[str, object],
    installed: set[str],
    confirmed_plan: bool,
    selected: list[str],
    completed: list[str],
    skipped: list[str] | None = None,
) -> dict[str, object]:
    skipped_set = set(skipped or [])
    if set(selected) & skipped_set:
        return {"entry": "sdd-status", "available": True, "conflict": "selected-step-is-skipped"}
    registry_map = {item["name"]: item for item in registry["skills"]}
    if not confirmed_plan:
        workflow = "project-scope-breakdown"
        return {
            "entry": workflow,
            "available": workflow in installed,
            "completion_handoff": registry_map[workflow].get("completion_handoff"),
            "profile_upgrade": None,
        }
    next_step = next((step for step in selected if step not in completed), None)
    if next_step is None:
        return {"entry": "sdd-status", "available": "sdd-status" in installed, "profile_upgrade": None}
    available = next_step in installed
    return {
        "entry": next_step if available else "sdd-how",
        "requested_workflow": next_step,
        "available": available,
        "profile_upgrade": None if available else "full",
    }


def expected(label: str, actual: dict[str, object], wanted: dict[str, object]) -> list[str]:
    errors = []
    for key, value in wanted.items():
        if actual.get(key) != value:
            errors.append(f"{label}: {key} expected={value!r} actual={actual.get(key)!r}")
    if not errors:
        print(f"PASS: {label}")
    return errors


def negative_proofs(
    manifest: dict[str, object],
    registry: dict[str, object],
    full_release: Path,
) -> list[str]:
    errors = []

    wrong_core = copy.deepcopy(manifest)
    wrong_core["members"][1] = "project-scope-breakdown"
    if not manifest_errors(wrong_core, registry):
        errors.append("negative proof failed: core replacement was not detected")
    else:
        print("EXPECTED_RED: core replacement rejected")

    wrong_registry = copy.deepcopy(registry)
    candidate = next(item for item in wrong_registry["skills"] if item["name"] == "test-case")
    candidate["package_profiles"] = ["full"]
    if not manifest_errors(manifest, wrong_registry):
        errors.append("negative proof failed: registry-only profile membership was not detected")
    else:
        print("EXPECTED_RED: registry-only profile membership rejected")

    no_handoff = copy.deepcopy(registry)
    next(item for item in no_handoff["skills"] if item["name"] == "project-scope-breakdown").pop("completion_handoff")
    if not manifest_errors(manifest, no_handoff):
        errors.append("negative proof failed: missing scope handoff was not detected")
    else:
        print("EXPECTED_RED: missing scope-to-status handoff rejected")

    executable = copy.deepcopy(registry)
    executable["execution_policy"] = "route_and_execute"
    if not manifest_errors(manifest, executable):
        errors.append("negative proof failed: route-only removal was not detected")
    else:
        print("EXPECTED_RED: route-only removal rejected")

    skipped = route(registry, installed_skills(full_release), True, ["mrd-generation"], [], ["mrd-generation"])
    if skipped.get("conflict") != "selected-step-is-skipped":
        errors.append("negative proof failed: skipped-step reinsertion was not detected")
    else:
        print("EXPECTED_RED: skipped-step reinsertion rejected")

    with tempfile.TemporaryDirectory(prefix="sdd-full-missing-") as temp:
        broken = Path(temp) / "release"
        shutil.copytree(full_release, broken)
        shutil.rmtree(broken / "skills/prd-prep")
        if not release_errors(broken, manifest, "full"):
            errors.append("negative proof failed: missing full workflow was not detected")
        else:
            print("EXPECTED_RED: missing full workflow rejected")

    with tempfile.TemporaryDirectory(prefix="sdd-private-red-") as temp:
        private_name = "Bl" + "ack"
        marker = Path(temp) / "SKILL.md"
        marker.write_text(f"Owner: {private_name}\n", encoding="utf-8")
        if not scan_paths([Path(temp)], [private_name]):
            errors.append("negative proof failed: private literal injection was not detected")
        else:
            print("EXPECTED_RED: private literal injection rejected")

    with tempfile.TemporaryDirectory(prefix="sdd-bad-sibling-") as temp:
        broken = Path(temp) / "skills"
        shutil.copytree(full_release / "skills", broken)
        split_skill = broken / "prd-split/SKILL.md"
        split_skill.write_text(
            split_skill.read_text(encoding="utf-8").replace(
                "../prd-write/SKILL.md",
                "prd-write/SKILL.md",
                1,
            ),
            encoding="utf-8",
        )
        if not validate_companion(broken, "prd-split"):
            errors.append("negative proof failed: malformed sibling path was not detected")
        else:
            print("EXPECTED_RED: malformed sibling workflow path rejected")

    support_failures = []
    for index, rel in enumerate(PROJECT_INIT_SUPPORT):
        with tempfile.TemporaryDirectory(prefix=f"sdd-missing-init-support-{index:02d}-") as temp:
            broken = Path(temp) / "skills"
            shutil.copytree(full_release / "skills", broken)
            (broken / "project-init" / rel).unlink()
            if not validate_companion(broken, "project-init"):
                support_failures.append(rel)
    if support_failures:
        errors.append(
            "negative proof failed for missing project-init support: "
            + ", ".join(support_failures)
        )
    else:
        print("EXPECTED_RED: all 12 missing project-init SDD2 support files rejected")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("parent", type=Path, help="Canonical skill parent")
    parser.add_argument("--minimal-release", required=True, type=Path)
    parser.add_argument("--full-release", required=True, type=Path)
    parser.add_argument("--negative-proof", action="store_true")
    args = parser.parse_args()
    parent = args.parent.expanduser().resolve()
    minimal_release = args.minimal_release.expanduser().resolve()
    full_release = args.full_release.expanduser().resolve()
    core = parent / "sdd"
    manifest = load_json(core / "references/group-manifest.json")
    registry = load_json(core / "references/companion-registry.json")
    minimal_installed = installed_skills(minimal_release)
    full_installed = installed_skills(full_release)

    errors = manifest_errors(manifest, registry)
    errors += release_errors(minimal_release, manifest, "minimal")
    errors += release_errors(full_release, manifest, "full")
    errors += expected(
        "minimal-no-plan-routes-scope-then-status",
        route(registry, minimal_installed, False, [], []),
        {"entry": "project-scope-breakdown", "available": True, "completion_handoff": "sdd-status"},
    )
    errors += expected(
        "minimal-full-step-requires-upgrade",
        route(registry, minimal_installed, True, ["prd-prep"], []),
        {"entry": "sdd-how", "requested_workflow": "prd-prep", "available": False, "profile_upgrade": "full"},
    )
    errors += expected(
        "full-standard-route-uses-actual-installation",
        route(registry, full_installed, True, ["mrd-generation", "prd-prep", "prd-write"], ["mrd-generation"]),
        {"entry": "prd-prep", "available": True, "profile_upgrade": None},
    )
    errors += expected(
        "full-tailored-route-does-not-restore-skip",
        route(registry, full_installed, True, ["prd-incremental-on-asis", "prd-review"], ["prd-incremental-on-asis"], ["mrd-generation"]),
        {"entry": "prd-review", "available": True, "profile_upgrade": None},
    )
    if args.negative_proof:
        errors += negative_proofs(manifest, registry, full_release)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("OK: real minimal/full routing and negative controls passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
