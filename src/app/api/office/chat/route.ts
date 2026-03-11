import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/* ─── Types ─── */
type GuestChatMessage = {
  userId: string;
  agentId: string;
  message: string;
  ts: number;
};

type AgentResponse = {
  agentId: string;
  message: string;
  ts: number;
};

type SessionChat = {
  messages: GuestChatMessage[];
  responses: Map<string, AgentResponse>; // agentId -> latest response
};

/* ─── In-memory chat store ─── */
const globalStore = globalThis as unknown as {
  __officeChat?: Map<string, SessionChat>;
};
if (!globalStore.__officeChat) {
  globalStore.__officeChat = new Map();
}
const chatStore = globalStore.__officeChat;

const STALE_TIMEOUT_MS = 300000; // 5 minutes

const cleanStale = (token: string) => {
  const session = chatStore.get(token);
  if (!session) return;
  const now = Date.now();
  // Remove old messages
  session.messages = session.messages.filter((m) => now - m.ts < STALE_TIMEOUT_MS);
  // Remove old responses
  for (const [agentId, response] of session.responses) {
    if (now - response.ts > STALE_TIMEOUT_MS) {
      session.responses.delete(agentId);
    }
  }
  if (session.messages.length === 0 && session.responses.size === 0) {
    chatStore.delete(token);
  }
};

/**
 * POST: Guest sends a chat message (owner will poll this and forward to gateway)
 * Body: { token, userId, agentId, message }
 * Response: { ok: true, messageId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: string;
      userId?: string;
      agentId?: string;
      message?: string;
    };

    const { token, userId, agentId, message } = body;

    if (!token || !userId || !agentId || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!chatStore.has(token)) {
      chatStore.set(token, { messages: [], responses: new Map() });
    }

    const session = chatStore.get(token)!;
    const messageId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const chatMessage: GuestChatMessage = {
      userId,
      agentId,
      message: message.trim(),
      ts: Date.now(),
    };

    session.messages.push(chatMessage);
    // Keep only last 100 messages
    if (session.messages.length > 100) {
      session.messages = session.messages.slice(-100);
    }

    cleanStale(token);

    console.log("[office/chat] Guest message received:", { token, userId, agentId, messageId, message: message.substring(0, 50) });

    return NextResponse.json({ ok: true, messageId });
  } catch (err) {
    console.error("[office/chat] POST error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/**
 * GET: Owner polls for guest messages, or guest polls for agent responses
 * Query: token, userId (optional, for owner to filter), agentId (optional, for guest to get responses)
 * Response: { messages: GuestChatMessage[], responses: AgentResponse[] }
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const userId = request.nextUrl.searchParams.get("userId");
  const agentId = request.nextUrl.searchParams.get("agentId");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  cleanStale(token);

  const session = chatStore.get(token);
  if (!session) {
    return NextResponse.json({ messages: [], responses: [] });
  }

  // Owner: get all pending messages (not from this userId if specified)
  const messages = userId
    ? session.messages.filter((m) => m.userId !== userId)
    : session.messages;

  // Guest: get responses for specific agent
  const responses = agentId && session.responses.has(agentId)
    ? [session.responses.get(agentId)!]
    : [];

  return NextResponse.json({ messages, responses });
}

/**
 * PUT: Owner updates agent response (so guests can poll for it)
 * Body: { token, agentId, message }
 * Response: { ok: true }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: string;
      agentId?: string;
      message?: string;
    };

    const { token, agentId, message } = body;

    if (!token || !agentId || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!chatStore.has(token)) {
      chatStore.set(token, { messages: [], responses: new Map() });
    }

    const session = chatStore.get(token)!;
    const response: AgentResponse = {
      agentId,
      message: message.trim(),
      ts: Date.now(),
    };
    
    session.responses.set(agentId, response);

    cleanStale(token);

    console.log("[office/chat] Agent response stored:", { token, agentId, message: message.substring(0, 50) });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[office/chat] PUT error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
