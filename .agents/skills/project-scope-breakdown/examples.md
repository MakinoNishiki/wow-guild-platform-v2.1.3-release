> **Document name**: Project Scope Breakdown Examples
> **Project**: Portable SDD workflow skills
> **Purpose**: Demonstrate full, tailored, forced-skip, and plan-change behavior.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Four examples showing user control, dependency warnings, and anti-expansion behavior.

---

# Examples

## 1. Standard full mode

**Input**: “Build a new internal supplier collaboration platform.”

After scope alignment, show the complete route:

| Step | Purpose | Expected input | Expected artifact | Gate |
|---|---|---|---|---|
| Project initialization | Establish governance and recovery | One-line goal and project identity | Project entry and state files | Initialization complete |
| Scope breakdown | Confirm users, boundaries, modules | Broad requirement and available context | Project breakdown brief | Scope gate |
| Module requirements | Design module responsibilities | Confirmed scope and decisions | Module requirement documents | Module gate |
| Optional integration | Unify multiple confirmed modules | Two or more confirmed module requirements | Integrated requirement view | Integration gate |
| Product-requirements preparation | Gather current-state, scenario, permission, dependency, and non-functional inputs | Confirmed upstream baseline or accepted-risk direct input | Preparation artifact | Authoring readiness |
| Product-requirements authoring | Specify behavior and edge cases | Preparation artifact or accepted-risk direct input | Product requirements | Implementation gate |
| Implementation | Build and verify the main path | Confirmed implementation baseline | Code/configuration/test evidence | Delivery evidence |
| Project summary | Index outputs and lessons | Delivery and verification evidence | Summary/specification | Archive decision |

The user chooses **Standard full mode**. The plan records every applicable stage; optional integration remains conditional on multiple confirmed module documents.

## 2. Small tailored route

**Input**: “Add one optional filter to an existing approved-list page.”

The full route is still shown first. The user chooses:

`scope breakdown → incremental product requirement → implementation`

Record module requirements and integration as skipped because the reliable current state and single change point are sufficient for the user. Later `sdd next` recommends the incremental requirement step, not a new module-requirement phase.

## 3. Forced MRD skip with unknown substitute

**Input**: “Skip module requirements and go directly from scope to PRD. I accept the risk and do not want to define another input document.”

Dependency warning:

- Normal dependency: product requirements usually inherit module boundaries and design decisions from confirmed module requirements.
- Risk: design decisions may be rediscovered or remain ambiguous during product specification.
- Suggested safeguard: use the confirmed scope brief and decision log as direct inputs.

The user keeps the route and declines the safeguard. Persist:

| Stage/change | Risk | Substitute input | Human decision |
|---|---|---|---|
| Skip module requirements | Product design may lack a module-level baseline | Unknown — human accepted risk | Keep route |

The plan is valid. Do not block it, claim the dependency was satisfied, or reinsert module requirements later.

## 4. Plan change

An implementation task discovers that two modules now require a shared contract. The standard route suggests an integration step, but the current plan skipped it.

Return a plan-change proposal:

- reason and evidence;
- impact of keeping the current route;
- impact of adding integration;
- smallest decision required.

Until the human confirms, keep the existing selected route. After confirmation, first append the previous complete ordered route and risk/override snapshot to Revision history or create an immutable versioned snapshot, then record the decision and update the current plan.
