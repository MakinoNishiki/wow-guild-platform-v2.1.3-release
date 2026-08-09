---
name: sdd-next
description: SDD likely-next entry. Use only when the user explicitly invokes /sdd next, $sdd-next, asks what to do next, or wants the most likely plan-constrained action for an explicit or inferred task focus plus other plausible choices, required inputs, authorization, and completion evidence. Route broad one-line requirements without a confirmed lifecycle plan to project scope/lifecycle planning. Never rank project priority or silently restore a skipped stage.
---

# SDD Next

> **Purpose**: Identify a likely next action without choosing project priority.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Return the likely selected-route action, plan relationship, inference basis, requirements, and alternatives.
> **Index**: Dependency → Workflow → Boundaries

## Dependency

**CORE_DEPENDENCY: `sdd` (required, exact-name, sibling-or-catalog resolution).** Resolve `../sdd/` relative to this skill directory first. If the runtime does not expose the loaded file path, resolve exactly one enabled Skill named `sdd` from the runtime catalog. Load its `SKILL.md`, `references/state-contract.md`, and the Next section of `references/output-contracts.md`. If zero or multiple cores resolve, stop and report an incomplete or ambiguous installation; do not guess a filesystem root.

## Workflow

1. Set `action = next` and preserve any supplied task as the focus argument.
2. Select likely focus using the state contract; do not translate recency or conversation focus into priority.
3. If a confirmed plan track exists, choose the next unfinished selected step; never silently select a skipped or merged-away step.
4. If the focus is a broad one-line requirement with no confirmed plan, route to the workflow skill `project-scope-breakdown` for scope and lifecycle-plan selection. Do not describe it as core.
5. Return the most likely next action, plan relationship, inference label and basis, required input, authorization, and completion evidence.
6. List other plausible choices with one-sentence descriptions. A skipped stage may appear only as a plan-change option requiring human confirmation.
7. When conflict prevents a safe business action, return the smallest confirmation or state decision as next.
8. If the task registry records a next action outside the confirmed route, expose both facts and request a plan-change or task-state correction decision; do not silently choose one.

## Boundaries

- Never claim “highest priority” unless a persisted human decision says so.
- Do not execute the action, start downstream skills, or start subagents.
- Do not expand a small task merely because more workflow skills exist.
- Task identifiers require one-sentence descriptions on first appearance.
