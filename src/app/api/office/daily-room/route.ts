import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type CreateRoomBody = {
  token: string;
};

type DailyRoomResponse = {
  url: string;
  name: string;
  id: string;
};

type DailyTokenResponse = {
  token: string;
};

/**
 * POST /api/office/daily-room
 *
 * Creates (or reuses) a Daily.co room scoped to the office share-token,
 * then returns a meeting token so the client can join.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing DAILY_API_KEY environment variable" },
      { status: 500 }
    );
  }

  let body: CreateRoomBody;
  try {
    body = (await request.json()) as CreateRoomBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const shareToken = body.token?.trim();
  if (!shareToken) {
    return NextResponse.json(
      { error: "Missing required field: token" },
      { status: 400 }
    );
  }

  // Room name: sanitize share token to valid Daily room name (alphanumeric + hyphens, max 41 chars)
  const roomName = `oc-${shareToken.replace(/[^a-zA-Z0-9]/g, "").slice(0, 37)}`;
  
  console.log("[daily-room] Creating room:", roomName, "API key present:", !!apiKey);

  try {
    // Try to get existing room first
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    
    console.log("[daily-room] Get room response:", getRes.status, getRes.statusText);

    let roomUrl: string;

    if (getRes.ok) {
      // Room already exists — reuse it
      const existing = (await getRes.json()) as DailyRoomResponse;
      roomUrl = existing.url;
    } else {
      // Room doesn't exist — create it
      // Simplified config - just the essentials
      const roomConfig = {
        name: roomName,
        privacy: "private" as const,
        properties: {
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
        },
      };
      
      console.log("[daily-room] Creating room with config:", JSON.stringify(roomConfig, null, 2));
      
      const createRes = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(roomConfig),
      });
      
      console.log("[daily-room] Create room response:", createRes.status, createRes.statusText);

      if (!createRes.ok) {
        const errText = await createRes.text();
        let errorMessage = "Failed to create Daily room";
        try {
          const errJson = JSON.parse(errText) as { error?: string; info?: { error?: string } };
          errorMessage = errJson.error || errJson.info?.error || errorMessage;
        } catch {
          errorMessage = errText || errorMessage;
        }
        console.error("[daily-room] Failed to create room:", errorMessage, "Status:", createRes.status);
        return NextResponse.json(
          { error: errorMessage },
          { status: createRes.status >= 400 && createRes.status < 500 ? createRes.status : 502 }
        );
      }

      const created = (await createRes.json()) as DailyRoomResponse;
      roomUrl = created.url;
    }

    // Create a meeting token so the client can join the private room
    const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
        },
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      let errorMessage = "Failed to create meeting token";
      try {
        const errJson = JSON.parse(errText) as { error?: string; info?: { error?: string } };
        errorMessage = errJson.error || errJson.info?.error || errorMessage;
      } catch {
        errorMessage = errText || errorMessage;
      }
      console.error("[daily-room] Failed to create meeting token:", errorMessage, "Status:", tokenRes.status);
      return NextResponse.json(
        { error: errorMessage },
        { status: tokenRes.status >= 400 && tokenRes.status < 500 ? tokenRes.status : 502 }
      );
    }

    const tokenData = (await tokenRes.json()) as DailyTokenResponse;

    return NextResponse.json({
      roomUrl,
      roomName,
      meetingToken: tokenData.token,
    });
  } catch (error) {
    console.error("[daily-room] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
