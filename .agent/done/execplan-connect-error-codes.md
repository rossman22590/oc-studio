# Refactor Studio Gateway Connect Errors For Structured Retry Policy

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository uses `.agent/PLANS.md` as the source of truth for ExecPlan requirements, and this document must be maintained in accordance with it.

## Purpose / Big Picture

Today, when Studio fails to connect to the gateway, the failure arrives at the UI as a generic WebSocket close reason string, and our retry stopping logic (`isAuthError`) relies on string matching. After this change, connection failures that originate as gateway response errors (for example `studio.gateway_token_missing`) are propagated as structured `GatewayResponseError` values, and the auto-retry gate uses the error code directly. This makes connect behavior easier to test and less brittle when error messages change.

You can see this working by running unit tests that simulate a connect failure and asserting that:

1. `GatewayClient.connect()` rejects with a `GatewayResponseError` containing the right `.code` (instead of a generic `Error`).
2. `useGatewayConnection` does not schedule auto-retry when the connect error code is auth-like (for example `studio.gateway_token_missing`), and does schedule auto-retry for non-auth failures.

Assumptions for this plan (these are intentional, to keep scope tight):

1. No user-visible UI copy changes are required beyond what naturally changes when we stop relying on close-reason formatting.
2. We are not reworking the server proxy’s connect handshake logic (`server/gateway-proxy.js`) in this plan. This plan focuses on how the client side represents and reasons about connect failures.
3. We will not attempt to deduplicate the duplicated “resolve Studio upstream gateway settings from filesystem” logic between `server/studio-settings.js` and `src/lib/studio/settings-store.ts` in this plan.

## Progress

- [x] (2026-02-13 02:38Z) Milestone 1: Preserve connect error codes in `GatewayClient.connect()` by parsing the connect-failed close reason and rejecting with `GatewayResponseError`.
- [x] (2026-02-13 02:45Z) Milestone 2: Use structured error codes (not string matching) to decide whether `useGatewayConnection` should auto-retry after a connect failure.
- [x] (2026-02-13 02:47Z) Milestone 3: Run full verification (`npm test`, `npm run typecheck`) and archive this ExecPlan to `.agent/done/`.

## Surprises & Discoveries

- Observation: React hook + fake-timer tests for auto-connect/auto-retry were timing-fragile and produced unhandled rejections.
  Evidence: The initial hook-level attempt tests were replaced with deterministic unit tests against a pure retry policy helper.

## Decision Log

- Decision: Scope this plan to client-side error propagation and retry gating, not the server proxy handshake or settings resolution deduplication.
  Rationale: It addresses the most brittle part of the entanglement (string-matching retry behavior) with minimal blast radius.
  Date/Author: 2026-02-13 / Codex

- Decision: Test retry behavior through a pure policy helper (`resolveGatewayAutoRetryDelayMs`) instead of React hook + fake-timer integration tests.
  Rationale: Hook-level tests were timing-fragile and produced unhandled rejections; extracting a pure policy function makes the boundary explicit and the tests deterministic.
  Date/Author: 2026-02-13 / Codex

## Outcomes & Retrospective

- `GatewayClient.connect()` now preserves structured connect-failure codes by parsing the `connect failed: <CODE> ...` close reason and rejecting with `GatewayResponseError`.
- `useGatewayConnection` now gates auto-retry using a pure policy helper that prefers structured error codes (and treats Studio host config failures like `studio.gateway_url_missing` as non-retryable).
- Unit tests cover both behaviors, and `npm test` + `npm run typecheck` pass.

## Context and Orientation

OpenClaw Studio is a Next.js UI that connects to an upstream OpenClaw Gateway via a same-origin WebSocket proxy at `/api/gateway/ws`.

Relevant code paths:

- `src/lib/gateway/openclaw/GatewayBrowserClient.ts`
  - Establishes the browser WebSocket connection and issues the gateway `connect` request.
  - When the `connect` request returns a response frame with `ok: false` and an `error.code`, it rejects the request with a `GatewayResponseError` and then closes the WebSocket with close code `4008` and a reason string starting with `connect failed: <CODE> ...`.
- `src/lib/gateway/GatewayClient.ts`
  - Wraps `GatewayBrowserClient` and provides `GatewayClient.connect()` and `GatewayClient.call()`.
  - `useGatewayConnection()` (in the same file) implements client-side connection lifecycle, including auto-connect and auto-retry.
- `tests/unit/*`
  - Vitest unit tests, including `tests/unit/gatewayClient.connectErrors.test.ts` and `tests/unit/gatewayConnectRetryPolicy.test.ts`.

## Plan of Work

We will implement two incremental, test-driven milestones.

Milestone 1 makes connect failures carry a structured `code` by teaching `GatewayClient.connect()` to recognize the “connect failed: <CODE> ...” close reason pattern and reject with `GatewayResponseError` (using the extracted code).

Milestone 2 updates `useGatewayConnection` to store the last connect error code and use that structured code (when available) to decide whether auto-retry should be scheduled, keeping a message-based fallback for non-structured errors.

Each milestone includes new unit tests and ends with a git commit.

## Concrete Steps

All commands are run from the repository root.

### Milestone 1: Preserve connect error codes in GatewayClient.connect

1. Tests to write (must fail before implementation):
   - Create `tests/unit/gatewayClient.connectErrors.test.ts`.
   - Add a test `rejects_connect_with_gateway_response_error_when_close_reason_is_connect_failed` that:
     - Mocks `@/lib/gateway/openclaw/GatewayBrowserClient` similarly to `tests/unit/gatewayClient.gap.test.ts` and captures the constructed options.
     - Calls `client.connect({ gatewayUrl: "ws://example.invalid" })`.
     - Invokes the captured `onClose` callback with `{ code: 4008, reason: "connect failed: studio.gateway_token_missing Upstream gateway token is not configured on the Studio host." }`.
     - Asserts the connect promise rejects with an error whose `.name` is `GatewayResponseError` and whose `.code` is exactly `studio.gateway_token_missing`.
2. Implementation:
   - Update `src/lib/gateway/GatewayClient.ts` so that the `onClose` handler used during `connect()`:
     - Detects close code `4008` and reason prefix `connect failed:`.
     - Extracts the error code token and message remainder.
     - Rejects the connect promise with `new GatewayResponseError({ code, message })` instead of `new Error(...)`.
3. Verification:
   - Run `npm test` and confirm the new test fails before the change and passes after.
4. Commit:
   - Commit with message `Milestone 1: Preserve connect error codes in GatewayClient`.

### Milestone 2: Gate auto-retry based on structured error codes

1. Tests to write (must fail before implementation):
   - Create `tests/unit/gatewayConnectRetryPolicy.test.ts`.
   - Add tests that call a new exported pure helper `resolveGatewayAutoRetryDelayMs` and assert:
     - it returns `null` when `connectErrorCode` is `studio.gateway_url_missing` (this should be treated as non-retryable because retrying cannot fix a missing Studio host setting).
     - it returns a positive `number` when `connectErrorCode` is `studio.upstream_error`.
2. Implementation:
   - In `src/lib/gateway/GatewayClient.ts` inside `useGatewayConnection`:
     - Track the last connect error code separately from the display string (for example `connectErrorCode: string | null` state).
     - Introduce `resolveGatewayAutoRetryDelayMs` as a pure policy helper and use it from the auto-retry effect.
     - Stop retrying based on `connectErrorCode` (when present), and only fall back to message string matching when `connectErrorCode` is not available.
3. Verification:
   - Run `npm test` and confirm the new tests fail before the change and pass after.
4. Commit:
   - Commit with message `Milestone 2: Gate gateway connect retry by error code`.

### Milestone 3: Full verification and archive plan

1. Run:
   - `npm test`
   - `npm run typecheck`
2. Move this plan to `.agent/done/execplan-connect-error-codes.md` and ensure `.agent/execplan-pending.md` no longer exists.

## Validation and Acceptance

Acceptance is met when all of the following are true:

1. `npm test` passes.
2. `npm run typecheck` passes.
3. A unit test demonstrates that a connect failure close reason that includes `connect failed: <CODE>` causes `GatewayClient.connect()` to reject with a `GatewayResponseError` containing that `<CODE>`.
4. A unit test demonstrates that `useGatewayConnection` does not auto-retry when the connect error code is non-retryable configuration (specifically `studio.gateway_url_missing`), and does auto-retry for a non-auth failure (for example `studio.upstream_error`).

## Idempotence and Recovery

This change is safe to re-run. If a milestone fails, revert only the files modified in that milestone and re-run `npm test` to return to green. All new behavior is covered by unit tests so regressions should be caught before committing.

## Artifacts and Notes

- (to be filled in during implementation with short test transcripts if needed)

## Interfaces and Dependencies

- We will continue using the existing `GatewayResponseError` type defined in `src/lib/gateway/errors.ts`.
- We will not add new runtime dependencies.
