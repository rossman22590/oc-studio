# Simplify Agent Creation to Starter Kits While Preserving Reliability

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `/Users/georgepickett/openclaw-studio/.agent/PLANS.md`, and this document must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, creating an agent in Studio will feel as fast and clear as cron creation. A user will choose a starter kit, choose a control level, optionally tweak a few fields, and create the agent without filling out long strategic forms. The existing reliability work remains intact: if setup application fails after `agents.create`, Studio still preserves pending setup state, supports retry and discard, and prevents duplicate setup execution.

The user-visible behavior to validate is simple. From the fleet sidebar, clicking `New Agent` opens a compact flow that can be completed in under a minute, and the resulting agent still gets correct per-agent files, per-agent config overrides, and per-agent exec approvals policy.

## Progress

- [x] (2026-02-12 20:20Z) Audited current branch versus `main` and identified the specific complexity hotspot in `AgentCreateModal` and related compiler types.
- [x] (2026-02-12 20:27Z) Verified OpenClaw gateway constraints from source: `agents.create` is minimal while per-agent sandbox/tools/approvals are supported and must remain valid.
- [x] (2026-02-12 13:33Z) Milestone 1 complete: introduced starter-kit and control-level draft model in compiler/types, added preset control resolver, and validated deterministic compile behavior with updated tests.
- [x] (2026-02-12 13:36Z) Milestone 2 complete: replaced the creation modal with a starter-kit/control-level/customize/review flow and added advanced controls toggle with updated modal tests.
- [x] (2026-02-12 21:33Z) Milestone 3 complete: create submission now always compiles guided starter payloads, setup apply ordering is covered by tests, and pending setup recovery behavior remains intact.
- [x] (2026-02-12 21:42Z) Milestone 4 complete: dead basic payload branch removed, docs updated for starter-kit flow, and verification run with baseline-only lint/typecheck issues documented.

## Surprises & Discoveries

- Observation: the current guided flow requires outcome fields that are high-friction for first-time users, including minimum counts for success criteria and non-goals.
  Evidence: `/Users/georgepickett/openclaw-studio/src/features/agents/components/AgentCreateModal.tsx` enforces required counts before allowing next-step progression.

- Observation: most of the complexity in the branch is orchestration and reliability, not pure UI.
  Evidence: `git diff --stat main...HEAD` shows large additions in retry, pending setup persistence, approval state, and restart handling in `/Users/georgepickett/openclaw-studio/src/app/page.tsx` and `src/features/agents/creation/*`.

- Observation: OpenClaw itself already supports the precise runtime knobs needed for template defaults, so starter kits can map to real mechanics instead of cosmetic personas.
  Evidence: per-agent sandbox and tool profile types in `/Users/georgepickett/openclaw/src/config/types.agents.ts` and tool profile/group behavior in `/Users/georgepickett/openclaw/src/agents/tool-policy.ts`.

- Observation: compile behavior depends on `draft.controls`, so starter/control changes require synchronized controls unless UI updates controls on selection change.
  Evidence: initial starter mapping tests failed until controls were set via `resolveGuidedControlsForPreset`.

- Observation: updating agent config via whole-config writes is fragile when `config.get` includes redacted non-agent fields.
  Evidence: tests in `/Users/georgepickett/openclaw-studio/tests/unit/gatewayAgentOverrides.test.ts` now assert `config.patch` payloads only include `agents.list` and omit redacted model fields.

## Decision Log

- Decision: keep pending-setup retry/discard and reconnect/restart recovery behavior as-is while redesigning creation UX.
  Rationale: this is valuable reliability infrastructure and independent from onboarding complexity.
  Date/Author: 2026-02-12 / Codex

- Decision: move from configuration-first onboarding to a starter-kit plus control-level model, with minimal optional edits and an advanced section.
  Rationale: users should not need to define governance-heavy fields before first value.
  Date/Author: 2026-02-12 / Codex

- Decision: compile starter selections into the same existing output surfaces (agent files, `agents.list` overrides, and exec approvals) to avoid introducing a second runtime path.
  Rationale: preserves proven integration points and reduces migration risk.
  Date/Author: 2026-02-12 / Codex

- Decision: add `resolveGuidedControlsForPreset` and keep `compileGuidedAgentCreation` output shape stable while shifting draft semantics to starter/control-first.
  Rationale: this allows UI simplification without rewriting apply/retry plumbing.
  Date/Author: 2026-02-12 / Codex

- Decision: remove the old basic-vs-guided decision step in the modal and always submit guided payloads from a compact starter flow.
  Rationale: one clear path reduces cognitive load and keeps onboarding aligned with cron-composer simplicity.
  Date/Author: 2026-02-12 / Codex

## Outcomes & Retrospective

- Milestone 1 outcome: compiler/types now support starter kit and control level fields (`researcher`, `engineer`, `marketer`, `chief-of-staff`, `blank`; `conservative`, `balanced`, `autopilot`) while preserving existing output contract (`files`, `agentOverrides`, `execApprovals`, `summary`, `validation`). Validation command: `npx vitest run tests/unit/agentCreationCompiler.test.ts tests/unit/createAgentOperation.test.ts`.
- Milestone 2 outcome: modal complexity dropped to four concise steps (starter, control, customize, review) and test coverage now validates starter/control selection, summary rendering, advanced tool additions, and submit payload shape. Validation command: `npx vitest run tests/unit/agentCreateModal.test.ts tests/unit/fleetSidebar-create.test.ts`.
- Milestone 3 outcome: create submit path now always sends guided starter payloads, apply sequencing is validated (files + approvals before overrides), and recovery tests remain green for reconnect/manual retry/store behavior. Validation command: `npx vitest run tests/unit/createAgentOperation.test.ts tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupStore.test.ts tests/unit/pendingGuidedSetupRetry.test.ts`.
- Milestone 4 outcome: docs now describe the starter-kit/control-level flow and gateway config patch semantics, with targeted suite green. `npm run typecheck` and `npm run lint` still fail on pre-existing baseline issues outside touched files (`tests/unit/gatewayProxy.test.ts` ws typings, CJS `require()` lint in server/scripts files, and `tests/unit/accessGate.test.ts` explicit `any`), with no new lint/typecheck failures in touched files.

## Context and Orientation

The current creation entry point is the `New Agent` button in `/Users/georgepickett/openclaw-studio/src/features/agents/components/FleetSidebar.tsx`. It opens `/Users/georgepickett/openclaw-studio/src/features/agents/components/AgentCreateModal.tsx`, which now runs a compact starter flow (starter kit -> control level -> customize -> review). Selections compile through `/Users/georgepickett/openclaw-studio/src/features/agents/creation/compiler.ts` and submit through `/Users/georgepickett/openclaw-studio/src/app/page.tsx`.

In this repository, “guided setup” means the set of writes performed after `agents.create`: file writes to `AGENTS.md` and related files, per-agent overrides in gateway config, and per-agent exec approvals policy. Those writes are orchestrated in `/Users/georgepickett/openclaw-studio/src/features/agents/operations/createAgentOperation.ts` and `/Users/georgepickett/openclaw-studio/src/lib/gateway/agentConfig.ts` plus `/Users/georgepickett/openclaw-studio/src/lib/gateway/execApprovals.ts`.

A “pending setup” means setup payloads stored when create succeeded but setup application did not complete. Pending setup state is persisted in session storage by `/Users/georgepickett/openclaw-studio/src/features/agents/creation/pendingSetupStore.ts`, retried by helpers in `/Users/georgepickett/openclaw-studio/src/features/agents/creation/pendingSetupRetry.ts`, and surfaced in the focused chat area through logic in `/Users/georgepickett/openclaw-studio/src/app/page.tsx`.

The OpenClaw gateway contract remains the hard constraint. `agents.create` only requires `name` and `workspace` at protocol level, while sandbox/tools/approval detail is added later via config patching and approvals API. That contract is defined in `/Users/georgepickett/openclaw/src/gateway/protocol/schema/agents-models-skills.ts` and enforced server-side in `/Users/georgepickett/openclaw/src/gateway/server-methods/agents.ts`.

## Plan of Work

Milestone 1 introduces a new creation domain shape that represents what users choose in a compact flow: starter kit, control level, and a tiny set of optional customization fields. The compiler remains the single place that turns user intent into concrete files plus gateway overrides plus approvals policy. This milestone deliberately keeps output plumbing compatible with existing setup application logic.

Milestone 2 replaces the current modal experience with a compact sequence that mirrors the cron composer’s ergonomics. The user should answer only the minimum essential questions up front. Advanced controls are still available, but hidden behind an explicit expansion so default onboarding stays lightweight.

Milestone 3 rethreads submit and retry orchestration so the simplified payload still uses existing reliability behavior. No duplicate setup paths should be introduced. Existing pending setup persistence and retry guards should continue working without semantic drift.

Milestone 4 removes obsolete guided-only constructs, aligns documentation, and verifies behavior with targeted and broader tests. The end state should have less code and fewer required inputs while preserving runtime correctness.

## Concrete Steps

Working directory for all commands:

    /Users/georgepickett/openclaw-studio

Milestone 1 commands:

    npx vitest run tests/unit/agentCreationCompiler.test.ts tests/unit/createAgentOperation.test.ts

Expected pre-implementation signal: existing compiler assertions fail after adding new starter/control types but before implementing compile mapping updates.

Milestone 2 commands:

    npx vitest run tests/unit/agentCreateModal.test.ts tests/unit/fleetSidebar-create.test.ts

Expected pre-implementation signal: modal tests fail because required fields and step semantics changed.

Milestone 3 commands:

    npx vitest run tests/unit/createAgentOperation.test.ts tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupStore.test.ts tests/unit/pendingGuidedSetupRetry.test.ts

Expected pre-implementation signal: recovery tests fail if payload shape changes are not correctly wired through page orchestration.

Milestone 4 commands:

    npm run typecheck
    npx vitest run tests/unit/agentCreateModal.test.ts tests/unit/agentCreationCompiler.test.ts tests/unit/createAgentOperation.test.ts tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupStore.test.ts tests/unit/pendingGuidedSetupRetry.test.ts tests/unit/gatewayAgentOverrides.test.ts tests/unit/agentChatPanel-approvals.test.ts
    npm run lint

Expected final signal: all targeted tests pass and typecheck passes. If lint reports unrelated pre-existing baseline issues, document them explicitly and confirm no new lint failures in touched files.

## Validation and Acceptance

### Milestone 1: Starter-kit compile model

Acceptance criteria are behavioral. Given a starter kit and control level, compilation must produce deterministic file content, deterministic per-agent overrides, and deterministic approvals policy. Defaults must map to valid OpenClaw config values.

1. Tests to write first: update `/Users/georgepickett/openclaw-studio/tests/unit/agentCreationCompiler.test.ts` to assert compile output for at least these combinations: `researcher + conservative`, `engineer + balanced`, and `marketer + conservative`. Add assertions for sandbox mode, workspace access, tool profile, additive tool allowances, and approvals defaults.
2. Implementation: update `/Users/georgepickett/openclaw-studio/src/features/agents/creation/types.ts` and `/Users/georgepickett/openclaw-studio/src/features/agents/creation/compiler.ts` to define new starter/control inputs and mapping functions. Keep compiler output shape compatible with `AgentGuidedSetup` application.
3. Verification: run `npx vitest run tests/unit/agentCreationCompiler.test.ts tests/unit/createAgentOperation.test.ts` and confirm green.
4. Commit: commit with message `Milestone 1: add starter-kit compile model`.

### Milestone 2: Compact creation modal UX

Acceptance criteria are user-observable. The modal should require fewer inputs, move through a short flow, and present an understandable behavior summary without requiring long freeform strategy text.

1. Tests to write first: update `/Users/georgepickett/openclaw-studio/tests/unit/agentCreateModal.test.ts` to assert step progression for starter-kit selection, control-level selection, and final submission payload; keep one test for advanced edit behavior if advanced is exposed.
2. Implementation: refactor `/Users/georgepickett/openclaw-studio/src/features/agents/components/AgentCreateModal.tsx` to remove the long outcome/identity requirement model and introduce starter/control-first steps plus compact optional customization.
3. Verification: run `npx vitest run tests/unit/agentCreateModal.test.ts tests/unit/fleetSidebar-create.test.ts` and confirm green.
4. Commit: commit with message `Milestone 2: simplify agent create modal flow`.

### Milestone 3: Submission and reliability continuity

Acceptance criteria are operational. Simplified creation payloads must still go through the same create/setup/retry lifecycle, including pending setup persistence and retry/discard controls.

1. Tests to write first: update `/Users/georgepickett/openclaw-studio/tests/unit/createAgentOperation.test.ts` and `/Users/georgepickett/openclaw-studio/tests/unit/guidedSetupRecovery.test.ts` so they validate setup apply order and pending setup recovery with the new payload shape.
2. Implementation: adjust `/Users/georgepickett/openclaw-studio/src/app/page.tsx` and `/Users/georgepickett/openclaw-studio/src/features/agents/operations/createAgentOperation.ts` only where needed to consume new compile inputs while preserving retry guards and pending setup state behavior.
3. Verification: run `npx vitest run tests/unit/createAgentOperation.test.ts tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupStore.test.ts tests/unit/pendingGuidedSetupRetry.test.ts` and confirm green.
4. Commit: commit with message `Milestone 3: preserve setup recovery with simplified create payload`.

### Milestone 4: Cleanup, docs, and full validation

Acceptance criteria are maintainability and clarity. Obsolete guided-only types and copy are removed, docs describe the new flow accurately, and test/type gates pass.

1. Tests to write first: add or update assertions in existing test files to ensure legacy heavy required fields are no longer enforced.
2. Implementation: remove dead guided-only branches from `/Users/georgepickett/openclaw-studio/src/features/agents/creation/types.ts`, update user-facing docs in `/Users/georgepickett/openclaw-studio/README.md`, and refresh architecture notes in `/Users/georgepickett/openclaw-studio/ARCHITECTURE.md`.
3. Verification: run the full Milestone 4 command set and capture outcomes in this ExecPlan.
4. Commit: commit with message `Milestone 4: document and validate simplified agent creation`.

## Idempotence and Recovery

This plan is safe to run repeatedly. UI refactors and compiler changes are additive until cleanup milestones remove dead code. Pending setup storage and retry behavior must remain backward-compatible for in-progress browser tabs where old pending entries may still exist. Parser logic in `/Users/georgepickett/openclaw-studio/src/features/agents/creation/pendingSetupStore.ts` should continue to accept existing persisted payload shape or fail safely by ignoring malformed entries.

If a milestone fails mid-implementation, rerun the milestone’s test command first to re-establish a known failing or passing state, then continue. Do not delete pending setup persistence or retry guards as a shortcut; these are required recovery features.

## Artifacts and Notes

Implementation should capture concise evidence in plan updates, using short command transcripts such as:

    $ npx vitest run tests/unit/agentCreateModal.test.ts
    ✓ tests/unit/agentCreateModal.test.ts (6)

And behavior evidence notes such as:

    New modal flow observed: starter selection -> control level -> review -> create.
    No required success-criteria/non-goal form blocks remain.

## Interfaces and Dependencies

The implementation should define a stable creation-intent interface in `/Users/georgepickett/openclaw-studio/src/features/agents/creation/types.ts` with explicit starter and control enums that are independent from raw gateway knobs.

At minimum, the compiler entry point in `/Users/georgepickett/openclaw-studio/src/features/agents/creation/compiler.ts` must continue to return one object that includes file content, per-agent override payload, approvals payload, validation output, and summary text. This preserves downstream dependencies in `/Users/georgepickett/openclaw-studio/src/app/page.tsx` and `/Users/georgepickett/openclaw-studio/src/features/agents/operations/createAgentOperation.ts`.

Gateway write paths remain unchanged in architecture terms. `updateGatewayAgentOverrides` in `/Users/georgepickett/openclaw-studio/src/lib/gateway/agentConfig.ts` must continue to enforce mutually exclusive `allow` and `alsoAllow` semantics and continue to write via config patch with base hash.

No new persistence surfaces should be added. Continue using existing tab-scoped session storage and existing retry guard sets in `/Users/georgepickett/openclaw-studio/src/app/page.tsx`.

## Plan Revision Note

2026-02-12 20:31Z: Initial ExecPlan drafted from current branch analysis and user direction to simplify agent creation while preserving reliability infrastructure. This revision establishes the milestone structure, validation commands, and file-level scope for implementation.
2026-02-12 13:33Z: Updated plan after Milestone 1 implementation with progress, decisions, discoveries, and verification evidence.
2026-02-12 13:36Z: Updated plan after Milestone 2 implementation with modal simplification outcomes and verification evidence.
2026-02-12 21:33Z: Updated plan after Milestone 3 implementation with payload simplification, setup-order verification, and recovery test evidence.
2026-02-12 21:42Z: Updated plan after Milestone 4 implementation with docs alignment and final validation outcomes (including baseline lint/typecheck constraints).
