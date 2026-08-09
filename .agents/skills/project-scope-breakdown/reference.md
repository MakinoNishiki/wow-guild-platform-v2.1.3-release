> **Document name**: Project Scope Breakdown Reference
> **Project**: Portable SDD workflow skills
> **Purpose**: Provide output templates, field ownership, and checks for scope and lifecycle planning.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Templates and checks for scope alignment, route selection, forced skips, and state separation.

---

# Project Scope Breakdown Reference

## 1. `project_breakdown_brief.md` template

```markdown
> **Document name**: Project Breakdown Brief
> **Project**: [project name]
> **Purpose**: Record the human-confirmed scope baseline before downstream work.
> **Owner**: [owner]
> **Last updated**: [date]
> **Summary**: [one-sentence scope]

# Project Breakdown Brief

## Goal and success evidence
- Goal: [...]
- Success evidence: [...]

## Users and core scenarios
| User/role | Scenario | Expected outcome |
|---|---|---|
| [...] | [...] | [...] |

## Scope
| In scope | Out of scope | Reason/source |
|---|---|---|
| [...] | [...] | [...] |

## Module or change-point landscape
| Area | One-sentence responsibility | Current decision state |
|---|---|---|
| [...] | [...] | Confirmed / open |

## Open decisions
| Decision | Why it matters | Needed by | State |
|---|---|---|---|
| [...] | [...] | [...] | Open / deferred |
```

## 2. Field ownership

| Field | Preferred owner | Must not be used as replacement |
|---|---|---|
| Static stages, gates, candidate methods | lifecycle specification | project dynamic state |
| User-selected mode and route | `project_lifecycle_plan.md` | task completion claims |
| Actual task state, blockers, pending review | task registry or equivalent | lifecycle plan |
| Gate decisions, route changes, forced skips | decision log or equivalent | file existence |
| Root, branch, dirty state, artifacts | live filesystem and Git | documentation alone |

The workbench joins these fields when answering status and next. Do not keep the same dynamic field in two documents.

When the project has no lifecycle specification, use `sdd/references/portable-lifecycle.md` from the installed workbench core as the fallback static authority. Do not infer gates from examples.

## 3. Complete-route presentation checklist

Before asking the user to select a mode:

- [ ] Show all applicable lifecycle stages, including already-completed and optional stages.
- [ ] Show product-requirements preparation and authoring as separate selectable work steps, even though both belong to lifecycle stage 3.
- [ ] Give purpose, expected input, expected artifact, and normal gate for each stage.
- [ ] Mark the current position as recorded, inferred, conflict, or unknown.
- [ ] Explain that the complete route is a reference set, not a mandatory sequence.
- [ ] Offer exactly Standard full mode and Custom tailored mode.
- [ ] Make scale-based advice a recommendation, not an automatic decision.

## 4. Tailored-route dependency check

For each skipped, merged, or reordered step, produce:

| Change | Normal dependency | Downstream risk | Suggested safeguard | Human choice |
|---|---|---|---|---|
| Skip/merge/reorder [...] | [...] | [...] | [...] | Revise / keep |

If the user chooses **keep**:

- save the selected route unchanged;
- record the risk and human override;
- keep unmet conditions visible;
- allow substitute input to remain `Unknown — human accepted risk`;
- do not re-add the stage in later `next` recommendations without a plan-change decision.

## 5. Plan confirmation statement

Use a compact confirmation before writing:

```text
Selected mode: [Standard full / Custom tailored]
Selected route: [ordered steps]
Skipped or merged: [steps]
Known risks and unmet conditions: [items]
Applies to: [whole project / named task track]
Plan changes require: explicit human confirmation
```

Current-session confirmation is not persisted until the plan and decision owner are updated.

## 6. Completion checks

### Scope baseline

- [ ] Goal, success evidence, users, scenarios, in-scope, and out-of-scope are explicit.
- [ ] Reference material is not presented as confirmed intent without evidence.
- [ ] Direction-changing unknowns are recorded rather than guessed.

### Lifecycle plan

- [ ] Full route was shown before mode selection.
- [ ] Human selected the mode and route.
- [ ] Every stage has a route-selection state: selected, skipped, merged, or not applicable. Actual completion is read only from the task-state owner.
- [ ] Dependency risks and overrides are recorded without blocking a forced choice.
- [ ] Plan contains no actual progress, blockers, or review queue duplication.
- [ ] Task registry points to the plan and holds the actual next action.
- [ ] Decision owner records forced skips and later plan changes.

### Anti-expansion

- [ ] Later recommendations use the selected route, not the full standard route.
- [ ] A skipped stage is reintroduced only as an explicit plan-change proposal.
- [ ] Small tasks are not expanded merely because more workflow skills are available.
