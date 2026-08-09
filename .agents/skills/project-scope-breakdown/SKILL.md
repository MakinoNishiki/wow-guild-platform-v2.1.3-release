---
name: project-scope-breakdown
description: "Turn a one-line or broad project idea into a confirmed scope baseline and a project-specific lifecycle plan. Use when the user provides a vague requirement, asks to break down project scope, wants to see the complete downstream workflow, or needs to choose between the standard full lifecycle and a custom subset. Always show the complete applicable route before mode selection, warn about dependency risks without vetoing an explicit human choice, and persist the confirmed route in project_lifecycle_plan.md."
metadata:
  source_version: "2.0"
---

# Project Scope Breakdown

> **Document name**: Project Scope Breakdown Skill
> **Project**: Portable SDD workflow skills
> **Purpose**: Convert a broad idea into a confirmed scope baseline and a user-selected project lifecycle plan.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Separate scope-discovery work from the downstream delivery lifecycle, then persist the selected full or tailored route.
> **Index**: Responsibilities → Two workflow layers → Workflow → Human override → Outputs → Boundaries → References

## Responsibilities

This workflow skill answers two related but different questions:

1. **What does the request mean?** Clarify goal, users, scenarios, scope, exclusions, modules, unknowns, and decision logic.
2. **Which delivery steps will this project actually use?** Show the complete applicable SDD route, let the user select the standard route or a tailored subset, check dependencies, and persist the confirmed choice.

Do not collapse these into one stage list. The scope-discovery steps below describe how this skill works; lifecycle stages describe what the project may do after scope alignment.

## Two workflow layers

### Layer A: scope-discovery steps

1. **Baseline understanding**: restate the one-line requirement, goal, current state, non-goals, users, and known constraints.
2. **Scope anchors**: confirm phase strategy, root problems, module landscape, and open decisions.
3. **Design depth when needed**: resolve direction-changing unknowns; preserve unresolved items explicitly.
4. **Pressure test when useful**: review the scope from relevant stakeholder perspectives without making this mandatory for every small task.
5. **Decision chain**: explain which root decision unlocks downstream work and what remains outside the task.

Small requests may use only steps 1, 2, and 5. These are internal discovery steps, not the project's selected delivery lifecycle.

### Layer B: project delivery lifecycle

Use the project's lifecycle specification as the static authority. When the common SDD lifecycle is available, show the complete map before asking for a mode:

`project initialization → scope/lifecycle planning → module requirements → optional integration → product-requirements preparation → product-requirements authoring → implementation → project summary`

For each applicable step, give one sentence each for purpose, expected input, expected artifact, and normal gate. Show already-completed facts only when the task-state/decision owners prove them, separate from route selection; mark not-applicable route steps without hiding either from the initial full view.

## Workflow

### 1. Identify context and field owners

- Identify the real project root and governance version.
- Read the project overview, task-state owner, persisted decisions, lifecycle specification, and an existing `project_lifecycle_plan.md` when present.
- If the project has no lifecycle specification, load the workbench core's `references/portable-lifecycle.md` as the fallback static authority and record that source in the plan.
- Treat the lifecycle specification as static definitions, the lifecycle plan as the selected route, the task registry as actual progress, and the decision log as gate/override authority.
- If the project lacks these conventional files, map equivalent roles and label the mapping as inferred.

### 2. Build and confirm the scope baseline

Start from available inputs; a one-line requirement is sufficient to begin. Present understanding by theme and ask the user to correct differences. Confirm:

- project goal and success evidence;
- users and core scenarios;
- scope in and scope out;
- module or change-point landscape;
- known constraints and unresolved decisions.

Do not treat reference material as confirmed requirements. Keep confirmed facts, inferences, open questions, and human decisions separate.

### 3. Show the complete applicable route

Before recommending a shortcut, show the whole applicable lifecycle with the current position. Explain that the full route is a reference set, not an obligation.

Then offer exactly two selection modes:

- **Standard full mode**: use all applicable stages and normal gates, with optional stages applied only when their conditions hold.
- **Custom tailored mode**: select, skip, or merge individual stages; preserve the user's sequence exactly after confirmation.

Scale heuristics may recommend a mode, but never select it for the user.

### 4. Check dependencies without taking control

For every skipped, merged, or reordered stage:

1. state the normal dependency and the concrete downstream risk;
2. suggest the smallest substitute input or safeguard when one exists;
3. ask whether the user wants to revise or keep the route;
4. if the user keeps it, record the choice as a human override and continue.

Dependency checks inform the user; they do not veto the route. If the user declines to name a substitute input, record it as unknown with its risk. Never silently restore a skipped stage.

### 5. Persist the selected route

After explicit confirmation, create or update project-level `project_lifecycle_plan.md` using `references/project_lifecycle_plan_template.md`.

The plan records intent, selected mode, route order, selected/skipped/merged steps, expected inputs and artifacts, risks, human overrides, applicable task tracks, and change rules. It must not duplicate actual completion, blockers, or review queues.

For SDD 2.0 projects:

- register the plan artifact and actual next action in `task_registry.md`;
- persist mode selection, forced skips, and later route changes in `decision_log.md` or the equivalent human-decision owner;
- treat adding a skipped stage, removing a selected stage, or changing order as a scope change requiring human confirmation.

For projects without these files, use equivalent roles and state the mapping.

### 6. Hand off without executing downstream work

Return:

- confirmed scope summary;
- selected mode and route;
- skipped/merged steps with risks and overrides;
- plan file location;
- actual next action and required authorization;
- `sdd-status` as the default handoff after a Human-confirmed plan is persisted, so later status/next/how answers read the plan instead of rerunning scope breakdown;
- one sentence stating that downstream workflow skills were not executed.

## Human override rules

- The human may force any stage skip, merge, reorder, or advance.
- Preserve unmet conditions and risk; do not claim they were satisfied.
- Distinguish a current-session confirmation from a persisted decision.
- Once persisted, the tailored route constrains later recommendations. A standard stage cannot be reintroduced without presenting it as a plan change.
- When multiple task tracks need different routes, keep one project-level plan with separate named tracks rather than creating competing plan files.

## Outputs

Required outputs after confirmation:

1. `project_breakdown_brief.md` or the project's equivalent scope baseline.
2. `project_lifecycle_plan.md` from the bundled template.
3. Task-state and decision references appropriate to the project's governance version.

Read `reference.md` for templates and checks. Read `examples.md` for standard, tailored, and forced-skip examples.

## Boundaries

- Do not execute MRD, PRD, implementation, review, or other downstream workflow skills.
- Do not convert a route recommendation into execution authorization.
- Do not store actual task progress in the lifecycle plan.
- Do not use project size to overrule the user's selected route.
- Do not require a substitute artifact as a condition for preserving an explicit human choice.
- Do not start subagents unless the user separately authorizes them under the active project policy.

## References

- `reference.md`: scope brief template, lifecycle selection checklist, field ownership, and completion checks.
- `references/project_lifecycle_plan_template.md`: portable project-level route template.
- `examples.md`: complete route, small tailored route, forced MRD skip, and plan-change examples.
- `../sdd/references/portable-lifecycle.md`: fallback static lifecycle authority when the project has no equivalent specification; report incomplete installation if this bundled core reference is missing.
