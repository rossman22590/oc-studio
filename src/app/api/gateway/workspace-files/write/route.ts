import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Helper to create multipart/form-data body manually
const createMultipartFormData = (
  fieldName: string,
  fileBuffer: Buffer,
  fileName: string,
  contentType: string = "text/plain; charset=utf-8"
): { body: Buffer; contentType: string } => {
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2, 15)}`;
  const CRLF = "\r\n";
  
  const parts: Buffer[] = [];
  
  // Start boundary
  parts.push(Buffer.from(`--${boundary}${CRLF}`));
  
  // Content-Disposition header
  parts.push(
    Buffer.from(
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"${CRLF}`
    )
  );
  
  // Content-Type header
  parts.push(Buffer.from(`Content-Type: ${contentType}${CRLF}`));
  
  // Empty line before content
  parts.push(Buffer.from(CRLF));
  
  // File content
  parts.push(fileBuffer);
  
  // End boundary
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));
  
  const body = Buffer.concat(parts);
  const contentTypeHeader = `multipart/form-data; boundary=${boundary}`;
  
  return { body, contentType: contentTypeHeader };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, path: filePath, content, gatewayUrl, rootWorkspace } = body as {
      agentId?: string;
      path?: string;
      content?: string;
      gatewayUrl?: string;
      rootWorkspace?: boolean;
    };

    if (!agentId || !filePath || typeof content !== "string" || !gatewayUrl) {
      return NextResponse.json(
        { error: "agentId, path, content, and gatewayUrl are required." },
        { status: 400 },
      );
    }

    // Basic path-traversal guard
    if (filePath.includes("..")) {
      return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
    }

    // daytona.works or daytonaproxy*.net
    const isDaytona = gatewayUrl.includes("daytona.works") || gatewayUrl.includes("daytonaproxy");

    if (!isDaytona) {
      return NextResponse.json(
        { error: "Only Daytona workspaces are currently supported for file writing." },
        { status: 400 },
      );
    }

    // Extract sandbox ID: ...18789-<uuid>.proxy.daytona.works or ...daytonaproxy01.net
    const match = gatewayUrl.match(/\/\/\d+-([a-f0-9-]+)\./);
    const sandboxId = match ? match[1] : null;

    if (!sandboxId) {
      throw new Error("Could not extract Daytona sandbox ID from gateway URL");
    }

    const daytonaApiKey = process.env.DAYTONA_API_KEY;
    const daytonaServerUrl =
      process.env.DAYTONA_SERVER_URL || "https://app.daytona.io/api";
    const daytonaTarget = process.env.DAYTONA_TARGET || "us";

    if (!daytonaApiKey) {
      throw new Error("DAYTONA_API_KEY environment variable is required");
    }

    // Construct full path (main absolute; others relative, resolves from home)
    const useRootWorkspace = rootWorkspace === true;
    const workspaceDir =
      agentId === "main" || useRootWorkspace
        ? "/home/daytona/.openclaw/workspace"
        : `.openclaw/workspace-${agentId}`;

    const fullPath = `${workspaceDir}/${filePath}`;

    console.log("Writing file to Daytona:", fullPath);

    // Extract filename from path
    const fileName = filePath.split("/").pop() || "file";
    
    // Create file buffer
    const contentBuffer = Buffer.from(content, "utf-8");

    const apiUrl = `${daytonaServerUrl}/toolbox/${sandboxId}/toolbox/files/upload?path=${encodeURIComponent(fullPath)}`;

    // Create multipart/form-data body manually
    const { body: formDataBody, contentType } = createMultipartFormData(
      "file",
      contentBuffer,
      fileName,
      "text/plain; charset=utf-8"
    );

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${daytonaApiKey}`,
        "x-daytona-target": daytonaTarget,
        "Content-Type": contentType,
      },
          body: formDataBody as unknown as BodyInit,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Daytona write file error:", errorText);
      throw new Error(`Daytona API error: ${response.status} ${errorText}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to write file";
    console.error("Error writing file:", message, error);
    return NextResponse.json(
      { error: "Failed to write file", details: message },
      { status: 500 },
    );
  }
}
