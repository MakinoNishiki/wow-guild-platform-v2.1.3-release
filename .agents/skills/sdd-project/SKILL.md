---
name: sdd-project
description: SDD project identity entry. Use only when the user explicitly invokes /sdd project, /sdd who, $sdd-project, asks “who am I” in the SDD workbench sense, or wants the project name, purpose, type, governance version, task focus, selected lifecycle mode/route, and agent authorization role.
---

# SDD Project

> **Purpose**: Explain the current working context rather than personal or model identity.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Return project identity, goal, governance version, focus, selected lifecycle route, and authorization role.
> **Index**: Dependency → Workflow → Boundaries

## Dependency

**CORE_DEPENDENCY: `sdd` (required, exact-name, sibling-or-catalog resolution).** Resolve `../sdd/` relative to this skill directory first. If the runtime does not expose the loaded file path, resolve exactly one enabled Skill named `sdd` from the runtime catalog. Load its `SKILL.md`, `references/state-contract.md`, and the Project section of `references/output-contracts.md`. If zero or multiple cores resolve, stop and report an incomplete or ambiguous installation; do not guess a filesystem root.

## Workflow

1. Set `action = project`.
2. Identify the project root and role-based project files.
3. Read the project lifecycle plan when present; return its confirmation state, selected mode, applicable task track, and compact route without treating it as actual progress.
4. Return project name and one-sentence purpose, project type, governance version, task focus, lifecycle plan summary, and agent authorization role.
5. When focus or lifecycle track is not unique, list plausible choices with one-sentence descriptions instead of selecting a priority.
6. Attach evidence state and sources.

## Boundaries

- Do not infer the user's personal identity or describe the model persona.
- Do not start subagents, edit state, or initialize a project.
