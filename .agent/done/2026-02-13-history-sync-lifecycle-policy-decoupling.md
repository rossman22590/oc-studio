# Decouple History Sync Lifecycle Policy From `src/app/page.tsx`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The source-of-truth planning guide for this repository is `.agent/PLANS.md`, and this document must be maintained in accordance with `.agent/PLANS.md`.

This plan builds on `.agent/done/2026-02-12-chat-transcript-dedupe-stability.md` and `.agent/done/execplan-fleet-refresh-latest-update-lifecycle-decoupling.md`. Those plans improved transcript dedupe behavior and extracted several lifecycle policies, but the history synchronization lifecycle in `src/app/page.tsx` remains the highest-impact flow where domain decisions are interleaved with gateway I/O and UI mutations.

## Purpose / Big Picture

After this change, users should still see the same transcript behavior: chat history loads, stale responses are ignored, running sessions avoid unsafe history overwrites, and “Load more” still works. The visible UX should not change. The architectural improvement is that history synchronization policy moves into a dedicated workflow module so it can be tested in isolation without wiring `stateRef`, in-flight refs, and gateway calls in `src/app/page.tsx`.

You can verify success by running the new history lifecycle tests and then exercising chat send + history refresh in Studio to confirm no regression in transcript rendering.

## Progress

- [x] (2026-02-13 05:10Z) Re-assessed entanglement candidates and selected page-level history/transcript synchronization as the highest-impact remaining boundary violation.
- [x] (2026-02-13 05:10Z) Created Beads milestones and dependencies for this plan (`bd-hqe` -> `bd-5ls` -> `bd-ebq`, with `bd-ebq` also blocked by `bd-hqe`). [bd-hqe]
- [x] (2026-02-13 05:13Z) Implemented Milestone 1: added `historyLifecycleWorkflow` with failing-first unit tests for request planning, stale-response adjudication, metadata-only disposition, and metadata patch semantics. [bd-hqe]
- [x] (2026-02-13 05:19Z) Implemented Milestone 2: rewired `loadAgentHistory` through workflow request/disposition helpers and added integration coverage in `tests/unit/historyLifecycleWorkflow.integration.test.ts`. [bd-5ls]
- [x] (2026-02-13 05:19Z) Implemented Milestone 3: switched runtime handler to a narrow `requestHistoryRefresh` boundary command and updated architecture docs. [bd-ebq]
- [x] (2026-02-13 05:19Z) Final verification completed; targeted test bundle passed and `br sync --flush-only` reported clean export state.

## Surprises & Discoveries

- Observation: `loadAgentHistory` still embeds policy and side effects in one callback.
  Evidence: `src/app/page.tsx` combines request planning, stale-response adjudication, transcript merge policy, and dispatch patching in one function spanning `loadAgentHistory` internals.

- Observation: history refresh is triggered from several infrastructure paths with no dedicated policy boundary.
  Evidence: `loadAgentHistory` is called from focused-run poll loop, reconcile completion, startup/session-loaded checks, and `gatewayRuntimeEventHandler` callback wiring (`src/app/page.tsx` and `src/features/agents/state/gatewayRuntimeEventHandler.ts`).

- Observation: runtime stream handling has strong tests, but history lifecycle policy itself has no direct workflow-level tests.
  Evidence: `tests/unit/gatewayRuntimeEventHandler.*` mostly mock `loadAgentHistory`; there is no `historyLifecycleWorkflow` test module today.

- Observation: repository-wide `npm run typecheck` has pre-existing baseline failures outside this scope.
  Evidence: baseline includes `src/features/agents/state/transcript.ts` (TS18047) and `tests/unit/gatewayProxy.test.ts` (TS7016/TS7006).

- Observation: history lifecycle request/disposition rules can be expressed as pure inputs/outputs without pulling in React or gateway dependencies.
  Evidence: `tests/unit/historyLifecycleWorkflow.test.ts` now passes with direct assertions for skip/fetch planning, stale-drop reasons, metadata-only disposition, and metadata patch building.

- Observation: runtime handler call sites only needed a one-way history refresh command and did not require page-level load options.
  Evidence: `src/features/agents/state/gatewayRuntimeEventHandler.ts` now depends on `requestHistoryRefresh({ agentId, reason })`, while `src/app/page.tsx` adapts that command to `loadAgentHistory(agentId)`.

## Decision Log

- Decision: target history synchronization lifecycle now instead of additional create/approval/mutation seams.
  Rationale: those seams now have dedicated workflow modules and integration tests, while history lifecycle policy still resides in page-level orchestration with high churn and broad runtime fan-in.
  Date/Author: 2026-02-13 / Codex

- Decision: preserve side-effect ownership in `src/app/page.tsx` while extracting decision policy into a pure workflow module.
  Rationale: this minimizes migration risk and keeps gateway I/O sequencing unchanged while improving testability.
  Date/Author: 2026-02-13 / Codex

- Decision: make runtime handler depend on a narrow history refresh command boundary, not page internals.
  Rationale: this reduces coupling between runtime event parsing and page-level history synchronization details.
  Date/Author: 2026-02-13 / Codex

- Decision: keep milestones test-first and close Beads issues only after passing verification and milestone commit.
  Rationale: aligns with `.agent/PLANS.md` requirements for idempotent, verifiable progress.
  Date/Author: 2026-02-13 / Codex

- Decision: include `buildHistoryMetadataPatch` in the extracted workflow module during Milestone 1 rather than waiting for page rewiring.
  Rationale: this keeps metadata semantics (`historyMaybeTruncated`, request-id tracking) under the same policy boundary and reduces branch-level drift during Milestone 2 migration.
  Date/Author: 2026-02-13 / Codex

- Decision: keep runtime boundary payload explicit with `reason: "chat-final-no-trace"` instead of a bare function call.
  Rationale: explicit command shape makes trigger intent testable and keeps future refresh paths additive without widening handler dependencies.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

Completed.

- History request planning, stale adjudication, and metadata patch semantics are now in `src/features/agents/operations/historyLifecycleWorkflow.ts` with deterministic unit coverage.
- `loadAgentHistory` in `src/app/page.tsx` now routes branch policy through workflow helpers while keeping gateway I/O and dispatch side effects local.
- Runtime handler history refresh coupling was narrowed to `requestHistoryRefresh` command dependency, with regression assertions in `tests/unit/gatewayRuntimeEventHandler.chat.test.ts`.
- Architecture documentation now names both `historyLifecycleWorkflow.ts` and the runtime `requestHistoryRefresh` boundary.
- Verification status:
  - `npm run test -- tests/unit/historyLifecycleWorkflow.integration.test.ts tests/unit/runtimeEventBridge.test.ts tests/unit/chatSendOperation.test.ts` passed.
  - `npm run test -- tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/runtimeEventBridge.test.ts` passed.
  - `npm run test -- tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/runtimeEventBridge.test.ts tests/unit/chatSendOperation.test.ts` passed.
  - `npm run typecheck` still reports the known baseline errors in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts`; no new typecheck failures were introduced by this plan.

## Context and Orientation

In this repository, transcript state is a mix of runtime-stream updates and history rehydration. The term “history lifecycle policy” means the rules that decide:

1. whether to request history for an agent now;
2. whether a history response is stale and must be ignored;
3. whether to apply metadata only versus transcript content;
4. how to map merge outcomes into `updateAgent` patches.

Today this policy is concentrated in `src/app/page.tsx` inside `loadAgentHistory`, where it is interleaved with direct gateway I/O (`chat.history`), mutable refs (`historyInFlightRef`, `stateRef`), and dispatch side effects.

Key files and boundaries relevant to this plan:

- `src/app/page.tsx`: top-level orchestration, including `loadAgentHistory`, poll loop, reconcile callbacks, and runtime-handler dependency wiring.
- `src/features/agents/state/runtimeEventBridge.ts`: pure history and summary helpers (`buildHistoryLines`, `buildHistorySyncPatch`, snapshot patching).
- `src/features/agents/state/gatewayRuntimeEventHandler.ts`: runtime event adapter that requests history refresh through an injected boundary command (`requestHistoryRefresh`).
- `src/features/agents/state/transcript.ts`: transcript merge and dedupe primitives used by v2 transcript path.
- `tests/unit/runtimeEventBridge.test.ts` and `tests/unit/gatewayRuntimeEventHandler.*`: existing adapter/helper tests that will remain regression anchors.

The current boundary violation is flow-level: infrastructure concerns and domain policy are coupled in the same call stack, making isolated policy testing difficult and increasing regression risk when gateway/history timing behavior changes.

## Milestones

### Milestone 1: Extract history lifecycle workflow policy

Introduce `src/features/agents/operations/historyLifecycleWorkflow.ts` as a pure policy module. It must own request-limit planning, stale-response adjudication, and response disposition mapping currently embedded in `loadAgentHistory`. End state: policy helpers are unit-testable without React refs or gateway client mocks.

### Milestone 2: Rewire page history orchestration through workflow adapters

Refactor `loadAgentHistory` in `src/app/page.tsx` so it delegates branch decisions to the new workflow module while retaining gateway calls and dispatch side effects in-page. Add integration tests that assert parity for stale-drop reasons, running-state metadata-only updates, and transcript-v2 merge application paths.

### Milestone 3: Align runtime history refresh boundary and document architecture

Replace direct runtime-handler dependency on page-level history internals with a narrow history refresh command function (for example, a small adapter function that encapsulates invocation rules). Add regression tests for runtime-triggered history refresh behavior and update `ARCHITECTURE.md` to name the new boundary.

## Plan of Work

First, add `historyLifecycleWorkflow.ts` under `src/features/agents/operations/` with explicit input/output contracts for request planning and response adjudication. Use existing helper modules (`runtimeEventBridge`, `transcript`) rather than duplicating parsing/merge logic.

Second, rewire `loadAgentHistory` in `src/app/page.tsx` so request planning and response branch selection come from workflow helpers. Keep gateway transport and state dispatch local to page adapters to avoid behavior drift.

Third, refine runtime-handler to use a narrow history-refresh command boundary and add tests proving parity for event-driven history refresh behavior. Then update architecture docs to reflect the extracted policy boundary.

## Concrete Steps

1. From `/Users/georgepickett/openclaw-studio`, claim Milestone 1 and write failing tests first.

    br ready --json
    br update bd-hqe --claim --json
    npm run test -- tests/unit/historyLifecycleWorkflow.test.ts

    Expected before implementation: Vitest reports missing test file/module exports.

2. Implement Milestone 1 workflow module and pass targeted tests.

    npm run test -- tests/unit/historyLifecycleWorkflow.test.ts
    git add src/features/agents/operations/historyLifecycleWorkflow.ts tests/unit/historyLifecycleWorkflow.test.ts
    git commit -m "Milestone 1: Extract history lifecycle workflow policy"
    br close bd-hqe --reason "Tests pass, committed" --json

3. Claim Milestone 2 and add failing integration tests around page adapter behavior.

    br update bd-5ls --claim --json
    npm run test -- tests/unit/historyLifecycleWorkflow.integration.test.ts

4. Rewire `loadAgentHistory` and verify Milestone 2.

    npm run test -- tests/unit/historyLifecycleWorkflow.integration.test.ts tests/unit/runtimeEventBridge.test.ts tests/unit/chatSendOperation.test.ts
    git add src/app/page.tsx src/features/agents/operations/historyLifecycleWorkflow.ts tests/unit/historyLifecycleWorkflow.integration.test.ts
    git commit -m "Milestone 2: Route page history sync through workflow adapter"
    br close bd-5ls --reason "Tests pass, committed" --json

5. Claim Milestone 3 and add failing runtime-boundary regressions.

    br update bd-ebq --claim --json
    npm run test -- tests/unit/gatewayRuntimeEventHandler.chat.test.ts

6. Implement Milestone 3 runtime boundary alignment and docs update.

    npm run test -- tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/runtimeEventBridge.test.ts
    npm run typecheck
    git add src/app/page.tsx src/features/agents/state/gatewayRuntimeEventHandler.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts ARCHITECTURE.md
    git commit -m "Milestone 3: Align runtime history refresh boundary and document lifecycle"
    br close bd-ebq --reason "Tests pass, committed" --json

7. Final verification and Beads flush.

    npm run test -- tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/runtimeEventBridge.test.ts tests/unit/chatSendOperation.test.ts
    npm run typecheck
    br sync --flush-only

## Validation and Acceptance

Milestone 1 verification workflow:

1. Tests to write first in `tests/unit/historyLifecycleWorkflow.test.ts`:
   `it("returns skip intent when session is missing or not created")` must assert no-request policy.
   `it("plans history request with bounded limit and request identifiers")` must assert request-shape parity.
   `it("drops stale responses when session key, epoch, or revision changed")` must assert stale-drop reasons.
   `it("returns metadata-only disposition while run is still active")` must assert running-state safety behavior.
2. Implementation: add `historyLifecycleWorkflow.ts` with pure planning/disposition helpers.
3. Verification: run `npm run test -- tests/unit/historyLifecycleWorkflow.test.ts`.
4. Commit: `Milestone 1: Extract history lifecycle workflow policy`.

Milestone 2 verification workflow:

1. Tests to write first in `tests/unit/historyLifecycleWorkflow.integration.test.ts`:
   `it("page adapter applies metadata-only patch when running run is still active")` must assert no transcript overwrite.
   `it("page adapter ignores stale response dispositions and preserves existing transcript")` must assert stale-drop parity.
   `it("page adapter applies transcript merge patch when workflow disposition is apply")` must assert transcript update parity.
2. Implementation: rewire `loadAgentHistory` in `src/app/page.tsx` to use workflow outputs for branch decisions.
3. Verification: run `npm run test -- tests/unit/historyLifecycleWorkflow.integration.test.ts tests/unit/runtimeEventBridge.test.ts tests/unit/chatSendOperation.test.ts`.
4. Commit: `Milestone 2: Route page history sync through workflow adapter`.

Milestone 3 verification workflow:

1. Tests to write first in `tests/unit/gatewayRuntimeEventHandler.chat.test.ts`:
   `it("requests history refresh through boundary command only when final assistant arrives without trace lines")` must preserve current trigger semantics.
   `it("does not invoke history refresh boundary for ignored/stale terminal events")` must preserve guard behavior.
2. Implementation: replace direct runtime-handler coupling with a narrow history-refresh command adapter and update `ARCHITECTURE.md` boundary text.
3. Verification: run milestone test bundle plus `npm run typecheck`; known baseline typecheck failures in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts` are acceptable if unchanged.
4. Commit: `Milestone 3: Align runtime history refresh boundary and document lifecycle`.

Behavioral acceptance for the full plan:

- Chat history still loads on startup, running poll, reconcile completion, and explicit “Load more” actions.
- Stale history responses are still dropped under session-key, epoch, and revision mismatch scenarios.
- Active running sessions still avoid unsafe transcript overwrites while receiving metadata refresh.
- Runtime final-event history refresh triggers remain semantically unchanged for users.
- History lifecycle policy is no longer primarily embedded in `src/app/page.tsx`.

## Idempotence and Recovery

All milestones are additive and safe to rerun. Test commands and Beads status updates are idempotent when rerun. If a milestone fails midway, keep the branch, restore a passing targeted test state, and continue from that milestone without closing its Beads issue.

If behavior drift appears after rewiring `loadAgentHistory`, rollback to the prior milestone commit and reapply in smaller slices: first request/disposition planning extraction, then stale-drop routing, then runtime-handler boundary alignment. Keep existing helper modules (`runtimeEventBridge`, `transcript`) as source-of-truth primitives during migration.

## Artifacts and Notes

Expected output snippet after Milestone 1:

    npm run test -- tests/unit/historyLifecycleWorkflow.test.ts
    ✓ returns skip intent when session is missing or not created
    ✓ plans history request with bounded limit and request identifiers
    ✓ drops stale responses when session key, epoch, or revision changed
    ✓ returns metadata-only disposition while run is still active

Expected output snippet after Milestone 2:

    npm run test -- tests/unit/historyLifecycleWorkflow.integration.test.ts
    ✓ page adapter applies metadata-only patch when running run is still active
    ✓ page adapter ignores stale response dispositions and preserves existing transcript
    ✓ page adapter applies transcript merge patch when workflow disposition is apply

Expected final targeted bundle output:

    npm run test -- tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/runtimeEventBridge.test.ts tests/unit/chatSendOperation.test.ts
    Test Files  ... passed
    Tests       ... passed

Known baseline typecheck note (unless independently fixed during implementation):

    npm run typecheck
    src/features/agents/state/transcript.ts ... TS18047
    tests/unit/gatewayProxy.test.ts ... TS7016/TS7006

## Interfaces and Dependencies

Add `src/features/agents/operations/historyLifecycleWorkflow.ts` with explicit policy contracts.

Required contracts:

- `type HistoryRequestIntent = { kind: "skip"; reason: "missing-agent" | "session-not-created" | "missing-session-key" | "in-flight" } | { kind: "fetch"; sessionKey: string; limit: number; requestRevision: number; requestEpoch: number; requestId: string; loadedAt: number }`
- `function resolveHistoryRequestIntent(params: { agent: AgentState | null; requestedLimit?: number; maxLimit: number; defaultLimit: number; inFlightSessionKeys: Set<string>; requestId: string; loadedAt: number }): HistoryRequestIntent`
- `type HistoryResponseDisposition = { kind: "drop"; reason: "session-key-changed" | "session-epoch-changed" | "transcript-revision-changed" } | { kind: "metadata-only" } | { kind: "apply" }`
- `function resolveHistoryResponseDisposition(params: { latestAgent: AgentState | null; expectedSessionKey: string; requestEpoch: number; requestRevision: number }): HistoryResponseDisposition`
- `function buildHistoryMetadataPatch(params: { loadedAt: number; fetchedCount: number; limit: number; requestId: string }): Pick<AgentState, "historyLoadedAt" | "historyFetchLimit" | "historyFetchedCount" | "historyMaybeTruncated" | "lastAppliedHistoryRequestId">`

If additional adapter helpers are needed for runtime boundary alignment, place them in `src/features/agents/operations/historyLifecycleWorkflow.ts` or a sibling workflow module under `src/features/agents/operations/` with explicit return types and no React imports.

Dependencies to reuse, not duplicate:

- `buildHistoryLines` and `buildHistorySyncPatch` in `src/features/agents/state/runtimeEventBridge.ts`
- transcript merge helpers in `src/features/agents/state/transcript.ts`
- existing runtime handler contract in `src/features/agents/state/gatewayRuntimeEventHandler.ts`
- existing page state/update primitives and refs in `src/app/page.tsx`

Maintain existing user-facing transcript behavior unless failing-first tests intentionally codify a behavior change.

Revision Note (2026-02-13 05:10Z, Codex): Initial plan authored for history/transcript synchronization lifecycle decoupling with Beads milestones `bd-hqe`, `bd-5ls`, and `bd-ebq`.
Revision Note (2026-02-13 05:13Z, Codex): Completed Milestone 1 with extracted `historyLifecycleWorkflow` module and passing failing-first unit coverage for request/disposition/metadata policy.
Revision Note (2026-02-13 05:19Z, Codex): Completed Milestone 2 with `loadAgentHistory` workflow-driven request/disposition wiring and integration coverage.
Revision Note (2026-02-13 05:19Z, Codex): Completed Milestone 3 with runtime `requestHistoryRefresh` boundary command, regression tests, architecture updates, and final verification + Beads flush.
