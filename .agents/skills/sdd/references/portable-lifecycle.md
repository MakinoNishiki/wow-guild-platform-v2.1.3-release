> **Document name**: Portable SDD Lifecycle Reference
> **Project**: SDD Workbench
> **Purpose**: Provide a fallback static lifecycle authority when the target project has no equivalent specification.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Portable stages, selectable work steps, normal inputs, artifacts, and gates for project lifecycle planning.

---

# Portable SDD Lifecycle Reference

## Authority boundary

Use the project's own lifecycle specification when one exists. Use this file only as the fallback static authority for a project that has no equivalent specification.

This file defines candidate stages, work steps, normal dependencies, and gates. It never stores a project's selected route, actual progress, blockers, review queue, or gate decisions.

## Complete reference route

| Lifecycle stage | Selectable work step | Purpose | Normal input | Expected artifact | Normal gate/condition |
|---|---|---|---|---|---|
| 0 Initialization | Project initialization | Establish project identity, governance, state owners, and recovery baseline | One-line goal and project identity | Project entry and state files | Root, governance, task owner, and recovery baseline exist |
| 1 Scope | Scope breakdown and lifecycle planning | Confirm users, scenarios, boundaries, modules, and selected delivery route | Broad requirement and available context | `project_breakdown_brief.md` + `project_lifecycle_plan.md` | Human confirms scope and route, or records a forced route with retained risk |
| 2 Module requirements | Module requirements per selected module | Define module responsibility, interfaces, examples, and unresolved detail | Confirmed scope and decisions | Module requirement documents | Each selected module baseline is human-confirmed |
| 2.5 Optional integration | Requirements integration | Unify terminology, cross-module flow, and end-to-end examples | Two or more confirmed module requirements | Integrated requirement view | Integration view is confirmed, or user explicitly skips it |
| 3 Product requirements | Product-requirements preparation | Gather current-state, scenario, permission, operational, dependency, and non-functional inputs | Selected upstream baseline or accepted-risk direct input | Product-requirements preparation artifact | Inputs needed for authoring are confirmed or explicitly accepted as unknown risk |
| 3 Product requirements | Product-requirements authoring | Specify normal, boundary, exception, data, permission, and interaction behavior | Preparation artifact or accepted-risk direct input | Product requirements document | Human confirms implementation readiness, or explicitly advances with retained conditions |
| 4 Implementation | Implementation and verification | Build the selected scope and prove the main path with real results | Confirmed implementation baseline or forced advance | Code/configuration/tests/operational evidence | Agreed delivery evidence exists; residual scope and risk are recorded |
| 5 Summary | Project summary and methodology feedback | Index outputs, decisions, evidence, residuals, and reusable lessons | Delivery and verification evidence | Summary/specification/experience report | Summary is archived; project closure remains a separate decision |

Optional downstream work such as reader-version derivation, review, simulated review, meeting-driven requirement update, incremental PRD rewrite, vertical slicing, technical design, test design, and prototype walkthrough may be inserted as selected project steps. Workflow availability does not make them mandatory.

For the full product workflow profile, the common optional PRD continuation is `prd-humanize → prd-review and/or prd-review-simulation → prd-update-from-meeting → prd-write incremental → prd-split`. Select only applicable steps; this chain is not permission to execute them.

## Tailoring rules

1. Show the complete applicable route before mode selection.
2. Offer Standard full mode or Custom tailored mode.
3. Explain dependency risk for skipped, merged, or reordered steps and suggest the smallest safeguard.
4. An explicit human choice overrides the normal dependency path. Preserve the choice, risk, unmet conditions, and decision evidence.
5. Never silently reinsert a skipped step. Restoring it is a plan change.
6. The plan stores route selection; task state stores progress; decision evidence stores gates, overrides, and route changes.

## Work-step selection granularity

Lifecycle stages group related work, but users select concrete work steps. In particular, product-requirements preparation and product-requirements authoring are separate selectable steps even though both belong to lifecycle stage 3.
