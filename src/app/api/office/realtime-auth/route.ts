import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type AuthRequestBody = {
  token?: string;
  userId?: string;
};

type TokenRequestError = { error: string; status: number };
type TokenRequestResult = Record<string, unknown> | TokenRequestError;

const isTokenRequestError = (value: TokenRequestResult): value is TokenRequestError =>
  typeof value === "object" &&
  value !== null &&
  "error" in value &&
  "status" in value;

const createTokenRequest = async (
  roomToken: string,
  userId: string
): Promise<TokenRequestResult> => {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    return { error: "Missing ABLY_API_KEY environment variable", status: 500 } as const;
  }

  const AblyModule = (await import("ably")) as unknown as {
    Rest: new (key: string) => {
      auth: {
        createTokenRequest: (params: {
          clientId: string;
          capability: string;
          ttl: number;
        }) => Promise<unknown>;
      };
    };
  };
  const client = new AblyModule.Rest(apiKey);
  const channelName = `office:${roomToken}`;
  const capability = {
    [channelName]: ["publish", "subscribe", "presence"],
  };

  const tokenRequest = await client.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000, // 1 hour
  });

  return tokenRequest as Record<string, unknown>;
};

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
    const tokenRequest = await createTokenRequest(roomToken, userId);
    if (isTokenRequestError(tokenRequest)) {
      return NextResponse.json({ error: tokenRequest.error }, { status: tokenRequest.status });
    }
    return NextResponse.json(tokenRequest);
  } catch (error) {
    console.error("[office] Failed to create Ably token request (GET):", error);
    return NextResponse.json({ error: "Failed to create token request" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AuthRequestBody;
    const roomToken = body.token?.trim();
    const userId = body.userId?.trim();
    if (!roomToken || !userId) {
      return NextResponse.json(
        { error: "Missing required fields: token and userId" },
        { status: 400 }
      );
    }
    const tokenRequest = await createTokenRequest(roomToken, userId);
    if (isTokenRequestError(tokenRequest)) {
      return NextResponse.json({ error: tokenRequest.error }, { status: tokenRequest.status });
    }
    return NextResponse.json(tokenRequest);
  } catch (error) {
    console.error("[office] Failed to create Ably token request (POST):", error);
    return NextResponse.json({ error: "Failed to create token request" }, { status: 500 });
  }
}
