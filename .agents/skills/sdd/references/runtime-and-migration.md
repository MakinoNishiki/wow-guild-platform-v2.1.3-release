> **Document name**: SDD Workbench Runtime and Migration Contract
> **Project**: SDD Workbench
> **Purpose**: Define portable invocation, package membership, release generation, and deployment checks.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06（manifest v3：七核心与 minimal/full 工作流 profiles）
> **Summary**: Runtime-specific entry fallbacks and deterministic safeguards for seven core members plus profile-selected workflow skills.

---

# Runtime and Migration Contract

## Logical interface

The product interface is `/sdd <action>`, but invocation UI is runtime-specific. Preserve action semantics rather than promising identical completion behavior.

| Capability | Preferred form | Portable fallback |
|---|---|---|
| Root workbench | `/sdd` | explicit `sdd` skill invocation |
| Nested action | `/sdd help` | `$sdd-help` or equivalent flat skill |
| Goal argument | `/sdd how <goal>` | invoke `sdd-how` with the goal in natural language |
| Adversarial check | `/sdd check` | explicit `sdd-check` skill invocation |

Tab completion is optional enhancement. A text menu and flat skills must preserve the full workflow when nested completion is unavailable.

## Package layers

The workbench core remains these seven directories and must be installed as one unit:

`sdd`, `sdd-help`, `sdd-project`, `sdd-status`, `sdd-next`, `sdd-how`, `sdd-check`.

The flat skills require the `sdd` core and its references. Report incomplete installation when a member is missing.

Workflow skills live in a separate workflow layer:

- `references/companion-registry.json` lists portable skills that SDD may route to after checking availability.
- Registry membership does not mean installed, bundled, or authorized.
- `group-manifest.json → workflows.profiles` is the authority for workflows copied into a release. Version 0.3.0 defines minimal and full.
- Minimal bundles only `project-scope-breakdown`; it remains a workflow, not an eighth core member.
- Full bundles twelve product-lifecycle workflows. Core members keep explicit-only invocation; workflows retain their own trigger policy and are not adapters.
- After scope/lifecycle planning persists a Human-confirmed plan, the default handoff is `sdd-status`.

## Portability rules

- Use role-based filenames and current-project discovery; do not hardcode a repository layout beyond optional conventions.
- Do not require a specific vendor, model, client, user account, messaging system, or organization tool.
- Do not store personal names, organization names, emails, account identifiers, repository-owner identities, machine usernames, or absolute local paths.
- Keep user-specific governance in the user's project files. The portable core only explains how to discover and respect those files.
- Keep all text UTF-8.
- Validate the Git source first, then deploy by explicit per-directory diff. Never overwrite an entire runtime skill directory.

## Release checks

1. Regenerate the portable workflow layer with `python -B portable/sdd-workbench/scripts/build_portable_workflows.py`; upstream hashes must match the approved lock.
2. Run `validate_group.py <skills-parent> --portable-root <portable-skills> --profile minimal` and repeat with `--profile full`.
3. Run `build_release.py --source-parent <skills-parent> --portable-root <portable-skills> --profile <minimal|full> --output <release-directory>`. Pass known private strings with repeated `--deny` arguments.
4. Validate each generated package with `validate_group.py <release-directory>/skills --exact-members --profile <profile> --release-root <release-directory>` and scan the entire release directory.
5. Validate every packaged Skill with the runtime's official skill validator. Set the runtime to UTF-8 rather than rewriting valid content.
6. Run `test_profile_routing.py <skills-parent> --minimal-release <minimal-release> --full-release <full-release> --negative-proof`; all four real-installation scenarios and every expected red control must pass.
7. Run `test_lifecycle_contract.py <skills-parent> --portable-root <portable-skills> --repro-build`; all lifecycle/state checks and both profile reproducibility checks must pass.
8. Build each archive with `build_zip.py`; generate twice and require identical ZIP SHA-256 and exact release-tree entries.
