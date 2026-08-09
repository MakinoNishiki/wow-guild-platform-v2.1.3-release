---
name: sdd-check
description: "SDD adversarial check entry. Use only when the user explicitly invokes /sdd check, $sdd-check, or explicitly requests the full SDD adversarial health check. The invocation authorizes exactly three bounded, independent, read-only subagents for this call: state facts, governance/lifecycle, and artifacts/completion. If subagents are unavailable, perform and label the documented single-agent downgrade."
---

# SDD Check

> **Purpose**: Audit whether the current SDD project state can be trusted.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06
> **Summary**: Run three independent read-only lanes, including lifecycle-plan reconciliation, and synthesize evidence and dissent.
> **Index**: Dependency → Authorization → Workflow → Boundaries

## Dependency

**CORE_DEPENDENCY: `sdd` (required, exact-name, sibling-or-catalog resolution).** Resolve `../sdd/` relative to this skill directory first. If the runtime does not expose the loaded file path, resolve exactly one enabled Skill named `sdd` from the runtime catalog. Load its `SKILL.md`, `references/state-contract.md`, `references/check-protocol.md`, and the Check section of `references/output-contracts.md`. If zero or multiple cores resolve, stop and report an incomplete or ambiguous installation; do not guess a filesystem root.

## Authorization

Treat explicit invocation of this skill as authorization for exactly the three subagents defined in `check-protocol.md`, for this check only. Do not extend that authority to later turns, other skills, file edits, external actions, repairs, or nested delegation.

## Workflow

1. Freeze a compact evidence baseline, including `project_lifecycle_plan.md` or its equivalent when present.
2. Start exactly three independent, bounded reviewers when supported.
3. Keep every lane read-only and prevent reviewers from contacting or delegating to one another.
4. Wait for all available lanes, then synthesize agreement, dissent, evidence, overrides, confirmations, and a safe next action.
5. If subagents are unavailable, run the three lanes serially and label the result **Single-agent downgrade**.

## Boundaries

- Do not repair findings during the check.
- Do not hide a well-evidenced dissent behind majority vote.
- Do not substitute a normal Status summary for the adversarial output.
- Do not treat a selected plan row as proof of actual progress or silently repair a plan/task mismatch.
- Every identifier in confirmation or task lists requires a one-sentence description.
