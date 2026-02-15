# Decouple Rename/Delete Restart Orchestration From `src/app/page.tsx`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The source-of-truth planning guide for this repository is `.agent/PLANS.md`, and this document must be maintained in accordance with `.agent/PLANS.md`.

This plan builds on the completed guided-create decoupling work documented at `.agent/done/execplan-guided-create-workflow-decoupling.md`. That prior plan extracted create/retry policy; this plan extracts the remaining rename/delete restart policy.

## Purpose / Big Picture

After this change, users will still rename and delete agents exactly as they do now, including queueing while runs are active, waiting for gateway restart when required, and seeing the same lock-screen status messages. The difference is architectural: mutation policy will live in a dedicated workflow module instead of being spread across large inline branches in `src/app/page.tsx`. You can see this working by running the new workflow tests, then performing rename/delete flows in Studio and observing unchanged behavior with reduced page-level orchestration logic.

## Progress

- [x] (2026-02-13 04:34Z) Re-assessed post-create-refactor architecture and confirmed rename/delete restart orchestration is now the highest-impact remaining entanglement. [bd-2vb]
- [x] (2026-02-13 04:34Z) Created Beads milestones and dependencies for this plan (`bd-2vb` -> `bd-bz3` -> `bd-fmk`). [bd-2vb]
- [x] (2026-02-13 04:37Z) Implemented Milestone 1: added `configMutationWorkflow` module and passing failing-first unit tests. [bd-2vb]
- [x] (2026-02-13 04:40Z) Implemented Milestone 2: wired `src/app/page.tsx` rename/delete handlers through workflow adapters and passing integration tests. [bd-bz3]
- [x] (2026-02-13 04:41Z) Implemented Milestone 3: added restart-orchestration regressions and updated architecture boundary docs. [bd-fmk]
- [x] (2026-02-13 04:42Z) Final verification complete: targeted mutation suites pass, repo typecheck remains at known baseline failures, and `br sync --flush-only` reports nothing dirty.

## Surprises & Discoveries

- Observation: rename/delete transaction internals are already partially separated (`deleteAgentTransaction.ts`), but orchestration policy (queueing, restart wait, phase transitions, UI state decisions) remains embedded in `src/app/page.tsx`.
  Evidence: `src/features/agents/operations/deleteAgentTransaction.ts` is unit-tested, while `handleDeleteAgent` and `handleRenameAgent` in `src/app/page.tsx` still own end-to-end control flow.

- Observation: page-level churn remains high, increasing risk for any mutation-flow feature work.
  Evidence: `git rev-list --count HEAD -- src/app/page.tsx` returned `157`.

- Observation: repository-wide typecheck is currently red for unrelated baseline issues.
  Evidence: `npm run typecheck` reports pre-existing errors in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts`.

- Observation: Mutation status-line text logic can be expressed as a pure helper without React state dependencies.
  Evidence: `resolveConfigMutationStatusLine` in `src/features/agents/operations/configMutationWorkflow.ts` now reproduces queued/mutating/awaiting strings from page-level conditional branches.

- Observation: Page handlers now consume workflow outcomes via a single post-run effects helper instead of duplicating completion vs awaiting-restart branches.
  Evidence: `resolveConfigMutationPostRunEffects` is used by both `handleDeleteAgent` and `handleRenameAgent` in `src/app/page.tsx`.

- Observation: Queue-gating and lock-screen status parity can be regression-guarded without rendering React components by asserting policy helpers directly.
  Evidence: new `preserves queue gating...` and `preserves lock-screen status text parity...` cases in `tests/unit/configMutationWorkflow.integration.test.ts`.

## Decision Log

- Decision: Use a dependency-injected mutation workflow module rather than moving rename/delete into another React hook.
  Rationale: Dependency injection enables deterministic unit tests for policy decisions without React lifecycle setup.
  Date/Author: 2026-02-13 / Codex

- Decision: Keep `useConfigMutationQueue` and `useGatewayRestartBlock` as infrastructure primitives, and route policy decisions through new workflow helpers.
  Rationale: These primitives already encode shared mechanics; the missing boundary is decision sequencing, not queue/restart plumbing itself.
  Date/Author: 2026-02-13 / Codex

- Decision: Preserve existing user-facing strings and modal phases unless tests prove an intentional change.
  Rationale: The goal is architectural separation with behavior parity.
  Date/Author: 2026-02-13 / Codex

- Decision: Treat current repo-wide typecheck failures as baseline and verify milestones using targeted tests plus explicit reporting of the baseline failure.
  Rationale: Fixing unrelated type issues would hide the scope of this refactor.
  Date/Author: 2026-02-13 / Codex

- Decision: Include status-line and awaiting-restart patch helpers in the workflow module during Milestone 1.
  Rationale: This keeps Milestone 2 page wiring focused on replacing inline branches rather than adding new behavior in the same change.
  Date/Author: 2026-02-13 / Codex

- Decision: Add `resolveConfigMutationPostRunEffects` as the sole mapping from workflow disposition to page side effects.
  Rationale: A dedicated mapping keeps page callbacks thin and guarantees rename/delete parity for reload/clear/awaiting transitions.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

Rename/delete restart policy is now orchestrated through `src/features/agents/operations/configMutationWorkflow.ts`, while `src/app/page.tsx` handlers keep only UI state transitions and side-effect invocations. The inline local/remote branching in both rename and delete handlers was replaced with workflow execution + shared post-run effect mapping. Lock-screen status messaging for queued/mutating/awaiting-restart states now comes from a shared pure helper, preserving prior user-facing strings.

Regression coverage now includes:
- workflow disposition-to-effects mapping for awaiting-restart vs completed outcomes;
- queue gating when restart block is active;
- status-line parity across queued, mutating, and both awaiting-restart sub-phases.

Verification summary:
- Targeted test bundles for workflow, delete operations/transactions, gate policy, and restart policy passed.
- `npm run typecheck` remains red only for pre-existing baseline errors in `src/features/agents/state/transcript.ts` and `tests/unit/gatewayProxy.test.ts`.
- Beads milestones `bd-2vb`, `bd-bz3`, and `bd-fmk` are all closed; `br sync --flush-only` succeeded with no dirty issues.

## Context and Orientation

In this repository, a config mutation is a gateway-side operation that changes agent configuration and may require a gateway restart before the UI can trust fresh state. The affected user flows are:

1. Rename agent from settings panel.
2. Delete agent from settings panel.
3. Wait for mutation queue to execute only when gateway is connected and no runs are active.
4. For remote gateway modes, optionally wait for disconnect/reconnect before finalizing UI state.

The key modules and boundaries are:

- `src/app/page.tsx`: currently owns `handleDeleteAgent`, `handleRenameAgent`, mutation block state, queue invocation, restart transitions, and lock-screen status text derivation.
- `src/features/agents/operations/useConfigMutationQueue.ts`: serializes queued config mutations when policy gates pass.
- `src/features/agents/operations/useGatewayRestartBlock.ts`: observes disconnect/reconnect and timeout behavior for restart waits.
- `src/features/agents/operations/deleteAgentOperation.ts` and `src/features/agents/operations/deleteAgentTransaction.ts`: delete side effects and transactional recovery internals.
- `src/lib/gateway/gatewayReloadMode.ts`: determines whether remote mutation should await restart.

Today, the boundary violation is that policy and side effects are intertwined inside page callbacks. A novice reader must inspect multiple branches across two large handlers plus restart hooks to understand one mutation.

## Milestones

### Milestone 1: Extract mutation policy into a workflow module

Create a dedicated workflow module under `src/features/agents/operations` for rename/delete sequencing decisions. The module must encode local vs remote handling, restart wait decision points, and standardized outcomes in one place. This milestone should produce failing-first unit tests, then a passing implementation with no page wiring changes yet beyond imports or helper usage needed for compilation.

### Milestone 2: Rewire page handlers to workflow adapters

Replace duplicated decision branches in `handleDeleteAgent` and `handleRenameAgent` with calls to the workflow module. Keep UI state updates in the page, but route decision-making through workflow outputs. This milestone should keep behavior parity, including current status messages and restart modal phases.

### Milestone 3: Add regression coverage and align architecture docs

Add tests for edge conditions that previously depended on inline branches (restart required vs not required, duplicate mutation blocking, status-line parity), then update `ARCHITECTURE.md` to describe the new mutation-workflow boundary so future contributors avoid reintroducing orchestration into the page controller.

## Plan of Work

First, add `src/features/agents/operations/configMutationWorkflow.ts` with explicit input/output contracts for rename/delete orchestration outcomes. This module will be dependency-injected so tests can supply fake side effects and verify policy deterministically.

Second, refactor `src/app/page.tsx` rename/delete paths to call workflow functions instead of embedding policy branches inline. The page remains responsible for rendering and local state transitions, but the “what happens next” decision comes from workflow result objects.

Third, expand tests and docs. Add unit tests for workflow policy, integration-style tests for page adapter mapping behavior, and architecture text that names this workflow module as the policy boundary.

## Concrete Steps

1. From `/Users/georgepickett/openclaw-studio`, claim Milestone 1 and write failing tests first.

    br ready --json
    br update bd-2vb --claim --json
    npm run test -- tests/unit/configMutationWorkflow.test.ts

    Expected before implementation: Vitest reports missing module or missing exports.

2. Implement Milestone 1 workflow module and pass tests.

    npm run test -- tests/unit/configMutationWorkflow.test.ts
    git add src/features/agents/operations/configMutationWorkflow.ts tests/unit/configMutationWorkflow.test.ts
    git commit -m "Milestone 1: Extract rename/delete mutation workflow policy"
    br close bd-2vb --reason "Tests pass, committed" --json

3. Claim Milestone 2 and write failing integration tests around page-adapter behavior.

    br update bd-bz3 --claim --json
    npm run test -- tests/unit/configMutationWorkflow.integration.test.ts

4. Implement Milestone 2 page wiring and verify with targeted suites.

    npm run test -- tests/unit/configMutationWorkflow.integration.test.ts tests/unit/deleteAgentOperation.test.ts tests/unit/deleteAgentTransaction.test.ts tests/unit/configMutationGatePolicy.test.ts tests/unit/gatewayRestartPolicy.test.ts
    git add src/app/page.tsx src/features/agents/operations/configMutationWorkflow.ts tests/unit/configMutationWorkflow.integration.test.ts
    git commit -m "Milestone 2: Route rename/delete page handlers through mutation workflow"
    br close bd-bz3 --reason "Tests pass, committed" --json

5. Claim Milestone 3, add edge regression tests, and update architecture docs.

    br update bd-fmk --claim --json
    npm run test -- tests/unit/configMutationWorkflow.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/configMutationGatePolicy.test.ts tests/unit/gatewayRestartPolicy.test.ts
    git add tests/unit/configMutationWorkflow.integration.test.ts ARCHITECTURE.md
    git commit -m "Milestone 3: Harden mutation restart regressions and document boundary"
    br close bd-fmk --reason "Tests pass, committed" --json

6. Final verification and Beads flush.

    npm run test -- tests/unit/configMutationWorkflow.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/deleteAgentOperation.test.ts tests/unit/deleteAgentTransaction.test.ts tests/unit/configMutationGatePolicy.test.ts tests/unit/gatewayRestartPolicy.test.ts
    npm run typecheck
    br sync --flush-only

## Validation and Acceptance

Milestone 1 verification workflow:

1. Tests to write first in `tests/unit/configMutationWorkflow.test.ts`:
   `it("returns completed for local gateway mutations without restart wait")` must assert remote-restart checks are not invoked when local.
   `it("returns completed for remote mutation when restart wait is not required")` must assert no awaiting-restart phase is requested.
   `it("returns awaiting-restart for remote mutation when restart wait is required")` must assert workflow result requests restart wait.
   `it("maps mutation failures to user-facing errors")` must assert standardized failure message content.
   `it("rejects invalid mutation input before side effects")` must assert dependencies are untouched for invalid IDs/names.
2. Implementation: add `configMutationWorkflow.ts` with dependency-injected orchestration functions.
3. Verification: run `npm run test -- tests/unit/configMutationWorkflow.test.ts`.
4. Commit: `Milestone 1: Extract rename/delete mutation workflow policy`.

Milestone 2 verification workflow:

1. Tests to write first in `tests/unit/configMutationWorkflow.integration.test.ts`:
   `it("delete workflow maps awaiting-restart outcome to awaiting-restart block phase")` must assert page adapter sets the correct phase and `sawDisconnect` reset.
   `it("rename workflow maps completed outcome to load-and-clear flow")` must assert load callback and block clear are invoked for completion outcomes.
   `it("workflow errors clear block and set page error message")` must assert error handling parity for rename/delete adapters.
2. Implementation: wire `handleDeleteAgent` and `handleRenameAgent` in `src/app/page.tsx` to call the workflow module, removing duplicated local/remote branch logic while preserving existing UI states.
3. Verification: run `npm run test -- tests/unit/configMutationWorkflow.integration.test.ts tests/unit/deleteAgentOperation.test.ts tests/unit/deleteAgentTransaction.test.ts tests/unit/configMutationGatePolicy.test.ts tests/unit/gatewayRestartPolicy.test.ts`.
4. Commit: `Milestone 2: Route rename/delete page handlers through mutation workflow`.

Milestone 3 verification workflow:

1. Tests to write first:
   extend `tests/unit/configMutationWorkflow.integration.test.ts` with `it("preserves queue gating when restart block is active")` and `it("preserves lock-screen status text parity across queued/mutating/awaiting phases")`.
2. Implementation: finalize edge-case mapping and update `ARCHITECTURE.md` focused-agent module text to name the mutation workflow boundary explicitly.
3. Verification: run the milestone target test bundle plus `npm run typecheck`; record known baseline typecheck failures if unchanged.
4. Commit: `Milestone 3: Harden mutation restart regressions and document boundary`.

Behavioral acceptance for the full plan:

- Delete flow still asks for confirmation, executes transactional delete, and either completes immediately or waits for restart according to remote reload policy.
- Rename flow still updates name, then either completes immediately or waits for restart according to remote reload policy.
- Queue gating remains unchanged: config mutations wait for connected status, no running agents, and no active restart block.
- Page lock-screen status strings for rename/delete remain semantically equivalent to current behavior.
- Policy logic for rename/delete restart decisions is no longer primarily embedded in page callback branches.

## Idempotence and Recovery

All steps are additive and safe to rerun. Re-running tests is required and idempotent. If a milestone fails partway, keep the branch and restore passing tests before continuing. Do not close a milestone issue until tests pass and commit is created.

If refactoring introduces behavior drift, revert to the previous milestone commit and re-apply in smaller slices: first extract workflow with no page usage changes, then wire delete path, then wire rename path. Keep restart policy logic (`shouldAwaitDisconnectRestartForRemoteMutation`) as the source of truth during migration.

## Artifacts and Notes

Expected output snippet after Milestone 1:

    npm run test -- tests/unit/configMutationWorkflow.test.ts
    ✓ returns completed for local gateway mutations without restart wait
    ✓ returns completed for remote mutation when restart wait is not required
    ✓ returns awaiting-restart for remote mutation when restart wait is required
    ✓ maps mutation failures to user-facing errors
    ✓ rejects invalid mutation input before side effects

Expected final targeted bundle output:

    npm run test -- tests/unit/configMutationWorkflow.test.ts tests/unit/configMutationWorkflow.integration.test.ts tests/unit/deleteAgentOperation.test.ts tests/unit/deleteAgentTransaction.test.ts tests/unit/configMutationGatePolicy.test.ts tests/unit/gatewayRestartPolicy.test.ts
    Test Files  ... passed
    Tests       ... passed

Expected known baseline typecheck note (unless independently fixed during implementation):

    npm run typecheck
    src/features/agents/state/transcript.ts ... TS18047
    tests/unit/gatewayProxy.test.ts ... TS7016/TS7006

## Interfaces and Dependencies

Create `src/features/agents/operations/configMutationWorkflow.ts` with prescriptive exports used by page adapters.

Required contracts:

- `type MutationWorkflowKind = "rename-agent" | "delete-agent"`
- `type MutationWorkflowResult = { disposition: "completed" | "awaiting-restart" }`
- `type MutationWorkflowDeps = { executeMutation: () => Promise<void>; shouldAwaitRemoteRestart: () => Promise<boolean>; }`
- `async function runConfigMutationWorkflow(params: { kind: MutationWorkflowKind; isLocalGateway: boolean }, deps: MutationWorkflowDeps): Promise<MutationWorkflowResult>`
- `function buildConfigMutationFailureMessage(params: { kind: MutationWorkflowKind; error: unknown }): string`

If additional adapter helpers are extracted for page mapping, keep them in the same module or a sibling module under `src/features/agents/operations/` with explicit return types and no direct React imports.

Dependencies to reuse, not duplicate:

- `deleteAgentViaStudio` in `src/features/agents/operations/deleteAgentOperation.ts`
- `renameGatewayAgent` in `src/lib/gateway/agentConfig.ts`
- `shouldAwaitDisconnectRestartForRemoteMutation` in `src/lib/gateway/gatewayReloadMode.ts`
- queue/restart primitives in `src/features/agents/operations/useConfigMutationQueue.ts` and `src/features/agents/operations/useGatewayRestartBlock.ts`

Maintain existing user-facing error/status semantics unless tests intentionally update them.

Revision Note (2026-02-13 04:35Z, Codex): Initial plan authored for rename/delete restart orchestration decoupling with Beads milestones `bd-2vb`, `bd-bz3`, and `bd-fmk`.
Revision Note (2026-02-13 04:37Z, Codex): Marked Milestone 1 complete after adding workflow module, failure-message mapping, and status-line helpers with passing unit tests.
Revision Note (2026-02-13 04:40Z, Codex): Completed Milestone 2 with workflow-driven rename/delete page wiring and passing integration + mutation policy test bundle.
Revision Note (2026-02-13 04:41Z, Codex): Completed Milestone 3 with queue/status regressions in workflow integration tests and architecture boundary update.
Revision Note (2026-02-13 04:42Z, Codex): Final verification completed and plan ready to move into `.agent/done`.
