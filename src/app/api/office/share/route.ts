import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

/* ─── In-memory share session store ─── */
type ShareSession = {
  token: string;
  ownerId: string;
  interactiveAgentId: string | null; // The ONE agent guests can interact with
  createdAt: number;
  expiresAt: number;
};

// Global in-memory store (persists across hot-reloads in dev via globalThis)
const globalStore = globalThis as unknown as {
  __officeShareSessions?: Map<string, ShareSession>;
};
if (!globalStore.__officeShareSessions) {
  globalStore.__officeShareSessions = new Map();
}
const sessions = globalStore.__officeShareSessions;

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const cleanExpired = () => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
};

/* ─── POST: Generate a new share token ─── */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { ownerId?: string; interactiveAgentId?: string };
    const ownerId = body.ownerId || `owner-${crypto.randomUUID().slice(0, 8)}`;
    const interactiveAgentId = body.interactiveAgentId?.trim() || null;

    cleanExpired();

    // Revoke any existing tokens for this owner
    for (const [token, session] of sessions) {
      if (session.ownerId === ownerId) sessions.delete(token);
    }

    const token = crypto.randomUUID();
    const now = Date.now();
    const session: ShareSession = {
      token,
      ownerId,
      interactiveAgentId,
      createdAt: now,
      expiresAt: now + TOKEN_TTL_MS,
    };

    sessions.set(token, session);

    // Get base URL from environment variable or construct from request headers
    let baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!baseUrl) {
      const host = request.headers.get("host") || request.nextUrl.host;
      const protocol =
        request.headers.get("x-forwarded-proto") ||
        (request.nextUrl.protocol === "https:" ? "https" : "http");
      baseUrl = `${protocol}://${host}`;
    }
    // Remove trailing slash if present
    baseUrl = baseUrl.replace(/\/$/, "");
    const shareUrl = `${baseUrl}/agent-office?shareToken=${token}`;

    return NextResponse.json({
      token,
      shareUrl,
      expiresAt: session.expiresAt,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/* ─── GET: Validate a share token ─── */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  cleanExpired();

  const session = sessions.get(token);
  if (!session) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: true,
    ownerId: session.ownerId,
    interactiveAgentId: session.interactiveAgentId,
    expiresAt: session.expiresAt,
  });
}

/* ─── DELETE: Revoke a share token ─── */
export async function DELETE(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const existed = sessions.delete(token);
  return NextResponse.json({ revoked: existed });
}
