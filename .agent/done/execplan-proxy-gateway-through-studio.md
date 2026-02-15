# Proxy Gateway Through Studio (Single-User)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository does not have a top-level `PLANS.md`. This plan must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

Today, OpenClaw Studio loads in a browser and then the browser connects directly to the OpenClaw Gateway over WebSocket. This is confusing (and often broken) when Studio is opened from a phone or another computer, because `ws://127.0.0.1:18789` points at "this device" (the phone), not the machine running the gateway.

After this change, the browser will only connect to Studio. Studio will connect to the gateway on the user's behalf (server-side), so remote browsers (phone/tablet/laptop) can open Studio and see agents without needing to understand gateway networking details. In the common "gateway bound to loopback on a VM" case, the default `ws://127.0.0.1:18789` will work even when browsing Studio remotely.

## Progress

- [x] (2026-02-10) Write failing tests for a server-side WebSocket proxy that injects the configured gateway auth token.
- [x] Add a Node WebSocket proxy implementation and make the tests pass.
- [x] (2026-02-10) Integrate the proxy with a custom Next.js server so `/api/gateway/ws` upgrades to WebSocket.
- [x] (2026-02-10) Switch the browser client to connect to the Studio proxy (same-origin) instead of connecting to the gateway directly.
- [x] (2026-02-10) Add a simple "configure gateway" CLI script that writes `~/.openclaw/openclaw-studio/settings.json` on the Studio host.
- [x] (2026-02-10) Add an optional Studio access gate (single shared token) to reduce footguns when Studio is internet-exposed.
- [x] (2026-02-10) Run unit tests (`npm test`) and e2e smoke (Playwright) and record evidence.

## Surprises & Discoveries

- Observation: (none yet)
  Evidence: (none yet)

- Observation: When running Playwright against the dev server, Next.js warned about cross origin dev requests to `/_next/*` and mentioned `allowedDevOrigins`.
  Evidence: e2e run printed a warning line beginning with "Cross origin request detected from 127.0.0.1 to /_next/* resource."

## Decision Log

- Decision: (none yet)
  Rationale: (none yet)
  Date/Author: (none yet)

## Outcomes & Retrospective

- Outcome: Studio now uses a same-origin WebSocket proxy (`/api/gateway/ws`) so browsers do not need direct network access to the upstream gateway.
  Evidence: `tests/unit/gatewayProxy.test.ts` asserts connect token injection; Playwright `npm run e2e` passed after switching to the custom server.

## Context and Orientation

Definitions (plain language):

- "Studio host": the machine running Studio (the Next.js app) via `npm run dev` or `npm run start`.
- "Browser device": the device opening Studio in a browser (phone/laptop/tablet).
- "Gateway": the OpenClaw Gateway WebSocket server (commonly on port `18789`).
- "Loopback / localhost": `127.0.0.1` or `localhost`, which always means "this same machine", not the LAN/VM/EC2 host you might be thinking of.
- "WebSocket proxy": a server that accepts a WebSocket connection from the browser and then opens another WebSocket connection to the real gateway, copying messages between them.

How the repo works today (relevant pieces):

- The main UI is `src/app/page.tsx` and it uses `useGatewayConnection` from `src/lib/gateway/GatewayClient.ts`.
- The browser-side WebSocket implementation is `src/lib/gateway/openclaw/GatewayBrowserClient.ts`.
- Studio settings are stored on the Studio host under `~/.openclaw/openclaw-studio/settings.json` and are loaded/saved via:
  - `src/lib/studio/settings-store.ts` (file I/O)
  - `src/app/api/studio/route.ts` (GET/PUT JSON API used by the browser)
- Today, the browser connects directly to the configured gateway URL (often `ws://127.0.0.1:18789`) and sends a `connect` request with a token; failures show up as "no agents available" even if the Studio page loads.

Target behavior after this refactor:

- The browser should connect to a Studio-owned endpoint like `ws(s)://<studio-host>/api/gateway/ws` (same origin as the page).
- Studio should read `settings.json` on the Studio host to determine the upstream gateway URL/token and connect to the gateway server-side.
- Studio should inject the configured token into the upstream gateway `connect` request so the browser does not need to know the token.

Non-goals (explicitly out of scope for this ExecPlan):

- Multi-user Studio (per-user gateway configs, user accounts, etc.).
- Hardening Studio for arbitrary public internet exposure beyond an optional single shared token gate.

## Plan of Work

We will implement a custom Node.js server that serves the Next.js app and also terminates a WebSocket endpoint at `/api/gateway/ws`. When the browser connects, the server will:

1. Wait for the browser to send the first gateway protocol request (`type: "req"`, `method: "connect"`).
2. Load the current Studio settings (gateway URL + token) from the Studio host (`loadStudioSettings()`).
3. Open an upstream WebSocket connection to the configured gateway URL.
4. Forward the browser's `connect` frame upstream, but overwrite/inject the auth token from settings (and never rely on a token supplied by the browser).
5. After connect succeeds, forward subsequent request/response/event frames in both directions unchanged.

Then we will change the browser client code to connect to the Studio proxy URL by default, while keeping the "Gateway URL" and "Token" UI fields as "Upstream gateway URL/token stored on the Studio host".

Finally, we will add a small CLI script for first-time setup that writes the settings file on the Studio host, so the user experience is: run `npx openclaw-studio`, answer "where is your gateway" once, then open Studio from any device.

## Concrete Steps

### Milestone 1: Proxy Spike + Tests (Node-level, no Next integration yet)

Acceptance (human-observable):

- A unit/integration test can start:
  - a fake upstream gateway WebSocket server
  - a Studio proxy WebSocket server
  - a simulated browser WebSocket client
- When the simulated browser sends a `connect` request without a token (or with a wrong token), the upstream server receives a `connect` request that includes the token from a mocked `loadStudioSettings()`.

Tests to write first:

- Create `tests/unit/gatewayProxy.test.ts` and force it to run in Node (not jsdom) by putting this at the very top of the file:
  - `// @vitest-environment node`
- Write a test `it("injects gateway token into connect request")` that:
  - starts a `ws` WebSocketServer that records the first `connect` request params it receives and responds with `ok: true` and a minimal "hello" payload
  - starts the proxy with a `loadSettings` stub returning:
    - `gateway.url` pointing to the upstream test server
    - `gateway.token` set to a known sentinel value
  - starts a WebSocket client to the proxy, sends a gateway protocol frame:
    - `{ "type": "req", "id": "1", "method": "connect", "params": { ... } }`
  - asserts the upstream saw `params.auth.token === <sentinel>`

Implementation:

- Add a dependency on `ws` (server + client) in `package.json`.
- Create `src/server/gatewayProxy.ts` (or `server/gatewayProxy.ts` if we want it outside `src/`) that exports a function like:
  - `createGatewayProxy({ loadSettings, log }): { wss: WebSocketServer, handleUpgrade(req, socket, head): void }`
- Keep it minimal and fail-fast:
  - if gateway URL is missing/invalid: respond to the `connect` request with an error response frame and close
  - if token is missing: same

Verification:

- Run unit tests:
  - `cd /path/to/openclaw-studio`
  - `npm install`
  - `npm test`

Commit:

- Commit message: `Milestone 1: Add server-side gateway proxy module with token injection tests`

### Milestone 2: Integrate Proxy Into Studio Server (single port, `/api/gateway/ws`)

Acceptance (human-observable):

- Starting Studio with `npm run dev` allows a WebSocket client to connect to:
  - `ws://localhost:3000/api/gateway/ws`
- The proxy is active at that path and still passes Milestone 1 tests.

Tests to write first:

- Add a second test in `tests/unit/gatewayProxy.test.ts` that uses an actual `http` server and verifies that `handleUpgrade` only accepts upgrades for `/api/gateway/ws` and rejects other paths (or ignores them cleanly).

Implementation:

- Add a custom server entrypoint (Node) that:
  - starts Next.js in dev mode
  - creates a Node `http` server
  - routes HTTP requests to Next's request handler
  - handles `upgrade` requests and delegates to the proxy when `req.url` matches `/api/gateway/ws`
- Suggested file layout:
  - `server/dev.mjs` (or `.js`) for `npm run dev`
  - `server/start.mjs` (or `.js`) for `npm run start`
- Update `package.json` scripts:
  - `dev`: run the custom server in dev mode
  - `start`: run the custom server in production mode (after `next build`)

Verification:

- `npm run dev` and then in another terminal:
  - `node -e "const WebSocket=require('ws'); const ws=new WebSocket('ws://localhost:3000/api/gateway/ws'); ws.on('open',()=>{console.log('open'); ws.close();}); ws.on('error',e=>{console.error(e); process.exit(1);});"`

Commit:

- Commit message: `Milestone 2: Serve Next.js with custom server and WebSocket proxy endpoint`

### Milestone 3: Browser Connects To Studio Proxy (same-origin), Not To Gateway Directly

Acceptance (human-observable):

- With Studio running on a VM (Studio host) and opened from a phone (browser device), agents load as long as the gateway URL/token are configured on the Studio host.
- The browser no longer needs direct network access to the gateway; it only needs access to Studio.

Tests to write first:

- Add `tests/unit/useGatewayConnection.test.ts` coverage for the new default "connect URL":
  - it should be derived from `window.location` as `ws://<host>/api/gateway/ws` (or `wss://...` when the page is `https://`)
- Add a unit test that ensures `GatewayClient.connect()` is invoked with:
  - `gatewayUrl = <derived proxy url>`
  - `token = ""` (browser never sends token upstream)

Implementation:

- Update `src/lib/gateway/GatewayClient.ts`:
  - Replace `DEFAULT_GATEWAY_URL` (env/default gateway) with a "default proxy URL" derived from `window.location` (because this is a client component).
  - Keep the settings-loaded "Gateway URL" in state, but interpret it as "upstream gateway URL stored on the Studio host", not "what the browser connects to".
- Update `src/features/agents/components/ConnectionPanel.tsx` labels to reduce confusion:
  - "Upstream Gateway URL (on Studio host)"
  - "Upstream Token (stored on Studio host)"
- Ensure connect flow flushes pending settings patches before opening the proxy WS, so the server reads the latest values.

Verification:

- Local smoke:
  - Start Studio with `npm run dev`
  - Load `http://localhost:3000`
  - Confirm the connection status flips to connected and agents appear (with a running gateway)

Commit:

- Commit message: `Milestone 3: Connect browser to Studio WS proxy and store upstream gateway settings server-side`

### Milestone 4: First-Run Setup CLI (write settings.json on the Studio host)

Acceptance (human-observable):

- On a fresh machine with no `~/.openclaw/openclaw-studio/settings.json`, the user can run:
  - `npm run studio:setup`
- The script prompts for:
  - upstream gateway URL (default `ws://127.0.0.1:18789`)
  - token (optionally auto-read from `openclaw config get gateway.auth.token` if `openclaw` is available)
- After setup, Studio can be started and opened from a phone, and agents load.

Tests to write first:

- Add `tests/unit/studioSetupPaths.test.ts` (Node environment) that asserts the setup script writes to the same resolved path as `resolveStudioSettingsPath()` (or, if the setup script re-implements path resolution in JS, that it matches a small set of expected examples for default and `OPENCLAW_STATE_DIR` override).

Implementation:

- Add `scripts/studio-setup.mjs` using Node's `readline/promises` for prompts.
- Implement path resolution consistent with `src/lib/clawdbot/paths.ts`:
  - prefer `OPENCLAW_STATE_DIR` if set
  - otherwise default to `~/.openclaw`
- Write settings JSON in the same shape as `src/lib/studio/settings.ts` expects (at minimum `{ version: 1, gateway: { url, token } }`).
- Add `npm` script:
  - `"studio:setup": "node scripts/studio-setup.mjs"`

Verification:

- Move aside existing settings file and run setup:
  - `mv ~/.openclaw/openclaw-studio/settings.json /tmp/settings.json.bak`
  - `npm run studio:setup`
  - `cat ~/.openclaw/openclaw-studio/settings.json`

Commit:

- Commit message: `Milestone 4: Add interactive setup script to configure upstream gateway on Studio host`

### Milestone 5: Optional Safety Gate For Internet-Exposed Studio (single shared token)

Security model (single-user, pragmatic):

- Default: no additional auth; assume Studio is only reachable on a trusted network (localhost, LAN, Tailscale, VPN).
- Optional: if `STUDIO_ACCESS_TOKEN` env var is set on the Studio host:
  - HTTP `/api/studio` PUT requires `?access_token=...` (or a cookie) or returns 401
  - WebSocket `/api/gateway/ws` requires `?access_token=...` or immediately closes

Acceptance (human-observable):

- With `STUDIO_ACCESS_TOKEN=abc`:
  - opening Studio without the token can load static assets but cannot configure settings or connect to gateway proxy
  - with the token present, everything works

Tests to write first:

- Add a Node-level test that calls the route guard function with missing/wrong token and asserts 401 / WS close.

Implementation:

- Implement a small helper in `src/lib/studio/access.ts` (or similar) that checks the token in query params.
- Apply it to:
  - `src/app/api/studio/route.ts` (PUT at minimum)
  - the WebSocket upgrade handler in the custom server for `/api/gateway/ws`

Verification:

- Start server:
  - `STUDIO_ACCESS_TOKEN=abc npm run dev`
- In browser:
  - `http://localhost:3000` should show a clear error if connect/configure is blocked (avoid silent failure).

Commit:

- Commit message: `Milestone 5: Add optional Studio access token gate for settings + WS proxy`

## Validation and Acceptance

End-to-end acceptance scenario (the one that motivated this work):

1. On a Linux VM (Studio host), run the gateway bound to loopback only:
   - `openclaw gateway run --bind loopback --port 18789`
2. On that same VM, configure Studio once:
   - `npm run studio:setup`
   - accept default upstream gateway URL `ws://127.0.0.1:18789`
   - paste token
3. Start Studio on the VM:
   - `npm run dev -- --host 0.0.0.0` (or equivalent for this repo after the custom server change; document the exact command once implemented)
4. From a phone on the network, open:
   - `http://<vm-ip>:3000`
5. Expected:
   - Studio connects successfully (status shows connected)
   - Agent list shows the gateway's agents
   - No "Gateway URL" needs to be reachable from the phone; only the Studio host is reachable

Test suite expectations:

- `npm test` passes (Vitest unit tests).
- `npm run e2e` passes (Playwright), or at least the existing smoke tests continue to pass.

## Idempotence and Recovery

- The proxy implementation should be safe to run repeatedly; restarting `npm run dev` should be enough to pick up code changes.
- The setup script should be idempotent:
  - if settings exist, it should either confirm overwrite or require a `--force` flag (fail fast by default).
- If a user misconfigures upstream gateway URL/token, Studio should surface a clear error in the UI (avoid "silent no agents").

## Artifacts and Notes

During implementation, capture:

- A short snippet of a failing test from Milestone 1 (before fix) and the same test passing.
- A short console log example when the proxy rejects a connect due to missing upstream settings (error should be actionable).

## Interfaces and Dependencies

Dependencies to add:

- `ws`: Node WebSocket server/client for implementing the Studio-side proxy and tests.

New/changed interfaces (names may adjust during implementation, but keep them stable once chosen):

- `createGatewayProxy({ loadSettings, log })`:
  - `loadSettings()` returns the current Studio settings (at minimum gateway url/token).
  - `handleUpgrade(req, socket, head)` attaches a WebSocket connection for `/api/gateway/ws`.

Gateway protocol assumptions:

- The browser speaks the existing gateway JSON frame protocol (as implemented by `src/lib/gateway/openclaw/GatewayBrowserClient.ts`):
  - request frame: `{ type: "req", id, method, params }`
  - response frame: `{ type: "res", id, ok, payload | error }`
  - event frame: `{ type: "event", event, payload, seq, stateVersion }`
- The proxy forwards frames verbatim except for the `connect` request, where it injects/overrides `params.auth.token` from Studio settings.
