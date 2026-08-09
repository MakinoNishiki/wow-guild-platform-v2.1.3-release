> **Document name**: SDD Workbench Workflow Routing
> **Project**: SDD Workbench
> **Purpose**: Route a stated goal through the selected project lifecycle and workflow skills without executing it.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Plan-aware route selection, minimal/full profile awareness, workflow availability, prerequisites, artifacts, and authorization boundaries.

---

# Workflow Routing

Use this reference only for `how`. Recommend a route; do not invoke it.

## Route order

1. Read `project_lifecycle_plan.md` when present and identify the track matching the user's focus. If the project has no lifecycle specification, use `portable-lifecycle.md` as the fallback static authority.
2. Interpret the goal against the selected route.
3. Read `companion-registry.json` to identify candidate workflow skills and the package profiles that include them.
4. Check actual runtime availability before naming a skill as installed. Package profile membership is distribution metadata, not proof of installation.
5. If the route lies outside the confirmed plan, present it as a plan-change option requiring human confirmation; do not treat it as the current route.

## Main routes

| Situation | Method route | Companion candidates |
|---|---|---|
| New project or broad idea | initialization → scope/lifecycle planning → selected downstream route | project-init, project-scope-breakdown |
| Broad requirement in an initialized project with no plan | scope alignment → show full lifecycle → user selects standard or tailored plan | project-scope-breakdown |
| Existing system with one small change | reliable current state → incremental requirement → implementation | prd-incremental-on-asis |
| Large or zero-to-one product requirements | product-requirements preparation → product-requirements authoring | prd-prep, prd-write |
| Multiple confirmed module requirements need a unified view | requirements integration | mrd-integration |
| Review meeting must update requirements | classify decisions → update requirements → record change history | prd-update-from-meeting, prd-write |
| Requirements are complete and need downstream work | vertical slicing, technical design, or test design | prd-split, generate-trd, technical-design-doc-creator, test-case |
| Requirements need review or shorter reader version | review, prototype walkthrough, or reader derivative | prd-review, prd-review-simulation, prototype-walkthrough, prd-humanize |
| Methodology or skill maintenance | governance, synchronization, or experience feedback | relevant governance companion |

## Workflow and profile rules

- Workbench core members answer project/status/next/how/check; workflow skills perform scope and downstream work only after separate explicit authorization.
- `project-scope-breakdown` remains a workflow even though minimal and full both bundle it. Core identity is defined only by the seven-member list.
- Registry membership means routable, not installed, bundled, authorized, or automatically executable.
- Minimal contains scope/lifecycle planning but not the other full product workflows. If a selected step is absent, state that the capability is not installed and identify the full profile; never pretend to execute it.
- Full contains the twelve portable product-lifecycle workflows. Runtime availability must still be checked.
- Do not include organization-specific messaging, finance, approval, or account-routing tools in the portable registry.

## Plan-aware behavior

- Prefer the confirmed selected route over the generic full route.
- Do not inflate a small task by listing every available companion as required.
- A human-forced skip remains authoritative even when prerequisites are unmet; surface the retained risk.
- Recommend a skipped stage only as an explicit plan-change option.
- When no plan exists, route the broad requirement to `project-scope-breakdown` as the persistence step.
- After that workflow persists a Human-confirmed plan, hand control to `sdd-status` to show the selected route and current evidence before `sdd-next` or `sdd-how` advances it.

## Route response rules

1. Distinguish full/zero-to-one routes from small incremental routes; ask only when the distinction materially changes the result.
2. Explain prerequisites, artifacts, the next handoff, and authorization.
3. State availability for every named companion skill.
4. Do not treat route recommendation as permission to execute.
