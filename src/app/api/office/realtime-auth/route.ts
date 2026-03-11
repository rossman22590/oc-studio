import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Ably token auth endpoint.
 * GET: used by Ably client SDK `authUrl` option.
 * POST: alternative for manual token requests.
 *
 * Creates a scoped Ably token request that only allows
 * publish/subscribe/presence on the specific office channel.
 */

const createTokenRequest = async (roomToken: string, userId: string) => {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    return { error: "Missing ABLY_API_KEY environment variable", status: 500 };
  }

  // Ably v2: default export has Rest and Realtime
  const Ably = await import("ably");
  const client = new Ably.Rest(apiKey);
  const channelName = `office:${roomToken}`;

  const tokenRequestData = await client.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify({
      [channelName]: ["publish", "subscribe", "presence"],
    }),
    ttl: 60 * 60 * 1000, // 1 hour
  });

  return tokenRequestData;
};

// GET: Ably SDK calls this via authUrl
export async function GET(request: NextRequest) {
  const roomToken = request.nextUrl.searchParams.get("token")?.trim();
  const userId = request.nextUrl.searchParams.get("userId")?.trim();
  if (!roomToken || !userId) {
    return NextResponse.json(
      { error: "Missing required query params: token and userId" },
      { status: 400 }
    );
  }

  try {
    const result = await createTokenRequest(roomToken, userId);
    if ("error" in result && "status" in result) {
      const err = result as { error: string; status: number };
      return NextResponse.json({ error: err.error }, { status: err.status });
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    const ablyError = error as { code?: number; statusCode?: number; message?: string };
    // Handle account blocked error (40112)
    if (ablyError.code === 40112 || (ablyError.statusCode === 401 && ablyError.message?.includes("blocked"))) {
      console.error("[office] Ably account blocked - message limits exceeded");
      return NextResponse.json(
        { error: "Ably account blocked - message limits exceeded. Please upgrade your Ably plan or wait for the limit to reset.", code: 40112 },
        { status: 401, headers: { "X-Ably-Error-Code": "40112" } }
      );
    }
    console.error("[office] Ably token request failed (GET):", error);
    return NextResponse.json({ error: "Token request failed" }, { status: 500 });
  }
}

// POST: alternative auth endpoint
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string; userId?: string };
    const roomToken = body.token?.trim();
    const userId = body.userId?.trim();
    if (!roomToken || !userId) {
      return NextResponse.json(
        { error: "Missing required fields: token and userId" },
        { status: 400 }
      );
    }
    const result = await createTokenRequest(roomToken, userId);
    if ("error" in result && "status" in result) {
      const err = result as { error: string; status: number };
      return NextResponse.json({ error: err.error }, { status: err.status });
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    const ablyError = error as { code?: number; statusCode?: number; message?: string };
    // Handle account blocked error (40112)
    if (ablyError.code === 40112 || (ablyError.statusCode === 401 && ablyError.message?.includes("blocked"))) {
      console.error("[office] Ably account blocked - message limits exceeded");
      return NextResponse.json(
        { error: "Ably account blocked - message limits exceeded. Please upgrade your Ably plan or wait for the limit to reset.", code: 40112 },
        { status: 401, headers: { "X-Ably-Error-Code": "40112" } }
      );
    }
    console.error("[office] Ably token request failed (POST):", error);
    return NextResponse.json({ error: "Token request failed" }, { status: 500 });
  }
}
