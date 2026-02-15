import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";
export const alt = "MachineClaw — AI Agent Command Center";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export async function GET(request: NextRequest) {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #ec4899 0%, #f472b6 50%, #f9a8d4 100%)",
          padding: "80px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "32px",
          }}
        >
          <div
            style={{
              fontSize: "120px",
              fontWeight: "900",
              color: "white",
              letterSpacing: "-0.02em",
              lineHeight: "0.9",
              textAlign: "center",
            }}
          >
            MachineClaw
          </div>
          <div
            style={{
              fontSize: "48px",
              fontWeight: "700",
              color: "white",
              opacity: 0.95,
              textAlign: "center",
              maxWidth: "900px",
            }}
          >
            Command Your AI Agent Fleet
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: "500",
              color: "white",
              opacity: 0.85,
              textAlign: "center",
              maxWidth: "800px",
              marginTop: "16px",
            }}
          >
            Orchestrate, monitor, and collaborate with your AI agents through an immersive 3D workspace
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
