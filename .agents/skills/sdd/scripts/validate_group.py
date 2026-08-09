#!/usr/bin/env python3
"""Validate the manifest-driven SDD workbench skill group."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


MANIFEST_REL = Path("sdd/references/group-manifest.json")
NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
EXPECTED_CORE = {
    "sdd",
    "sdd-help",
    "sdd-project",
    "sdd-status",
    "sdd-next",
    "sdd-how",
    "sdd-check",
}
CORE_RESOURCES = (
    "references/state-contract.md",
    "references/output-contracts.md",
    "references/workflow-routing.md",
    "references/companion-registry.json",
    "references/portable-lifecycle.md",
    "references/lifecycle-state-fixtures.json",
    "references/check-protocol.md",
    "references/runtime-and-migration.md",
    "references/group-manifest.json",
    "scripts/privacy_scan.py",
    "scripts/validate_group.py",
    "scripts/build_release.py",
    "scripts/build_zip.py",
    "scripts/test_lifecycle_contract.py",
    "scripts/test_profile_routing.py",
)
PROJECT_INIT_SUPPORT = (
    "references/sdd2/interaction_protocol.md",
    "references/sdd2/meta_order_v2.md",
    "references/sdd2/migration_guide.md",
    "references/sdd2/README.md",
    "references/sdd2/recovery_protocol.md",
    "references/sdd2/runtime_compatibility.md",
    "references/sdd2/usage_guide.md",
    "references/sdd2/templates/template_AGENTS.md",
    "references/sdd2/templates/template_agent_quickstart.md",
    "references/sdd2/templates/template_CLAUDE.md",
    "references/sdd2/templates/template_decision_log.md",
    "references/sdd2/templates/template_task_registry.md",
)


class ManifestError(ValueError):
    """Raised when the canonical manifest cannot drive validation safely."""


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ManifestError(f"cannot read JSON {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ManifestError(f"JSON root must be an object: {path}")
    return data


def frontmatter_name(text: str) -> str | None:
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return None
    name = re.search(r"^name:\s*([^\n]+)$", match.group(1), re.MULTILINE)
    if not name:
        return None
    return name.group(1).strip().strip(chr(34)).strip(chr(39))


def manifest_values(parent: Path) -> dict[str, Any]:
    path = parent / MANIFEST_REL
    if not path.is_file():
        raise ManifestError(f"missing canonical manifest: {path}")
    manifest = load_json(path)
    required = {
        "schema_version",
        "group",
        "version",
        "runtime_scope",
        "core",
        "members",
        "adapters",
        "adapter_contract",
        "explicit_only",
        "workflows",
        "excluded",
    }
    missing = sorted(required - manifest.keys())
    if missing:
        raise ManifestError(f"canonical manifest missing fields: {', '.join(missing)}")
    members = manifest["members"]
    core = manifest["core"]
    adapters = manifest["adapters"]
    contract = manifest["adapter_contract"]
    excluded = manifest["excluded"]
    workflows = manifest["workflows"]
    if manifest["schema_version"] != 3:
        raise ManifestError("unsupported canonical manifest schema_version")
    if not isinstance(members, list) or not members:
        raise ManifestError("members must be a non-empty list")
    if len(members) != len(set(members)):
        raise ManifestError("members must be unique")
    if any(not isinstance(name, str) or not NAME_PATTERN.fullmatch(name) for name in members):
        raise ManifestError("every member must use a valid skill name")
    if core not in members:
        raise ManifestError("core must be one of the members")
    if core != "sdd" or set(members) != EXPECTED_CORE or len(members) != len(EXPECTED_CORE):
        raise ManifestError("core identity must remain the exact seven-member SDD workbench set")
    if not isinstance(adapters, dict) or set(adapters) != set(members) - {core}:
        raise ManifestError("adapters must map every non-core member exactly once")
    if len(set(adapters.values())) != len(adapters):
        raise ManifestError("adapter actions must be unique")
    if manifest["explicit_only"] is not True:
        raise ManifestError("explicit_only must be true")
    if not isinstance(excluded, list) or len(excluded) != len(set(excluded)):
        raise ManifestError("excluded must be a unique list")
    if set(excluded) & set(members):
        raise ManifestError("excluded entries must not be members")
    workflow_fields = {"registry", "default_profile", "profiles"}
    if not isinstance(workflows, dict) or set(workflows) != workflow_fields:
        raise ManifestError("workflows must contain registry, default_profile, and profiles")
    registry_rel = workflows["registry"]
    default_profile = workflows["default_profile"]
    profiles = workflows["profiles"]
    if not isinstance(registry_rel, str) or not registry_rel:
        raise ManifestError("workflows.registry must be a non-empty path")
    if not isinstance(profiles, dict) or set(profiles) != {"minimal", "full"}:
        raise ManifestError("workflows.profiles must contain minimal and full")
    if default_profile not in profiles:
        raise ManifestError("workflows.default_profile must name a profile")
    profile_workflows: dict[str, list[str]] = {}
    for profile_name, profile in profiles.items():
        if not isinstance(profile, dict) or set(profile) != {"description", "bundled"}:
            raise ManifestError(f"workflow profile is invalid: {profile_name}")
        bundled = profile["bundled"]
        if not isinstance(profile["description"], str) or not profile["description"]:
            raise ManifestError(f"workflow profile description is empty: {profile_name}")
        if not isinstance(bundled, list) or len(bundled) != len(set(bundled)):
            raise ManifestError(f"workflow profile bundled list is invalid: {profile_name}")
        if any(not isinstance(name, str) or not NAME_PATTERN.fullmatch(name) for name in bundled):
            raise ManifestError(f"workflow profile contains an invalid skill name: {profile_name}")
        if set(bundled) & set(members):
            raise ManifestError(f"workflow profile overlaps core members: {profile_name}")
        if set(bundled) & set(excluded):
            raise ManifestError(f"workflow profile contains excluded skills: {profile_name}")
        profile_workflows[profile_name] = bundled
    if not set(profile_workflows["minimal"]) < set(profile_workflows["full"]):
        raise ManifestError("minimal workflows must be a strict subset of full workflows")
    if profile_workflows["minimal"] != ["project-scope-breakdown"]:
        raise ManifestError("minimal must bundle only the project-scope-breakdown workflow")
    if len(profile_workflows["full"]) != 12:
        raise ManifestError("full must bundle exactly twelve product workflow skills")
    registry = load_json(parent / registry_rel)
    if registry.get("schema_version") != 2 or registry.get("execution_policy") != "route_only_never_execute":
        raise ManifestError("workflow registry schema or execution policy is invalid")
    registry_skills = registry.get("skills")
    if not isinstance(registry_skills, list) or not registry_skills:
        raise ManifestError("workflow registry skills must be a non-empty list")
    registry_names: list[str] = []
    for item in registry_skills:
        required_item = {"name", "kind", "source_version", "routes", "package_profiles"}
        optional_item = {"completion_handoff"}
        if not isinstance(item, dict) or not required_item <= set(item) or set(item) - required_item - optional_item:
            raise ManifestError("every workflow registry item has an invalid field set")
        name = item["name"]
        routes = item["routes"]
        if not isinstance(name, str) or not NAME_PATTERN.fullmatch(name):
            raise ManifestError("workflow registry contains an invalid skill name")
        if item["kind"] != "workflow":
            raise ManifestError(f"registry kind must be workflow: {name}")
        if not isinstance(item["source_version"], str) or not item["source_version"]:
            raise ManifestError(f"workflow source version is invalid: {name}")
        if not isinstance(routes, list) or not routes or any(not isinstance(route, str) or not route for route in routes):
            raise ManifestError(f"workflow registry routes are invalid: {name}")
        package_profiles = item["package_profiles"]
        if not isinstance(package_profiles, list) or len(package_profiles) != len(set(package_profiles)):
            raise ManifestError(f"workflow package profiles are invalid: {name}")
        if not set(package_profiles) <= set(profiles):
            raise ManifestError(f"workflow references an unknown package profile: {name}")
        registry_names.append(name)
    if len(registry_names) != len(set(registry_names)):
        raise ManifestError("workflow registry skill names must be unique")
    for profile_name, bundled in profile_workflows.items():
        if not set(bundled) <= set(registry_names):
            raise ManifestError(f"every bundled workflow must exist in the registry: {profile_name}")
        for item in registry_skills:
            if item["name"] in bundled and profile_name not in item["package_profiles"]:
                raise ManifestError(f"registry profile membership is missing: {item['name']} -> {profile_name}")
        registry_profile = {
            item["name"] for item in registry_skills if profile_name in item["package_profiles"]
        }
        if registry_profile != set(bundled):
            raise ManifestError(f"manifest and registry workflow membership differ: {profile_name}")
    scope_item = next(item for item in registry_skills if item["name"] == "project-scope-breakdown")
    if scope_item.get("completion_handoff") != "sdd-status":
        raise ManifestError("project-scope-breakdown must hand off to sdd-status")
    contract_fields = {
        "dependency_marker",
        "sibling_path",
        "catalog_resolution",
        "fail_closed_text",
    }
    if not isinstance(contract, dict) or not contract_fields <= contract.keys():
        raise ManifestError("adapter_contract is incomplete")
    if any(not isinstance(contract[field], str) or not contract[field] for field in contract_fields):
        raise ManifestError("adapter_contract values must be non-empty strings")
    return manifest


def bundled_workflows(manifest: dict[str, Any], profile: str | None = None) -> list[str]:
    selected = profile or manifest["workflows"]["default_profile"]
    profiles = manifest["workflows"]["profiles"]
    if selected not in profiles:
        raise ManifestError(f"unknown workflow profile: {selected}")
    return profiles[selected]["bundled"]


def release_manifest(manifest: dict[str, Any], profile: str | None = None) -> dict[str, Any]:
    """Return the deterministic release manifest derived from the authority."""
    selected = profile or manifest["workflows"]["default_profile"]
    return {
        "schema_version": 3,
        "package": manifest["group"],
        "version": manifest["version"],
        "profile": selected,
        "defined_profiles": list(manifest["workflows"]["profiles"]),
        "runtime_availability": "probe_required",
        "runtime_scope": manifest["runtime_scope"],
        "skill_root": "skills",
        "canonical_manifest": "skills/sdd/references/group-manifest.json",
        "core": manifest["core"],
        "members": manifest["members"],
        "adapters": manifest["adapters"],
        "adapter_contract": manifest["adapter_contract"],
        "explicit_only": manifest["explicit_only"],
        "workflows": {
            "registry": manifest["workflows"]["registry"],
            "bundled": bundled_workflows(manifest, selected),
        },
        "excluded": manifest["excluded"],
        "upstream_lock": "upstream-lock.json",
        "installation": "INSTALL.md",
        "checksums": "checksums.sha256",
        "privacy_report": "privacy-report.json",
    }


def packaged_skills(manifest: dict[str, Any], profile: str | None = None) -> list[str]:
    """Return core members followed by the selected profile's workflows."""
    return [*manifest["members"], *bundled_workflows(manifest, profile)]


def relevant_files(root: Path) -> dict[str, Path]:
    files: dict[str, Path] = {}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if "__pycache__" in path.parts or path.suffix in {".pyc", ".pyo"}:
            continue
        files[path.relative_to(root).as_posix()] = path
    return files


def normalized_tree_sha256(root: Path) -> str:
    digest = hashlib.sha256()
    files = sorted(
        (
            path
            for path in root.rglob("*")
            if path.is_file()
            and "__pycache__" not in path.parts
            and path.suffix not in {".pyc", ".pyo"}
        ),
        key=lambda path: (
            path.relative_to(root).as_posix().casefold(),
            path.relative_to(root).as_posix(),
        ),
    )
    for path in files:
        rel = path.relative_to(root).as_posix()
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes().replace(b"\r\n", b"\n"))
    return digest.hexdigest()


def validate_upstream_lock(
    lock_path: Path,
    workflow_root: Path,
    manifest: dict[str, Any],
    profile: str,
) -> list[str]:
    errors: list[str] = []
    try:
        lock = load_json(lock_path)
    except ManifestError as exc:
        return [str(exc)]
    entries = lock.get("workflows")
    if lock.get("schema_version") != 2 or lock.get("workflow_count") != 12:
        errors.append("upstream lock schema or workflow count is invalid")
        return errors
    if not isinstance(entries, list) or len(entries) != 12:
        errors.append("upstream lock must contain twelve workflow entries")
        return errors
    by_name = {item.get("name"): item for item in entries if isinstance(item, dict)}
    full = set(bundled_workflows(manifest, "full"))
    if set(by_name) != full:
        errors.append("upstream lock names differ from the full workflow profile")
        return errors
    for name in bundled_workflows(manifest, profile):
        item = by_name[name]
        source_id = item.get("source_id")
        if source_id != f"authoritative-private-source/{name}":
            errors.append(f"upstream lock source id is invalid: {name}")
        portable_target = item.get("portable_target")
        if portable_target != f"skills/{name}":
            errors.append(f"upstream lock portable target is invalid: {name}")
        expected = item.get("portable_tree_sha256")
        actual = normalized_tree_sha256(workflow_root / name)
        if expected != actual:
            errors.append(f"portable workflow hash differs from upstream lock: {name}")
    return errors


def validate_member(parent: Path, member: str, explicit_only: bool) -> list[str]:
    errors: list[str] = []
    folder = parent / member
    skill = folder / "SKILL.md"
    metadata = folder / "agents/openai.yaml"
    if not folder.is_dir():
        return [f"missing member directory: {member}"]
    if not skill.is_file():
        return [f"missing SKILL.md: {member}"]
    text = read_text(skill)
    if frontmatter_name(text) != member:
        errors.append(f"frontmatter name mismatch: {member}")
    if "[TODO" in text or "TODO:" in text:
        errors.append(f"template placeholder remains: {member}")
    if not metadata.is_file():
        errors.append(f"missing agents/openai.yaml: {member}")
    elif explicit_only:
        flags = re.findall(
            r"^\s*allow_implicit_invocation:\s*(true|false)\s*$",
            read_text(metadata),
            re.MULTILINE | re.IGNORECASE,
        )
        if flags != ["false"]:
            errors.append(f"allow_implicit_invocation must be exactly false: {member}")
    return errors


def validate_companion(parent: Path, companion: str) -> list[str]:
    errors: list[str] = []
    folder = parent / companion
    skill = folder / "SKILL.md"
    if not folder.is_dir():
        return [f"missing bundled workflow directory: {companion}"]
    if not skill.is_file():
        return [f"missing bundled workflow SKILL.md: {companion}"]
    text = read_text(skill)
    if frontmatter_name(text) != companion:
        errors.append(f"bundled workflow frontmatter name mismatch: {companion}")
    if "[TODO" in text or "TODO:" in text:
        errors.append(f"template placeholder remains in bundled workflow: {companion}")
    all_text = "\n".join(
        read_text(path)
        for path in sorted(
            folder.rglob("*"),
            key=lambda item: (
                item.relative_to(folder).as_posix().casefold(),
                item.relative_to(folder).as_posix(),
            ),
        )
        if path.is_file() and path.suffix in {".md", ".json", ".yaml", ".yml", ".py"}
    )
    forbidden_roots = ("skills_download/skill-", "SDD/skills_download", ".claude/skills/")
    for forbidden in forbidden_roots:
        if forbidden in all_text:
            errors.append(f"private or runtime-specific source path remains: {companion} -> {forbidden}")
    sibling_refs = re.findall(r"\.\./([a-z0-9]+(?:-[a-z0-9]+)*)/SKILL\.md", all_text)
    for target in sibling_refs:
        if target != "sdd" and not (parent / target / "SKILL.md").is_file():
            errors.append(f"workflow sibling reference is unresolved: {companion} -> {target}")
    if "[SDD_ROOT]/../" in all_text:
        errors.append(f"workflow reference uses an unresolved SDD_ROOT sibling path: {companion}")
    malformed_refs = re.findall(
        r"(?<![./A-Za-z0-9_-])([a-z0-9]+(?:-[a-z0-9]+)*)/SKILL\.md",
        all_text,
    )
    for target in malformed_refs:
        if (parent / target / "SKILL.md").is_file():
            errors.append(f"workflow sibling reference must use ../: {companion} -> {target}")
    if companion == "project-init":
        for rel in PROJECT_INIT_SUPPORT:
            if not (folder / rel).is_file():
                errors.append(f"project-init portable support is missing: {rel}")
    return errors


def validate_adapter(
    parent: Path,
    member: str,
    action: str,
    core: str,
    contract: dict[str, str],
) -> list[str]:
    errors: list[str] = []
    skill = parent / member / "SKILL.md"
    if not skill.is_file():
        return errors
    text = read_text(skill)
    required_fragments = (
        contract["dependency_marker"],
        contract["sibling_path"],
        contract["catalog_resolution"],
        contract["fail_closed_text"],
        core,
    )
    for fragment in required_fragments:
        if fragment not in text:
            errors.append(f"adapter dependency contract missing {fragment!r}: {member}")
    if action.casefold() not in text.casefold():
        errors.append(f"adapter action missing from SKILL.md: {member} -> {action}")
    sibling = (parent / member / contract["sibling_path"]).resolve()
    if sibling != (parent / core).resolve() or not (sibling / "SKILL.md").is_file():
        errors.append(f"adapter sibling core is not resolvable: {member}")
    return errors


def validate_group(
    parent: Path,
    exact_members: bool = False,
    profile: str | None = None,
    portable_root: Path | None = None,
) -> tuple[dict[str, Any] | None, list[str]]:
    errors: list[str] = []
    try:
        manifest = manifest_values(parent)
    except ManifestError as exc:
        return None, [str(exc)]
    members = manifest["members"]
    selected = profile or manifest["workflows"]["default_profile"]
    try:
        package = packaged_skills(manifest, selected)
    except ManifestError as exc:
        return manifest, [str(exc)]
    if exact_members:
        actual = sorted(path.name for path in parent.iterdir() if path.is_dir())
        expected = sorted(package)
        if actual != expected:
            errors.append(f"package directories differ: expected={expected}, actual={actual}")
    for member in members:
        errors.extend(validate_member(parent, member, manifest["explicit_only"]))
    workflow_root = portable_root.resolve() if portable_root else parent
    for workflow in bundled_workflows(manifest, selected):
        errors.extend(validate_companion(workflow_root, workflow))
    if portable_root:
        errors.extend(
            validate_upstream_lock(
                workflow_root.parent / "upstream-lock.json",
                workflow_root,
                manifest,
                selected,
            )
        )
    core = parent / manifest["core"]
    for rel in CORE_RESOURCES:
        if not (core / rel).is_file():
            errors.append(f"missing core resource: {rel}")
    for member, action in manifest["adapters"].items():
        errors.extend(
            validate_adapter(
                parent,
                member,
                action,
                manifest["core"],
                manifest["adapter_contract"],
            )
        )
    return manifest, errors


def validate_runtime_uniqueness(
    members: list[str],
    runtime_roots: list[Path],
) -> list[str]:
    errors: list[str] = []
    hits: dict[str, set[Path]] = {member: set() for member in members}
    roots = {root.expanduser().resolve() for root in runtime_roots}
    for root in sorted(roots, key=str):
        if not root.is_dir():
            errors.append(f"runtime root is unavailable: {root}")
            continue
        for skill in root.rglob("SKILL.md"):
            try:
                name = frontmatter_name(read_text(skill))
            except (OSError, UnicodeDecodeError):
                continue
            if name in hits:
                hits[name].add(skill.resolve())
    for member, paths in hits.items():
        if len(paths) != 1:
            errors.append(
                f"runtime name must resolve exactly once: {member} -> "
                + ", ".join(str(path) for path in sorted(paths, key=str))
            )
    return errors


def compare_group(
    source_parent: Path,
    target_parent: Path,
    members: list[str],
) -> list[str]:
    errors: list[str] = []
    for member in members:
        source = relevant_files(source_parent / member)
        target = relevant_files(target_parent / member)
        if set(source) != set(target):
            errors.append(
                f"file inventory differs for {member} at {target_parent}: "
                f"source_only={sorted(set(source) - set(target))}, "
                f"target_only={sorted(set(target) - set(source))}"
            )
            continue
        for rel in sorted(source):
            if source[rel].read_bytes() != target[rel].read_bytes():
                errors.append(f"file bytes differ: {member}/{rel} at {target_parent}")
    return errors


def validate_release(
    release_root: Path,
    manifest: dict[str, Any],
    profile: str | None = None,
) -> list[str]:
    errors: list[str] = []
    release_path = release_root / "manifest.json"
    try:
        actual_manifest = load_json(release_path)
    except ManifestError as exc:
        return [str(exc)]
    expected_manifest = release_manifest(manifest, profile)
    if actual_manifest != expected_manifest:
        errors.append("release manifest does not match the canonical manifest")
    checksum_path = release_root / expected_manifest["checksums"]
    privacy_path = release_root / expected_manifest["privacy_report"]
    upstream_lock_path = release_root / expected_manifest["upstream_lock"]
    installation_path = release_root / expected_manifest["installation"]
    if not upstream_lock_path.is_file():
        errors.append("missing release upstream-lock.json")
    else:
        errors.extend(
            validate_upstream_lock(
                upstream_lock_path,
                release_root / "skills",
                manifest,
                profile or manifest["workflows"]["default_profile"],
            )
        )
    if not installation_path.is_file():
        errors.append("missing release INSTALL.md")
    if not checksum_path.is_file():
        errors.append("missing release checksums.sha256")
    else:
        listed: dict[str, str] = {}
        for line_number, line in enumerate(read_text(checksum_path).splitlines(), start=1):
            match = re.fullmatch(r"([0-9a-f]{64})  (skills/.+)", line)
            if not match:
                errors.append(f"invalid checksum line {line_number}")
                continue
            listed[match.group(2)] = match.group(1)
        actual_files = relevant_files(release_root / "skills")
        actual_names = {f"skills/{name}" for name in actual_files}
        if set(listed) != actual_names:
            errors.append("release checksum inventory does not match skills files")
        for rel, expected_hash in listed.items():
            path = release_root / Path(rel)
            if path.is_file():
                actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
                if actual_hash != expected_hash:
                    errors.append(f"release checksum mismatch: {rel}")
    if not privacy_path.is_file():
        errors.append("missing privacy-report.json")
    else:
        try:
            privacy = load_json(privacy_path)
            if privacy.get("status") != "pass":
                errors.append("privacy report status is not pass")
        except ManifestError as exc:
            errors.append(str(exc))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("parent", type=Path, help="Directory containing all group members")
    parser.add_argument(
        "--exact-members",
        action="store_true",
        help="Require the parent directory to contain exactly the manifest members",
    )
    parser.add_argument(
        "--runtime-root",
        action="append",
        default=[],
        type=Path,
        help="Runtime skill root; repeat to validate exact-name uniqueness across roots",
    )
    parser.add_argument(
        "--compare-root",
        action="append",
        default=[],
        type=Path,
        help="Member root that must match the canonical parent byte-for-byte",
    )
    parser.add_argument(
        "--release-root",
        type=Path,
        help="Release root whose manifest and checksums must match the canonical manifest",
    )
    parser.add_argument(
        "--profile",
        choices=("minimal", "full"),
        help="Workflow package profile; defaults to the canonical default profile",
    )
    parser.add_argument(
        "--portable-root",
        type=Path,
        help="Directory containing portable workflow skill directories",
    )
    args = parser.parse_args()
    parent = args.parent.expanduser().resolve()
    portable_root = args.portable_root.expanduser().resolve() if args.portable_root else None
    manifest, errors = validate_group(parent, args.exact_members, args.profile, portable_root)
    if manifest is not None:
        if args.runtime_root:
            errors.extend(validate_runtime_uniqueness(manifest["members"], args.runtime_root))
        for target in args.compare_root:
            errors.extend(compare_group(parent, target.expanduser().resolve(), manifest["members"]))
        if args.release_root:
            errors.extend(validate_release(args.release_root.expanduser().resolve(), manifest, args.profile))
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(
        f"OK: validated {len(manifest['members'])} core members and "
        f"{len(bundled_workflows(manifest, args.profile))} bundled workflows "
        f"for profile {args.profile or manifest['workflows']['default_profile']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
