# Decouple runtime event policy from gateway side effects

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository does not ship a root `PLANS.md`; the source of truth for this plan is `/Users/georgepickett/openclaw-studio/.agent/PLANS.md`, copied from the `execplan-create` skill per policy. This document must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, runtime gateway event handling will keep the same user-visible behavior in Studio while separating domain policy from side-effect execution. A user should still see streaming assistant text, thinking traces, tool lines, terminal states, and heartbeat-triggered refresh behavior exactly as before, but the event policy will be expressed as pure, testable decisions that do not require mocking dispatch timers and gateway callbacks just to validate run-state transitions.

You can see the change working by running the runtime event handler unit suite and observing that existing behavior tests still pass, plus new policy-level tests pass against a pure decision module.

## Progress

- [x] (2026-02-13 05:36Z) Copied planning source of truth to `/Users/georgepickett/openclaw-studio/.agent/PLANS.md` because root `PLANS.md` is absent.
- [x] (2026-02-13 05:36Z) Created Beads milestone issue for policy extraction scope. [bd-12e]
- [x] (2026-02-13 05:36Z) Created Beads milestone issue for handler migration scope and linked dependency on Milestone 1. [bd-35n]
- [x] (2026-02-13 05:36Z) Created Beads milestone issue for stabilization scope and linked dependency on Milestone 2. [bd-17c]
- [x] (2026-02-13 05:42Z) Implemented Milestone 1 test-first: added `tests/unit/runtimeEventPolicy.test.ts`, observed initial import-failure, then added `src/features/agents/state/runtimeEventPolicy.ts` and passed `npm run test -- tests/unit/runtimeEventPolicy.test.ts tests/unit/runtimeEventBridge.test.ts`. Closed Beads issue. [bd-12e]
- [x] (2026-02-13 05:46Z) Implemented Milestone 2 test-first: added policy-delegation tests (`tests/unit/gatewayRuntimeEventHandler.policyDelegation.test.ts`), observed failure, then refactored `src/features/agents/state/gatewayRuntimeEventHandler.ts` to execute `runtimeEventPolicy` intents for chat/agent preflight/summary paths; passed targeted runtime suites. Closed Beads issue. [bd-35n]
- [x] (2026-02-13 05:48Z) Implemented Milestone 3: expanded edge-case policy coverage (`tests/unit/runtimeEventPolicy.test.ts`), updated architecture docs (`ARCHITECTURE.md`) for the policy/executor split, and passed broad runtime verification suite. `npm run typecheck` and `npm run lint` were executed and still fail on pre-existing unrelated repository issues; no new failures remained in touched runtime files. [bd-17c]

## Surprises & Discoveries

- Observation: The repository already has broad, split test coverage for chat, agent, and summary-refresh runtime paths.
  Evidence: Existing suites at `tests/unit/gatewayRuntimeEventHandler.chat.test.ts`, `tests/unit/gatewayRuntimeEventHandler.agent.test.ts`, and `tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts`.
- Observation: Beads is already initialized and active, so milestone tracking can be first-class instead of optional.
  Evidence: `.beads/` exists and `br list` returns open issues.
- Observation: Final-state policy emits two `dispatchUpdateAgent` intents (`lastResult` and terminal cleanup patch), which required test assertions to validate both instead of only the first match.
  Evidence: `tests/unit/runtimeEventPolicy.test.ts` terminal-case assertion update.
- Observation: Handler-level delegation is easiest to prove by mocking policy outputs and asserting effect execution, which made wiring regressions visible immediately.
  Evidence: `tests/unit/gatewayRuntimeEventHandler.policyDelegation.test.ts` failed before refactor and passed after intent execution wiring.
- Observation: Repository-wide `typecheck` and `lint` currently fail outside this change set (for example `src/features/agents/state/transcript.ts` nullability and CommonJS lint violations in `server/*.js`), so milestone verification relied on targeted runtime suites plus ensuring no new runtime-type errors.
  Evidence: `npm run typecheck` and `npm run lint` outputs during Milestone 3.

## Decision Log

- Decision: Keep the refactor behavior-preserving and avoid introducing fallback execution paths.
  Rationale: Repository instructions explicitly prohibit unnecessary fallback paths; the runtime flow is already high-risk and should change only in structure, not semantics.
  Date/Author: 2026-02-13 / Codex
- Decision: Track implementation as three milestones (pure policy extraction, handler adoption, stabilization).
  Rationale: This sequence allows failing tests first, then controlled migration, then regression hardening with minimal blast radius per commit.
  Date/Author: 2026-02-13 / Codex
- Decision: Use Beads milestone issues and dependencies (`bd-12e` -> `bd-35n` -> `bd-17c`) in the ExecPlan.
  Rationale: `/Users/georgepickett/openclaw-studio/.agent/PLANS.md` requires issue tracking when Beads is initialized.
  Date/Author: 2026-02-13 / Codex
- Decision: Model runtime policy as pure intent emitters (`decideRuntimeChatEvent`, `decideRuntimeAgentEvent`, `decideSummaryRefreshEvent`) and keep side-effect execution in the handler.
  Rationale: This yields testable decision boundaries without breaking existing dependency contracts in `createGatewayRuntimeEventHandler`.
  Date/Author: 2026-02-13 / Codex
- Decision: Keep transcript formatting/output emission logic in the handler for now while policy controls lifecycle/guard/state-transition intents.
  Rationale: This preserves existing behavior and limits migration risk while still extracting the highest-impact decision coupling.
  Date/Author: 2026-02-13 / Codex
- Decision: Treat current repo-wide lint/typecheck failures as baseline debt and avoid expanding milestone scope to unrelated fixes.
  Rationale: The execplan targets runtime policy decoupling; unrelated global cleanup would increase risk and dilute milestone guarantees.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

All three milestones are complete. Runtime decision policy now exists as a pure intent layer in `src/features/agents/state/runtimeEventPolicy.ts`, and `createGatewayRuntimeEventHandler` executes those intents for chat, agent preflight, and summary-refresh orchestration. Runtime bridge and handler tests pass with added delegation coverage, and architecture docs now describe the policy/executor split. Remaining known gaps are pre-existing repository-wide lint/typecheck issues outside this change scope.

## Context and Orientation

OpenClaw Studio consumes gateway events in the client and updates agent state. The current runtime boundary is centered in `src/features/agents/state/gatewayRuntimeEventHandler.ts`, which currently mixes policy and side effects in one large module. In this context, policy means the rules that decide what should happen when a specific event arrives (for example, ignore stale run events, publish terminal output, or request history refresh). Side effects means operations that mutate app state or external boundaries (for example, dispatching `updateAgent`, queueing live patches, scheduling timers, and calling async refresh commands).

The current policy helper file `src/features/agents/state/runtimeEventBridge.ts` already provides pure utility functions (classification, stream merge, dedupe, lifecycle patch resolution), but `gatewayRuntimeEventHandler.ts` still owns most flow-level branching and directly executes side effects while deciding behavior. Runtime entry wiring remains in `src/app/page.tsx`, which instantiates and feeds the handler from gateway events.

Existing tests provide a baseline:

- `tests/unit/gatewayRuntimeEventHandler.chat.test.ts`
- `tests/unit/gatewayRuntimeEventHandler.agent.test.ts`
- `tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts`
- `tests/unit/runtimeEventBridge.test.ts`

These suites should remain behavior guards during migration.

## Plan of Work

Milestone 1 introduces a new pure policy module under `src/features/agents/state/` (for example `runtimeEventPolicy.ts`) that receives normalized runtime inputs and current lightweight state snapshots, then returns typed decisions/intents instead of executing effects. A decision/intent is a plain object that says what the handler must do (for example, append output line, update agent patch, clear run tracking, request history refresh, debounce summary refresh). This milestone adds policy-focused tests first, proving expected intent emission for representative chat, agent, and lifecycle cases.

Milestone 2 refactors `src/features/agents/state/gatewayRuntimeEventHandler.ts` to become an executor/orchestrator. It will collect required snapshot data, call the pure policy functions, and apply returned intents through existing dependency callbacks (`dispatch`, `queueLivePatch`, `clearPendingLivePatch`, `requestHistoryRefresh`, timer functions). The module should preserve current public API (`createGatewayRuntimeEventHandler`) and existing dependency contract for `src/app/page.tsx`.

Milestone 3 removes remaining duplicated or dead branch logic left after migration, expands regression tests around event ordering and terminal handling, and validates full runtime suites plus typecheck/lint as needed. If architecture docs describe runtime ownership boundaries that changed materially, update `ARCHITECTURE.md` in the same milestone so new contributors understand the policy/executor split.

## Concrete Steps

All commands below run from:

    cd /Users/georgepickett/openclaw-studio

Milestone 1 (test-first policy module):

1. Create tests that define the pure-policy contract before implementation, for example in:

       tests/unit/runtimeEventPolicy.test.ts

   Candidate test cases:

   - emits no-op intent for stale chat delta run mismatch
   - emits queue-live-patch intent for assistant chat delta text/thinking
   - emits terminal intents for chat final with assistant output and run cleanup
   - emits summary-refresh debounce intent for `presence`/`heartbeat`

2. Run the new suite and confirm failure before implementation:

       npm run test -- tests/unit/runtimeEventPolicy.test.ts

3. Implement the new pure module and related types in:

   - `src/features/agents/state/runtimeEventPolicy.ts` (new)
   - `src/features/agents/state/runtimeEventBridge.ts` (only if shared helper extraction is needed)

4. Re-run the suite until passing, then run existing runtime bridge tests:

       npm run test -- tests/unit/runtimeEventPolicy.test.ts tests/unit/runtimeEventBridge.test.ts

5. Close milestone issue and sync Beads metadata before commit:

       br update bd-12e --status in_progress
       br close bd-12e --reason "Tests pass, committed"
       br sync --flush-only

6. Commit:

       git add src/features/agents/state/runtimeEventPolicy.ts src/features/agents/state/runtimeEventBridge.ts tests/unit/runtimeEventPolicy.test.ts .beads
       git commit -m "Milestone 1: extract pure runtime event policy model"

Milestone 2 (adopt policy in handler):

1. Add failing adapter-focused tests that prove handler delegates to policy intents without behavior drift. Extend:

   - `tests/unit/gatewayRuntimeEventHandler.chat.test.ts`
   - `tests/unit/gatewayRuntimeEventHandler.agent.test.ts`
   - `tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts`

   Include assertions that side-effect callbacks fire from policy output, not ad hoc branch duplication.

2. Run targeted suites and confirm failures:

       npm run test -- tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts

3. Refactor `src/features/agents/state/gatewayRuntimeEventHandler.ts` so each event path:

   - builds policy input from current snapshots/tracking maps
   - calls pure policy function(s)
   - executes returned intents via existing deps and local run-tracking helpers

4. Re-run targeted suites until passing.

5. Close milestone issue and sync Beads metadata before commit:

       br update bd-35n --status in_progress
       br close bd-35n --reason "Tests pass, committed"
       br sync --flush-only

6. Commit:

       git add src/features/agents/state/gatewayRuntimeEventHandler.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts .beads
       git commit -m "Milestone 2: route runtime handler through policy intents"

Milestone 3 (stabilize and verify end-to-end behavior):

1. Add/adjust tests for edge conditions discovered during migration, emphasizing late events, terminal dedupe, and history-refresh gating. Use:

   - `tests/unit/gatewayRuntimeEventHandler.chat.test.ts`
   - `tests/unit/gatewayRuntimeEventHandler.agent.test.ts`
   - `tests/unit/runtimeEventPolicy.test.ts`

2. Run broader verification:

       npm run test -- tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts tests/unit/runtimeEventPolicy.test.ts tests/unit/runtimeEventBridge.test.ts
       npm run typecheck
       npm run lint

3. If runtime-boundary architecture wording changed materially, update:

   - `ARCHITECTURE.md`

4. Close milestone issue and sync Beads metadata before commit:

       br update bd-17c --status in_progress
       br close bd-17c --reason "Tests pass, committed"
       br sync --flush-only

5. Commit:

       git add src/features/agents/state/gatewayRuntimeEventHandler.ts src/features/agents/state/runtimeEventPolicy.ts tests/unit/runtimeEventPolicy.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts ARCHITECTURE.md .beads
       git commit -m "Milestone 3: stabilize runtime policy-executor split"

Expected short success transcript examples:

    $ npm run test -- tests/unit/runtimeEventPolicy.test.ts
     ✓ tests/unit/runtimeEventPolicy.test.ts (N tests)

    $ npm run test -- tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts
     ✓ tests/unit/gatewayRuntimeEventHandler.chat.test.ts (N tests)
     ✓ tests/unit/gatewayRuntimeEventHandler.agent.test.ts (N tests)

    $ npm run typecheck
    # exits 0 with no TypeScript errors

## Validation and Acceptance

Acceptance is behavior-based and must preserve existing runtime UX while improving separability.

Milestone 1 verification workflow:

1. Tests to write first:
   `tests/unit/runtimeEventPolicy.test.ts` with named cases:
   - `returns_noop_for_stale_chat_delta_run`
   - `returns_live_patch_intent_for_assistant_delta`
   - `returns_terminal_intents_for_chat_final_assistant`
   - `returns_summary_refresh_intent_for_presence_and_heartbeat`
   Assertions must check exact intent shapes and ordering.
2. Implementation:
   Introduce pure policy functions and intent types in `src/features/agents/state/runtimeEventPolicy.ts`.
3. Verification:
   Run `npm run test -- tests/unit/runtimeEventPolicy.test.ts tests/unit/runtimeEventBridge.test.ts`; all pass.
4. Commit:
   Commit with message `Milestone 1: extract pure runtime event policy model`.

Milestone 2 verification workflow:

1. Tests to write first:
   Extend handler suites to prove policy-driven execution for chat/agent/summary paths and no regression in emitted side effects.
2. Implementation:
   Refactor `createGatewayRuntimeEventHandler` to use policy outputs for side-effect execution.
3. Verification:
   Run `npm run test -- tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts`; all pass.
4. Commit:
   Commit with message `Milestone 2: route runtime handler through policy intents`.

Milestone 3 verification workflow:

1. Tests to write first:
   Add edge-case coverage for late deltas after terminal closure, terminal dedupe, and history-refresh trigger conditions.
2. Implementation:
   Final cleanup and optional architecture doc sync.
3. Verification:
   Run:
   - `npm run test -- tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/gatewayRuntimeEventHandler.agent.test.ts tests/unit/gatewayRuntimeEventHandler.summaryRefresh.test.ts tests/unit/runtimeEventPolicy.test.ts tests/unit/runtimeEventBridge.test.ts`
   - `npm run typecheck`
   - `npm run lint`
   All commands must exit 0.
4. Commit:
   Commit with message `Milestone 3: stabilize runtime policy-executor split`.

Final acceptance criteria:

- Runtime event handler behavior observed by existing chat/agent/summary suites remains green.
- A new pure-policy suite validates flow decisions without requiring side-effect mocks beyond policy input/output assertions.
- `src/app/page.tsx` integration does not require interface changes to handler construction, preserving wiring stability.

## Idempotence and Recovery

The plan is additive and can be retried safely. If a milestone fails midway, reset only that milestone by restoring modified files from the last commit and rerunning its targeted tests; do not continue to downstream milestones until upstream tests pass again.

`br sync --flush-only` is safe to re-run. If a Beads close/update command was applied too early, reopen with `br reopen <id>` and continue. Keep one milestone per commit so rollback is precise (`git revert <commit>`), avoiding broad rewrites.

Avoid destructive git commands. If runtime behavior regresses, use the milestone-scoped tests to isolate failure before proceeding.

## Artifacts and Notes

Beads milestones created for this plan:

- `bd-12e` Milestone 1: Extract pure runtime decision model
- `bd-35n` Milestone 2: Adopt command executor in gateway runtime handler (depends on `bd-12e`)
- `bd-17c` Milestone 3: Stabilize tests and integration boundary (depends on `bd-35n`)

Current hotspot files identified during planning:

- `src/features/agents/state/gatewayRuntimeEventHandler.ts` (main runtime orchestration)
- `src/features/agents/state/runtimeEventBridge.ts` (pure helpers already in use)
- `src/app/page.tsx` (event subscription and handler wiring)

## Interfaces and Dependencies

Use existing project stack and boundaries only: TypeScript, Vitest, and current gateway client contracts. Do not add new runtime libraries.

Define stable interfaces in the new pure policy module:

    export type RuntimePolicyIntent =
      | { kind: "queueLivePatch"; agentId: string; patch: Partial<AgentState> }
      | { kind: "dispatchUpdateAgent"; agentId: string; patch: Partial<AgentState> }
      | { kind: "appendOutput"; agentId: string; line: string; transcript?: TranscriptAppendMeta }
      | { kind: "requestHistoryRefresh"; agentId: string; reason: "chat-final-no-trace" }
      | { kind: "markRunClosed"; runId: string }
      | { kind: "clearRunTracking"; runId: string }
      | { kind: "clearPendingLivePatch"; agentId: string }
      | { kind: "scheduleSummaryRefresh"; delayMs: number; includeHeartbeatRefresh: boolean };

    export function decideRuntimeChatEvent(input: RuntimeChatPolicyInput): RuntimePolicyIntent[];
    export function decideRuntimeAgentEvent(input: RuntimeAgentPolicyInput): RuntimePolicyIntent[];
    export function decideSummaryRefreshEvent(input: RuntimeSummaryPolicyInput): RuntimePolicyIntent[];

The exact type names can vary if implementation reveals better naming, but the interface contract must remain explicit: policy functions are pure and return intents only; `createGatewayRuntimeEventHandler` remains the sole side-effect executor and external boundary.

Plan revision note (2026-02-13): Initial draft created to resolve the identified runtime flow entanglement by introducing a policy/executor split while preserving behavior.
Plan revision note (2026-02-13): Updated after Milestone 1 implementation to record completed test-first policy extraction and resulting decisions/discoveries.
Plan revision note (2026-02-13): Updated after Milestone 2 implementation to record handler intent-execution wiring and new delegation regression tests.
Plan revision note (2026-02-13): Updated after Milestone 3 implementation to record expanded edge coverage, architecture updates, and baseline repo verification constraints.
