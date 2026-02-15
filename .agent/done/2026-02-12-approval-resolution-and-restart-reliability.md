# Fix Approval Resolution and Restart Reliability Regressions

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository uses `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/.agent/PLANS.md` as the source of truth for ExecPlan format and process, and this document must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, Studio will no longer strand exec-approval cards in a disabled state, no longer mis-route valid approval requests to an unscoped bucket during hydration races, and no longer time out remote create/rename/delete flows when the gateway is configured for non-disconnect reload modes (`hot` or `off`).

A user-visible success condition is straightforward: approval cards disappear immediately after a successful allow/deny action even if the follow-up event is dropped, approvals tagged with an explicit `agentId` show on that agent, and remote mutation flows complete without a false “restart timed out” error when restart is not expected.

## Progress

- [x] (2026-02-12 19:52Z) Translated review findings into implementation milestones and acceptance criteria.
- [x] (2026-02-12 19:56Z) Milestone 1 complete: optimistic local cleanup after successful `exec.approval.resolve`, with test coverage for shared pending-approval state transitions.
- [x] (2026-02-12 20:01Z) Milestone 2 complete: explicit-`agentId` approvals now map directly, with regression coverage for pre-hydration routing.
- [x] (2026-02-12 20:02Z) Milestone 3 complete: remote create/rename/delete now gate `awaiting-restart` on reload-mode policy and skip disconnect waits for `hot`/`off`.
- [x] (2026-02-12 20:02Z) Final verification complete: typecheck and targeted vitest bundle passed; lint still reports existing baseline CommonJS + legacy test issues outside touched files.

## Surprises & Discoveries

- Observation: `exec.approval.resolved` is broadcast with `dropIfSlow`, so successful resolve RPC cannot rely on that event for guaranteed UI cleanup.
  Evidence: `/Users/georgepickett/openclaw/src/gateway/server-methods/exec-approval.ts` broadcasts resolved events with `{ dropIfSlow: true }`.

- Observation: agent mapping currently rejects a valid explicit `agentId` if that agent is not already hydrated in local state.
  Evidence: `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/approvals/execApprovalEvents.ts` only returns `request.agentId` when found in `agents`.

- Observation: restart completion logic requires a disconnect cycle before it can complete an `awaiting-restart` block.
  Evidence: `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/operations/useGatewayRestartBlock.ts` completes only when `observeGatewayRestart(...).restartComplete` is true; `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/operations/gatewayRestartPolicy.ts` defines this as `connected && sawDisconnect`.

## Decision Log

- Decision: Resolve actions will remove pending approvals locally immediately after successful `exec.approval.resolve`.
  Rationale: Event delivery is best-effort; local state must reflect confirmed RPC success without waiting for broadcast.
  Date/Author: 2026-02-12 / Codex

- Decision: Explicit `request.agentId` will be trusted whenever present and non-empty.
  Rationale: Gateway already validates and emits this field; hydration timing should not de-scope valid approvals.
  Date/Author: 2026-02-12 / Codex

- Decision: Remote mutation flows will gate restart waiting based on detected reload mode and skip disconnect-based waiting for `hot`/`off`.
  Rationale: This is the smallest reliable fix that prevents false timeouts while preserving conservative behavior when mode is unknown.
  Date/Author: 2026-02-12 / Codex

- Decision: If reload mode cannot be determined, fallback behavior remains conservative (await restart as today).
  Rationale: False positives (waiting when unnecessary) are preferable to false negatives (assuming no restart when one is required) for safety.
  Date/Author: 2026-02-12 / Codex

## Outcomes & Retrospective

All three reliability findings are fixed and backed by targeted tests.

- Approval cards now disappear immediately after a successful resolve RPC even if `exec.approval.resolved` is dropped.
- Explicit gateway-provided `agentId` values now scope approvals immediately, even before local agent hydration catches up.
- Remote create/rename/delete flows now skip disconnect-based restart waits when reload mode is `hot` or `off`, preventing false timeout errors in those environments.

Validation outcomes:

- `npm run typecheck` passed.
- `npx vitest run tests/unit/pendingExecApprovalsStore.test.ts tests/unit/execApprovalEvents.test.ts tests/unit/gatewayReloadMode.test.ts tests/unit/gatewayRestartPolicy.test.ts tests/unit/agentChatPanel-approvals.test.ts` passed.
- `npm run lint` still reports pre-existing baseline violations in CommonJS server/scripts files and `tests/unit/accessGate.test.ts`; no new lint issues were introduced by the touched feature files.

## Context and Orientation

The relevant runtime orchestration lives in `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/app/page.tsx`. That file owns:

- pending approval collections (`pendingExecApprovalsByAgentId` and `unscopedPendingExecApprovals`),
- resolve handler (`handleResolveExecApproval`),
- approval event ingestion (`handleExecApprovalEvent`),
- and remote mutation block transitions for create/rename/delete.

Approval event parsing and agent routing live in `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/approvals/execApprovalEvents.ts`.

Pending-approval collection helpers live in `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/approvals/pendingStore.ts` and are already covered by `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/tests/unit/pendingExecApprovalsStore.test.ts`.

Restart block lifecycle logic lives in `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/operations/useGatewayRestartBlock.ts` and `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/operations/gatewayRestartPolicy.ts`.

Gateway reload mode utilities live in `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/lib/gateway/gatewayReloadMode.ts` with tests at `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/tests/unit/gatewayReloadMode.test.ts`.

## Plan of Work

Milestone 1 fixes the highest-severity user issue: approvals that remain stuck in `resolving` after a successful decision. We will make success cleanup immediate and idempotent, then keep broadcast-based cleanup as a secondary path.

Milestone 2 fixes approval routing correctness by changing agent resolution semantics to trust explicit gateway-provided agent identifiers even before local hydration catches up.

Milestone 3 fixes false restart timeouts by detecting whether a disconnect-style restart is expected for remote config mutations, and by skipping restart waiting for non-disconnect reload modes.

## Concrete Steps

Working directory for all commands:

    /Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio

Milestone 1 commands:

    npx vitest run tests/unit/pendingExecApprovalsStore.test.ts

Milestone 2 commands:

    npx vitest run tests/unit/execApprovalEvents.test.ts

Milestone 3 commands:

    npx vitest run tests/unit/gatewayReloadMode.test.ts tests/unit/gatewayRestartPolicy.test.ts

Final verification commands:

    npm run typecheck
    npx vitest run tests/unit/pendingExecApprovalsStore.test.ts tests/unit/execApprovalEvents.test.ts tests/unit/gatewayReloadMode.test.ts tests/unit/gatewayRestartPolicy.test.ts tests/unit/agentChatPanel-approvals.test.ts
    npm run lint

Expected test transcript shape:

    Test Files  ... passed
    Tests       ... passed

Expected lint note:

    Existing baseline lint failures may remain in untouched CommonJS server/scripts files; touched feature files must not introduce new lint errors.

## Validation and Acceptance

### Milestone 1: Resolve success removes pending approval immediately

1. Tests to write first:

Add failing-first coverage in `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/tests/unit/pendingExecApprovalsStore.test.ts` for a new helper that removes a single approval ID from both scoped and unscoped collections in one idempotent operation. Include assertions for:

- removal from agent map plus unscoped list when ID exists in both,
- no-op behavior when ID is missing,
- empty agent buckets being dropped.

2. Implementation:

In `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/approvals/pendingStore.ts`, add a pure helper for “remove approval everywhere” state transitions.

In `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/app/page.tsx`, update `handleResolveExecApproval` so that after successful `client.call("exec.approval.resolve", ...)`, it immediately removes the approval from local state (scoped + unscoped). Keep existing event-driven cleanup and unknown-id cleanup paths as idempotent fallbacks.

3. Verification:

Run Milestone 1 tests and confirm the new helper assertions pass.

4. Commit:

Commit with message:

    Milestone 1: remove approvals locally on successful resolve

### Milestone 2: Trust explicit agentId during approval routing

1. Tests to write first:

Extend `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/tests/unit/execApprovalEvents.test.ts` with a failing test that passes an approval request containing `agentId: "agent-prehydration"` and an agents list that does not include that ID. Assert that `resolveExecApprovalAgentId` returns `"agent-prehydration"`.

Retain existing fallback behavior tests where `agentId` is absent and session-key mapping is required.

2. Implementation:

Update `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/approvals/execApprovalEvents.ts` so `resolveExecApprovalAgentId` returns non-empty `request.agentId` immediately. Keep session-key lookup as fallback only when explicit `agentId` is missing.

3. Verification:

Run Milestone 2 tests and confirm all event parser and mapping tests pass.

4. Commit:

Commit with message:

    Milestone 2: trust explicit agentId for approval routing

### Milestone 3: Skip disconnect-based restart wait for hot/off reload modes

1. Tests to write first:

Extend `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/tests/unit/gatewayReloadMode.test.ts` with failing-first tests for a new decision helper that determines whether remote mutation flows should await disconnect/reconnect. Cover:

- cached config indicates `gateway.reload.mode=hot` -> do not await restart,
- cached config indicates `gateway.reload.mode=off` -> do not await restart,
- unknown/missing mode -> conservative await restart,
- optional fresh `config.get` fallback path (if cached mode missing) returns expected decision.

If `gatewayRestartPolicy` behavior changes are needed, add corresponding failing tests in `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/tests/unit/gatewayRestartPolicy.test.ts`.

2. Implementation:

In `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/lib/gateway/gatewayReloadMode.ts`, add helper(s) to read reload mode and decide whether disconnect-based restart waiting is required.

In `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/app/page.tsx`, for remote create/rename/delete success paths, gate transition into `phase: "awaiting-restart"` using that helper. If restart waiting is not required, immediately reload agents and clear the block state instead of entering restart wait.

3. Verification:

Run Milestone 3 tests and confirm decision helper behavior is deterministic.

4. Commit:

Commit with message:

    Milestone 3: gate restart waits by reload mode

Final acceptance criteria:

- After clicking Allow once / Always allow / Deny, the corresponding pending approval card disappears immediately on successful RPC response, even if no `exec.approval.resolved` event arrives.
- Approval requests with explicit `agentId` are scoped to that agent regardless of hydration timing.
- Remote create/rename/delete flows no longer false-timeout in environments configured for `gateway.reload.mode=hot` or `gateway.reload.mode=off`.

## Idempotence and Recovery

All changes are additive and safe to re-run. Approval cleanup operations are idempotent by approval ID. If a resolve RPC fails, the approval remains present with error feedback and can be retried. Restart decision fallback remains conservative when mode detection fails, so failed detection cannot cause unsafe skipping of required restart waits.

## Artifacts and Notes

Capture concise evidence during implementation:

    npx vitest run tests/unit/pendingExecApprovalsStore.test.ts
    npx vitest run tests/unit/execApprovalEvents.test.ts
    npx vitest run tests/unit/gatewayReloadMode.test.ts tests/unit/gatewayRestartPolicy.test.ts

When validating Milestone 1 manually, capture one short log note showing:

- resolve RPC succeeded,
- local approval card removed before any resolved event is processed.

## Interfaces and Dependencies

After implementation, these interfaces/functions must exist and be used:

In `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/approvals/pendingStore.ts`:

- a pure helper that removes an approval ID from both:
  - `Record<string, PendingExecApproval[]>` scoped collections,
  - `PendingExecApproval[]` unscoped collection,
  - with empty scoped buckets removed.

In `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/features/agents/approvals/execApprovalEvents.ts`:

- `resolveExecApprovalAgentId` semantics:
  - return explicit non-empty `requested.request.agentId` first,
  - otherwise fall back to session-key matching,
  - otherwise return `null`.

In `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/lib/gateway/gatewayReloadMode.ts`:

- helper(s) that evaluate reload mode and return whether disconnect-style restart waiting is required for remote config mutations.

In `/Users/georgepickett/.codex/worktrees/3ffe/openclaw-studio/src/app/page.tsx`:

- successful resolve path performs immediate local removal of the approval,
- remote mutation post-success flow conditionally enters `awaiting-restart` only when restart waiting is required.

Plan revision note: Created on 2026-02-12 to address three merge-blocking reliability findings from first-principles review (approval stuck-state cleanup, approval agent scoping race, and remote restart false-timeout behavior).
Plan revision note: Updated on 2026-02-12 after completing Milestone 1 and verifying pending-approval store tests.
Plan revision note: Updated on 2026-02-12 after completing Milestones 2/3, running full verification, and recording baseline lint status.
