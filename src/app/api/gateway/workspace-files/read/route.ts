import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const filePath = searchParams.get("path");
    const gatewayUrl = searchParams.get("gatewayUrl");
    const rootWorkspaceParam = searchParams.get("rootWorkspace");
    const useRootWorkspace =
      rootWorkspaceParam === "1" ||
      (typeof rootWorkspaceParam === "string" && rootWorkspaceParam.toLowerCase() === "true");

    if (!agentId || !filePath || !gatewayUrl) {
      return NextResponse.json(
        { error: "Agent ID, file path, and Gateway URL are required." },
        { status: 400 }
      );
    }

    // Check if using Daytona
    const isDaytona = gatewayUrl.includes("daytona.works");
    
    if (!isDaytona) {
      return NextResponse.json(
        { error: "Only Daytona workspaces are currently supported for file reading." },
        { status: 400 }
      );
    }

    // Extract sandbox ID from URL
    const match = gatewayUrl.match(/\/\/\d+-([a-f0-9-]+)\.proxy\.daytona\.works/);
    const sandboxId = match ? match[1] : null;
    
    if (!sandboxId) {
      throw new Error("Could not extract Daytona sandbox ID from gateway URL");
    }

    const daytonaApiKey = process.env.DAYTONA_API_KEY;
    const daytonaServerUrl = process.env.DAYTONA_SERVER_URL || "https://app.daytona.io/api";
    const daytonaTarget = process.env.DAYTONA_TARGET || "us";
    
    if (!daytonaApiKey) {
      throw new Error("DAYTONA_API_KEY environment variable is required");
    }

    // Construct full file path
    // Main agent uses absolute path (required by Daytona), others use relative (resolves from home)
    const workspaceDir = agentId === "main" || useRootWorkspace
      ? "/home/daytona/.openclaw/workspace"
      : `.openclaw/workspace-${agentId}`;
    
    const fullPath = `${workspaceDir}/${filePath}`;

    console.log("Reading file from Daytona:", fullPath);

    // Use Daytona Toolbox API to download file
    const apiUrl = `${daytonaServerUrl}/toolbox/${sandboxId}/toolbox/files/download?path=${encodeURIComponent(fullPath)}`;
    
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${daytonaApiKey}`,
        "x-daytona-target": daytonaTarget,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Daytona read file error:", errorText);
      throw new Error(`Daytona API error: ${response.status} ${errorText}`);
    }

    // Check if this is a binary file (PDF, image, etc.)
    const isBinary = filePath.toLowerCase().endsWith('.pdf') || 
                     filePath.toLowerCase().match(/\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/i);
    
    let content: string;
    if (isBinary) {
      // Read as ArrayBuffer and convert to base64
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      content = buffer.toString('base64');
    } else {
      // Read as text for text files
      content = await response.text();
    }

    return NextResponse.json({ content, exists: true });
  } catch (error: any) {
    console.error("Error reading file:", error);
    return NextResponse.json(
      { error: "Failed to read file", details: error.message },
      { status: 500 }
    );
  }
}
