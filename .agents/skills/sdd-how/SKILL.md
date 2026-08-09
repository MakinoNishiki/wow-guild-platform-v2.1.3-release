---
name: sdd-how
description: SDD plan-aware goal-routing entry. Use only when the user explicitly invokes /sdd how, /sdd route, $sdd-how, asks how to accomplish a stated goal, or needs the applicable workflow, companion skills, expected artifacts, selected-plan relationship, and authorization boundary. Route only; never execute. Treat recommendations outside a confirmed project lifecycle plan as plan-change options.
---

# SDD How

> **Purpose**: Explain how to approach a stated goal without executing it.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Return a plan-aware SDD route, companion availability, prerequisites, artifacts, and authorization.
> **Index**: Dependency → Workflow → Boundaries

## Dependency

**CORE_DEPENDENCY: `sdd` (required, exact-name, sibling-or-catalog resolution).** Resolve `../sdd/` relative to this skill directory first. If the runtime does not expose the loaded file path, resolve exactly one enabled Skill named `sdd` from the runtime catalog. Load its `SKILL.md`, `references/state-contract.md`, `references/workflow-routing.md`, `references/companion-registry.json`, and the How section of `references/output-contracts.md`. If zero or multiple cores resolve, stop and report an incomplete or ambiguous installation; do not guess a filesystem root.

## Workflow

1. Set `action = how` and preserve the user's goal verbatim.
2. If the goal is missing, request only the goal and show one short example.
3. If interpretations materially change the workflow, list two or three choices with one-sentence descriptions.
4. Read the confirmed project lifecycle plan when present and identify whether the requested route is selected, skipped, or outside the plan.
5. Use the workflow registry to classify candidate skills and profile membership, then check actual installation before naming them as available. If only minimal is installed and the route needs a full-only workflow, say so and identify the full profile.
6. Return workflow, prerequisites, missing inputs, recommended companions, expected artifacts, plan/stage relationship, and authorization required.
7. When the recommendation is outside the plan, label it as a plan-change option requiring human confirmation; do not replace the selected route.
8. End with: “This answer provides a route only; it does not execute it.”

## Boundaries

- Do not call a recommended skill or modify project state.
- Do not include organization-specific tools in the portable route.
- A route recommendation never grants authorization to continue.
- Registry membership never proves installation or packaging.
