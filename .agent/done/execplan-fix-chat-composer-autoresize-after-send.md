# Fix Agent Chat Composer Textarea Stays Tall After Send

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository’s ExecPlan requirements live at `.agent/PLANS.md` from the repository root. This document must be maintained in accordance with that file.

## Purpose / Big Picture

When a user types a long multi-line message into the agent chat composer and sends it, the textarea clears but sometimes stays visually tall. After this change, sending a message reliably resets the chat composer textarea height back to the single-line height, so the UI does not “stick” at the prior expanded size.

You can see it working by starting the app, typing a message long enough to grow the composer (multiple lines), pressing Send, and observing the composer shrink immediately after the message is sent.

## Progress

- [x] (2026-02-10 21:51Z) Added a focused unit test that reproduces the stale composer height after send.
- [x] (2026-02-10 21:52Z) Fixed resize scheduling in `src/features/agents/components/AgentChatPanel.tsx` to resize after the rendered textarea value updates.
- [x] (2026-02-10 21:53Z) Ran unit tests and started the dev server to confirm the flow works; committed.

## Surprises & Discoveries

- Observation: In `AgentChatPanel`, resize scheduling is keyed on `agent.draft` (prop) but the textarea value is `draftValue` (state). When `agent.draft` is cleared on send, the resize effect runs before the state sync applies, so it measures the old textarea value and leaves the old height.
  Evidence: `src/features/agents/components/AgentChatPanel.tsx` has a `useEffect` that depends on `agent.draft` and schedules `resizeDraft()` via `requestAnimationFrame`, and a separate `useEffect` earlier that syncs `draftValue` from `agent.draft`.

## Decision Log

- Decision: Drive textarea resizing from the rendered textarea value (`draftValue`) rather than from the upstream store draft (`agent.draft`).
  Rationale: The bug is a timing/order issue: measuring the DOM before the value updates produces stale height that never shrinks. Resizing on `draftValue` guarantees the measurement matches what the user sees.
  Date/Author: 2026-02-10 / Codex

## Outcomes & Retrospective

- Added `tests/unit/agentChatPanel-composer-autoresize.test.ts` which fails on the pre-fix implementation (textarea height stays at the pre-send value) and passes after the change.
- Updated `src/features/agents/components/AgentChatPanel.tsx` so textarea resizing is driven from `draftValue` changes (the rendered value) rather than `agent.draft` changes (store prop), eliminating the send-time race.
- Verified `npm test` passes (233 tests) and `npm run dev` starts successfully.

## Context and Orientation

The agent chat UI is implemented in `src/features/agents/components/AgentChatPanel.tsx`.

Key parts:

- `AgentChatComposer` renders the `<textarea>` with `rows={1}` and `value={value}` where `value` is the `draftValue` state in `AgentChatPanel`.
- `AgentChatPanel` keeps:
  - `draftValue` (React state) used as the textarea `value`.
  - `agent.draft` (prop from store) that is updated by upstream operations.
  - `resizeDraft()` which sets `el.style.height` based on `el.scrollHeight`.
- Sending a message is wired from `src/app/page.tsx` into `src/features/agents/operations/chatSendOperation.ts`. That operation clears the store draft immediately on send by dispatching `patch: { draft: \"\" }`. See `sendChatMessageViaStudio()` in `src/features/agents/operations/chatSendOperation.ts`.

Bug shape (as reported):

1. Type a long message so the composer grows tall.
2. Send the message.
3. The textarea clears, but its `style.height` stays at the previous tall value.

Root cause to keep in mind while implementing:

In `AgentChatPanel.tsx`, there is an effect that syncs `draftValue` from `agent.draft`, and another effect that schedules a resize when `agent.draft` changes. Effects run after render in declaration order, so on send the resize can run while the textarea still contains the old `draftValue`, producing a stale large height, and then never re-running after `draftValue` becomes empty.

## Plan of Work

Add a targeted unit test that simulates the send flow and asserts that textarea height shrinks after the draft is cleared. The test should make the height observable by stubbing `scrollHeight` so that “non-empty” returns a larger number and “empty” returns a smaller number.

Then fix the resize scheduling in `src/features/agents/components/AgentChatPanel.tsx` so that the resize runs in response to `draftValue` changes (the actual rendered textarea value), not in response to `agent.draft` changes (which can race with the `draftValue` state sync).

The intent is to keep the change localized: do not introduce new abstraction layers, and avoid adding extra “fallback” behavior. Just make the resize measurement happen after the value is updated.

## Concrete Steps

All commands are from the repository root:

    cd /Users/georgepickett/.codex/worktrees/1461/openclaw-studio

### Milestone 1: Add a failing unit test that reproduces stale height after send

Add `tests/unit/agentChatPanel-composer-autoresize.test.ts` with a test that:

1. Renders `AgentChatPanel` inside a small harness component that owns `agent` state (so the test can simulate upstream store changes by rerendering with `agent.draft` cleared).
2. Stubs `requestAnimationFrame` to run callbacks immediately so the resize scheduling is deterministic.
3. Stubs the textarea’s `scrollHeight` so it is “large” when `textarea.value` is non-empty and “small” when empty.
4. Asserts that after clicking Send (which clears `agent.draft` in the harness), the textarea height is the “small” height.

Suggested harness behavior (keep it minimal):

- Initial agent has `draft` set to a multi-line string so the component will compute a tall height.
- `onSend` updates agent to set `draft: \"\"` (and optionally `status: \"running\"` to match real flow).
- Provide no-op handlers for everything else.

Suggested test name and assertions:

- Test: `resets_textarea_height_after_send_when_draft_is_cleared`
- Assertions:
  - Before send: textarea has `style.height` equal to the “large” stubbed height (for example `\"200px\"`).
  - After send + updates flushed: textarea has `style.height` equal to the “small” stubbed height (for example `\"20px\"`).

Run the test file and confirm it fails before the fix:

    npm test -- tests/unit/agentChatPanel-composer-autoresize.test.ts

Expected failure mode: the final assertion sees the old “large” height.

### Milestone 2: Fix resize scheduling to run on `draftValue` changes

Edit `src/features/agents/components/AgentChatPanel.tsx`:

1. Keep `resizeDraft()` as the one place that sets `textarea.style.height`.
2. Replace the resize scheduling effect that currently keys off `agent.draft` with one that keys off `draftValue` (the textarea’s actual `value` prop).
3. Ensure only one path is responsible for scheduling resize in response to a value change, so the resize is not duplicated (avoid “double scheduling” on each keystroke).

Concrete target behavior:

- When the draft is cleared by upstream send (`agent.draft` becomes `\"\"`), `draftValue` will become `\"\"`, and the resize effect must run after that render, shrinking the textarea height.

Implementation guidance (choose one and be consistent):

- Preferred: Have a single effect that schedules a resize whenever `draftValue` changes, and remove the per-keystroke resize scheduling in `handleComposerChange` so there is one source of truth for scheduling.
- Keep the existing `pendingResizeFrameRef` cancellation behavior so rapid updates do not queue multiple resizes.

After the change, rerun the new unit test:

    npm test -- tests/unit/agentChatPanel-composer-autoresize.test.ts

Then run the full unit suite:

    npm test

### Milestone 3: Manual verification and commit

Start the dev server:

    npm run dev

Manual repro:

1. Open the studio UI (Next dev server prints the URL).
2. Select an agent.
3. Paste/type a multi-line message so the textarea grows taller.
4. Click Send (or press Enter if your flow sends on Enter).
5. Observe the textarea shrinks back to the single-line height immediately after send.

If tests pass and manual behavior is correct, commit with a message like:

    git status
    git add -A
    git commit -m "Fix chat composer autoresize after send"

## Validation and Acceptance

Acceptance is satisfied when all of the following are true:

1. Unit test `resets_textarea_height_after_send_when_draft_is_cleared` passes and fails on main (pre-fix).
2. After sending a long multi-line message in the UI, the composer textarea shrinks back to a single-line height without requiring any extra typing or focus changes.
3. Existing `AgentChatPanel` unit tests still pass (`npm test`).

## Idempotence and Recovery

This change is safe to apply multiple times. If something goes wrong:

- Use `git revert <commit>` to roll back the behavior change.
- The new unit test can be kept; it should continue to encode the desired UX and prevent regressions.

## Artifacts and Notes

Paths referenced:

- `src/features/agents/components/AgentChatPanel.tsx`
- `src/features/agents/operations/chatSendOperation.ts`
- `src/app/page.tsx`
- `tests/unit/agentChatPanel-composer-autoresize.test.ts` (to be added)

## Interfaces and Dependencies

- React 19 (hooks already used in `AgentChatPanel.tsx`).
- Unit testing uses Vitest + JSDOM + Testing Library (`npm test` runs vitest; see `vitest.config.ts` and `tests/setup.ts`).
