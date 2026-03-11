import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/* ─── Types ─── */
type AgentState = {
  agentId: string;
  name: string;
  sessionKey: string;
  avatarSeed?: string | null;
  avatarUrl?: string | null;
  model?: string | null;
  thinkingLevel?: string | null;
  sessionExecHost?: "sandbox" | "gateway" | "node";
  sessionExecSecurity?: "deny" | "allowlist" | "full";
  sessionExecAsk?: "off" | "on-miss" | "always";
  toolCallingEnabled?: boolean;
  showThinkingTraces?: boolean;
  status: "running" | "idle" | "stopped" | "error";
  outputLines: string[];
  lastResult?: string | null;
  streamText?: string | null;
  lastUpdate: number;
};

type SessionAgents = Map<string, AgentState>;

/* ─── In-memory agent store ─── */
const globalStore = globalThis as unknown as {
  __officeAgents?: Map<string, SessionAgents>;
};
if (!globalStore.__officeAgents) {
  globalStore.__officeAgents = new Map();
}
const agentStore = globalStore.__officeAgents;

const STALE_TIMEOUT_MS = 30000; // Remove agents not updated in 30 seconds

const cleanStale = (token: string) => {
  const session = agentStore.get(token);
  if (!session) return;
  const now = Date.now();
  for (const [agentId] of session) {
    const agent = session.get(agentId);
    if (agent && now - agent.lastUpdate > STALE_TIMEOUT_MS) {
      session.delete(agentId);
    }
  }
  if (session.size === 0) {
    agentStore.delete(token);
  }
};

/**
 * POST: Update agent state (owner only).
 * Owner publishes agent state here for guests to read via polling.
 *
 * Body: { token, agents: AgentState[] }
 * Response: { ok: true }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: string;
      agents?: Array<Omit<AgentState, "lastUpdate">>;
    };

    const { token, agents } = body;

    if (!token || !Array.isArray(agents)) {
      return NextResponse.json({ error: "Missing required fields: token and agents" }, { status: 400 });
    }

    if (!agentStore.has(token)) {
      agentStore.set(token, new Map());
    }

    const session = agentStore.get(token)!;
    const now = Date.now();

    // Update or add all agents
    for (const agent of agents) {
      session.set(agent.agentId, {
        ...agent,
        lastUpdate: now,
      });
    }

    // Remove agents that are no longer in the list (owner removed them)
    const currentAgentIds = new Set(agents.map((a) => a.agentId));
    for (const [agentId] of session) {
      if (!currentAgentIds.has(agentId)) {
        session.delete(agentId);
      }
    }

    // Clean stale agents
    cleanStale(token);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/**
 * GET: Get all agent states for a session (guests use this for polling).
 * Used when Ably is unavailable.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  cleanStale(token);

  const session = agentStore.get(token);
  if (!session) {
    return NextResponse.json({ agents: [] });
  }

  const agents = Array.from(session.values());
  return NextResponse.json({ agents });
}
