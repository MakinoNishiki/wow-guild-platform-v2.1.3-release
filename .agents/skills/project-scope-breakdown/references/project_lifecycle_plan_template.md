> **Document name**: Project Lifecycle Plan Template
> **Project**: [project name]
> **Purpose**: Record the human-selected delivery route without duplicating actual task status.
> **Owner**: [owner]
> **Last updated**: [date]
> **Summary**: [selected mode and one-sentence route]
> **Index**: Authority → Intent → Selection → Route → Overrides → State pointers → Revision history → Change control

---

# Project Lifecycle Plan

## 0. Authority and boundary

- **Plan state**: Draft / Human-confirmed / Superseded
- **Plan version**: [integer or project version]
- **Supersedes**: [previous version/snapshot pointer or None]
- **Decision source**: [decision record or current-session confirmation pending persistence]
- **Applies to**: Whole project / Task track `[name or identifier with description]`
- **Static lifecycle source**: [project lifecycle specification path; otherwise installed `sdd/references/portable-lifecycle.md`]
- **Actual task-state owner**: [task registry path or equivalent]
- **Gate/override owner**: [decision log path or equivalent]

This document owns the selected route. It does not own actual completion, blockers, pending review, Git state, or gate approval.

## 1. Intent

- **One-line request**: [...]
- **Goal**: [...]
- **Success evidence**: [...]
- **Scope baseline**: [project breakdown brief path]

## 2. Selection

- **Mode**: Standard full / Custom tailored
- **Human confirmation**: [who/when/source]
- **Selection rationale**: [...]

## 3. Selected route

| Order | Standard stage | Project step | Selection | Expected input | Expected artifact | Normal gate | Companion method/skill |
|---:|---|---|---|---|---|---|---|
| 1 | [...] | [...] | Selected / Skipped / Merged / Not applicable | [...] | [...] | [...] | [...] |

`Selection` describes the plan, not actual progress.

## 4. Skips, merges, risks, and human overrides

| Stage/change | Normal dependency | Risk or unmet condition | Suggested safeguard | Human decision | Persisted evidence |
|---|---|---|---|---|---|
| [...] | [...] | [...] | [...] / None accepted | Keep route / Revise | [...] |

An unknown substitute input may be recorded as `Unknown — human accepted risk`. The selected route remains valid as a plan.

## 5. Task-track mapping

| Task track | Route rows | Task-state pointer | Notes |
|---|---|---|---|
| [...] | [...] | [...] | [...] |

## 6. Current state pointers

- **Actual status and next action**: [task registry location]
- **Gate decisions and forced advances**: [decision log location]
- **Live workspace and artifacts**: inspect filesystem and Git

Do not copy those dynamic values into this plan.

## 7. Revision history and superseded route snapshots

Before changing the current route, preserve the previous complete ordered route and its skip/merge risk state. Either append the full snapshot below or create an immutable versioned plan file and link it.

| Version | Effective date | Complete ordered route snapshot or immutable file | Skip/merge risk snapshot | Change summary | Human confirmation | Decision pointer |
|---|---|---|---|---|---|---|
| [...] | [...] | [...] | [...] | [...] | [...] | [...] |

A change record that contains only a short summary is insufficient when it cannot reconstruct the previous complete route.

## 8. Change control

Adding a skipped stage, removing a selected stage, changing order, or changing the applicable task track requires explicit human confirmation. Snapshot the previous route under §7, record the decision in the gate/override owner, then update this plan. Never overwrite the only copy of the previous route.

## Navigation

| If you need to know… | Read | Location |
|---|---|---|
| Why this route was selected | This plan | §2, §4 and §7 |
| What is actually in progress | Task-state owner | Corresponding task track |
| Which gates or overrides were approved | Gate/override owner | Corresponding decision entry |
| What each standard stage means | Static lifecycle source | Stage and gate definitions |
