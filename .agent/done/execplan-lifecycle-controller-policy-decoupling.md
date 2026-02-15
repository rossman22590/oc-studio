# Decouple Agent Lifecycle Controller Policy From `src/app/page.tsx`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The source-of-truth planning guide for this repository is `.agent/PLANS.md`, and this document must be maintained in accordance with `.agent/PLANS.md`.

This plan builds on `.agent/done/execplan-guided-create-workflow-decoupling.md` and `.agent/done/execplan-rename-delete-restart-orchestration-decoupling.md`. Those plans extracted major create/retry and rename/delete flows, but high-impact lifecycle policy is still concentrated in `src/app/page.tsx`.

## Purpose / Big Picture

After this change, users will still create agents, retry/discard pending setup, and resolve exec approvals exactly as they do today, including follow-up messaging and retry guards. The architectural difference is that lifecycle policy will move from `src/app/page.tsx` into dedicated workflow modules, so behavior can be tested without mounting the full page controller. You can verify this by running the new workflow tests, then exercising create/retry/approval behavior in Studio and observing unchanged UX with thinner page-level orchestration.

## Progress

- [x] (2026-02-13 04:47Z) Re-assessed entanglement candidates and selected page-level lifecycle orchestration as the highest-impact boundary violation. [bd-pak]
- [x] (2026-02-13 04:47Z) Created Beads milestones and dependencies for this plan (`bd-pak` -> `bd-pik` -> `bd-12f`, with `bd-12f` also blocked by `bd-pak`). [bd-pak]
- [x] (2026-02-13 04:49Z) Implemented Milestone 1: added pending-setup lifecycle workflow module with passing failing-first unit tests. [bd-pak]
- [x] (2026-02-13 04:51Z) Implemented Milestone 2: added exec-approval lifecycle workflow module with passing failing-first unit tests. [bd-pik]
- [x] (2026-02-13 04:55Z) Implemented Milestone 3: rewired page controller pending-setup and approval handlers through workflow modules, added lifecycle integration tests, and updated architecture docs. [bd-12f]
- [x] (2026-02-13 04:55Z) Final verification complete: targeted lifecycle bundle passes, typecheck remains at known baseline failures, and `br sync --flush-only` reports no dirty issues.

## Surprises & Discoveries

- Observation: `src/app/page.tsx` still combines policy branching with side effects for pending setup retries and approval resolution, despite previous extractions.
  Evidence: `applyPendingCreateSetupForAgentId`, pending setup auto-retry `useEffect`, `handleResolveExecApproval`, and `handleExecApprovalEvent` all live in `src/app/page.tsx`.

- Observation: change frequency remains very high in the same file, so any feature touching lifecycle policy has broad regression risk.
  Evidence: `git rev-list --count HEAD -- src/app/page.tsx` returned `158`.

- Observation: this repository already has good unit test conventions for pure workflow modules, making additional extraction low-risk.
  Evidence: existing suites for `guidedCreateWorkflow`, `configMutationWorkflow`, `pendingSetupRetry`, and `sessionSettingsMutations` are all module-level and dependency-injected.

- Observation: repository-wide `npm run typecheck` currently has known baseline failures outside this scope.
  Evidence: current baseline includes errors in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts`.

- Observation: pending setup lifecycle policy can be represented as pure helpers plus one dependency-injected retry runner without React state dependencies.
  Evidence: `src/features/agents/operations/pendingSetupLifecycleWorkflow.ts` now contains auto-retry gating, suppress/error message policy, and retry execution mapping with passing tests in `tests/unit/pendingSetupLifecycleWorkflow.test.ts`.

- Observation: requested/resolved exec approval event mapping and allow-follow-up targeting can be fully expressed as pure effect/intention outputs.
  Evidence: `src/features/agents/approvals/execApprovalLifecycleWorkflow.ts` now returns deterministic event effects and follow-up intent with passing tests in `tests/unit/execApprovalLifecycleWorkflow.test.ts`.

- Observation: page-level approval/event handlers can be reduced to infrastructure adapters once workflow modules own policy branches.
  Evidence: `handleResolveExecApproval` and `handleExecApprovalEvent` in `src/app/page.tsx` now consume `resolveExecApprovalFollowUpIntent` and `resolveExecApprovalEventEffects` instead of inline parsing/targeting branches.

## Decision Log

- Decision: target the remaining lifecycle-policy seam (pending setup retry and exec approval policy), not runtime event stream parsing.
  Rationale: runtime event handling already has dedicated modules and strong tests; page-level lifecycle policy remains the biggest coupling hotspot.
  Date/Author: 2026-02-13 / Codex

- Decision: keep queue/restart primitives and gateway adapters unchanged; extract decision logic into new workflow helpers with explicit return contracts.
  Rationale: this yields isolation and testability without re-architecting transport/state foundations.
  Date/Author: 2026-02-13 / Codex

- Decision: preserve all user-facing strings and behavior unless failing-first tests deliberately encode a change.
  Rationale: this is an architectural separation task, not a UX redesign.
  Date/Author: 2026-02-13 / Codex

- Decision: keep milestone verification test-first and commit once per milestone with Beads status updates.
  Rationale: aligns with repository planning rules and provides safe rollback points.
  Date/Author: 2026-02-13 / Codex

- Decision: include `runPendingSetupRetryLifecycle` in Milestone 1 in addition to the required gate/message helpers.
  Rationale: this lets Milestone 3 page rewiring move side-effect sequencing behind a single policy adapter while preserving current behavior.
  Date/Author: 2026-02-13 / Codex

- Decision: represent exec approval handling as two contracts (`resolveExecApprovalEventEffects`, `resolveExecApprovalFollowUpIntent`) plus a dedicated unknown-id classifier.
  Rationale: splitting event mapping, follow-up routing, and error classification keeps page adapters thin and independently testable.
  Date/Author: 2026-02-13 / Codex

- Decision: keep pending setup retry primitives (`beginPendingGuidedSetupRetry` / `endPendingGuidedSetupRetry`) in page infrastructure while delegating retry decision policy to workflow helpers.
  Rationale: this preserves current concurrency guard behavior and minimizes migration risk while still separating domain policy from page control flow.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

Lifecycle policy for pending setup and exec approvals now lives in dedicated workflow modules, and `src/app/page.tsx` consumes those modules as infrastructure adapters. The page still owns UI state updates, timers, and gateway calls, but policy branches for auto-retry gating, retry error surfacing, approval event mapping, allow-follow-up targeting, and unknown-id classification are extracted.

Implemented modules and coverage:
- `src/features/agents/operations/pendingSetupLifecycleWorkflow.ts` + `tests/unit/pendingSetupLifecycleWorkflow.test.ts`
- `src/features/agents/approvals/execApprovalLifecycleWorkflow.ts` + `tests/unit/execApprovalLifecycleWorkflow.test.ts`
- `tests/unit/lifecycleControllerWorkflow.integration.test.ts` for cross-module parity assertions

Verification summary:
- Targeted lifecycle bundle passed (`37` tests across `7` files).
- `npm run typecheck` still reports only known baseline failures in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts`.
- `br sync --flush-only` completed with no dirty issues.
- Behavioral parity retained for create retry/discard and exec approval follow-up paths.

## Context and Orientation

In this repository, the page controller in `src/app/page.tsx` is the top-level React component that coordinates agent lifecycle behavior. “Lifecycle policy” in this plan means decisions such as when auto-retry is allowed, how retry failures are phrased, whether an approval resolution should send a follow-up chat message, and how requested/resolved approval events mutate local pending-approval state.

Relevant modules today:

- `src/app/page.tsx`: currently owns pending setup auto-retry gating, retry execution policy, exec approval event handling, exec approval resolve behavior, and many infrastructure side effects.
- `src/features/agents/operations/guidedCreateWorkflow.ts`: extracted create/retry sequencing core, but page still performs substantial lifecycle decisions around retries and messaging.
- `src/features/agents/creation/pendingSetupRetry.ts`: low-level retry selection/in-flight primitives.
- `src/features/agents/approvals/execApprovalEvents.ts`: payload parsing for requested/resolved events.
- `src/features/agents/approvals/pendingStore.ts`: state-map mutation primitives for pending approvals.
- `src/features/agents/operations/chatSendOperation.ts`: gateway send adapter used for approval follow-up messages.

The boundary violation is flow-level, not function-level: domain policy and infrastructure calls (gateway `client.call`, timers, React state mutations, and follow-up sends) are interleaved in page callbacks and effects, so a policy change requires reasoning about UI lifecycle and transport details at the same time.

## Milestones

### Milestone 1: Extract pending-setup lifecycle policy module

Create a new workflow module under `src/features/agents/operations/` that owns pending-setup retry policy decisions currently spread across `applyPendingCreateSetupForAgentId` and auto-retry effects in `src/app/page.tsx`. The module must expose explicit contracts for retry eligibility, outcome mapping, and user-facing error message generation. End state: page code still performs side effects, but policy branches move into testable workflow helpers.

### Milestone 2: Extract exec-approval lifecycle policy module

Create a dedicated workflow module under `src/features/agents/approvals/` (or `src/features/agents/operations/` if better cohesion) that centralizes requested/resolved event mapping and approval resolution follow-up intent policy. End state: `handleExecApprovalEvent` and `handleResolveExecApproval` become thin adapters that apply precomputed workflow outcomes.

### Milestone 3: Rewire page controller and add regression coverage

Replace inline policy branches in `src/app/page.tsx` with calls to the two new workflow modules, add regression tests for parity edge cases, and update `ARCHITECTURE.md` to document the new lifecycle boundary. End state: observable behavior remains unchanged, but policy logic is no longer primarily in the page controller.

## Plan of Work

First, introduce a pending-setup lifecycle workflow module with pure helper functions for retry gating and retry outcome mapping. Use existing retry primitives (`selectNextPendingGuidedSetupRetryAgentId`, `beginPendingGuidedSetupRetry`, `endPendingGuidedSetupRetry`) as infrastructure dependencies, and keep string/error policy in one place.

Second, introduce an exec-approval lifecycle workflow module that composes existing parser/store helpers into explicit “requested event effects,” “resolved event effects,” and “resolve-decision follow-up intent” outputs. This module should decide whether a follow-up send is needed and what target/session to use, but not perform network calls.

Third, rewire `src/app/page.tsx` to consume these workflow outputs while keeping UI state and side effects local to the page. Add regression tests that prove parity for retry gating, error copy, approval map updates, and allow-follow-up behavior. Update architecture docs to name workflow-policy modules as the lifecycle boundary.

## Concrete Steps

1. From `/Users/georgepickett/openclaw-studio`, claim Milestone 1 and write failing tests first.

    br ready --json
    br update bd-pak --claim --json
    npm run test -- tests/unit/pendingSetupLifecycleWorkflow.test.ts

    Expected before implementation: test file or exports are missing and Vitest fails.

2. Implement Milestone 1 workflow module and passing tests.

    npm run test -- tests/unit/pendingSetupLifecycleWorkflow.test.ts
    git add src/features/agents/operations/pendingSetupLifecycleWorkflow.ts tests/unit/pendingSetupLifecycleWorkflow.test.ts
    git commit -m "Milestone 1: Extract pending setup lifecycle workflow policy"
    br close bd-pak --reason "Tests pass, committed" --json

3. Claim Milestone 2 and write failing tests for approval workflow policy.

    br update bd-pik --claim --json
    npm run test -- tests/unit/execApprovalLifecycleWorkflow.test.ts

    Expected before implementation: test file or exports are missing and Vitest fails.

4. Implement Milestone 2 approval workflow module and passing tests.

    npm run test -- tests/unit/execApprovalLifecycleWorkflow.test.ts tests/unit/pendingExecApprovalsStore.test.ts tests/unit/execApprovalEvents.test.ts
    git add src/features/agents/approvals/execApprovalLifecycleWorkflow.ts tests/unit/execApprovalLifecycleWorkflow.test.ts
    git commit -m "Milestone 2: Extract exec approval lifecycle workflow policy"
    br close bd-pik --reason "Tests pass, committed" --json

5. Claim Milestone 3 and rewire `src/app/page.tsx` to workflow adapters with regression tests.

    br update bd-12f --claim --json
    npm run test -- tests/unit/lifecycleControllerWorkflow.integration.test.ts

6. Verify Milestone 3 and commit.

    npm run test -- tests/unit/pendingSetupLifecycleWorkflow.test.ts tests/unit/execApprovalLifecycleWorkflow.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/pendingGuidedSetupRetry.test.ts tests/unit/pendingExecApprovalsStore.test.ts tests/unit/execApprovalEvents.test.ts
    npm run typecheck
    git add src/app/page.tsx src/features/agents/operations/pendingSetupLifecycleWorkflow.ts src/features/agents/approvals/execApprovalLifecycleWorkflow.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts ARCHITECTURE.md
    git commit -m "Milestone 3: Route page lifecycle controller through workflow policies"
    br close bd-12f --reason "Tests pass, committed" --json

7. Final verification and Beads flush.

    npm run test -- tests/unit/pendingSetupLifecycleWorkflow.test.ts tests/unit/execApprovalLifecycleWorkflow.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/pendingGuidedSetupRetry.test.ts tests/unit/pendingExecApprovalsStore.test.ts tests/unit/execApprovalEvents.test.ts
    npm run typecheck
    br sync --flush-only

## Validation and Acceptance

Milestone 1 verification workflow:

1. Tests to write first in `tests/unit/pendingSetupLifecycleWorkflow.test.ts`:
   `it("allows auto-retry only when connected, loaded, and not blocked")` must assert gating parity for status, block phase, and busy flags.
   `it("resolves manual retry failure message with agent name and original error")` must assert exact user-facing message format currently used in page.
   `it("suppresses auto-retry disconnect-like failures without surfacing user error")` must assert parity between auto and manual retry error handling.
   `it("rejects empty agent id before retry side effects")` must assert no dependency calls occur for invalid agent identifiers.
2. Implementation: add `pendingSetupLifecycleWorkflow.ts` with explicit dependency-injected retry helpers and message builders.
3. Verification: run `npm run test -- tests/unit/pendingSetupLifecycleWorkflow.test.ts`.
4. Commit: `Milestone 1: Extract pending setup lifecycle workflow policy`.

Milestone 2 verification workflow:

1. Tests to write first in `tests/unit/execApprovalLifecycleWorkflow.test.ts`:
   `it("maps requested approval into scoped or unscoped upsert effect")` must assert parity with current event mapping behavior.
   `it("maps resolved approval event into remove effects")` must assert both scoped and unscoped removals.
   `it("returns follow-up intent only for allow decisions")` must assert deny path emits no follow-up and allow path resolves target agent/session.
   `it("maps unknown approval id gateway error to local removal intent")` must assert parity with current `unknown approval id` handling branch.
2. Implementation: add `execApprovalLifecycleWorkflow.ts` with pure mapping and follow-up intent helpers.
3. Verification: run `npm run test -- tests/unit/execApprovalLifecycleWorkflow.test.ts tests/unit/pendingExecApprovalsStore.test.ts tests/unit/execApprovalEvents.test.ts`.
4. Commit: `Milestone 2: Extract exec approval lifecycle workflow policy`.

Milestone 3 verification workflow:

1. Tests to write first in `tests/unit/lifecycleControllerWorkflow.integration.test.ts`:
   `it("pending setup auto-retry path preserves existing guard semantics")` must assert no duplicate retries when in-flight/busy.
   `it("manual retry failure still clears busy state and surfaces user error")` must assert parity with current behavior.
   `it("allow-once and allow-always still trigger follow-up message send once")` must assert follow-up send intent is unchanged.
   `it("deny decision does not trigger follow-up message send")` must assert no follow-up side effect.
2. Implementation: rewire `src/app/page.tsx` lifecycle sections to workflow adapters; keep UI state updates and gateway calls in page.
3. Verification: run milestone test bundle plus `npm run typecheck`; baseline typecheck failures in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts` are acceptable if unchanged.
4. Commit: `Milestone 3: Route page lifecycle controller through workflow policies`.

Behavioral acceptance for the full plan:

- Agent creation retry/discard behavior in chat remains unchanged for local and remote gateways.
- Auto-retry still runs only when connected, agents are loaded, pending setup scope matches, no active create block is running, and no retry is already in flight.
- Exec approval cards still appear and clear correctly on requested/resolved events.
- Allow decisions still send one follow-up message to the correct target session; deny does not.
- Lifecycle policy for these flows is no longer primarily embedded in `src/app/page.tsx`.

## Idempotence and Recovery

All milestones are additive and safe to rerun. Re-running tests and `br` commands is idempotent for verification and status checks. If a milestone fails mid-way, keep the branch, restore passing tests, and continue from the same milestone; do not close its Beads issue until tests pass and commit is created.

If behavior drift appears after page rewiring, rollback to the prior milestone commit and reapply in smaller slices: first pending-setup workflow wiring, then approval event wiring, then approval resolve follow-up wiring. Keep existing parser/store helpers (`execApprovalEvents.ts`, `pendingStore.ts`) as source-of-truth infrastructure primitives during migration.

## Artifacts and Notes

Expected output snippet after Milestone 1:

    npm run test -- tests/unit/pendingSetupLifecycleWorkflow.test.ts
    ✓ allows auto-retry only when connected, loaded, and not blocked
    ✓ resolves manual retry failure message with agent name and original error
    ✓ suppresses auto-retry disconnect-like failures without surfacing user error
    ✓ rejects empty agent id before retry side effects

Expected output snippet after Milestone 2:

    npm run test -- tests/unit/execApprovalLifecycleWorkflow.test.ts
    ✓ maps requested approval into scoped or unscoped upsert effect
    ✓ maps resolved approval event into remove effects
    ✓ returns follow-up intent only for allow decisions
    ✓ maps unknown approval id gateway error to local removal intent

Expected final targeted bundle output:

    npm run test -- tests/unit/pendingSetupLifecycleWorkflow.test.ts tests/unit/execApprovalLifecycleWorkflow.test.ts tests/unit/lifecycleControllerWorkflow.integration.test.ts tests/unit/guidedCreateWorkflow.integration.test.ts tests/unit/pendingGuidedSetupRetry.test.ts tests/unit/pendingExecApprovalsStore.test.ts tests/unit/execApprovalEvents.test.ts
    Test Files  ... passed
    Tests       ... passed

Known baseline typecheck note (unless independently fixed during implementation):

    npm run typecheck
    src/features/agents/state/transcript.ts ... TS18047
    tests/unit/gatewayProxy.test.ts ... TS7016/TS7006

## Interfaces and Dependencies

Add `src/features/agents/operations/pendingSetupLifecycleWorkflow.ts` with explicit contracts used by page adapters.

Required contracts:

- `type PendingSetupAutoRetryGateInput = { status: "disconnected" | "connecting" | "connected"; agentsLoadedOnce: boolean; loadedScopeMatches: boolean; hasActiveCreateBlock: boolean; retryBusyAgentId: string | null; }`
- `function shouldAttemptPendingSetupAutoRetry(input: PendingSetupAutoRetryGateInput): boolean`
- `function buildPendingSetupRetryErrorMessage(params: { source: "auto" | "manual"; agentName: string; errorMessage: string }): string`
- `function shouldSuppressPendingSetupRetryError(params: { source: "auto" | "manual"; disconnectLike: boolean }): boolean`

Add `src/features/agents/approvals/execApprovalLifecycleWorkflow.ts` with explicit contracts for event and resolve policy.

Required contracts:

- `type ExecApprovalEventEffects = { scopedUpserts: Array<{ agentId: string; approval: PendingExecApproval }>; unscopedUpserts: PendingExecApproval[]; removals: string[]; markActivityAgentIds: string[]; }`
- `function resolveExecApprovalEventEffects(params: { event: EventFrame; agents: AgentState[] }): ExecApprovalEventEffects | null`
- `type ExecApprovalFollowUpIntent = { shouldSend: boolean; agentId: string | null; sessionKey: string | null; message: string | null }`
- `function resolveExecApprovalFollowUpIntent(params: { decision: ExecApprovalDecision; approval: PendingExecApproval | null; agents: AgentState[]; followUpMessage: string }): ExecApprovalFollowUpIntent`
- `function shouldTreatExecApprovalResolveErrorAsUnknownId(error: unknown): boolean`

Dependencies to reuse rather than duplicate:

- event parsing in `src/features/agents/approvals/execApprovalEvents.ts`
- pending-approval map operations in `src/features/agents/approvals/pendingStore.ts`
- retry primitives in `src/features/agents/creation/pendingSetupRetry.ts`
- chat send adapter in `src/features/agents/operations/chatSendOperation.ts`
- guided retry operation in `src/features/agents/operations/guidedCreateWorkflow.ts` and `src/features/agents/creation/recovery.ts`

Maintain all current user-facing strings and approval follow-up semantics unless tests intentionally codify a changed behavior.

Revision Note (2026-02-13 04:47Z, Codex): Initial plan authored to extract remaining pending-setup and exec-approval lifecycle policy from `src/app/page.tsx`, with Beads milestones `bd-pak`, `bd-pik`, and `bd-12f`.
Revision Note (2026-02-13 04:49Z, Codex): Completed Milestone 1 with new pending-setup lifecycle workflow module and passing failing-first tests.
Revision Note (2026-02-13 04:51Z, Codex): Completed Milestone 2 with new exec-approval lifecycle workflow module and passing failing-first tests.
Revision Note (2026-02-13 04:55Z, Codex): Completed Milestone 3 by rewiring page lifecycle handlers to workflow adapters, adding lifecycle integration tests, and updating architecture docs.
Revision Note (2026-02-13 04:55Z, Codex): Completed final verification and flushed Beads state.
