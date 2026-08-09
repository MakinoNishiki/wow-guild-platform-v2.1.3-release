---
name: sdd-help
description: SDD beginner guidance entry. Use only when the user explicitly invokes /sdd help, $sdd-help, asks what SDD can do now, or wants a repeatable guided loop from the current project context toward a concrete artifact. Combine capability, project, selected lifecycle plan, actual status, and plan-constrained next; do not include the full how route.
---

# SDD Help

> **Purpose**: Give a beginner one repeatable entry into the SDD workbench.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Combine current capability, project identity, selected lifecycle route, actual status, and likely next action.
> **Index**: Dependency → Workflow → Boundaries

## Dependency

**CORE_DEPENDENCY: `sdd` (required, exact-name, sibling-or-catalog resolution).** Resolve `../sdd/` relative to this skill directory first. If the runtime does not expose the loaded file path, resolve exactly one enabled Skill named `sdd` from the runtime catalog. Load its `SKILL.md`, `references/state-contract.md`, and the Help section of `references/output-contracts.md`. If zero or multiple cores resolve, stop and report an incomplete or ambiguous installation; do not guess a filesystem root.

## Workflow

1. Set `action = help`.
2. Run the core's lightweight, single-agent state check. Do not start subagents.
3. Explain SDD's end-to-end value in one sentence, then list only two to four capabilities relevant now.
4. Include compact Project, Status, and Next results. When a confirmed lifecycle plan exists, show its mode/track and keep the next action inside the selected route.
5. When the input remains a broad idea and no lifecycle plan exists, point the continuation phrase to scope breakdown/lifecycle planning.
6. End with one concrete phrase the user can send to continue.
7. Re-read current state every time this skill is invoked so repeated use advances with the project.

## Boundaries

- Do not include the full How workflow or a catalog of every installed skill.
- Do not write files or start the recommended next action.
- Label inferred task focus and list other plausible choices.
