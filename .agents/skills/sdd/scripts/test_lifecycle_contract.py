#!/usr/bin/env python3
"""Run deterministic contract checks for tailored project lifecycle planning."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from build_release import build


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")


def require(text: str, fragments: list[str], evidence: str) -> list[str]:
    return [f"{evidence}: missing {fragment!r}" for fragment in fragments if fragment not in text]


def tree_hashes(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in root.rglob("*")
        if path.is_file()
    }


def tree_fingerprint(files: dict[str, str]) -> str:
    serialized = "".join(f"{name}\0{digest}\n" for name, digest in sorted(files.items()))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def verify_reproducible_build(parent: Path, portable_root: Path, denied: list[str]) -> list[str]:
    errors: list[str] = []
    with tempfile.TemporaryDirectory(prefix="sdd-workbench-repro-") as temp:
        temp_root = Path(temp)
        for profile in ("minimal", "full"):
            first = temp_root / f"{profile}-first"
            second = temp_root / f"{profile}-second"
            build(parent, portable_root, profile, first, denied)
            build(parent, portable_root, profile, second, denied)
            first_tree = tree_hashes(first)
            second_tree = tree_hashes(second)
            label = profile.upper()
            print(f"REPRO_{label}_FIRST_FILES={len(first_tree)}")
            print(f"REPRO_{label}_SECOND_FILES={len(second_tree)}")
            print(f"REPRO_{label}_FIRST_TREE={tree_fingerprint(first_tree)}")
            print(f"REPRO_{label}_SECOND_TREE={tree_fingerprint(second_tree)}")
            if first_tree != second_tree:
                errors.append(f"two independent {profile} release builds differ by path or SHA-256")
            else:
                print(f"PASS: profile {profile} is byte-for-byte reproducible")
    return errors


def resolve_fixture(fixture: dict[str, object]) -> dict[str, object]:
    plan_state = fixture["plan_state"]
    selected = fixture["selected"]
    completed = set(fixture["completed"])
    recorded_next = fixture["recorded_next"]
    if plan_state == "Draft":
        return {"active_plan": False, "next": None, "conflict": "plan-not-confirmed"}
    if plan_state == "Superseded":
        return {"active_plan": False, "next": None, "conflict": "plan-not-active"}
    next_step = next((step for step in selected if step not in completed), None)
    conflict = None
    if recorded_next is not None and recorded_next not in selected:
        conflict = "recorded-next-outside-plan"
    return {"active_plan": True, "next": next_step, "conflict": conflict}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("parent", type=Path, help="Directory containing canonical skills")
    parser.add_argument("--repro-build", action="store_true", help="Build two temporary releases and compare every file")
    parser.add_argument("--portable-root", type=Path, help="Directory containing twelve portable workflow skills")
    parser.add_argument("--deny", action="append", default=[], help="Private literal used by reproducible build privacy scans")
    args = parser.parse_args()
    parent = args.parent.expanduser().resolve()
    portable_root = (
        args.portable_root.expanduser().resolve()
        if args.portable_root
        else parent.parent / "portable/sdd-workbench/skills"
    )

    scope = parent / "project-scope-breakdown"
    core = parent / "sdd"
    files = {
        "scope": read(scope / "SKILL.md"),
        "reference": read(scope / "reference.md"),
        "examples": read(scope / "examples.md"),
        "plan": read(scope / "references/project_lifecycle_plan_template.md"),
        "state": read(core / "references/state-contract.md"),
        "output": read(core / "references/output-contracts.md"),
        "routing": read(core / "references/workflow-routing.md"),
        "next": read(parent / "sdd-next/SKILL.md"),
        "status": read(parent / "sdd-status/SKILL.md"),
    }
    manifest = json.loads(read(core / "references/group-manifest.json"))
    registry = json.loads(read(core / "references/companion-registry.json"))
    fixtures = json.loads(read(core / "references/lifecycle-state-fixtures.json"))["fixtures"]
    evals = json.loads(read(scope / "evals/evals.json"))["evals"]

    checks: list[tuple[str, list[str]]] = []
    checks.append((
        "standard-full-route",
        require(files["scope"], ["show the whole applicable lifecycle", "Standard full mode", "Custom tailored mode"], "project-scope-breakdown/SKILL.md")
        + require(files["examples"], ["Standard full mode", "Expected input", "Expected artifact", "Gate"], "project-scope-breakdown/examples.md"),
    ))
    checks.append((
        "small-tailored-route",
        require(files["examples"], ["Small tailored route", "scope breakdown → incremental product requirement → implementation"], "project-scope-breakdown/examples.md")
        + require(files["next"], ["Do not expand a small task", "never silently select a skipped"], "sdd-next/SKILL.md"),
    ))
    checks.append((
        "forced-skip-mrd",
        require(files["scope"], ["they do not veto the route", "record the choice as a human override", "Never silently restore a skipped stage"], "project-scope-breakdown/SKILL.md")
        + require(files["plan"], ["Unknown — human accepted risk", "The selected route remains valid as a plan"], "project_lifecycle_plan_template.md"),
    ))
    checks.append((
        "existing-plan-status",
        require(files["state"], ["Treat `project_lifecycle_plan.md` as a plan, not a progress tracker", "Join plan rows with task state and decisions", "**Draft**: display as pending confirmation only", "**Superseded**: historical evidence only"], "state-contract.md")
        + require(files["status"], ["Only a Human-confirmed plan may constrain", "Join confirmed plan rows", "do not infer progress from the plan"], "sdd-status/SKILL.md"),
    ))
    checks.append((
        "next-does-not-expand",
        require(files["state"], ["next unfinished **selected** plan step", "do not expand a small task", "records a next action outside the confirmed selected route"], "state-contract.md")
        + require(files["output"], ["Never silently recommend a skipped/merged-away stage", "plan change requiring human confirmation", "recorded next lies outside the confirmed route"], "output-contracts.md"),
    ))
    checks.append((
        "plan-change-proposal",
        require(files["plan"], ["Revision history and superseded route snapshots", "Complete ordered route snapshot or immutable file", "Never overwrite the only copy"], "project_lifecycle_plan_template.md")
        + require(files["examples"], ["Plan change", "keep the existing selected route", "previous complete ordered route"], "project-scope-breakdown/examples.md"),
    ))

    errors: list[str] = []
    if len(evals) != 6 or {item.get("name") for item in evals} != {name for name, _ in checks}:
        errors.append("evals/evals.json must contain the exact six lifecycle scenarios")
    profiles = manifest.get("workflows", {}).get("profiles", {})
    if manifest.get("schema_version") != 3 or len(manifest.get("members", [])) != 7:
        errors.append("manifest must keep seven core members under schema v3")
    if profiles.get("minimal", {}).get("bundled") != ["project-scope-breakdown"]:
        errors.append("minimal must bundle only project-scope-breakdown")
    if len(profiles.get("full", {}).get("bundled", [])) != 12:
        errors.append("full must bundle exactly twelve workflows")
    if "project-scope-breakdown" in manifest.get("members", []):
        errors.append("project-scope-breakdown must never be a core member")
    registry_names = {item.get("name") for item in registry.get("skills", [])}
    for required in {"project-scope-breakdown", "prd-write", "prd-incremental-on-asis", "prd-update-from-meeting", "test-case"}:
        if required not in registry_names:
            errors.append(f"companion registry missing {required}")
    if registry.get("execution_policy") != "route_only_never_execute":
        errors.append("workflow registry must keep route-only execution policy")
    if registry.get("schema_version") != 2:
        errors.append("workflow registry must use schema v2")
    scope_registry = next((item for item in registry.get("skills", []) if item.get("name") == "project-scope-breakdown"), {})
    if scope_registry.get("completion_handoff") != "sdd-status":
        errors.append("project-scope-breakdown must hand off to sdd-status")
    portable_scope = read(portable_root / "project-scope-breakdown/SKILL.md")
    errors.extend(require(portable_scope, ["sdd-status", "Human-confirmed plan"], "portable project-scope-breakdown/SKILL.md"))
    portable = read(core / "references/portable-lifecycle.md")
    errors.extend(require(portable, ["fallback static authority", "Product-requirements preparation", "Product-requirements authoring", "An explicit human choice overrides"], "portable-lifecycle.md"))

    if len(fixtures) != 4:
        errors.append("lifecycle-state-fixtures.json must contain four high-risk state fixtures")
    for fixture in fixtures:
        actual = resolve_fixture(fixture)
        if actual != fixture["expected"]:
            errors.append(
                f"state fixture failed {fixture['name']}: expected={fixture['expected']}, actual={actual}"
            )
        else:
            print(f"PASS: state-fixture/{fixture['name']}")

    for name, findings in checks:
        if findings:
            errors.extend(f"{name}: {finding}" for finding in findings)
        else:
            print(f"PASS: {name}")
    if args.repro_build:
        errors.extend(verify_reproducible_build(parent, portable_root, args.deny))
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("OK: six lifecycle planning scenarios and core/workflow layering are covered")
    return 0


if __name__ == "__main__":
    sys.exit(main())
