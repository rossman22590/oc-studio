# Agent-Scoped Cron Composer Modal (Helios-2026-02-11)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `.agent/PLANS.md` from the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, a user who opens settings for a specific agent can create cron jobs directly from that settings panel without chatting with the agent first. If the agent has no cron jobs, the user sees a clear `Create` call-to-action instead of a dead-end empty state. Pressing `Create` opens a guided modal with example templates, then walks the user through task, schedule, and delivery choices, ending with a review screen.

The new behavior is observable in one flow: open agent settings, click `Create` in the `Cron jobs` section, complete the wizard, submit, and immediately see the new job appear in the same agent-scoped list.

## Progress

- [x] (2026-02-11 03:28Z) Read `.agent/PLANS.md` fully and confirmed required ExecPlan sections and test-first milestone rules.
- [x] (2026-02-11 03:28Z) Mapped current cron settings implementation in `src/features/agents/components/AgentInspectPanels.tsx`, `src/app/page.tsx`, and `src/lib/cron/types.ts`.
- [x] (2026-02-11 03:28Z) Verified OpenClaw cron execution constraints from `~/openclaw` so UI plan matches backend behavior (`sessionTarget`/`payload` compatibility and delivery defaults).
- [x] (2026-02-11 03:34Z) Implemented Milestone 1 test-first: added `createCronJob` transport wrapper/types plus `buildCronJobCreateInput` with new unit tests in `tests/unit/cronGatewayClient.test.ts` and `tests/unit/cronCreatePayloadBuilder.test.ts`.
- [x] (2026-02-11 03:37Z) Implemented Milestone 2 test-first: added cron `Create` entry points and guided modal in `AgentSettingsPanel`, with component coverage in `tests/unit/agentSettingsPanel.test.ts`.
- [x] (2026-02-11 03:40Z) Implemented Milestone 3 test-first: added orchestration helper `performCronCreateFlow` (`src/features/agents/operations/cronCreateOperation.ts`), wired create state into `src/app/page.tsx`, and added `tests/unit/cronCreateFlowState.test.ts`.
- [x] (2026-02-11 03:41Z) Implemented Milestone 4 docs + verification: updated `README.md` and `ARCHITECTURE.md`; full `npm run test` passes. `npm run lint` and `npm run typecheck` fail due pre-existing repo issues unrelated to this change.

## Surprises & Discoveries

- Observation: Studio currently supports cron list, run-now, and delete, but not create.
  Evidence: `src/lib/cron/types.ts` exposes `listCronJobs`, `runCronJobNow`, and `removeCronJob`; no `cron.add` wrapper exists.

- Observation: The settings panel’s empty cron state is currently a passive message with no action.
  Evidence: `src/features/agents/components/AgentInspectPanels.tsx` renders `No cron jobs for this agent.` when `cronJobs.length === 0`.

- Observation: Agent scope and execution mode are separate concerns in OpenClaw cron.
  Evidence: OpenClaw enforces `main -> systemEvent` and `isolated -> agentTurn` in `~/openclaw/src/cron/service/jobs.ts`, while agent routing is via `job.agentId` resolution in `~/openclaw/src/cron/isolated-agent/run.ts`.

- Observation: Existing lint and typecheck failures are present outside the cron create changeset.
  Evidence: `npm run lint` fails on legacy `require()` usage in `cli/`, `server/`, and `scripts/`, plus pre-existing `no-explicit-any` in `tests/unit/accessGate.test.ts`; `npm run typecheck` fails on pre-existing `tests/unit/gatewayProxy.test.ts` + `tests/unit/studioSetupPaths.test.ts` issues.

## Decision Log

- Decision: The modal will always create jobs scoped to the currently selected settings agent by setting `agentId` automatically and never exposing agent selection in the form.
  Rationale: The user is already in an agent-specific settings context, so agent scope should be implicit and unambiguous.
  Date/Author: 2026-02-11 / Codex

- Decision: Session execution mode (`main` vs `isolated`) will not be a primary step. The default path will use isolated agent turns, with a tucked-away advanced override.
  Rationale: This keeps the workflow novice-friendly while preserving backend flexibility for power users.
  Date/Author: 2026-02-11 / Codex

- Decision: The first modal screen will be template-driven (examples with icons and accent color) to reduce blank-page friction.
  Rationale: The user asked for “examples of what’s possible” as the home of cron creation.
  Date/Author: 2026-02-11 / Codex

## Outcomes & Retrospective

Implementation outcome: complete for code + automated tests. Agent settings now support cron creation from empty and non-empty states, using a 4-step template-first modal and agent-scoped submission.

Verification outcome: targeted suites and full `npm run test` pass (`64 files / 264 tests`). Full lint/type gates are currently red from existing unrelated issues listed in `Surprises & Discoveries`.

Manual gateway validation was not executed in this run because no live browser+gateway session was available in-tool.

## Context and Orientation

In this repository, the main app screen is assembled in `src/app/page.tsx`. Agent settings UI is rendered by `AgentSettingsPanel` inside `src/features/agents/components/AgentInspectPanels.tsx`. Cron data for settings is loaded in page state and passed into that panel.

A cron job is a scheduled task stored by the OpenClaw gateway. In practice, Studio talks to the gateway over WebSocket methods such as `cron.list`, `cron.run`, and `cron.remove`. Those calls are wrapped in `src/lib/cron/types.ts`.

Two execution styles exist in OpenClaw cron: a main-session system event (`sessionTarget: "main"` with `payload.kind: "systemEvent"`) and an isolated agent turn (`sessionTarget: "isolated"` with `payload.kind: "agentTurn"`). The cron backend enforces those pairings. This plan keeps that complexity mostly hidden from users while still generating valid payloads.

Relevant files for this work:

- `src/lib/cron/types.ts` (gateway transport types and cron RPC wrappers)
- `src/lib/cron/` (new builder/validation helper module for wizard submission)
- `src/features/agents/components/AgentInspectPanels.tsx` (cron section UI, create button, modal integration)
- `src/app/page.tsx` (state orchestration and submit handler for `cron.add`)
- `tests/unit/cronGatewayClient.test.ts` (gateway wrapper tests)
- `tests/unit/agentSettingsPanel.test.ts` (settings panel and modal tests)
- `tests/unit/` (new wizard mapping tests)

Beads note: `.beads/` is not present in this worktree, so no Beads issue setup is required.

## Plan of Work

Milestone 1 establishes the data contract. Add a typed `cron.add` client wrapper in `src/lib/cron/types.ts`, plus a pure helper that converts modal draft state into a gateway-safe create payload. This helper must always inject the selected `agentId` and must normalize schedule and payload choices into valid OpenClaw combinations. The milestone ends when tests fail first, then pass, proving payload generation is deterministic and valid.

Milestone 2 adds the user-facing flow in `AgentSettingsPanel`. Replace the empty-state dead end with a `Create` button, add a header-level create action when jobs exist, and implement a modal wizard whose first screen is template cards with icons and subtle accents. The wizard then captures task text, schedule, optional delivery target, and review. The milestone ends when component tests prove open/close behavior, step progression, and submit gating for required fields.

Milestone 3 wires runtime behavior in `src/app/page.tsx`. Add a create handler that calls `cron.add`, sets busy and error state, and refreshes cron jobs for the selected agent after success. Ensure create cannot race against run/delete actions and that user-facing errors are shown in the same cron settings section. The milestone ends when tests and manual verification prove new jobs appear immediately after creation.

Milestone 4 validates and documents. Run targeted tests, full test suite, lint, and typecheck. Then run one manual browser scenario against a connected gateway to confirm the full workflow. Update docs so users know cron jobs can now be created from agent settings without chat commands.

## Concrete Steps

Run all commands from:
`/Users/georgepickett/.codex/worktrees/c25a/openclaw-studio`

1. Milestone 1 tests first.

   Run:
   `npm run test -- tests/unit/cronGatewayClient.test.ts`

   Add failing test cases in `tests/unit/cronGatewayClient.test.ts`:

   - `creates_job_via_cron_add`
   - `throws_when_create_payload_missing_required_name`

   Add a new test file `tests/unit/cronCreatePayloadBuilder.test.ts` with failing tests:

   - `builds_agent_scoped_isolated_payload_from_template_defaults`
   - `builds_main_system_event_payload_when_advanced_mode_selected`
   - `rejects_invalid_one_time_schedule_input`

2. Milestone 1 implementation.

   Edit `src/lib/cron/types.ts` to add create payload types and `createCronJob` wrapper for gateway method `cron.add`.

   Add `src/lib/cron/createPayloadBuilder.ts` with pure functions that transform modal draft state into a valid gateway payload.

   Re-run:
   `npm run test -- tests/unit/cronGatewayClient.test.ts tests/unit/cronCreatePayloadBuilder.test.ts`

3. Milestone 2 tests first.

   Extend `tests/unit/agentSettingsPanel.test.ts` with failing tests:

   - `shows_create_button_when_no_cron_jobs`
   - `opens_cron_create_modal_from_empty_state_button`
   - `submits_modal_with_agent_scoped_draft`
   - `disables_create_submit_while_create_in_flight`

4. Milestone 2 implementation.

   Edit `src/features/agents/components/AgentInspectPanels.tsx` to:

   - add create entry points in the cron section
   - render modal wizard UI
   - collect draft values and call `onCreateCronJob`

   If file size becomes unwieldy, extract modal UI into:
   `src/features/agents/components/AgentCronCreateModal.tsx`

   Re-run:
   `npm run test -- tests/unit/agentSettingsPanel.test.ts`

5. Milestone 3 tests first.

   Add or extend tests that exercise create orchestration. Preferred approach is a focused unit test around helper logic if page-level rendering is too coupled.

   Candidate file:
   `tests/unit/cronCreateFlowState.test.ts`

   Minimum failing assertions:

   - successful create refreshes list for selected agent
   - create failure surfaces cron error message
   - create is blocked while run/delete busy ids are active

6. Milestone 3 implementation.

   Edit `src/app/page.tsx` to add:

   - create busy state and create handler
   - call to `createCronJob(client, payload)`
   - list refresh and error handling wired into existing cron settings state

   Pass new props from `src/app/page.tsx` into `AgentSettingsPanel`.

   Re-run targeted tests:
   `npm run test -- tests/unit/cronCreatePayloadBuilder.test.ts tests/unit/agentSettingsPanel.test.ts tests/unit/cronGatewayClient.test.ts`

7. Milestone 4 full verification.

   Run:

   - `npm run test`
   - `npm run lint`
   - `npm run typecheck`

8. Manual validation.

   Run:
   `npm run dev`

   In browser:

   - open an agent with zero cron jobs
   - click `Create` in cron section
   - select a template, complete wizard, submit
   - confirm new job appears under that same agent
   - run the new job with existing play button to confirm compatibility with current run flow

9. Documentation updates.

   Update relevant docs, at minimum:

   - `README.md` (cron creation discoverability in settings)
   - `ARCHITECTURE.md` (new modal flow and gateway `cron.add` path)

## Validation and Acceptance

Milestone 1 verification workflow:

1. Tests to write first: gateway create wrapper and payload builder tests named in Concrete Steps.
2. Implementation: add `createCronJob` and builder module.
3. Verification: targeted tests pass.
4. Commit: `Milestone 1: add cron create gateway wrapper and payload builder`.

Milestone 2 verification workflow:

1. Tests to write first: settings panel create button/modal behavior tests.
2. Implementation: add create entry points and modal wizard UI.
3. Verification: `tests/unit/agentSettingsPanel.test.ts` passes.
4. Commit: `Milestone 2: add cron create modal entry points in agent settings`.

Milestone 3 verification workflow:

1. Tests to write first: create orchestration state tests (or helper-level equivalent).
2. Implementation: wire page-level `cron.add` submission and refresh.
3. Verification: targeted tests pass and manual flow works against live gateway.
4. Commit: `Milestone 3: wire cron add submission and refresh in page state`.

Milestone 4 verification workflow:

1. Tests to write first: none required unless docs introduce executable examples.
2. Implementation: docs and polish.
3. Verification: `npm run test`, `npm run lint`, and `npm run typecheck` all pass.
4. Commit: `Milestone 4: document agent-scoped cron creation workflow`.

Final acceptance criteria:

- In `Agent settings -> Cron jobs`, empty state includes a visible `Create` action.
- Clicking `Create` opens a multi-step modal beginning with example templates.
- Submitting the modal creates a cron job with `agentId` set to the selected agent automatically.
- The created job appears in the same agent-scoped list without manual page reload.
- Existing run/delete actions still work for old and newly created jobs.

## Idempotence and Recovery

All create operations are additive and should be safe to retry. If a create submission fails, the modal remains open with the error visible and no local list mutation should be persisted as success. Refreshing cron jobs from gateway after submit is the source-of-truth reconciliation step.

If implementation drifts during refactor, revert only the in-progress milestone changes and re-run the milestone’s failing tests to restore a known baseline before continuing. Avoid deleting existing cron jobs during testing unless they are test fixtures created in the current session.

## Artifacts and Notes

Expected gateway payload shape for default template submission (indented example):

  {
    name: "Morning brief",
    agentId: "agent-1",
    enabled: true,
    schedule: { kind: "cron", expr: "0 7 * * *", tz: "America/Chicago" },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: { kind: "agentTurn", message: "Summarize overnight updates and priorities." },
    delivery: { mode: "announce", channel: "last" }
  }

Expected targeted test transcript pattern after Milestone 1:

  > npm run test -- tests/unit/cronGatewayClient.test.ts tests/unit/cronCreatePayloadBuilder.test.ts
  ...
  ✓ tests/unit/cronGatewayClient.test.ts (...)
  ✓ tests/unit/cronCreatePayloadBuilder.test.ts (...)

## Interfaces and Dependencies

Add these interfaces in `src/lib/cron/types.ts`:

- `type CronJobCreateInput = { name: string; agentId: string; enabled?: boolean; schedule: CronSchedule; sessionTarget: "main" | "isolated"; wakeMode: "now" | "next-heartbeat"; payload: CronPayload; delivery?: CronDelivery; description?: string; deleteAfterRun?: boolean }`
- `const createCronJob = async (client: GatewayClient, input: CronJobCreateInput): Promise<CronJobSummary>`

Add these interfaces in `src/lib/cron/createPayloadBuilder.ts`:

- `type CronCreateTemplateId = "morning-brief" | "reminder" | "weekly-review" | "inbox-triage" | "custom"`
- `type CronCreateDraft = { templateId: CronCreateTemplateId; name: string; taskText: string; scheduleKind: "at" | "every" | "cron"; scheduleAt?: string; everyAmount?: number; everyUnit?: "minutes" | "hours" | "days"; cronExpr?: string; cronTz?: string; deliveryMode?: "announce" | "none"; deliveryChannel?: string; deliveryTo?: string; advancedSessionTarget?: "main" | "isolated"; advancedWakeMode?: "now" | "next-heartbeat" }`
- `const buildCronJobCreateInput = (agentId: string, draft: CronCreateDraft, nowMs?: number): CronJobCreateInput`

UI dependencies:

- Reuse `lucide-react` icons already in the repo for template cards.
- Reuse existing modal style patterns (`fixed inset-0`, `bg-background/70`, `backdrop-blur-sm`) for visual consistency with current overlays.

Plan revision note: Initial plan authored from the user-requested cron-creation UX discussion, with agent scope made implicit and session-mode complexity moved to an advanced path.
