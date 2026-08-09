> **Document name**: SDD Workbench Adversarial Check Protocol
> **Project**: SDD Workbench
> **Purpose**: Define the bounded three-lane read-only review authorized by an explicit check call.
> **Owner**: SDD maintainers
> **Last updated**: 2026-08-06（加入项目生命周期计划与实际状态一致性检查）
> **Summary**: Reviewer scopes, lifecycle-plan reconciliation, independence, downgrade behavior, synthesis, and non-repair boundary.

---

# Adversarial Check Protocol

## Authorization and scope

Run this protocol only after an explicit `sdd check`, `/sdd check`, or `$sdd-check` invocation. That invocation authorizes exactly three bounded, read-only subagents for this check only. It does not authorize file edits, external actions, automatic repairs, downstream skills, or further subagent delegation.

All ordinary workbench actions use a lightweight single-agent consistency check and must not start subagents.

## Freeze the baseline

Before delegation, identify the project root and collect a compact baseline:

- project/governance files and their roles;
- task registry and current candidate focus;
- relevant decision records;
- `project_lifecycle_plan.md` or equivalent selected-route owner when present;
- Git/worktree status;
- artifact locations that support completion claims.

Pass raw paths and the user's check scope. Do not pass expected findings or another reviewer's conclusions.

## Three independent lanes

Start exactly three independent reviewers when the runtime supports bounded subagents:

1. **State facts**: verify project identity, task state, focus, blockers, and live worktree against their field owners.
2. **Governance and lifecycle**: verify the selected plan track, stages, gates, authorization boundaries, current-session decisions, forced skips/advances, retained risks, and whether a skipped stage was silently reintroduced.
3. **Artifacts and completion**: verify plan/task/decision pointers, documents, code, tests, Git evidence, and whether completion claims are supported without treating plan rows as progress.

Tell every reviewer: stay read-only, do not message other reviewers, do not spawn subagents, label facts versus inferences, and attach evidence locations. Let reviewers finish independently before synthesis.

## Downgrade

If the runtime cannot start subagents, run the same three lanes serially in the main agent and label the result **Single-agent downgrade**. Never describe a serial review as multi-agent adversarial checking.

## Synthesis

Return:

1. **Verdict**: Pass / Conditional pass / Fail.
2. **Agreed findings**: findings supported by multiple lanes.
3. **Dissenting findings**: single-lane findings with evidence and impact.
4. **High-risk issues**: issues that can make stage, task, or completion status wrong.
5. **Human overrides**: persisted overrides and current-session overrides pending persistence.
6. **Confirmations needed**: each item includes a one-sentence description, not only an identifier.
7. **Safe next action**: one action that does not expand scope.

Do not use a majority vote to erase a well-evidenced dissent. Do not repair findings during the check.
