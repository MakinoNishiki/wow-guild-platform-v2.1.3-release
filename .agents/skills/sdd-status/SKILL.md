---
name: sdd-status
description: SDD current-position entry. Use only when the user explicitly invokes /sdd status, /sdd where, $sdd-status, asks where the current work stands, or wants workspace, task, and lifecycle position with the selected project route, actual progress, skips/overrides, evidence, blockers, gates, and conflicts.
---

# SDD Status

> **Purpose**: Explain where the work stands across three distinct coordinates.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Return workspace, task, plan-aware lifecycle position, evidence, conflicts, and recovery action.
> **Index**: Dependency → Workflow → Boundaries

## Dependency

**CORE_DEPENDENCY: `sdd` (required, exact-name, sibling-or-catalog resolution).** Resolve `../sdd/` relative to this skill directory first. If the runtime does not expose the loaded file path, resolve exactly one enabled Skill named `sdd` from the runtime catalog. Load its `SKILL.md`, `references/state-contract.md`, and the Status section of `references/output-contracts.md`; load `references/portable-lifecycle.md` when the project has no lifecycle specification. If zero or multiple cores resolve, stop and report an incomplete or ambiguous installation; do not guess a filesystem root.

## Workflow

1. Set `action = status`.
2. Inspect the live root, branch/worktree, and dirty state.
3. Read the task-state field owner for focus, status, blockers, and pending review.
4. Read the lifecycle plan and its plan state. Only a Human-confirmed plan may constrain the active route; show Draft as pending confirmation and Superseded as history only.
5. Match the active plan track to the focus; read persisted gate decisions and use the lifecycle specification only to interpret definitions and transitions.
6. Join confirmed plan rows with task/decision evidence to identify the current selected step. Keep skipped/merged steps and forced overrides visible; do not infer progress from the plan.
7. Return Workspace, Task, and Lifecycle separately, followed by evidence state, conflicts, and the smallest recovery action.

## Boundaries

- Permit “no single lifecycle stage” for methodology, multi-track, or multi-module projects.
- File existence does not confirm a gate.
- Respect a human-forced advance while retaining unmet conditions.
- Do not start subagents or repair inconsistencies.
