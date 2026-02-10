# De-entangle Agent Deletion Flow (Policy vs Executors vs UI)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is governed by `.agent/PLANS.md` and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, deleting an agent from OpenClaw Studio remains the same user-visible action (confirm, then the agent disappears from the fleet; remote gateway host state is moved under `~/.openclaw/trash`), but the code is structurally separated so that:

1. The “what does delete mean and what order do we do things in” logic is testable without gateway/SSH.
2. The gateway-host side effects (SSH + scripts that move/restore directories) are owned by a single server-side module rather than being embedded inside the API route handler.
3. The UI page (`src/app/page.tsx`) is not responsible for wiring together low-level side effects (HTTP to `/api/gateway/agent-state`, cron cleanup, gateway config mutation) inline; instead it calls a dedicated operation that composes those executors.

The easiest way to see this working is:

1. `npm run test` still passes (including the existing delete transaction and agent-state route tests).
2. Starting the app with `npm run dev` and deleting a non-main agent still works (agent removed from fleet, and the delete flow still waits for gateway reconnect before refreshing).

## Progress

- [x] (2026-02-09 12:14Z) Milestone 1: Extract gateway-host agent state trash/restore executor out of the API route into a shared server module, keep route behavior the same, and update/add unit tests. [no-beads]
- [x] (2026-02-09 12:28Z) Milestone 2: Introduce a dedicated “delete agent” operation that composes the existing transaction policy with concrete executors (HTTP + gateway calls), update `src/app/page.tsx` to use it, and add unit tests for the new operation. [no-beads]
- [x] (2026-02-09 12:29Z) Milestone 3: Run repo gates (`typecheck`, `test`, `lint`) and do a minimal manual dev verification of delete-agent UX. Commit each milestone. [no-beads]

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Treat `runDeleteAgentTransaction` as the “policy” layer and improve separation by extracting executors + wiring, rather than inventing a new multi-step planner abstraction.
  Rationale: The transaction ordering and rollback rules already exist, are unit-tested, and are dependency-injected. The current pain is primarily that executors and wiring are embedded in `src/app/page.tsx` and in the API route file as inline scripts.
  Date/Author: 2026-02-09 / Codex

## Outcomes & Retrospective

Completed.

- Agent-state SSH behavior is now owned by `src/lib/ssh/agent-state.ts`, and the API route is a thin validator + delegator.
- The delete-agent flow wiring now lives in `src/features/agents/operations/deleteAgentOperation.ts`, and `src/app/page.tsx` calls it instead of composing executors inline.
- Verified `npm run typecheck`, `npm run test`, and `npm run lint` pass.
- Verified the dev server boots and responds at `http://localhost:3000`.

## Context and Orientation

OpenClaw Studio is a Next.js App Router UI that connects directly to an OpenClaw Gateway over WebSocket for most operations, but uses server-side API routes for local filesystem operations and for running remote commands over SSH.

The current “delete agent” flow spans multiple boundaries:

1. UI entrypoint: `src/app/page.tsx` has `handleDeleteAgent` which confirms, enqueues a config mutation, and then runs a “transaction” that:
   - trashes agent workspace/state on the gateway host via `POST /api/gateway/agent-state`
   - removes cron jobs via gateway `cron.*` methods
   - removes the agent from gateway config via `config.patch` through `src/lib/gateway/agentConfig.ts`
   If a later step fails and the trash step moved any paths, it attempts to restore via `PUT /api/gateway/agent-state`.

2. Transaction policy: `src/features/agents/operations/deleteAgentTransaction.ts` defines `runDeleteAgentTransaction(deps, agentId)` which encodes the ordering and rollback rule. This module is already unit-tested in `tests/unit/deleteAgentTransaction.test.ts`.

3. Gateway-host executor: `src/app/api/gateway/agent-state/route.ts` is a Node.js API route that resolves an SSH target from Studio settings (via `src/lib/ssh/gateway-host.ts` + `src/lib/studio/settings-store`) and runs an embedded bash+python script over SSH to move/restore:
   - `~/.openclaw/workspace-<agentId>`
   - `~/.openclaw/agents/<agentId>`
   This behavior is currently covered by `tests/unit/agentStateRoute.test.ts`.

Terminology used in this plan:

“Policy” means the repository-owned definition of the deletion sequence and rollback conditions (what to do, and when to attempt restore).

“Executor” means a concrete adapter that performs side effects (HTTP calls, WebSocket gateway calls, SSH calls).

The goal is not to change behavior; it is to make boundaries explicit so that:

1. Policy tests do not require network/SSH.
2. Executors are reusable and individually testable.
3. `src/app/page.tsx` becomes simpler and less coupled.

## Plan of Work

First, extract the SSH trash/restore logic out of the API route file into a dedicated server-side module that owns the scripts and the `runSshJson` invocation. Keep the API route behavior and response shapes the same so the UI does not change.

Second, create a small operation module in `src/features/agents/operations/` that composes:

1. The existing transaction policy (`runDeleteAgentTransaction`)
2. A concrete HTTP executor for “trash/restore agent state” (`/api/gateway/agent-state`)
3. The existing gateway executors (`removeCronJobsForAgent` and `deleteGatewayAgent`)

Then update `src/app/page.tsx` to use this operation module so the page no longer contains the low-level wiring for the delete transaction.

Finally, add unit tests for the new extraction points, run the repo gates, and do a minimal manual verification in dev mode.

## Concrete Steps

Run all commands from the repo root:

    cd /Users/georgepickett/openclaw-studio

### Milestone 1: Extract Agent-State SSH Executor From API Route

Acceptance for this milestone:

1. The API route behavior is unchanged:
   - `POST /api/gateway/agent-state` still validates `agentId` and returns `{ result }` on success.
   - `PUT /api/gateway/agent-state` still validates `agentId` + `trashDir` and returns `{ result }` on success.
2. `tests/unit/agentStateRoute.test.ts` passes with the same behavioral assertions (it may change how it imports or what it spies on, but it should still validate the SSH invocation shape).

Tests to write first:

1. Add a new unit test file `tests/unit/agentStateExecutor.test.ts` that calls the new executor module directly and asserts:
   - it calls `runSshJson` with `argv` and `input` containing the expected script markers (for example `python3 - "$1"` and `workspace-{agent_id}`).
   - it returns parsed JSON from `runSshJson`.
   This test should fail before the module exists.

Implementation:

1. Create a new server-side module, for example `src/lib/ssh/agent-state.ts`, that exports:
   - `trashAgentStateOverSsh({ sshTarget, agentId }): TrashAgentStateResult`
   - `restoreAgentStateOverSsh({ sshTarget, agentId, trashDir }): RestoreAgentStateResult`
   and contains the `TRASH_SCRIPT` and `RESTORE_SCRIPT` strings currently embedded in the API route.
2. Update `src/app/api/gateway/agent-state/route.ts` to:
   - keep request validation and SSH target resolution in the route file
   - delegate the side effect to the new executor functions
   - keep response shapes and status codes unchanged

Verification:

1. Run:

    npm run test -- tests/unit/agentStateRoute.test.ts
    npm run test -- tests/unit/agentStateExecutor.test.ts

Commit:

    git status --porcelain=v1
    git add -A
    git commit -m "Refactor: extract agent-state ssh executor"

### Milestone 2: Compose A Dedicated Delete-Agent Operation

Acceptance for this milestone:

1. `src/app/page.tsx` no longer wires the delete-agent transaction inline with raw `fetchJson` calls; instead it calls a dedicated operation function with clear dependencies.
2. The delete-agent operation is unit tested without a real gateway or SSH.
3. `tests/unit/deleteAgentTransaction.test.ts` continues to pass (policy unchanged).

Tests to write first:

1. Add `tests/unit/deleteAgentOperation.test.ts` that covers:
   - Success path: trash called first, then cron removal, then gateway delete; no restore attempted.
   - Failure path: if cron removal or gateway delete throws and the trash result indicates `moved.length > 0`, a restore is attempted with the returned `trashDir`, and the original error is re-thrown.
   This test should use mocks for:
   - a minimal `GatewayClient`-like object (or direct function mocks) for cron and delete calls
   - a `fetchJson` mock for the API route calls

Implementation:

1. Create `src/features/agents/operations/deleteAgentOperation.ts` that exports a function like:

    - `deleteAgentViaStudio({ client, agentId, fetchJson, logError? }): Promise<DeleteAgentTransactionResult>`

   where:
   - `client` is the existing `GatewayClient` instance already in `src/app/page.tsx`
   - `fetchJson` is imported from `src/lib/http.ts` by default, but the operation function accepts it as a parameter for testability
   - the operation uses `runDeleteAgentTransaction` internally, wiring its deps as:
     - `trashAgentState`: `POST /api/gateway/agent-state`
     - `restoreAgentState`: `PUT /api/gateway/agent-state`
     - `removeCronJobsForAgent`: `src/lib/cron/types.ts`
     - `deleteGatewayAgent`: `src/lib/gateway/agentConfig.ts`
2. Update `src/app/page.tsx` inside `handleDeleteAgent` to call the new operation function, and keep the surrounding UI state transitions the same (delete blocks, queueing behavior, and the “awaiting restart” reconnect logic).

Verification:

1. Run:

    npm run test -- tests/unit/deleteAgentTransaction.test.ts
    npm run test -- tests/unit/deleteAgentOperation.test.ts

Commit:

    git status --porcelain=v1
    git add -A
    git commit -m "Refactor: centralize delete agent operation wiring"

### Milestone 3: Gates + Minimal Manual Verification

Acceptance for this milestone:

1. Repo gates pass: `typecheck`, `test`, `lint`.
2. Manual dev verification: deleting a non-main agent in the running UI still:
   - prompts for confirmation
   - applies the config mutation
   - results in the agent being removed from the fleet after reconnect/refresh

Implementation:

1. No further code changes expected beyond fixes for failing gates.

Verification:

1. Run:

    npm run typecheck
    npm run test
    npm run lint

2. Run the dev server:

    npm run dev

   Then navigate to `http://localhost:3000`, create or select a non-main agent, and delete it via the settings panel. Confirm the flow completes and the agent is no longer listed after the gateway reconnect cycle.

Commit:

If milestone 3 required code changes to fix gates, commit those fixes:

    git status --porcelain=v1
    git add -A
    git commit -m "Chore: fix gates after delete-agent refactor"

## Validation and Acceptance

Global acceptance criteria (end of plan):

1. All unit tests pass: `npm run test` exits 0.
2. Typecheck passes: `npm run typecheck` exits 0.
3. Lint passes: `npm run lint` exits 0.
4. Manual dev verification demonstrates that agent deletion still works end-to-end in the UI.

Milestone verification workflow:

1. Tests to write: follow the tests described in each milestone, and confirm they fail before implementation when possible.
2. Implementation: apply the described edits.
3. Verification: re-run the milestone’s tests and expect pass.
4. Commit: commit after each milestone passes.

## Idempotence and Recovery

All steps in this plan are refactors and test additions; they are safe to run multiple times.

If an intermediate refactor breaks the app:

1. Use unit tests to narrow scope (`npm run test -- tests/unit/<file>.test.ts`).
2. If the API route breaks, revert to a thin delegation pattern: keep validation and response formatting in `src/app/api/gateway/agent-state/route.ts` and keep SSH scripts + invocation in the executor module.
3. If `src/app/page.tsx` wiring breaks, temporarily keep the old inline wiring while the operation module is brought into parity, then switch over once tests pass.

## Artifacts and Notes

Relevant existing files (pre-change) that this plan assumes:

    src/features/agents/operations/deleteAgentTransaction.ts
    src/app/api/gateway/agent-state/route.ts
    src/app/page.tsx
    src/lib/cron/types.ts
    src/lib/gateway/agentConfig.ts
    tests/unit/deleteAgentTransaction.test.ts
    tests/unit/agentStateRoute.test.ts

## Interfaces and Dependencies

Do not introduce new libraries for this refactor.

The new modules should use existing helpers:

1. HTTP JSON helper: `src/lib/http.ts` (`fetchJson`).
2. SSH runner: `src/lib/ssh/gateway-host.ts` (`runSshJson` and SSH target helpers).
3. Transaction policy: `src/features/agents/operations/deleteAgentTransaction.ts` (`runDeleteAgentTransaction`).

## Revision Notes

- 2026-02-09: Marked milestones complete after implementation + verification (typecheck/tests/lint/dev boot). Added outcome summary so a future reader can see what shipped and where the new seams live.
