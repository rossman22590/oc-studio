# Decouple Fleet Refresh And Latest-Update Lifecycle Policy From `src/app/page.tsx`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The source-of-truth planning guide for this repository is `.agent/PLANS.md`, and this document must be maintained in accordance with `.agent/PLANS.md`.

This plan builds on `.agent/done/execplan-guided-create-workflow-decoupling.md`, `.agent/done/execplan-rename-delete-restart-orchestration-decoupling.md`, and `.agent/done/execplan-lifecycle-controller-policy-decoupling.md`. Those plans extracted create/retry, rename/delete, and approval lifecycle policy, but page-level fleet refresh and latest-update enrichment policy remains entangled with gateway side effects.

## Purpose / Big Picture

After this change, users will still see the same fleet hydration behavior, summary status updates, run reconciliation, and latest-update previews (heartbeat/cron) they see today. The visible product behavior should not change. The architectural change is that lifecycle policy currently embedded in `src/app/page.tsx` will move into dedicated workflow modules, so policy can be tested in isolation without mounting the page controller or performing real gateway I/O. You can verify this by running the new workflow tests and then running Studio to confirm summary/latest-update behavior is unchanged.

## Progress

- [x] (2026-02-13 04:57Z) Re-assessed the codebase and confirmed fleet refresh + latest-update enrichment in `src/app/page.tsx` as the highest-impact remaining entanglement. [bd-357]
- [x] (2026-02-13 04:57Z) Created Beads milestones and dependencies for this plan (`bd-357` -> `bd-ps9` -> `bd-3ah`, with `bd-3ah` also blocked by `bd-357`). [bd-357]
- [x] (2026-02-13 05:02Z) Implemented Milestone 1: added `latestUpdateWorkflow` with failing-first tests for kind selection, reset/noop, heartbeat fallback intent, and patch semantics. [bd-357]
- [x] (2026-02-13 05:03Z) Implemented Milestone 2: added `fleetLifecycleWorkflow` with failing-first tests for summary snapshot intent, reconcile eligibility, and terminal patch mapping. [bd-ps9]
- [x] (2026-02-13 05:07Z) Implemented Milestone 3: rewired `src/app/page.tsx` latest-update, summary snapshot, and reconcile branches through workflow helpers; added integration regression coverage and architecture boundary updates. [bd-3ah]
- [x] (2026-02-13 05:07Z) Final verification complete: targeted lifecycle test bundle passes, typecheck remains at known baseline failures only, and `br sync --flush-only` reports no dirty issues.

## Surprises & Discoveries

- Observation: page-level churn remains high for the same module that still owns this policy.
  Evidence: `git rev-list --count HEAD -- src/app/page.tsx` returned `159`.

- Observation: runtime event stream parsing has dedicated modules and tests, but adjacent fleet refresh/latest-update policy still lives in page callbacks.
  Evidence: `src/features/agents/state/gatewayRuntimeEventHandler.ts` and its unit tests exist, while `updateSpecialLatestUpdate`, `loadAgents`, `loadSummarySnapshot`, and `reconcileRunningAgents` remain in `src/app/page.tsx`.

- Observation: existing tests already validate lower-level adapters (`agentFleetHydration`, `gatewayRuntimeEventHandler`) which reduces risk for policy extraction.
  Evidence: `tests/unit/agentFleetHydration.test.ts`, `tests/unit/gatewayRuntimeEventHandler.agent.test.ts`, `tests/unit/gatewayRuntimeEventHandler.chat.test.ts`, and `tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts` are present.

- Observation: repository-wide `npm run typecheck` has known baseline failures outside this scope.
  Evidence: baseline includes `src/features/agents/state/transcript.ts` (TS18047) and `tests/unit/gatewayProxy.test.ts` (TS7016/TS7006).

- Observation: latest-update policy can be extracted as pure intent + patch helpers without changing gateway call sites.
  Evidence: `tests/unit/latestUpdateWorkflow.test.ts` now passes with four behavior-parity assertions against message-kind resolution, reset/noop routing, heartbeat fallback resolution, and patch mapping.

- Observation: summary snapshot and reconcile decisions can be represented as pure workflow outputs without touching hydration/runtime adapters.
  Evidence: `tests/unit/fleetLifecycleWorkflow.test.ts` now passes while `tests/unit/agentFleetHydration.test.ts` and `tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts` remain green.

- Observation: page-level lifecycle callbacks now read as infrastructure adapters once workflow intents/outcomes are introduced.
  Evidence: `src/app/page.tsx` now routes `updateSpecialLatestUpdate`, `loadSummarySnapshot`, and `reconcileRunningAgents` through `resolveLatestUpdateIntent`, `resolveSummarySnapshotIntent`, `resolveReconcileEligibility`, and `buildReconcileTerminalPatch`.

## Decision Log

- Decision: target page-level fleet refresh/latest-update policy first, not gateway transport internals.
  Rationale: transport internals already have dedicated boundaries and tests; this page seam still couples policy and side effects with high blast radius.
  Date/Author: 2026-02-13 / Codex

- Decision: preserve existing user-facing behavior and strings for latest-update and summary/reconcile flows.
  Rationale: this is architectural decoupling; behavior drift would reduce confidence and expand scope.
  Date/Author: 2026-02-13 / Codex

- Decision: extract policy as pure workflow helpers that return explicit decisions/effects while keeping gateway calls and React state updates in page adapters.
  Rationale: this minimizes migration risk and enables deterministic unit tests without requiring a full controller rewrite.
  Date/Author: 2026-02-13 / Codex

- Decision: keep milestone verification test-first and atomic with Beads close-per-milestone.
  Rationale: aligns with repository planning rules and preserves safe rollback points.
  Date/Author: 2026-02-13 / Codex

- Decision: make `buildLatestUpdatePatch` accept an optional `kind` argument while preserving the original `content`-first API.
  Rationale: patch `latestOverrideKind` cannot be derived from content alone; optional kind keeps call sites explicit and preserves null-kind behavior when no content is present.
  Date/Author: 2026-02-13 / Codex

- Decision: add `resolveSummarySnapshotIntent` in the fleet lifecycle workflow module in addition to key extraction.
  Rationale: page orchestration needs a single policy decision for skip vs fetch plus payload shape (`keys`, `limit`, `maxChars`) to remove inline branching cleanly in Milestone 3.
  Date/Author: 2026-02-13 / Codex

- Decision: keep gateway transport calls (`sessions.list`, `chat.history`, `status`, `sessions.preview`, `agent.wait`) in `src/app/page.tsx` while moving branching policy into workflow modules.
  Rationale: this preserves existing side-effect ownership and sequencing while still decoupling lifecycle decisions for deterministic tests.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

Latest-update, summary snapshot, and reconcile branch policy has been extracted into `src/features/agents/operations/latestUpdateWorkflow.ts` and `src/features/agents/operations/fleetLifecycleWorkflow.ts`, with page callbacks now acting as side-effect adapters. Regression coverage now includes `tests/unit/latestUpdateWorkflow.test.ts`, `tests/unit/fleetLifecycleWorkflow.test.ts`, and `tests/unit/fleetLifecycleWorkflow.integration.test.ts`, and the prior infrastructure-adapter suites remain green.

Verification status at this milestone:
- targeted milestone test bundle passes (`20` tests across `6` files);
- `npm run typecheck` still reports only known baseline errors in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts` with no new failures from this work.
- Beads milestones `bd-357`, `bd-ps9`, and `bd-3ah` are closed, and `br sync --flush-only` reports no dirty issues.

## Context and Orientation

In this repository, `src/app/page.tsx` is the top-level controller for Studio runtime behavior. A “latest update” is the user-facing preview text (heartbeat or cron) shown in the fleet UI. A “summary snapshot” is the lightweight session status/preview refresh loaded via `status` and `sessions.preview`. “Run reconciliation” is the periodic check that translates gateway run completion into local agent state transitions.

Today, the entangled flow spans these page-level functions:

- `updateSpecialLatestUpdate` in `src/app/page.tsx` (currently handles latest-update kind detection and performs gateway calls `sessions.list`, `chat.history`, and `cron.list` plus dispatch updates).
- `loadAgents` in `src/app/page.tsx` (calls `hydrateAgentFleetFromGateway`, then performs page-specific patching and selection policy).
- `loadSummarySnapshot` in `src/app/page.tsx` (builds session key list, calls `status` + `sessions.preview`, then applies patches).
- `reconcileRunningAgents` in `src/app/page.tsx` (calls `agent.wait`, applies terminal run patches, and triggers history reload).
- `client.onEvent` and `client.onGap` hooks in `src/app/page.tsx` that connect these flows into runtime.

Relevant existing modules and boundaries:

- `src/features/agents/operations/agentFleetHydration.ts`: already handles gateway hydration and seed generation, but page still owns post-hydration policy.
- `src/features/agents/state/gatewayRuntimeEventHandler.ts`: runtime stream handling boundary with unit tests.
- `src/features/agents/state/runtimeEventBridge.ts`: event classification and summary patch helpers.

The boundary violation is flow-level: domain decisions (what kind of latest update to show, when to refresh summary, how to reconcile run completion) are interleaved with I/O and UI mutations in the same page call stacks.

## Milestones

### Milestone 1: Extract latest-update enrichment workflow policy

Create a new workflow module under `src/features/agents/operations/` that owns latest-update policy decisions currently embedded in `updateSpecialLatestUpdate`. This includes kind resolution, heartbeat-vs-cron fetch intent, fallback behavior when no session data is available, and patch mapping intent. The page controller should remain responsible for performing gateway calls and dispatching state updates, but policy branching should move to the new module.

### Milestone 2: Extract fleet refresh and run-reconcile workflow policy

Create a new workflow module under `src/features/agents/operations/` that centralizes page-level refresh/reconcile decisions now in `loadAgents`, `loadSummarySnapshot`, and `reconcileRunningAgents`. The module should provide pure decision helpers for when to refresh, how to map completion outcomes, and when to skip stale or invalid transitions. Keep actual gateway calls and dispatches in adapters.

### Milestone 3: Rewire page controller and harden regressions

Wire `src/app/page.tsx` to the new workflow modules, remove duplicated inline policy branches, add integration/regression tests that assert parity across latest-update and reconcile behavior, and update `ARCHITECTURE.md` to document the new boundary.

## Plan of Work

First, add `src/features/agents/operations/latestUpdateWorkflow.ts` with explicit input/output contracts. Move policy currently encoded by `resolveSpecialUpdateKind` and branching inside `updateSpecialLatestUpdate` into pure helpers that return intents (reset, heartbeat fetch, cron fetch, and content-to-patch mapping).

Second, add `src/features/agents/operations/fleetLifecycleWorkflow.ts` with helpers that determine summary snapshot eligibility, run reconciliation eligibility, and terminal run patch mapping. Keep lower-level hydration/runtime adapters unchanged.

Third, rewire `src/app/page.tsx` to call these workflow helpers from existing callbacks/effects. Preserve existing gateway call order and UI update semantics. Add regression tests and architecture docs updates naming these new workflow boundaries.

## Concrete Steps

1. From `/Users/georgepickett/openclaw-studio`, claim Milestone 1 and write failing tests first.

    br ready --json
    br update bd-357 --claim --json
    npm run test -- tests/unit/latestUpdateWorkflow.test.ts

    Expected before implementation: Vitest reports missing test file/module exports.

2. Implement Milestone 1 module and make tests pass.

    npm run test -- tests/unit/latestUpdateWorkflow.test.ts
    git add src/features/agents/operations/latestUpdateWorkflow.ts tests/unit/latestUpdateWorkflow.test.ts
    git commit -m "Milestone 1: Extract latest-update enrichment workflow policy"
    br close bd-357 --reason "Tests pass, committed" --json

3. Claim Milestone 2 and write failing tests for fleet refresh/reconcile policy.

    br update bd-ps9 --claim --json
    npm run test -- tests/unit/fleetLifecycleWorkflow.test.ts

    Expected before implementation: Vitest reports missing test file/module exports.

4. Implement Milestone 2 module and make tests pass.

    npm run test -- tests/unit/fleetLifecycleWorkflow.test.ts tests/unit/agentFleetHydration.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts
    git add src/features/agents/operations/fleetLifecycleWorkflow.ts tests/unit/fleetLifecycleWorkflow.test.ts
    git commit -m "Milestone 2: Extract fleet refresh and reconcile workflow policy"
    br close bd-ps9 --reason "Tests pass, committed" --json

5. Claim Milestone 3 and add failing integration/regression tests.

    br update bd-3ah --claim --json
    npm run test -- tests/unit/fleetLifecycleWorkflow.integration.test.ts

6. Rewire `src/app/page.tsx`, update docs, and verify.

    npm run test -- tests/unit/latestUpdateWorkflow.test.ts tests/unit/fleetLifecycleWorkflow.test.ts tests/unit/fleetLifecycleWorkflow.integration.test.ts tests/unit/agentFleetHydration.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts
    npm run typecheck
    git add src/app/page.tsx src/features/agents/operations/latestUpdateWorkflow.ts src/features/agents/operations/fleetLifecycleWorkflow.ts tests/unit/fleetLifecycleWorkflow.integration.test.ts ARCHITECTURE.md
    git commit -m "Milestone 3: Route fleet lifecycle controller through workflow policies"
    br close bd-3ah --reason "Tests pass, committed" --json

7. Final verification and Beads flush.

    npm run test -- tests/unit/latestUpdateWorkflow.test.ts tests/unit/fleetLifecycleWorkflow.test.ts tests/unit/fleetLifecycleWorkflow.integration.test.ts tests/unit/agentFleetHydration.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts
    npm run typecheck
    br sync --flush-only

## Validation and Acceptance

Milestone 1 verification workflow:

1. Tests to write first in `tests/unit/latestUpdateWorkflow.test.ts`:
   `it("resolves latest-update kind as heartbeat, cron, or none from message content")` must assert parity with current keyword resolution.
   `it("returns reset intent when no latest-update kind is present and existing override is set")` must assert reset behavior parity.
   `it("returns heartbeat fetch intent with fallback session strategy")` must assert intent for heartbeat path without directly calling gateway.
   `it("maps fetched content into latest override patch semantics")` must assert null vs non-null patch behavior.
2. Implementation: add `latestUpdateWorkflow.ts` with pure intent and patch mapping helpers.
3. Verification: run `npm run test -- tests/unit/latestUpdateWorkflow.test.ts`.
4. Commit: `Milestone 1: Extract latest-update enrichment workflow policy`.

Milestone 2 verification workflow:

1. Tests to write first in `tests/unit/fleetLifecycleWorkflow.test.ts`:
   `it("returns summary snapshot skip when no valid session keys exist")` must assert no-op behavior.
   `it("returns summary snapshot fetch intent when session keys are present")` must assert request payload shape.
   `it("maps reconcile wait result ok/error to idle/error terminal patch")` must assert terminal state parity.
   `it("rejects reconcile intent for non-running or missing-run agents")` must assert stale-run guard behavior.
2. Implementation: add `fleetLifecycleWorkflow.ts` with pure eligibility and mapping helpers.
3. Verification: run `npm run test -- tests/unit/fleetLifecycleWorkflow.test.ts tests/unit/agentFleetHydration.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts`.
4. Commit: `Milestone 2: Extract fleet refresh and reconcile workflow policy`.

Milestone 3 verification workflow:

1. Tests to write first in `tests/unit/fleetLifecycleWorkflow.integration.test.ts`:
   `it("page adapter applies latest-update reset/update intents without behavior drift")` must assert parity for reset and non-empty update paths.
   `it("summary snapshot flow preserves status + preview patch application semantics")` must assert same patch mapping behavior.
   `it("run reconciliation preserves terminal transition semantics and history reload trigger")` must assert parity for `ok` and `error` outcomes.
2. Implementation: rewire `src/app/page.tsx` to call workflow helpers from `updateSpecialLatestUpdate`, `loadSummarySnapshot`, and `reconcileRunningAgents` while keeping gateway I/O and dispatch in-page.
3. Verification: run milestone test bundle plus `npm run typecheck`; known baseline typecheck failures in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts` are acceptable if unchanged.
4. Commit: `Milestone 3: Route fleet lifecycle controller through workflow policies`.

Behavioral acceptance for the full plan:

- Latest-update preview behavior for heartbeat and cron remains semantically unchanged.
- Fleet hydration and summary snapshot updates remain unchanged from user perspective.
- Running-agent reconciliation still transitions runs to idle/error correctly and triggers history refresh on completion.
- Policy logic for these flows is no longer primarily embedded in `src/app/page.tsx`.

## Idempotence and Recovery

All planned steps are additive and safe to rerun. Re-running tests and Beads commands is idempotent for verification and progress tracking. If a milestone partially fails, keep the branch, restore passing tests, and continue from that milestone without closing its Beads issue.

If behavior drift appears after page rewiring, rollback to the previous milestone commit and reapply in smaller slices: first latest-update workflow wiring, then summary snapshot wiring, then reconcile wiring. Keep existing lower-level adapters (`agentFleetHydration`, `gatewayRuntimeEventHandler`, `runtimeEventBridge`) as source-of-truth infrastructure during migration.

## Artifacts and Notes

Expected output snippet after Milestone 1:

    npm run test -- tests/unit/latestUpdateWorkflow.test.ts
    ✓ resolves latest-update kind as heartbeat, cron, or none from message content
    ✓ returns reset intent when no latest-update kind is present and existing override is set
    ✓ returns heartbeat fetch intent with fallback session strategy
    ✓ maps fetched content into latest override patch semantics

Expected output snippet after Milestone 2:

    npm run test -- tests/unit/fleetLifecycleWorkflow.test.ts
    ✓ returns summary snapshot skip when no valid session keys exist
    ✓ returns summary snapshot fetch intent when session keys are present
    ✓ maps reconcile wait result ok/error to idle/error terminal patch
    ✓ rejects reconcile intent for non-running or missing-run agents

Expected final targeted bundle output:

    npm run test -- tests/unit/latestUpdateWorkflow.test.ts tests/unit/fleetLifecycleWorkflow.test.ts tests/unit/fleetLifecycleWorkflow.integration.test.ts tests/unit/agentFleetHydration.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts
    Test Files  ... passed
    Tests       ... passed

Known baseline typecheck note (unless independently fixed during implementation):

    npm run typecheck
    src/features/agents/state/transcript.ts ... TS18047
    tests/unit/gatewayProxy.test.ts ... TS7016/TS7006

## Interfaces and Dependencies

Add `src/features/agents/operations/latestUpdateWorkflow.ts` with explicit policy contracts.

Required contracts:

- `type LatestUpdateKind = "heartbeat" | "cron" | null`
- `function resolveLatestUpdateKind(message: string): LatestUpdateKind`
- `type LatestUpdateIntent = { kind: "reset" } | { kind: "fetch-heartbeat"; agentId: string; sessionLimit: number; historyLimit: number } | { kind: "fetch-cron"; agentId: string } | { kind: "noop" }`
- `function resolveLatestUpdateIntent(params: { message: string; agentId: string; sessionKey: string; hasExistingOverride: boolean }): LatestUpdateIntent`
- `function buildLatestUpdatePatch(content: string, kind?: "heartbeat" | "cron"): { latestOverride: string | null; latestOverrideKind: "heartbeat" | "cron" | null }`

Add `src/features/agents/operations/fleetLifecycleWorkflow.ts` with explicit refresh/reconcile contracts.

Required contracts:

- `function resolveSummarySnapshotKeys(params: { agents: Array<{ sessionCreated: boolean; sessionKey: string }>; maxKeys: number }): string[]`
- `type ReconcileEligibility = { shouldCheck: boolean; reason: "ok" | "not-running" | "missing-run-id" | "not-session-created" }`
- `function resolveReconcileEligibility(params: { status: "running" | "idle" | "error"; sessionCreated: boolean; runId: string | null }): ReconcileEligibility`
- `function buildReconcileTerminalPatch(params: { outcome: "ok" | "error" }): { status: "idle" | "error"; runId: null; runStartedAt: null; streamText: null; thinkingTrace: null }`

Dependencies to reuse, not duplicate:

- `hydrateAgentFleetFromGateway` in `src/features/agents/operations/agentFleetHydration.ts`
- runtime bridge helpers in `src/features/agents/state/runtimeEventBridge.ts`
- runtime handler tracking semantics in `src/features/agents/state/gatewayRuntimeEventHandler.ts`
- existing page state/update primitives in `src/app/page.tsx`

Maintain all existing user-facing status/preview semantics unless tests intentionally codify a behavior change.

Revision Note (2026-02-13 04:58Z, Codex): Initial plan authored to extract remaining fleet refresh and latest-update lifecycle policy from `src/app/page.tsx`, with Beads milestones `bd-357`, `bd-ps9`, and `bd-3ah`.
Revision Note (2026-02-13 05:02Z, Codex): Completed Milestone 1 with `latestUpdateWorkflow` extraction and passing failing-first test coverage; updated contract for `buildLatestUpdatePatch` to carry explicit optional kind.
Revision Note (2026-02-13 05:03Z, Codex): Completed Milestone 2 with `fleetLifecycleWorkflow` extraction and passing failing-first unit coverage for summary intent and reconcile policy.
Revision Note (2026-02-13 05:07Z, Codex): Completed Milestone 3 with page callback rewiring through workflow helpers, added lifecycle integration tests, and updated architecture module-boundary documentation.
Revision Note (2026-02-13 05:07Z, Codex): Final verification completed with passing targeted tests, unchanged baseline typecheck failures, and clean Beads sync.
