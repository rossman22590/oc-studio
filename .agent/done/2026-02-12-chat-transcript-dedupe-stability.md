# Stabilize Chat Transcript De-duplication Across Studio and OpenClaw Gateway Sync

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The repository-level source of truth for this plan is `.agent/PLANS.md`, and this document must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, sending one user message should produce one visible user card, even when Studio rehydrates from `chat.history`, retries gateway connections, receives event gaps, or the user clicks “Load more”. The immediate behavior to verify is simple: type one message, press Send once, and observe one user bubble before and after history sync. The longer-term reliability goal is that replayed terminal runtime events (for the same run) do not append duplicate final assistant lines.

## Progress

- [x] (2026-02-12 18:10Z) Traced the full chat flow from `AgentChatPanel` rendering to `sendChatMessageViaStudio`, gateway proxy relays, runtime event handling, and history rehydration.
- [x] (2026-02-12 18:10Z) Identified concrete duplication vectors with file-level evidence and confirmed existing unit-test coverage points for `chatSendOperation`, `runtimeEventBridge`, `chatItems`, and `gatewayRuntimeEventHandler`.
- [x] (2026-02-12 18:20Z) Added failing regression tests for optimistic user duplication, whitespace-variant history merge duplication, duplicate final user card rendering, and replayed terminal chat events.
- [x] (2026-02-12 18:22Z) Implemented canonical user-turn handling: optimistic send now appends only user content, history merge now treats whitespace-equivalent user lines as the same turn, and final item build collapses adjacent duplicate user turns.
- [x] (2026-02-12 18:22Z) Implemented per-run terminal chat replay suppression in runtime chat event handling.
- [x] (2026-02-12 18:23Z) Ran targeted regression suite and full unit suite; updated architecture documentation with transcript ownership and dedupe rules.

## Surprises & Discoveries

- Observation: Studio currently appends optimistic user output twice per send (meta + quoted text) before the gateway acknowledges.
  Evidence: `src/features/agents/operations/chatSendOperation.ts:71` and `src/features/agents/operations/chatSendOperation.ts:77`.

- Observation: History sync rebuilds those same user lines from persisted gateway history and then merges with existing in-memory lines, so optimistic and persisted copies can coexist.
  Evidence: `src/features/agents/state/runtimeEventBridge.ts:212`, `src/features/agents/state/runtimeEventBridge.ts:286`, and `src/features/agents/state/runtimeEventBridge.ts:312`.

- Observation: Runtime chat handler intentionally ignores `role === "user"` messages, so optimistic local append is currently the only immediate user echo path.
  Evidence: `src/features/agents/state/gatewayRuntimeEventHandler.ts:241`.

- Observation: History is reloaded at multiple lifecycle points, including startup, running poll loop, reconciliation, and manual “Load more”, which increases duplicate exposure if merge logic is not canonical.
  Evidence: `src/app/page.tsx:877`, `src/app/page.tsx:1003`, `src/app/page.tsx:1430`, and `src/app/page.tsx:930`.

- Observation: Repository-wide `typecheck` and `lint` currently fail on pre-existing issues unrelated to this change (missing `@types/ws`, existing CommonJS lint rule violations in `server/*` and `scripts/*`).
  Evidence: `npm run typecheck` and `npm run lint` output during verification on 2026-02-12.

## Decision Log

- Decision: Keep optimistic user echo for responsiveness, but stop writing optimistic user metadata (`[[meta]]`) locally.
  Rationale: A local `> user text` line preserves immediate UI feedback while allowing history rehydration to provide the single canonical timestamped user turn, eliminating the specific duplicated meta+text pair shown in the report.
  Date/Author: 2026-02-12 / Codex

- Decision: Add a rendering-level guard to collapse identical consecutive user turns with the same timestamp/text pair.
  Rationale: This is a safety rail that protects the UI from accidental double-emits in future gateway/runtime changes without masking legitimate non-consecutive repeated prompts.
  Date/Author: 2026-02-12 / Codex

- Decision: Add terminal chat replay suppression by run ID in runtime event handling.
  Rationale: Replayed `final`/`aborted`/`error` events for the same run should not append duplicate terminal output after reconnect/gap recovery.
  Date/Author: 2026-02-12 / Codex

- Decision: Keep pre-existing lint/typecheck baseline issues out of scope for this fix.
  Rationale: They are not introduced by this transcript stability change and would broaden the change surface significantly.
  Date/Author: 2026-02-12 / Codex

## Outcomes & Retrospective

Implemented and validated via unit coverage. Studio now treats persisted history as canonical for user-turn metadata while keeping immediate optimistic user echo without writing optimistic user metadata. Whitespace-only differences between optimistic and persisted user turns no longer create duplicate user cards, and replayed terminal chat events for the same run are ignored. Full unit suite is green (`npm test`). Residual gap: live connected-gateway manual UI smoke was not executed in this run.

## Context and Orientation

The transcript displayed in Studio is produced from `agent.outputLines` and rendered by `AgentChatPanel` through `buildFinalAgentChatItems`.

The send path starts in `src/app/page.tsx` (`handleSend`) and calls `src/features/agents/operations/chatSendOperation.ts` (`sendChatMessageViaStudio`). That operation updates runtime state and appends optimistic lines before issuing `chat.send` with `idempotencyKey = runId`.

Gateway events pass through the same-origin proxy (`server/index.js` + `server/gateway-proxy.js`) to the upstream OpenClaw gateway unchanged. Client-side event routing lives in `src/features/agents/state/gatewayRuntimeEventHandler.ts` and `src/features/agents/state/runtimeEventBridge.ts`.

Persisted history rehydration happens in `loadAgentHistory` (`src/app/page.tsx`) via `chat.history`, then `buildHistorySyncPatch`, which rebuilds line format and merges with in-memory lines.

Key files in scope for this fix are:

- `src/features/agents/operations/chatSendOperation.ts`
- `src/features/agents/state/runtimeEventBridge.ts`
- `src/features/agents/state/gatewayRuntimeEventHandler.ts`
- `src/features/agents/components/chatItems.ts`
- `tests/unit/chatSendOperation.test.ts`
- `tests/unit/runtimeEventBridge.test.ts`
- `tests/unit/gatewayRuntimeEventHandler.chat.test.ts`
- `tests/unit/chatItems.test.ts`
- `ARCHITECTURE.md`

## Plan of Work

Milestone 1 codifies regressions before code changes. Add tests that fail under current behavior: one for optimistic user duplication after history rehydration and one for duplicated terminal outputs on replayed runtime events.

Milestone 2 implements the canonical user-turn strategy. Modify the send operation so optimistic write includes only the user content line (`> text`) and not optimistic user metadata. Keep history metadata canonical by allowing `chat.history` to provide the timestamped user line once. Add a small rendering guard in `buildFinalAgentChatItems` to skip identical consecutive user items where both normalized text and timestamp match.

Milestone 3 hardens runtime replay handling. In `createGatewayRuntimeEventHandler`, track terminal chat processing per run and ignore repeated terminal chat events (`final`, `aborted`, `error`) for a run already finalized. Clear the tracking state via existing `clearRunTracking` and `dispose` paths so new runs are unaffected.

Milestone 4 validates behavior and updates architecture documentation. Confirm the duplicate screenshot scenario no longer reproduces under normal send, history polling, and manual `Load more`, and record the canonical transcript ownership model in `ARCHITECTURE.md`.

## Concrete Steps

Run all commands from `/Users/georgepickett/.codex/worktrees/ccdd/openclaw-studio`.

1. Create failing tests first.
   - Edit `tests/unit/chatSendOperation.test.ts` to assert only one optimistic user append line for non-error sends.
   - Edit `tests/unit/runtimeEventBridge.test.ts` to assert that current optimistic `> text` plus persisted user history produces a single user turn after `buildHistorySyncPatch`.
   - Edit `tests/unit/gatewayRuntimeEventHandler.chat.test.ts` to assert replayed terminal event for same run does not append duplicate assistant terminal lines.
   - Edit `tests/unit/chatItems.test.ts` to assert identical consecutive user items with matching timestamp/text are collapsed at render-item build time.

2. Confirm failures before implementation.

    npm test -- tests/unit/chatSendOperation.test.ts tests/unit/runtimeEventBridge.test.ts tests/unit/gatewayRuntimeEventHandler.chat.test.ts tests/unit/chatItems.test.ts

   Expected: new assertions fail, existing assertions remain stable.

3. Implement send/history/render/runtime changes in the scoped files.

4. Re-run the same targeted tests until green.

5. Run broader gates.

    npm run typecheck
    npm run lint
    npm test

6. Perform manual smoke check in dev UI.

    npm run dev

   Then send a single prompt in the focused agent chat, wait for history refresh, and verify one user card remains.

7. Update `ARCHITECTURE.md` summary text for transcript ownership and dedupe behavior.

## Validation and Acceptance

Acceptance is behavior-first and must be demonstrated in both automated and manual checks.

For Milestone 1 and Milestone 2:

1. Tests to write first:
   - `tests/unit/chatSendOperation.test.ts` with a test function that verifies optimistic send appends exactly one user-content line and no user meta line.
   - `tests/unit/runtimeEventBridge.test.ts` with a test function that verifies `buildHistorySyncPatch` does not duplicate the user turn when history contains the canonical timestamped message.
   - `tests/unit/chatItems.test.ts` with a test function that verifies duplicate consecutive user cards are not emitted by `buildFinalAgentChatItems`.
2. Implementation:
   - Apply the send-path and rendering-path changes in `chatSendOperation.ts` and `chatItems.ts` (and helper adjustments if required in `runtimeEventBridge.ts`).
3. Verification:
   - Run targeted unit tests and confirm they pass.
4. Commit:
   - Commit with message `Milestone 2: Canonicalize optimistic user turns and prevent duplicate user cards`.

For Milestone 3:

1. Tests to write first:
   - `tests/unit/gatewayRuntimeEventHandler.chat.test.ts` with a test function that sends duplicate terminal chat events for one run and asserts only one terminal append.
2. Implementation:
   - Add per-run terminal replay guard in `gatewayRuntimeEventHandler.ts`, with state cleanup through existing run-clear paths.
3. Verification:
   - Re-run targeted tests plus full unit suite.
4. Commit:
   - Commit with message `Milestone 3: Ignore replayed terminal chat events per run`.

For Milestone 4:

1. Validation:
   - Run `npm run dev`, reproduce previous scenario (single send + wait for history + optionally `Load more`), and confirm no duplicate user card.
2. Documentation:
   - Update `ARCHITECTURE.md` and verify no contradictions with current flow.
3. Commit:
   - Commit with message `Milestone 4: Document transcript dedupe ownership`.

## Idempotence and Recovery

This plan is safe to re-run. Unit-test additions and code changes are additive and deterministic. If a step fails midway:

- Re-run the targeted vitest command to confirm current failing set.
- Re-apply only the incomplete milestone edits.
- Do not delete transcript history or agent runtime state files; recovery is code-level only.

If runtime replay guard introduces false positives, rollback only the guard block in `gatewayRuntimeEventHandler.ts` while keeping Milestone 2 dedupe changes intact, then re-run the targeted tests to isolate the regression.

## Artifacts and Notes

Representative pre-fix duplication path:

    sendChatMessageViaStudio:
      append [[meta]]{"role":"user","timestamp":...}
      append > <user text>

    buildHistoryLines(chat.history):
      append [[meta]]{"role":"user","timestamp":...}
      append > <user text>

    mergeHistoryWithPending(history, current):
      retains both copies when optimistic and persisted sets are both present

Representative rendering path:

    agent.outputLines -> buildFinalAgentChatItems -> AgentChatFinalItems -> UserMessageCard

A duplicate in `outputLines` becomes a duplicate card unless explicitly collapsed.

## Interfaces and Dependencies

No gateway protocol changes are required. This is a Studio-side stabilization change.

Preserve these external method contracts:

- `sendChatMessageViaStudio(params)` in `src/features/agents/operations/chatSendOperation.ts`
- `buildHistorySyncPatch(input)` in `src/features/agents/state/runtimeEventBridge.ts`
- `createGatewayRuntimeEventHandler(deps)` in `src/features/agents/state/gatewayRuntimeEventHandler.ts`
- `buildFinalAgentChatItems(input)` in `src/features/agents/components/chatItems.ts`

New internal behavior requirements:

- Optimistic user send writes only content line (`> text`) until canonical history metadata arrives.
- Consecutive identical user items with same timestamp/text are dropped at render-item build.
- Terminal chat event handling is idempotent per run.

Plan Revision Note: Initial plan drafted on 2026-02-12 to address duplicate user message rendering observed in Studio transcript flow and to harden replay stability.
Plan Revision Note: Updated on 2026-02-12 after implementation to record completed milestones, verification results, and scoped residual risk.
