import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/* ─── Types ─── */
type PlayerPosition = {
  userId: string;
  role: "owner" | "guest";
  position: [number, number, number];
  rotation: number;
  color: string;
  animation: string;
  lastUpdate: number;
};

type SessionPositions = Map<string, PlayerPosition>;

/* ─── In-memory position store ─── */
const globalStore = globalThis as unknown as {
  __officePositions?: Map<string, SessionPositions>;
};
if (!globalStore.__officePositions) {
  globalStore.__officePositions = new Map();
}
const positionStore = globalStore.__officePositions;

const STALE_TIMEOUT_MS = 20000; // Remove players not updated in 20 seconds

const cleanStale = (token: string) => {
  const session = positionStore.get(token);
  if (!session) return;
  const now = Date.now();
  for (const [userId] of session) {
    const pos = session.get(userId);
    if (pos && now - pos.lastUpdate > STALE_TIMEOUT_MS) {
      session.delete(userId);
    }
  }
  if (session.size === 0) {
    positionStore.delete(token);
  }
};

/**
 * POST: Update player position AND return all players.
 *
 * This is the primary sync endpoint. By combining write + read in a single
 * request we guarantee the same serverless instance handles both, which is
 * critical on Vercel where separate GET/POST calls may hit different instances
 * with isolated in-memory stores.
 *
 * Body: { token, userId, role, position, rotation, color, animation }
 * Response: { ok: true, players: PlayerPosition[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: string;
      userId?: string;
      role?: "owner" | "guest";
      position?: [number, number, number];
      rotation?: number;
      color?: string;
      animation?: string;
    };

    const { token, userId, role, position, rotation, color, animation } = body;

    if (!token || !userId || !role || !position || rotation === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!positionStore.has(token)) {
      positionStore.set(token, new Map());
    }

    const session = positionStore.get(token)!;
    session.set(userId, {
      userId,
      role,
      position,
      rotation,
      color: color || "#6366f1",
      animation: animation || "Idle",
      lastUpdate: Date.now(),
    });

    // Clean stale players and return ALL players (including the sender)
    cleanStale(token);
    const players = Array.from(session.values());

    return NextResponse.json({ ok: true, players });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/**
 * GET: Get all player positions for a session.
 * Used for initial load / fallback. The main sync loop uses POST above.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  cleanStale(token);

  const session = positionStore.get(token);
  if (!session) {
    return NextResponse.json({ players: [] });
  }

  const players = Array.from(session.values());
  return NextResponse.json({ players });
}
