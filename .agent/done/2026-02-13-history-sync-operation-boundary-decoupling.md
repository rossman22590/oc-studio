# Decouple history sync policy from page-level gateway I/O

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository does not include a root `PLANS.md`; the source of truth for this plan is `/Users/georgepickett/openclaw-studio/.agent/PLANS.md`. This plan must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, chat history synchronization will behave the same in the UI, but the core rules for deciding when to apply, drop, or metadata-only a history response will no longer be embedded in `src/app/page.tsx`. A user should still see transcript history load, merge, and recover after runtime events exactly as before, while the decision logic becomes independently testable and less coupled to React refs and dispatch plumbing.

You can verify this by running the history workflow and runtime history-focused unit suites: they should fail before extraction and pass after, with unchanged behavior in existing runtime tests that trigger history refresh from gateway events.

## Progress

- [x] (2026-02-13 05:52Z) Verified planning source of truth at `/Users/georgepickett/openclaw-studio/.agent/PLANS.md` and confirmed no existing pending plan file.
- [x] (2026-02-13 05:52Z) Created Beads milestone issue for extracting history sync operation boundary. [bd-55a]
- [x] (2026-02-13 05:52Z) Created Beads milestone issue for routing `loadAgentHistory` through operation and linked dependency on Milestone 1. [bd-3si]
- [x] (2026-02-13 05:52Z) Created Beads milestone issue for stabilization/docs and linked dependency on Milestone 2. [bd-gzp]
- [x] (2026-02-13 05:56Z) Implemented Milestone 1 test-first: added `tests/unit/historySyncOperation.test.ts`, observed import-failure, implemented `src/features/agents/operations/historySyncOperation.ts`, and passed targeted history workflow suites. Closed Beads issue. [bd-55a]
- [x] (2026-02-13 05:57Z) Implemented Milestone 2 test-first: added `tests/unit/historySyncOperation.integration.test.ts` (failed on missing executor), added `executeHistorySyncCommands` and refactored `loadAgentHistory` in `src/app/page.tsx` to delegate through `runHistorySyncOperation`; passed targeted integration/runtime suites. Closed Beads issue. [bd-3si]
- [x] (2026-02-13 06:00Z) Implemented Milestone 3: added stale-revision regression coverage in `tests/unit/historySyncOperation.test.ts`, updated architecture boundary docs, passed broad history/runtime tests, and confirmed `typecheck`/`lint` failures remain baseline-only and unrelated to changed history-sync files. Closed Beads issue. [bd-gzp]

## Surprises & Discoveries

- Observation: The repository already split a first layer of history policy into `historyLifecycleWorkflow`, but `loadAgentHistory` in `page.tsx` still combines fetch/disposition/merge/dispatch in one callback.
  Evidence: `/Users/georgepickett/openclaw-studio/src/features/agents/operations/historyLifecycleWorkflow.ts` and `/Users/georgepickett/openclaw-studio/src/app/page.tsx`.
- Observation: There is existing integration coverage that models page adapter behavior, so extraction can extend current tests rather than starting from scratch.
  Evidence: `/Users/georgepickett/openclaw-studio/tests/unit/historyLifecycleWorkflow.integration.test.ts`.
- Observation: The extracted operation can preserve behavior without touching workflow modules by returning explicit commands (`dispatchUpdateAgent`, `logMetric`, `logError`) that page executes.
  Evidence: `src/features/agents/operations/historySyncOperation.ts` and passing tests in `tests/unit/historySyncOperation.test.ts`.
- Observation: Page-level history callback can be reduced to orchestration-only with no direct disposition branch logic by executing operation-returned commands.
  Evidence: Refactor in `src/app/page.tsx` where `loadAgentHistory` now delegates to `runHistorySyncOperation` + `executeHistorySyncCommands`.
- Observation: `npm run typecheck` and `npm run lint` continue to fail for pre-existing repository debt (for example `transcript.ts` nullability and CommonJS lint rules in `server/*.js`), while new history-sync files no longer introduce additional failures after fixes.
  Evidence: Milestone 3 verification runs.

## Decision Log

- Decision: Keep behavior stable and treat this refactor as a boundary move, not a feature change.
  Rationale: The goal is to separate policy from infrastructure side effects without altering user-visible transcript behavior.
  Date/Author: 2026-02-13 / Codex
- Decision: Build on `historyLifecycleWorkflow` instead of creating parallel policy modules.
  Rationale: The repo already uses this workflow for request/disposition decisions; extending it avoids duplicate policy surfaces.
  Date/Author: 2026-02-13 / Codex
- Decision: Introduce a dedicated history sync operation module that page calls, leaving page with orchestration and state wiring only.
  Rationale: This directly addresses the entanglement seam while preserving the existing `requestHistoryRefresh -> loadAgentHistory` integration path from runtime event handling.
  Date/Author: 2026-02-13 / Codex
- Decision: Use a command-returning operation instead of immediate dispatch side effects.
  Rationale: Command outputs keep policy/testability high and simplify page-level migration in Milestone 2.
  Date/Author: 2026-02-13 / Codex
- Decision: Keep metric names and metadata payloads unchanged while moving execution into operation commands.
  Rationale: This preserves existing debug instrumentation semantics and avoids hidden observability regressions.
  Date/Author: 2026-02-13 / Codex
- Decision: Treat current global typecheck/lint failures as out-of-scope baseline and avoid widening this refactor to unrelated files.
  Rationale: The plan targets history sync boundary decoupling; broad cleanup would increase change risk and violate milestone focus.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

All milestones are complete. History synchronization is operation-driven (`historySyncOperation.ts`), `loadAgentHistory` in `page.tsx` is an orchestration adapter, regression coverage includes stale-revision drops and metadata-only behavior, and architecture docs reflect the new boundary. Remaining known gaps are pre-existing repo-wide typecheck/lint failures outside this scope.

## Context and Orientation

The current entangled flow lives in `loadAgentHistory` in `/Users/georgepickett/openclaw-studio/src/app/page.tsx` (around lines 1192-1351). That callback currently does all of the following in one place: identifies request intent, performs gateway I/O (`chat.history`), computes stale/disposition decisions, performs transcript v2 merge or legacy sync patching, emits debug metrics, dispatches patches, and manages in-flight request keys.

A “history response disposition” is the rule that determines whether a history response should be applied, dropped as stale, or used only for metadata updates. These rules already exist in `/Users/georgepickett/openclaw-studio/src/features/agents/operations/historyLifecycleWorkflow.ts` but the final patch assembly and side-effect execution still live in `page.tsx`.

Runtime event handling triggers this flow through `requestHistoryRefresh` wiring in `/Users/georgepickett/openclaw-studio/src/app/page.tsx` (`createGatewayRuntimeEventHandler` deps), so stability of this seam is critical for transcript recovery behavior after streaming completion.

Relevant files:

- `/Users/georgepickett/openclaw-studio/src/app/page.tsx`
- `/Users/georgepickett/openclaw-studio/src/features/agents/operations/historyLifecycleWorkflow.ts`
- `/Users/georgepickett/openclaw-studio/src/features/agents/state/runtimeEventBridge.ts`
- `/Users/georgepickett/openclaw-studio/src/features/agents/state/transcript.ts`
- `/Users/georgepickett/openclaw-studio/tests/unit/historyLifecycleWorkflow.test.ts`
- `/Users/georgepickett/openclaw-studio/tests/unit/historyLifecycleWorkflow.integration.test.ts`
- `/Users/georgepickett/openclaw-studio/tests/unit/gatewayRuntimeEventHandler.chat.test.ts`

## Plan of Work

Milestone 1 creates a dedicated history sync operation boundary under `src/features/agents/operations/` and moves deterministic patch-assembly logic out of `page.tsx`. This includes codifying transcript-v2 merge and legacy patch paths behind operation/workflow functions with explicit input/output types.

Milestone 2 rewires `loadAgentHistory` in `page.tsx` to delegate to that operation. The page callback will keep only boundary concerns (current-agent lookup, dispatch plumbing, ref lifecycle, and gateway wiring) and execute returned effects/patches rather than owning branch-heavy history policy.

Milestone 3 hardens regressions and documentation. It extends tests for stale responses, metadata-only behavior during active runs, and transcript merge application. It also updates `ARCHITECTURE.md` to explicitly describe the new history sync policy/operation boundary.

## Concrete Steps

All commands run from:

    cd /Users/georgepickett/openclaw-studio

Milestone 1 (test-first extraction of history sync operation/workflow):

1. Add failing tests that describe the extracted behavior boundary, likely in a new file:

       tests/unit/historySyncOperation.test.ts

   Also extend existing integration coverage:

       tests/unit/historyLifecycleWorkflow.integration.test.ts

   Include assertions for:
   - stale response drop vs metadata-only vs apply flow
   - transcript-v2 merge patch construction
   - legacy `buildHistorySyncPatch` path construction

2. Run targeted suites and confirm they fail before implementation:

       npm run test -- tests/unit/historySyncOperation.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts

3. Implement operation/workflow extraction:

   - Add `/Users/georgepickett/openclaw-studio/src/features/agents/operations/historySyncOperation.ts` (new)
   - Extend `/Users/georgepickett/openclaw-studio/src/features/agents/operations/historyLifecycleWorkflow.ts` if additional pure helpers are required

4. Re-run targeted suites until passing:

       npm run test -- tests/unit/historySyncOperation.test.ts tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts

5. Close Beads milestone and sync:

       br update bd-55a --status in_progress
       br close bd-55a --reason "Tests pass, committed"
       br sync --flush-only

6. Commit:

       git add src/features/agents/operations/historySyncOperation.ts src/features/agents/operations/historyLifecycleWorkflow.ts tests/unit/historySyncOperation.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts .beads
       git commit -m "Milestone 1: extract history sync operation boundary"

Milestone 2 (route page callback through operation):

1. Add failing tests that prove `loadAgentHistory` delegates behavior through the new operation and preserves runtime wiring contracts. Extend/add:

       tests/unit/historySyncOperation.integration.test.ts
       tests/unit/gatewayRuntimeEventHandler.chat.test.ts

2. Run targeted suites and confirm failures:

       npm run test -- tests/unit/historySyncOperation.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts

3. Refactor `loadAgentHistory` in `/Users/georgepickett/openclaw-studio/src/app/page.tsx` to delegate request/disposition/patch assembly to `historySyncOperation`, keeping page-level concerns limited to boundary orchestration.

4. Re-run targeted suites until passing:

       npm run test -- tests/unit/historySyncOperation.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts

5. Close Beads milestone and sync:

       br update bd-3si --status in_progress
       br close bd-3si --reason "Tests pass, committed"
       br sync --flush-only

6. Commit:

       git add src/app/page.tsx src/features/agents/operations/historySyncOperation.ts tests/unit/historySyncOperation.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts .beads
       git commit -m "Milestone 2: route loadAgentHistory through operation"

Milestone 3 (stabilize regressions and docs):

1. Add/adjust regression tests for edge behavior:

   - response dropped when transcript revision changes during in-flight request
   - metadata-only patch during active run
   - apply path preserves local optimistic lines while adding canonical history

   Target files:

       tests/unit/historySyncOperation.test.ts
       tests/unit/historyLifecycleWorkflow.integration.test.ts
       tests/unit/historyLifecycleWorkflow.test.ts

2. Run broad verification:

       npm run test -- tests/unit/historySyncOperation.test.ts tests/unit/historySyncOperation.integration.test.ts tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts

3. Update architecture documentation to reflect the new boundary:

   - `/Users/georgepickett/openclaw-studio/ARCHITECTURE.md`

4. Run final checks and record baseline constraints:

       npm run typecheck
       npm run lint

   If existing unrelated failures remain, document them in this ExecPlan and confirm no new failures originate from changed history-sync files.

5. Close Beads milestone and sync:

       br update bd-gzp --status in_progress
       br close bd-gzp --reason "Tests pass, committed"
       br sync --flush-only

6. Commit:

       git add ARCHITECTURE.md src/app/page.tsx src/features/agents/operations/historySyncOperation.ts src/features/agents/operations/historyLifecycleWorkflow.ts tests/unit/historySyncOperation.test.ts tests/unit/historySyncOperation.integration.test.ts tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts .beads
       git commit -m "Milestone 3: stabilize history sync boundary and docs"

Expected concise success transcript examples:

    $ npm run test -- tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts
     ✓ tests/unit/historyLifecycleWorkflow.test.ts (...)
     ✓ tests/unit/historyLifecycleWorkflow.integration.test.ts (...)

    $ npm run test -- tests/unit/historySyncOperation.test.ts
     ✓ tests/unit/historySyncOperation.test.ts (...)

## Validation and Acceptance

Acceptance is behavior-focused and must preserve user-visible transcript behavior.

Milestone 1 verification workflow:

1. Tests to write first:
   - `tests/unit/historySyncOperation.test.ts`
   - extend `tests/unit/historyLifecycleWorkflow.integration.test.ts`
   Tests must assert exact disposition-driven patch outputs for apply/drop/metadata-only branches.
2. Implementation:
   Add `historySyncOperation.ts` and any supporting pure helpers.
3. Verification:
   Run `npm run test -- tests/unit/historySyncOperation.test.ts tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts`.
4. Commit:
   `Milestone 1: extract history sync operation boundary`.

Milestone 2 verification workflow:

1. Tests to write first:
   Add integration tests proving `page.tsx` history callback behavior is preserved while delegated through the new operation.
2. Implementation:
   Refactor `loadAgentHistory` to call operation/workflow APIs.
3. Verification:
   Run `npm run test -- tests/unit/historySyncOperation.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts`.
4. Commit:
   `Milestone 2: route loadAgentHistory through operation`.

Milestone 3 verification workflow:

1. Tests to write first:
   Expand regression coverage around stale-response races and transcript merge behavior.
2. Implementation:
   Final stabilization and `ARCHITECTURE.md` updates.
3. Verification:
   Run:
   - `npm run test -- tests/unit/historySyncOperation.test.ts tests/unit/historySyncOperation.integration.test.ts tests/unit/historyLifecycleWorkflow.test.ts tests/unit/historyLifecycleWorkflow.integration.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts`
   - `npm run typecheck`
   - `npm run lint`
4. Commit:
   `Milestone 3: stabilize history sync boundary and docs`.

Final acceptance criteria:

- `loadAgentHistory` no longer owns branch-heavy history policy logic directly in `page.tsx`.
- A dedicated history sync operation/workflow boundary encapsulates disposition and patch assembly rules.
- Existing runtime history refresh behavior remains intact when `gatewayRuntimeEventHandler` invokes `requestHistoryRefresh`.
- History-focused tests cover stale, metadata-only, and apply paths with explicit assertions.

## Idempotence and Recovery

This migration is additive and retry-safe. If a milestone fails midway, restore only that milestone’s changed files from the last passing commit and rerun its targeted tests before proceeding. Keep one milestone per commit so rollback remains precise (`git revert <commit>`).

Beads operations are idempotent for this workflow: re-running `br sync --flush-only` is safe, and mistaken closures can be corrected via `br reopen <id>`.

Avoid destructive git commands. Do not continue to the next milestone while targeted tests for the current milestone are failing.

## Artifacts and Notes

Beads milestones created for this ExecPlan:

- `bd-55a` Milestone 1: Extract history sync operation boundary
- `bd-3si` Milestone 2: Route page `loadAgentHistory` through operation (depends on `bd-55a`)
- `bd-gzp` Milestone 3: Stabilize history sync regressions and docs (depends on `bd-3si`)

Current entanglement hotspot:

- `/Users/georgepickett/openclaw-studio/src/app/page.tsx` (`loadAgentHistory` callback)

Supporting policy modules already present:

- `/Users/georgepickett/openclaw-studio/src/features/agents/operations/historyLifecycleWorkflow.ts`
- `/Users/georgepickett/openclaw-studio/src/features/agents/state/runtimeEventBridge.ts`

## Interfaces and Dependencies

Use only existing project stack (TypeScript, Vitest, existing gateway client and transcript helpers). Do not add new runtime libraries.

Define a stable operation contract in `historySyncOperation.ts` similar to other operations:

    export type HistorySyncCommand =
      | { kind: "dispatchUpdateAgent"; agentId: string; patch: Partial<AgentState> }
      | { kind: "logMetric"; name: string; meta: Record<string, unknown> }
      | { kind: "noop"; reason: string };

    export async function runHistorySyncOperation(params: {
      client: { call: (method: string, params: unknown) => Promise<unknown> };
      agentId: string;
      requestedLimit?: number;
      getAgent: (agentId: string) => AgentState | null;
      inFlightSessionKeys: Set<string>;
      requestId: string;
      loadedAt: number;
      transcriptV2Enabled: boolean;
    }): Promise<HistorySyncCommand[]>;

Exact naming may vary, but the required architectural contract is fixed:

- The operation/workflow layer computes history application decisions and resulting patches.
- `page.tsx` executes returned commands and remains the UI boundary owner.
- Runtime event handler integration remains via `requestHistoryRefresh -> loadAgentHistory`.

Plan revision note (2026-02-13): Initial draft created to decouple history sync domain policy from page-level gateway I/O and state side effects.
Plan revision note (2026-02-13): Updated after Milestone 1 implementation to record extracted operation boundary, tests, and decision updates.
Plan revision note (2026-02-13): Updated after Milestone 2 implementation to record page delegation and command executor integration.
Plan revision note (2026-02-13): Updated after Milestone 3 implementation to record regression hardening, architecture sync, and baseline verification constraints.
