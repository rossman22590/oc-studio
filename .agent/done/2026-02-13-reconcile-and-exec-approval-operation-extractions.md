# Reduce `src/app/page.tsx` Orchestration Entanglement (Reconcile + Exec Approval Resolve)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository uses `.agent/PLANS.md` as the source of truth for ExecPlan requirements, and this document must be maintained in accordance with it.

## Purpose / Big Picture

Today, the main page module (`src/app/page.tsx`) interleaves core workflow policy (what Studio should do) with infrastructure side effects (gateway RPC calls, timers/intervals, and state mutations) inside a single mega-file. This makes it harder to test, reason about failure modes, and evolve behavior without touching unrelated UI wiring.

After this change, two high-impact flows will be extracted out of `src/app/page.tsx` into dedicated operation modules:

1. The “reconcile running agents” loop that probes `agent.wait` with `timeoutMs: 1` and applies terminal patches + history refreshes.
2. The manual “resolve exec approval” flow that calls `exec.approval.resolve`, updates pending approval UI state, optionally waits on `agent.wait`, and refreshes history.

You can see this working by running the unit tests: the new operation-level unit tests pass, and the existing Studio unit suite continues to pass (`npm test`), with no change in user-visible behavior.

Non-goals (explicitly out of scope for this plan):

1. Fully breaking up `src/app/page.tsx` into many smaller components.
2. Changing gateway protocol behavior, adding new endpoints, or changing wire formats.
3. Consolidating the pending approvals React state shape (scoped map + unscoped list) into a single unified store object.

## Progress

- [x] (2026-02-13) Milestone 1: Extract “reconcile running agents” flow into an operation module + unit tests; wire `src/app/page.tsx` to call the operation.
- [x] (2026-02-13) Milestone 2: Extract “resolve exec approval” flow into an approvals operation module + unit tests; wire `src/app/page.tsx` to call the operation.
- [x] (2026-02-13) Milestone 3: Run full verification (`npm test`, `npm run typecheck`) and update `ARCHITECTURE.md` to reflect the new operation boundaries.

## Surprises & Discoveries

- Observation: (none yet)
  Evidence: (n/a)

## Decision Log

- Decision: Limit scope to the two highest-impact page-level flows (reconcile loop and manual exec approval resolve) rather than attempting a full `src/app/page.tsx` breakup.
  Rationale: These flows combine domain decisions, gateway I/O, and timers and are currently difficult to test or modify safely; extracting them yields meaningful separation with low blast radius.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

- (to be filled in when complete)

## Context and Orientation

Key concepts as they exist in this repository:

1. Gateway RPC calls are made through `GatewayClient.call(method, params)` from `src/lib/gateway/GatewayClient.ts`.
2. The main Studio UI wiring lives in `src/app/page.tsx` and uses:
   - `useAgentStore()` (agent UI state store)
   - `createGatewayRuntimeEventHandler(...)` for processing gateway runtime events
   - `runHistorySyncOperation(...)` + `executeHistorySyncCommands(...)` for history sync
3. The reconcile loop uses pure helpers from `src/features/agents/operations/fleetLifecycleWorkflow.ts`:
   - `resolveReconcileEligibility(...)`
   - `resolveReconcileWaitOutcome(...)`
   - `buildReconcileTerminalPatch(...)`
4. Exec approvals are represented as `PendingExecApproval` in `src/features/agents/approvals/types.ts`, and state helpers exist in `src/features/agents/approvals/pendingStore.ts`.
5. Exec approval event handling already has a policy helper at `src/features/agents/approvals/execApprovalLifecycleWorkflow.ts`, including `shouldTreatExecApprovalResolveErrorAsUnknownId(...)`.

The architectural problem:

`src/app/page.tsx` currently owns the policy decisions and the infrastructure side effects for reconcile + manual exec approval resolve, in the same module that also owns rendering. This plan introduces operation modules that can be unit tested with stubbed gateway clients and deterministic inputs.

## Plan of Work

We will introduce two operation modules and migrate the existing `src/app/page.tsx` logic into them with minimal behavioral changes:

1. `src/features/agents/operations/agentReconcileOperation.ts` will own the reconcile loop logic (select eligible agents, probe `agent.wait`, decide terminal outcomes, and return/apply side effects).
2. `src/features/agents/approvals/execApprovalResolveOperation.ts` will own the manual approval resolve workflow (local pending state transitions + gateway calls + optional post-allow wait + history refresh).

Both modules will be covered with unit tests that do not require rendering React components. After each extraction, we will wire `src/app/page.tsx` to call the new operation and delete the now-duplicated inline logic.

## Concrete Steps

All commands are run from the repository root.

### Milestone 1: Extract reconcile running agents

Acceptance for this milestone:

1. `src/app/page.tsx` no longer contains the `reconcileRunningAgents` implementation details (it should delegate to the operation).
2. A unit test demonstrates the operation calls `agent.wait` for eligible running agents and produces the expected terminal patch + history refresh intent.

1. Tests to write (must fail before implementation):
   - Create `tests/unit/agentReconcileOperation.test.ts`.
   - Write `it("reconciles terminal runs and requests history refresh", ...)` that:
     - Constructs a minimal `AgentState[]` with one `running` agent with `sessionCreated: true` and `runId: "run-1"`.
     - Uses a stub `client.call` that, when called with `agent.wait`, returns `{ status: "ok" }`.
     - Asserts the operation returns a command list that includes:
       - a “clear run tracking for run-1” intent
       - an “update agent patch” intent with `buildReconcileTerminalPatch({ outcome: "ok" })`
       - a “load agent history” intent for that agent
   - Write `it("skips when agent is not eligible", ...)` that covers non-running or missing `runId` behavior (no gateway calls, no commands).

2. Implementation:
   - Create `src/features/agents/operations/agentReconcileOperation.ts` with:
     - A `ReconcileCommand` union type, at minimum:
       - `{ kind: "clearRunTracking"; runId: string }`
       - `{ kind: "dispatchUpdateAgent"; agentId: string; patch: Partial<AgentState> }`
       - `{ kind: "requestHistoryRefresh"; agentId: string }`
       - `{ kind: "logInfo"; message: string }`
       - `{ kind: "logWarn"; message: string; error: unknown }`
     - An async `runAgentReconcileOperation(params)` that:
       - Iterates agents, applies `resolveReconcileEligibility`, and probes `agent.wait` with `timeoutMs: 1` for eligible agents.
       - Uses `resolveReconcileWaitOutcome` to determine terminal outcomes.
       - When terminal, emits `clearRunTracking`, `dispatchUpdateAgent` using `buildReconcileTerminalPatch`, and `requestHistoryRefresh`.
       - Preserves existing logging behavior (the info line currently emitted on reconcile success should still happen, just via a `logInfo` command).
     - An executor `executeAgentReconcileCommands({ commands, dispatch, clearRunTracking, requestHistoryRefresh, logInfo, logWarn, isDisconnectLikeError })` that applies commands using injected dependencies.
   - Update `src/app/page.tsx`:
     - Replace the body of `reconcileRunningAgents` with a call to `runAgentReconcileOperation(...)` and `executeAgentReconcileCommands(...)`.
     - Keep `reconcileRunInFlightRef.current` guarding behavior in the page (minimal risk), but do not keep the per-agent terminal patching logic in the page.

3. Verification:
   - Run `npm test -- tests/unit/agentReconcileOperation.test.ts` and confirm it fails before implementation and passes after.
   - Run `npm test` to ensure no regressions.

4. Commit:
   - Commit with message `Milestone 1: Extract agent reconcile operation`.

### Milestone 2: Extract manual exec approval resolve flow

Acceptance for this milestone:

1. `src/app/page.tsx` no longer contains the long inline exec approval resolve workflow (it should delegate to the operation).
2. A unit test demonstrates that a successful resolve removes the approval locally and requests a history refresh for the resolved agent when the decision is allow-like.

1. Tests to write (must fail before implementation):
   - Create `tests/unit/execApprovalResolveOperation.test.ts`.
   - Build minimal in-memory pending approval state:
     - `pendingExecApprovalsByAgentId: Record<string, PendingExecApproval[]>`
     - `unscopedPendingExecApprovals: PendingExecApproval[]`
   - Write `it("removes approval and refreshes history after allow-once", ...)` that:
     - Creates a pending approval with `id: "appr-1"`, `agentId: "a1"`, and `sessionKey` matching the agent session.
     - Uses a stub client where:
       - `exec.approval.resolve` succeeds
       - `agent.wait` succeeds (or is skipped if no runId)
     - Asserts the operation updates state by removing `appr-1` and produces a “request history refresh for a1” intent when decision is `allow-once`.
   - Write `it("treats unknown approval id as already removed", ...)` that:
     - Simulates `exec.approval.resolve` throwing a `GatewayResponseError` whose message matches `unknown approval id` and asserts the local approval is removed.

2. Implementation:
   - Create `src/features/agents/approvals/execApprovalResolveOperation.ts` that exports an async function such as:
     - `resolveExecApprovalViaStudio(params)` where `params` includes:
       - `client` (GatewayClient-like `call`)
       - `decision: ExecApprovalDecision`
       - `approvalId: string`
       - `agents: AgentState[]` (for sessionKey->agent mapping)
       - `getPendingState: () => { approvalsByAgentId; unscopedApprovals }` (or pass current values directly)
       - `setPendingState: (next) => void` (implemented via the existing `setPendingExecApprovalsByAgentId` and `setUnscopedPendingExecApprovals` in the page)
       - `requestHistoryRefresh: (agentId: string) => Promise<void> | void` (page will pass `loadAgentHistory`)
       - `isDisconnectLikeError: (err: unknown) => boolean`
       - `shouldTreatUnknownId: (err: unknown) => boolean` (use `shouldTreatExecApprovalResolveErrorAsUnknownId`)
     - The operation should:
       - Mark the approval as `resolving: true` and clear its local error before calling the gateway (using `updatePendingApprovalById` helpers).
       - Call `client.call("exec.approval.resolve", { id, decision })`.
       - On success, remove the approval everywhere (use `removePendingApprovalEverywhere`).
       - If decision is `allow-once` or `allow-always`, optionally call `agent.wait` on the agent’s active run (if any) and then call `requestHistoryRefresh(agentId)`.
       - On error:
         - If `shouldTreatUnknownId(err)` is true, remove the approval locally and return.
         - Otherwise, set the approval’s `resolving: false` and set its `error` string.
   - Update `src/app/page.tsx`:
     - Replace `handleResolveExecApproval` body with a thin delegate to `resolveExecApprovalViaStudio(...)`.
     - Keep UI behavior (resolving spinner, error display) unchanged.

3. Verification:
   - Run `npm test -- tests/unit/execApprovalResolveOperation.test.ts` and confirm it fails before implementation and passes after.
   - Run `npm test` to ensure no regressions.

4. Commit:
   - Commit with message `Milestone 2: Extract exec approval resolve operation`.

### Milestone 3: Full verification and architecture update

1. Run:
   - `npm test`
   - `npm run typecheck`

2. Update `ARCHITECTURE.md`:
   - In the “Focused agent UI” operations list, mention the new reconcile operation module and the extracted exec approval resolve operation module.
   - In “Major design decisions & trade-offs”, add a bullet describing the decision to keep page wiring thin by extracting page-level workflows into operation modules that can be unit tested without React.

3. Commit:
   - Commit with message `Milestone 3: Document reconcile + approval operations in architecture`.

## Validation and Acceptance

Acceptance is met when all of the following are true:

1. `npm test` passes.
2. `npm run typecheck` passes.
3. `src/app/page.tsx` delegates reconcile and manual exec approval resolve flows to operation modules (and does not contain the old long inline implementations).
4. `tests/unit/agentReconcileOperation.test.ts` and `tests/unit/execApprovalResolveOperation.test.ts` pass and cover the intended behaviors.
5. `ARCHITECTURE.md` is updated to reflect the new operation boundaries.

## Idempotence and Recovery

This plan is safe to re-run.

If a milestone breaks behavior, the recommended recovery path is:

1. Revert only the changes from the most recent milestone commit.
2. Re-run `npm test` and `npm run typecheck`.
3. Re-apply the milestone with smaller steps (for example, extract to an operation module without changing call sites first, then switch call sites, then delete old code).

## Artifacts and Notes

- (to be filled in during implementation with short test transcripts if needed)

## Interfaces and Dependencies

- The operation modules should depend only on existing types and helpers:
  - `AgentState` from `src/features/agents/state/store`
  - reconcile helpers from `src/features/agents/operations/fleetLifecycleWorkflow.ts`
  - approvals types/helpers from `src/features/agents/approvals/*`
  - gateway error type `GatewayResponseError` (already used in approvals workflow code)
- No new third-party dependencies should be introduced.
