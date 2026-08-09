> **Document name**: SDD Workbench Output Contracts
> **Project**: SDD Workbench
> **Purpose**: Define compact output shapes for workbench actions, including project lifecycle plans.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Required fields for menu, help, project, status, next, how, check, and error recovery.

---

# Output Contracts

## Root menu

Show available actions with one-sentence descriptions. Include logical `/sdd <action>` usage and flat `$sdd-<action>` fallback. Do not perform a full state scan for a menu-only request.

## Help

Return a beginner loop in this order:

1. one sentence explaining what SDD can help turn an idea into;
2. two to four capabilities relevant now;
3. Project summary, including selected lifecycle mode/route when confirmed;
4. Status summary, separating planned route from actual task state;
5. Next summary constrained by the selected route;
6. one concrete phrase the user can send to continue.

If the input is still a broad idea with no confirmed plan, the continuation phrase should point to scope breakdown/lifecycle planning. Do not include the full How route.

## Project

Return:

- project name and one-sentence purpose;
- project type and governance/SDD version;
- current task focus or plausible focuses with descriptions;
- lifecycle plan state, selected mode, applicable track, and compact selected route, or “no confirmed project lifecycle plan”;
- agent authorization role;
- evidence state and sources.

Project means working context, not personal identity or model persona.

## Status

Return three coordinates separately:

1. **Workspace**: root, worktree/branch, clean or dirty state.
2. **Task**: focus task, recorded status, blockers, pending review.
3. **Lifecycle**: selected plan track and route; current selected step joined from task/decision evidence; last confirmed gate; next selected gate; skipped/merged steps and human overrides that materially affect status.

When no plan is confirmed, say so. Methodology and multi-track projects may have no single lifecycle stage. Then return evidence state, conflicts, and the smallest recovery action.

Draft plans are pending proposals and Superseded plans are history; neither constrains current position.

## Next

Return:

- **Most likely next**: action, inference label when applicable, and basis;
- **Plan relationship**: selected plan row/track, or absence of a confirmed plan;
- required input, authorization, and completion evidence;
- **Other plausible choices** with one-sentence explanations.

Use the next unfinished selected step. Never silently recommend a skipped/merged-away stage. If one-line scope is not yet planned, the next action is scope breakdown/lifecycle planning. A proposal to restore a skipped step must be labeled as a plan change requiring human confirmation. Never call the likely choice highest priority unless a persisted decision does.

When task-state recorded next lies outside the confirmed route, report a conflict and request the smallest plan-change or task-state correction decision; do not overwrite either source.

## How

Return:

- interpreted goal;
- applicable route and relationship to the confirmed project plan;
- prerequisites and missing inputs;
- recommended companion methods/skills, with installed/bundled/unknown availability stated;
- expected artifacts and current-stage relationship;
- authorization required to continue;
- plan-change warning when the recommendation is outside the confirmed route.

If interpretations materially differ, list two or three choices. State: “This answer provides a route only; it does not execute it.”

## Check

Use the exact summary shape from `check-protocol.md`. Do not substitute a normal Status answer.

## Error recovery

- Unknown action: suggest nearest actions.
- Missing How goal: request only the goal and show one example.
- Not in a project: explain failed identification and the minimum usable starting point.
- Missing group core: report incomplete installation and list the missing member.
- Missing workflow in minimal: report the capability as unavailable, identify the full profile, and do not reconstruct or execute it privately.
- Missing workflow declared by the active profile: report an incomplete package for the affected route.
- Unsupported subagents: use documented serial downgrade and label it clearly.
