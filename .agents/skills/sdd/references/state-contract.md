> **Document name**: SDD Workbench State Contract
> **Project**: SDD Workbench
> **Purpose**: Define field ownership, evidence states, lifecycle-plan reconciliation, conflicts, human overrides, and task focus.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Join static lifecycle rules, a human-selected route, actual task state, decisions, and live evidence without creating duplicate authorities.

---

# State Contract

## Field owners

Assign authority by field instead of using one global source order.

| Field | Preferred source | Other evidence |
|---|---|---|
| Project identity and governance version | project-level agent instructions or governance declaration | quickstart/background file |
| Project goal, type, and background | project quickstart or equivalent overview | README and agent instructions |
| User-selected lifecycle mode, route, skips, merges, and task-track mapping | `project_lifecycle_plan.md` or equivalent project plan | persisted route decision verifies human confirmation |
| Task state, recorded next, blockers, pending review | task registry or equivalent task-state file | artifacts and Git only verify |
| Human decisions, gate approval, forced skips/advances, and plan changes | decision log or equivalent persisted decision record | current conversation may supply a pending override |
| Root, branch, worktree, dirty state, artifact existence | live filesystem and Git inspection | documentation is only expected state |
| Lifecycle definitions and transition conditions | lifecycle specification | never use it as dynamic project state or selected route |
| Goal-to-workflow routing and companion classification | installed SDD routing specification and companion registry | availability never grants execution authority |

If a project uses different filenames, identify files that play these roles and label the mapping as inferred.

If the project has no lifecycle specification, use `references/portable-lifecycle.md` as the fallback static definition. This fallback never overrides a project-owned specification and never becomes a dynamic state source.

## Project lifecycle plan contract

Treat `project_lifecycle_plan.md` as a plan, not a progress tracker. A valid plan states:

- draft, human-confirmed, or superseded state;
- standard full or custom tailored mode;
- ordered selected route and applicable project/task track;
- selected, skipped, merged, or not-applicable route state for each standard step;
- dependency risks, unmet conditions, and human overrides;
- pointers to the task-state and decision owners.
- a version plus a reconstructable snapshot or immutable pointer for every superseded route.

Do not read actual completion, blockers, pending review, Git state, or gate approval from the plan. Join plan rows with task state and decisions when answering current position.

Plan state controls how it may be used:

- **Human-confirmed**: active route; may constrain status, next, and how.
- **Draft**: display as pending confirmation only; never use it to calculate current position or next.
- **Superseded**: historical evidence only; never use it as the active route.

When multiple tracks exist, use the explicit task focus to select a track. If no unique mapping exists, list plausible tracks instead of inventing a project-wide stage.

## Evidence states

- **Confirmed**: persisted human decision or matching authoritative record and live evidence.
- **Recorded, needs verification**: authoritative record exists but live evidence is missing or inconsistent.
- **Inferred**: conclusion derived from conversation or indirect evidence; include the basis.
- **Conflict**: sources for the same field disagree.
- **Unknown**: no reliable source exists.

Do not compress Conflict or Unknown into a numerical score.

## Conflict rules

- Same-field authoritative records disagree: stop the affected recommendation and request the smallest confirmation.
- Plan and task record disagree about actual progress: task record owns progress; expose the mismatch and do not change the plan silently.
- Task registry records a next action outside the confirmed selected route: task registry owns the recorded-next fact and the plan owns route validity. Report the conflict, do not execute or rewrite either source, and require human confirmation of a plan change or task-state correction.
- Plan selects or skips a step without persisted confirmation: report “route recorded; human confirmation not persisted.”
- Task record and artifact disagree: keep recorded task state, expose the live mismatch, and do not advance a gate.
- Artifact exists without gate approval: report “artifact exists; gate not confirmed.”
- Current-session decision is not persisted: report “human-confirmed in this session; persistence pending.”
- Project root or governance version cannot be identified: project/status/next degrade explicitly; how may provide a generic route.

## Human-forced lifecycle choice

An explicit human instruction may skip, merge, reorder, or advance stages even when normal dependencies are unmet. Return:

1. the human-selected route or stage;
2. the fact that it was forced;
3. unmet conditions and risk retained as follow-up evidence;
4. the decision source and whether it is persisted.

Risk advice does not veto the choice. Never reinsert a skipped step in `next` as if it were already selected. Propose it only as a plan change requiring human confirmation.

## Task focus for `next`

Select likely focus in this order without converting it into priority:

1. task explicitly supplied by the user;
2. task explicitly discussed in the current conversation;
3. single recorded active task;
4. evidence-based guess from the most recently active context.

Label steps 2–4 as inference. When more than one task or plan track remains plausible, list the likely focus first and other choices afterward. Every task identifier includes a one-sentence description on first appearance.

After focus selection:

- if a confirmed lifecycle plan maps the focus, select the next unfinished **selected** plan step;
- if the input is still a one-line/broad requirement and no confirmed plan exists, route to scope breakdown and lifecycle planning;
- if no plan exists but reliable downstream artifacts already establish the route, label the route as inferred and propose the smallest persistence action;
- do not expand a small task merely because more companion skills are installed.
