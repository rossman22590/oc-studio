import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST: Process a guest chat message - forward to agent and return response
 * This endpoint is called by the owner's frontend to process guest messages
 * Body: { token, messageId, agentId, sessionKey, gatewayUrl }
 * Response: { ok: true, response?: string }
 * 
 * Note: This doesn't directly connect to gateway (WebSocket), but stores
 * the message for the owner's gateway client to process and return response
 */

type ProcessRequest = {
  token?: string;
  messageId?: string;
  agentId?: string;
  sessionKey?: string;
  message?: string;
};

type PendingProcess = {
  messageId: string;
  agentId: string;
  sessionKey: string;
  message: string;
  ts: number;
  status: "pending" | "processing" | "completed" | "failed";
  response?: string;
  error?: string;
};

const globalStore = globalThis as unknown as {
  __officeChatProcess?: Map<string, Map<string, PendingProcess>>; // token -> messageId -> process
};

if (!globalStore.__officeChatProcess) {
  globalStore.__officeChatProcess = new Map();
}

const processStore = globalStore.__officeChatProcess;

const STALE_TIMEOUT_MS = 60000; // 1 minute

const cleanStale = (token: string) => {
  const tokenStore = processStore.get(token);
  if (!tokenStore) return;
  const now = Date.now();
  for (const [messageId, process] of tokenStore) {
    if (now - process.ts > STALE_TIMEOUT_MS) {
      tokenStore.delete(messageId);
    }
  }
  if (tokenStore.size === 0) {
    processStore.delete(token);
  }
};

/**
 * POST: Owner submits a guest message for processing
 * This creates a pending process that the owner's gateway client will handle
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProcessRequest;
    const { token, messageId, agentId, sessionKey, message } = body;

    if (!token || !messageId || !agentId || !sessionKey || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!processStore.has(token)) {
      processStore.set(token, new Map());
    }

    const tokenStore = processStore.get(token)!;
    
    // Create or update pending process
    const process: PendingProcess = {
      messageId,
      agentId,
      sessionKey,
      message: message.trim(),
      ts: Date.now(),
      status: "pending",
    };

    tokenStore.set(messageId, process);
    cleanStale(token);

    return NextResponse.json({ ok: true, processId: messageId });
  } catch (err) {
    console.error("[office/chat/process] Error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/**
 * GET: Get pending processes for a token
 * Used by owner to get messages that need processing
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const messageId = request.nextUrl.searchParams.get("messageId");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  cleanStale(token);

  const tokenStore = processStore.get(token);
  if (!tokenStore) {
    return NextResponse.json({ processes: [] });
  }

  if (messageId) {
    // Get specific process
    const process = tokenStore.get(messageId);
    return NextResponse.json({ process: process || null });
  }

  // Get all pending processes
  const processes = Array.from(tokenStore.values())
    .filter((p) => p.status === "pending" || p.status === "processing")
    .sort((a, b) => a.ts - b.ts);

  return NextResponse.json({ processes });
}

/**
 * PUT: Update process status (owner's gateway client calls this after processing)
 * Body: { token, messageId, status, response?, error? }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: string;
      messageId?: string;
      status?: "processing" | "completed" | "failed";
      response?: string;
      error?: string;
    };

    const { token, messageId, status, response, error } = body;

    if (!token || !messageId || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const tokenStore = processStore.get(token);
    if (!tokenStore) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const process = tokenStore.get(messageId);
    if (!process) {
      return NextResponse.json({ error: "Process not found" }, { status: 404 });
    }

    process.status = status;
    if (response) process.response = response;
    if (error) process.error = error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[office/chat/process] Error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
