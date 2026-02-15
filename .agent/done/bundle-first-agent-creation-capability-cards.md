# Add Preset Bundles and Capability-First Starter Cards for Agent Creation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.agent/PLANS.md`, and this document must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, a user creating an agent in Studio can choose from clear preset bundles that describe real behavior differences, not just role names. The modal will show capability chips and a risk indicator on each option so users understand what will happen before clicking Create. The user-visible outcome is that `New Agent` feels fast and trustworthy: users can compare presets like `PR Engineer` vs `Autonomous Engineer` by concrete mechanics (exec enabled, internet access, sandbox mode, heartbeat default) and still keep the existing reliable setup/retry flow.

The behavior to verify is straightforward. In the create modal, bundle cards are grouped, each card shows capability chips, and selecting a bundle sets starter/control defaults that compile into the same setup artifacts (files, per-agent overrides, exec approvals). If setup apply fails after `agents.create`, pending setup retry/discard behavior remains unchanged.

## Progress

- [x] (2026-02-12 21:53Z) Drafted ExecPlan from current starter/control implementation and validated scope against existing modal/compiler/recovery files.
- [x] (2026-02-12 21:56Z) Milestone 1 complete: added preset-bundle domain types, bundle-to-starter/control mapping helpers, and capability/risk derivation helpers with compiler tests.
- [x] (2026-02-12 21:59Z) Milestone 2 complete: replaced flat starter cards with grouped preset bundles, capability chips, and risk labels in the modal starter step.
- [x] (2026-02-12 21:59Z) Milestone 3 complete: added bundle-originated setup assertions in create/recovery tests and verified pending setup retry path remains unchanged.
- [x] (2026-02-12 22:01Z) Milestone 4 complete: docs updated for preset-bundle/capability-chip UX and final validation suite executed with baseline-only typecheck/lint failures.

## Surprises & Discoveries

- Observation: in OpenClaw, `non-main` sandbox mode intentionally does not sandbox the agent main session; this must be explicit in UX copy to avoid false safety assumptions.
  Evidence: `src/agents/sandbox.resolveSandboxContext.test.ts` in OpenClaw (`does not sandbox the agent main session in non-main mode`).

- Observation: tool profiles are concrete and narrow in OpenClaw (for example, `minimal` allows only `session_status` by default), so internet and filesystem capabilities come from additive entries and not from role text.
  Evidence: `/Users/georgepickett/openclaw/src/agents/tool-policy.ts`.

- Observation: Studio already compiles starter/control into concrete agent overrides and approvals, so capability chips can be computed from compile inputs without touching setup orchestration.
  Evidence: `/Users/georgepickett/openclaw-studio/src/features/agents/creation/compiler.ts` and `/Users/georgepickett/openclaw-studio/src/app/page.tsx`.

## Decision Log

- Decision: keep the two-axis mental model (`starter kit` + `control level`) as the runtime primitive, and add named preset bundles as UI shortcuts.
  Rationale: this preserves existing compiler contracts while reducing user cognitive load.
  Date/Author: 2026-02-12 / Codex

- Decision: capability chips and risk labels must be derived from actual controls/compiled behavior, not hardcoded marketing text.
  Rationale: avoids UI drift and ensures cards always reflect real execution policy.
  Date/Author: 2026-02-12 / Codex

- Decision: do not implement auto-generated “team mode” (coordinator + delegated agents) in this plan.
  Rationale: it introduces orchestration semantics beyond current create flow and would blur scope away from UX simplification.
  Date/Author: 2026-02-12 / Codex

## Outcomes & Retrospective

- Milestone 1 outcome: `AgentPresetBundle` and capability metadata are now first-class in the creation domain, with bundle resolution (`resolveGuidedDraftFromPresetBundle`) and capability/risk derivation (`deriveGuidedPresetCapabilitySummary`) implemented in `/Users/georgepickett/openclaw-studio/src/features/agents/creation/compiler.ts`. Verification: `npx vitest run tests/unit/agentCreationCompiler.test.ts` (9 passed).
- Milestone 2 outcome: modal starter step now renders grouped preset bundle cards (Knowledge/Builder/Operations/Baseline) with chips for exec/internet/filesystem/sandbox/heartbeat, risk labels, and non-main caveat text. Selection now seeds draft defaults via bundle mapping while preserving downstream payload shape. Verification: `npx vitest run tests/unit/agentCreateModal.test.ts tests/unit/fleetSidebar-create.test.ts` (9 passed).
- Milestone 3 outcome: reliability tests now explicitly exercise setup payloads compiled from bundle defaults (`pr-engineer`) and confirm no new `agents.create` calls occur during retry/apply paths. Verification: `npx vitest run tests/unit/createAgentOperation.test.ts tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupStore.test.ts tests/unit/pendingGuidedSetupRetry.test.ts` (19 passed).
- Milestone 4 outcome: docs now describe preset bundles and capability chips in creation flow language (`README.md`, `ARCHITECTURE.md`). Final verification passed for targeted test suites (`npx vitest run ...` 40 passed). `npm run typecheck` still reports pre-existing `tests/unit/gatewayProxy.test.ts` ws/implicit-any issues, and `npm run lint` still reports pre-existing CJS `require()` and `accessGate` typing issues outside touched files.

## Context and Orientation

Agent creation currently lives in three key areas.

`/Users/georgepickett/openclaw-studio/src/features/agents/components/AgentCreateModal.tsx` contains the four-step create UI (`starter`, `control`, `customize`, `review`) with flat starter cards and a summary block.

`/Users/georgepickett/openclaw-studio/src/features/agents/creation/compiler.ts` is the translation layer from user draft to concrete setup artifacts. It defines starter templates, control defaults, and returns files, `agents.list` overrides, approvals policy, validation, and summary.

`/Users/georgepickett/openclaw-studio/src/app/page.tsx` handles submission, create mutation sequencing, and recovery UX. It compiles, creates, applies setup, and persists pending setup when apply fails.

The core reliability path must stay intact. `applyGuidedAgentSetup` in `/Users/georgepickett/openclaw-studio/src/features/agents/operations/createAgentOperation.ts` writes files, approvals, then config overrides, and pending setup persistence/retry logic is validated in `pendingGuidedSetup*` and `guidedSetupRecovery` tests.

A “preset bundle” in this plan means a named option such as `PR Engineer` that maps to an existing starter kit and control level pair plus optional defaults (for example heartbeat on/off). A “capability chip” means one short UI label that reflects mechanics (for example `Exec: on`, `Internet: on`, `Sandbox: non-main`, `Heartbeat: off`).

## Plan of Work

Milestone 1 adds a bundle model and capability metadata in the creation domain. The implementation should introduce explicit bundle definitions that map to existing starter/control values, plus helper functions that derive capability chips and a risk label from controls. This milestone must keep `compileGuidedAgentCreation` output shape stable so `page.tsx` and setup operations do not need semantic changes.

Milestone 2 updates the modal UX to present grouped preset cards first, with capability chips and risk labels visible before selection. Selecting a bundle should populate starter/control defaults and keep advanced controls available. The existing customize and review steps remain, but review copy should include the new capability framing.

Milestone 3 proves continuity of create/setup/retry behavior. No new persistence surfaces should be added. Reliability tests should pass without changing retry/discard semantics.

Milestone 4 updates user-facing docs and architecture notes to describe bundle-first creation and capability chips, then runs full validation commands and records baseline constraints if they remain unrelated.

## Concrete Steps

All commands run from:

    /Users/georgepickett/openclaw-studio

Milestone 1 commands:

    npx vitest run tests/unit/agentCreationCompiler.test.ts

Milestone 2 commands:

    npx vitest run tests/unit/agentCreateModal.test.ts tests/unit/fleetSidebar-create.test.ts

Milestone 3 commands:

    npx vitest run tests/unit/createAgentOperation.test.ts tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupStore.test.ts tests/unit/pendingGuidedSetupRetry.test.ts

Milestone 4 commands:

    npx vitest run tests/unit/agentCreateModal.test.ts tests/unit/agentCreationCompiler.test.ts tests/unit/createAgentOperation.test.ts tests/unit/guidedSetupRecovery.test.ts tests/unit/pendingGuidedSetupStore.test.ts tests/unit/pendingGuidedSetupRetry.test.ts tests/unit/gatewayAgentOverrides.test.ts tests/unit/agentChatPanel-approvals.test.ts
    npm run typecheck
    npm run lint

Expected short success transcript format:

    RUN  v4.x.x /Users/georgepickett/openclaw-studio
    ✓ tests/unit/agentCreateModal.test.ts (...)
    Test Files  ... passed

## Validation and Acceptance

### Milestone 1: Preset bundles and capability metadata

Acceptance criteria: the creation domain can express named preset bundles, each resolves to starter/control defaults, and capability/risk metadata is computed from actual controls.

1. Tests to write first:
   - Update `/Users/georgepickett/openclaw-studio/tests/unit/agentCreationCompiler.test.ts` with tests such as:
     - `maps PR Engineer bundle to engineer+balanced defaults`
     - `maps Autonomous Engineer bundle to engineer+autopilot defaults`
     - `derives capability chips from controls (exec/internet/fs/sandbox/heartbeat)`
     - `flags non-main sandbox with main-session caveat in capability metadata`
   - Assertions must check concrete overrides and summary/capability outputs, not only labels.
2. Implementation:
   - Update `/Users/georgepickett/openclaw-studio/src/features/agents/creation/types.ts` to define bundle IDs and capability metadata types.
   - Update `/Users/georgepickett/openclaw-studio/src/features/agents/creation/compiler.ts` to:
     - declare bundle-to-starter/control mapping,
     - expose helper(s) that resolve a bundle into draft defaults,
     - expose helper(s) that derive chips/risk from controls,
     - keep `compileGuidedAgentCreation` return contract backward compatible.
3. Verification:
   - Run milestone command and confirm tests pass.
4. Commit:
   - Commit with message `Milestone 1: add preset bundles and capability metadata`.

### Milestone 2: Bundle-first modal with capability chips

Acceptance criteria: the first modal step shows grouped bundle cards with concrete capability chips and risk labels, and selection drives current draft defaults.

1. Tests to write first:
   - Update `/Users/georgepickett/openclaw-studio/tests/unit/agentCreateModal.test.ts` to assert:
     - grouped sections render (for example Knowledge/Builder/Operations/Baseline naming chosen by implementation),
     - selecting `PR Engineer` sets expected starter/control values in submit payload,
     - card chips show concrete capabilities (exec/internet/sandbox/risk),
     - non-main caveat appears where applicable.
2. Implementation:
   - Update `/Users/georgepickett/openclaw-studio/src/features/agents/components/AgentCreateModal.tsx` to:
     - replace flat starter options with bundle cards,
     - render capability chips and risk text from compiler/domain helpers,
     - keep customize/advanced/review flow intact.
3. Verification:
   - Run milestone command and confirm pass.
4. Commit:
   - Commit with message `Milestone 2: add bundle cards with capability chips`.

### Milestone 3: Reliability continuity checks

Acceptance criteria: create setup apply, pending setup persistence, reconnect auto-retry, and manual retry/discard behavior remain unchanged.

1. Tests to write first:
   - Add or update assertions in:
     - `/Users/georgepickett/openclaw-studio/tests/unit/createAgentOperation.test.ts`
     - `/Users/georgepickett/openclaw-studio/tests/unit/guidedSetupRecovery.test.ts`
   - Assertions should prove bundle-originated drafts still compile into valid setup and flow through existing retry paths.
2. Implementation:
   - Only adjust submission glue in `/Users/georgepickett/openclaw-studio/src/app/page.tsx` if required by type changes; avoid semantic retries/orchestration rewrites.
3. Verification:
   - Run milestone command and confirm pass.
4. Commit:
   - Commit with message `Milestone 3: verify setup recovery with bundle-first create UX`.

### Milestone 4: Docs and final validation

Acceptance criteria: documentation reflects bundle-first UX and capability chips, and validation results are recorded with baseline caveats called out explicitly.

1. Tests/docs first:
   - Update `/Users/georgepickett/openclaw-studio/README.md` and `/Users/georgepickett/openclaw-studio/ARCHITECTURE.md` language from generic starter/control to bundle-first capability messaging.
2. Implementation:
   - Ensure terminology is consistent: “preset bundle”, “capability chips”, “risk level”.
3. Verification:
   - Run Milestone 4 command set.
   - If `typecheck` or `lint` still fail due known unrelated baseline issues (for example `tests/unit/gatewayProxy.test.ts` ws typing and server CJS lint rules), record them explicitly in Outcomes.
4. Commit:
   - Commit with message `Milestone 4: document and validate bundle-first agent creation`.

## Idempotence and Recovery

This plan is safe to rerun. Bundle metadata and modal rendering changes are additive to existing creation flow and can be re-applied without data migration. If a milestone fails, rerun that milestone’s test command to re-establish failing/passing state, then continue. Do not delete pending setup storage or retry guards as a shortcut.

If UI tests become brittle due text changes, adjust only user-facing assertions that changed intentionally and keep assertions about payload mechanics and controls behavior.

## Artifacts and Notes

Keep concise milestone evidence in this file as work proceeds, for example:

    $ npx vitest run tests/unit/agentCreationCompiler.test.ts
    ✓ tests/unit/agentCreationCompiler.test.ts (N tests)

    Observed in modal: PR Engineer card shows Exec:on, Internet:off, Sandbox:non-main, Risk:Moderate.

## Interfaces and Dependencies

The implementation should define stable helper interfaces in `src/features/agents/creation` so UI rendering and compile semantics share one source of truth.

At minimum, keep these contracts stable:

- `compileGuidedAgentCreation(...)` in `/Users/georgepickett/openclaw-studio/src/features/agents/creation/compiler.ts` continues returning `files`, `agentOverrides`, `execApprovals`, `validation`, and `summary`.
- Submission payload in `/Users/georgepickett/openclaw-studio/src/features/agents/creation/types.ts` remains compatible with `/Users/georgepickett/openclaw-studio/src/app/page.tsx` create flow.
- Setup application remains via `/Users/georgepickett/openclaw-studio/src/features/agents/operations/createAgentOperation.ts` and existing gateway adapters.

Use OpenClaw semantics as the behavioral ground truth:

- tool groups/profiles from `/Users/georgepickett/openclaw/src/agents/tool-policy.ts`
- sandbox behavior from `/Users/georgepickett/openclaw/src/config/types.agents.ts` and sandbox tests
- exec approvals modes (`deny`, `allowlist`, `full`; `off`, `on-miss`, `always`) from `/Users/georgepickett/openclaw-studio/src/lib/gateway/execApprovals.ts`

## Plan Revision Note

2026-02-12 21:53Z: Initial plan created to implement bundle-first starter UX with capability chips while preserving existing create/setup/recovery mechanics. This revision records concrete milestones, file paths, test-first acceptance criteria, and validation commands.
2026-02-12 21:56Z: Updated after Milestone 1 implementation with completed progress state and compiler-test verification evidence.
2026-02-12 21:59Z: Updated after Milestone 2 implementation with grouped preset-card UX and modal test verification evidence.
2026-02-12 21:59Z: Updated after Milestone 3 implementation with bundle-originated recovery coverage and reliability-suite verification evidence.
2026-02-12 22:01Z: Updated after Milestone 4 implementation with documentation changes and final validation outcomes, including baseline typecheck/lint constraints.
