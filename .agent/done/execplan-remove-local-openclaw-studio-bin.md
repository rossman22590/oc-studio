# Remove Local `openclaw-studio` Bin to Eliminate `npx` Command Collision

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `/Users/georgepickett/.codex/worktrees/418a/openclaw-studio/.agent/PLANS.md` and must be maintained in accordance with that file.

## Purpose / Big Picture

Today, this repository exports a local CLI binary named `openclaw-studio` from `cli/openclaw-studio.js`. That name collides with the installer/doctor package (`openclaw-studio-cli`) when someone runs `npx openclaw-studio` from inside this repo. After this change, repository-local development must continue to use `npm run dev`, while `npx openclaw-studio` should no longer be intercepted by this repo’s local package metadata.

A user-visible outcome of success is simple: from this repository directory, `npm exec -c 'which openclaw-studio'` no longer resolves to a local bin, and installer/doctor usage remains available via `npx -y openclaw-studio@latest ...`.

## Progress

- [x] (2026-02-11 03:37Z) Audited current behavior and identified the collision source at `package.json` `bin.openclaw-studio`.  
- [x] (2026-02-11 03:39Z) Added `tests/unit/packageManifest.test.ts` and captured expected failing state before implementation (`expected true to be false` for `bin.openclaw-studio`).
- [x] (2026-02-11 03:40Z) Removed local package bin export from `package.json` and deleted `cli/openclaw-studio.js`.
- [x] (2026-02-11 03:40Z) Updated installer command in `README.md` to `npx -y openclaw-studio@latest` to keep runtime/install boundaries explicit.
- [x] (2026-02-11 03:40Z) Validated targeted and full tests (`63` files, `253` tests passed) plus command checks (`no local bin`, installer/doctor help output).

## Surprises & Discoveries

- Observation: `npx --yes openclaw-studio --help` run from this repository starts local Studio server logic instead of installer/doctor help text.
  Evidence: command output from repo root was Next.js dev lock failure (`.next/dev/lock`) rather than installer usage text.

- Observation: the local bin entry was introduced in commit `879adfa` together with `cli/openclaw-studio.js`.
  Evidence: `git show 879adfa -- package.json cli/openclaw-studio.js` adds `"bin": { "openclaw-studio": "cli/openclaw-studio.js" }`.

- Observation: this file is not referenced elsewhere in the codebase except the package `bin` mapping.
  Evidence: `rg -n "cli/openclaw-studio.js"` returns only `package.json`.

- Observation: this worktree initially lacked local dependencies, so test-first validation could not run until install.
  Evidence: initial `npm test -- tests/unit/packageManifest.test.ts` returned `sh: vitest: command not found`; `npm install --no-audit --no-fund` resolved it.

## Decision Log

- Decision: treat the local bin as unnecessary for core Studio usage and remove it unless a hidden downstream dependency is found during implementation.
  Rationale: the repo already has first-class run scripts (`npm run dev`, `npm run start`), and the local bin creates a high-confusion collision with installer/doctor workflows.
  Date/Author: 2026-02-11 / Codex

- Decision: enforce the intended package behavior with a small unit test against `package.json` so regressions are caught before merge.
  Rationale: this is the cheapest automated guard for a packaging-level behavior change.
  Date/Author: 2026-02-11 / Codex

- Decision: in repository docs, prefer `npx -y openclaw-studio@latest` for installer usage examples.
  Rationale: this prevents accidental resolution to local package context and makes command intent explicit.
  Date/Author: 2026-02-11 / Codex

## Outcomes & Retrospective

The planned change was completed. The repository no longer exports a local `openclaw-studio` bin command, `cli/openclaw-studio.js` was removed, and docs now consistently show `npx -y openclaw-studio@latest` for installer flow.

Observed outcomes match the original purpose:

- `npm exec -c 'which openclaw-studio'` now yields no local bin.
- `npx --yes openclaw-studio@latest --help` returns installer/doctor usage text.
- Local Studio runtime remains unchanged through npm scripts (`npm run dev`, `npm run start`).

No functional regressions were detected in unit tests after the packaging change (`63` files passed, `253` tests passed).

## Context and Orientation

OpenClaw Studio is the application in this repository. The entrypoint for the app server is `server/index.js`, and day-to-day local development runs through npm scripts in `package.json` (`dev`, `start`).

A package `bin` entry is a mapping that tells npm which executable command name to expose when running `npm exec`/`npx`. This repository currently defines `openclaw-studio` as a local binary in `package.json`, pointing to `cli/openclaw-studio.js`. That file is a thin wrapper that spawns `server/index.js` with `HOST`/`PORT` environment variables.

The installer/doctor command people expect (`openclaw-studio doctor`) lives in a different repository/package (`openclaw-studio-cli`) and is commonly invoked via `npx -y openclaw-studio@latest ...`. The naming overlap is the source of confusion.

Key files for this change:

- `/Users/georgepickett/.codex/worktrees/418a/openclaw-studio/package.json`
- `/Users/georgepickett/.codex/worktrees/418a/openclaw-studio/cli/openclaw-studio.js`
- `/Users/georgepickett/.codex/worktrees/418a/openclaw-studio/README.md`
- `/Users/georgepickett/.codex/worktrees/418a/openclaw-studio/tests/unit/` (new packaging guard test)

## Plan of Work

Milestone 1 establishes an automated failing test that captures the desired package behavior: this repository must not export a local `openclaw-studio` bin command. The implementation then removes the `bin` field from `package.json` and deletes `cli/openclaw-studio.js`.

Milestone 2 updates docs so the command model is explicit: run Studio from this repository with `npm run dev`; use installer/doctor via `npx -y openclaw-studio@latest ...`. This milestone is documentation-focused, so verification is behavior checks and lint/tests rather than new runtime code.

Milestone 3 validates end-to-end command behavior from the repository root and ensures existing test suites still pass.

## Concrete Steps

All commands below are run from `/Users/georgepickett/.codex/worktrees/418a/openclaw-studio` unless otherwise stated.

1. Create a new unit test file `tests/unit/packageManifest.test.ts` with a test named `package does not export local openclaw-studio bin` that reads `package.json` and asserts either `bin` is absent or `bin.openclaw-studio` is not present.

2. Run the new test alone and confirm it fails before implementation:

    npm test -- tests/unit/packageManifest.test.ts

   Expected pre-change signal: assertion fails because `bin.openclaw-studio` exists.

3. Edit `package.json` and remove the `bin` block that maps `openclaw-studio` to `cli/openclaw-studio.js`.

4. Delete `cli/openclaw-studio.js`.

5. Re-run the new test and confirm it passes:

    npm test -- tests/unit/packageManifest.test.ts

6. Update `README.md` command guidance where needed so there is no ambiguous suggestion to run Studio app via `npx openclaw-studio` from inside this repository. Keep app run instructions as `npm run dev`; keep installer/doctor guidance as `npx -y openclaw-studio@latest ...`.

7. Run a focused regression sweep:

    npm test -- tests/unit/studioUpstreamGatewaySettings.test.ts
    npm test -- tests/unit/studioSetupPaths.test.ts

8. Run command-level behavior checks:

    npm exec -c 'which openclaw-studio' || echo "no local bin"
    npx --yes openclaw-studio@latest --help

   Expected post-change signal: first command should not resolve a local package bin; second command should print installer/doctor usage text.

9. Run full unit test suite before merge:

    npm test

10. Commit milestone changes atomically after tests pass.

## Validation and Acceptance

Milestone 1 verification workflow:

1. Tests to write first: `tests/unit/packageManifest.test.ts` with `package does not export local openclaw-studio bin`, asserting no `bin.openclaw-studio` key.
2. Implementation: remove `bin` from `package.json`, delete `cli/openclaw-studio.js`.
3. Verification: run `npm test -- tests/unit/packageManifest.test.ts`; it must fail before and pass after edits.
4. Commit: `Milestone 1: Remove local openclaw-studio package bin`.

Milestone 2 verification workflow:

1. Tests to write: none required (documentation-only).
2. Implementation: update `README.md` wording to separate app runtime from installer/doctor command usage.
3. Verification: run `npm test -- tests/unit/studioUpstreamGatewaySettings.test.ts` and `npm test -- tests/unit/studioSetupPaths.test.ts` to confirm no collateral breakage.
4. Commit: `Milestone 2: Clarify Studio runtime vs installer commands`.

Milestone 3 verification workflow:

1. Tests to write: none required (command behavior and regression validation).
2. Implementation: none beyond prior milestones.
3. Verification: run `npm exec -c 'which openclaw-studio' || echo "no local bin"`, `npx --yes openclaw-studio@latest --help`, then `npm test`; confirm expected command behavior and green suite.
4. Commit: `Milestone 3: Validate no npx command interception`.

Final acceptance criteria:

- This repository no longer exports `openclaw-studio` via package `bin`.
- `cli/openclaw-studio.js` is removed.
- Local Studio run path remains `npm run dev` / `npm run start`.
- Installer/doctor command remains accessible via `npx -y openclaw-studio@latest ...`.
- All tests run in this repo pass.

## Idempotence and Recovery

These steps are safe to repeat. Re-running tests and command checks is idempotent.

If a step fails midway:

- If test creation fails, fix the test file and re-run only that file.
- If removal of `bin` causes unexpected tooling dependency failures, re-add the `bin` block and `cli/openclaw-studio.js`, rerun tests, and capture the dependency in `Decision Log` before choosing an alternative (for example, renaming the local bin to a non-colliding name).
- If `npx --yes openclaw-studio@latest --help` fails due network issues, treat it as environmental; retry once and continue with local assertions.

## Artifacts and Notes

Expected post-change command snippets:

    $ npm exec -c 'which openclaw-studio' || echo "no local bin"
    no local bin

    $ npx --yes openclaw-studio@latest --help
    OpenClaw Studio Installer / Doctor
    Usage:
      openclaw-studio [options]
      openclaw-studio doctor [--check|--fix] [options]

## Interfaces and Dependencies

No runtime application interface changes are planned in `server/index.js` or React modules.

Packaging interface changes:

- `package.json` must not contain `bin.openclaw-studio`.
- `cli/openclaw-studio.js` must not exist after this plan.

Test interface additions:

- New test file: `tests/unit/packageManifest.test.ts`.
- New test name: `package does not export local openclaw-studio bin`.
- Assertion contract: package manifest omits the local command export that causes command interception.

Revision note (2026-02-11): Initial ExecPlan created to resolve whether `cli/openclaw-studio.js` is necessary and to provide a safe removal path with automated verification.
Revision note (2026-02-11): Updated plan with implementation progress, discoveries, decisions, and final outcomes after completing all milestones and validations.
