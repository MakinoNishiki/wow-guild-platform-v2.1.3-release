---
name: sdd
description: "SDD project workbench core for answering project, status, next, how, help, and check questions from field-owned evidence. Use when the user explicitly invokes /sdd or $sdd, asks for the SDD workbench, wants to know the selected project lifecycle or current position, or requests a project/status/next/how/help/check action. Read project_lifecycle_plan.md when present, keep selected-route planning separate from actual task state, route to companion skills without executing them, and keep all actions read-only; only an explicit check authorizes its bounded adversarial subagents."
---

# SDD Workbench Core

> **Purpose**: Provide the single behavior contract for the related SDD workbench skills.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06（加入可裁剪项目生命周期与配套技能分层）
> **Summary**: Route six read-only actions through shared state, lifecycle-plan, companion-routing, output, check, and migration contracts.
> **Index**: Group contract → Actions → Common workflow → Boundaries → References

## Group contract

Treat this as the required core of one related skill group:

- `sdd-help`: beginner loop that combines capability, project, status, and next.
- `sdd-project`: current project identity and working context.
- `sdd-status`: workspace, task, and lifecycle position.
- `sdd-next`: likely next action plus other plausible choices.
- `sdd-how`: route a stated goal without executing it.
- `sdd-check`: three-lane adversarial, read-only review.

The seven members are the **workbench core**. Scope breakdown and downstream product methods are **workflow skills**, never extra core members. SDD may route to them after profile and runtime availability checks, but no workbench action executes them. Read `references/companion-registry.json` for portable workflow classification.

Install the exact seven directories listed in `references/group-manifest.json` together. Flat skills are current-Codex adapters for runtimes that cannot expose nested `/sdd` completion. Keep the behavior contract here and in this skill's `references/`; do not copy a competing state or routing policy into adapters.

## Select an action

Interpret explicit arguments as follows:

| Input | Action |
|---|---|
| no argument | Show a compact menu with one-sentence descriptions and one example. |
| `help` | Follow `references/output-contracts.md` → Help. |
| `project` or `who` | Follow Project. |
| `status` or `where` | Follow Status. |
| `next [task]` | Follow Next; treat the task argument as focus, not priority. |
| `how <goal>` or `route <goal>` | Follow How and load `references/workflow-routing.md`. |
| `check` | Follow `references/check-protocol.md`; require explicit invocation. |
| `do <goal>` | Explain that `do` implies execution and redirect to read-only `how <goal>`. |

Unknown or ambiguous input: suggest the closest actions with one-sentence descriptions. Missing `how` goal: ask only for the goal and give one short example.

## Run the common workflow

1. Stay read-only. Do not edit files, change task state, invoke a recommended downstream skill, or perform an external action.
2. Identify the real project root and worktree. Prefer Git evidence when available; otherwise use the current folder and state the limitation.
3. Load `references/state-contract.md`. Read only field owners needed for the selected action, including `project_lifecycle_plan.md` when the selected route matters. Never scan an entire skill catalog to answer a status question.
4. Separate recorded fact, current-session human confirmation, evidence-based inference, conflict, and unknown.
5. Load the selected section of `references/output-contracts.md` and return that shape.
6. Attach a brief evidence line. When a conflict changes the answer, state the conflict and the smallest human confirmation needed.
7. Whenever an identifier such as `T-099` is shown for the first time, append a one-sentence description.
8. Respond in the user's language unless the user requests another language.

## Boundaries

- Never rank project priorities. `next` may identify the most likely current focus, label it as an inference, explain the basis, and list other plausible choices.
- A human may explicitly force a lifecycle advance. Record it as a human override, retain unmet conditions, and distinguish a current-session override from a persisted decision.
- File existence proves an artifact exists; it does not prove a review gate passed.
- `how` recommends a workflow and authorization boundary; it never executes the workflow.
- A confirmed tailored lifecycle constrains project/status/next/how outputs. Never silently reinsert a skipped stage; present restoration only as a plan change.
- Dependency risks inform but do not veto an explicit human lifecycle choice.
- Only an explicit `sdd check`, `/sdd check`, or `$sdd-check` invocation authorizes the three bounded reviewers for that call. No other action may start subagents.
- If a required core member or reference is unavailable, report an incomplete installation instead of reconstructing a private alternative.

## References and utilities

- Read `references/state-contract.md` for field ownership, confidence states, conflicts, and human overrides.
- Read `references/output-contracts.md` for the six action outputs and error recovery.
- Read `references/workflow-routing.md` only for `how`.
- Read `references/companion-registry.json` with `workflow-routing.md` to classify routable workflow skills.
- Read `references/portable-lifecycle.md` only when the project has no lifecycle specification; it is the bundled fallback static authority.
- Read `references/check-protocol.md` only for explicit `check`.
- Read `references/runtime-and-migration.md` when installing, adapting, or packaging the group.
- Read `references/group-manifest.json` as the only membership authority.
- Run `scripts/validate_group.py` to verify structure, explicit-only metadata, dependencies, and current Codex name uniqueness.
- Run `scripts/build_release.py` to generate or reproduce the external package from the manifest.
- Run `scripts/privacy_scan.py` before migration or distribution.
