import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Helper to create multipart/form-data body manually
const createMultipartFormData = (
  fieldName: string,
  fileBuffer: Buffer,
  fileName: string,
  contentType: string = "application/octet-stream"
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
    const formData = await request.formData();
    const agentId = formData.get("agentId") as string | null;
    const gatewayUrl = formData.get("gatewayUrl") as string | null;
    const rootWorkspace = formData.get("rootWorkspace") === "1";
    const destPath = (formData.get("path") as string | null) ?? "";

    // Collect all files from the form
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File) {
        files.push(value);
      }
    }

    if (!agentId || !gatewayUrl || files.length === 0) {
      return NextResponse.json(
        { error: "agentId, gatewayUrl, and at least one file are required." },
        { status: 400 },
      );
    }

    // Path-traversal guard
    if (destPath.includes("..")) {
      return NextResponse.json({ error: "Invalid path." }, { status: 400 });
    }

    const isDaytona = gatewayUrl.includes("daytona.works");
    if (!isDaytona) {
      return NextResponse.json(
        { error: "Only Daytona workspaces are currently supported for file uploads." },
        { status: 400 },
      );
    }

    const match = gatewayUrl.match(/\/\/\d+-([a-f0-9-]+)\.proxy\.daytona\.works/);
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

    // Daytona requires absolute path; match console workspace
    const workspaceDir =
      agentId === "main" || rootWorkspace
        ? "/home/daytona/.openclaw/workspace"
        : `/home/daytona/.openclaw/workspace-${agentId}`;

    const results: { name: string; success: boolean; error?: string }[] = [];

    for (const file of files) {
      const filePath = destPath
        ? `${workspaceDir}/${destPath}/${file.name}`
        : `${workspaceDir}/${file.name}`;

      console.log("Uploading file to Daytona:", filePath, "size:", file.size);

      try {
        // Get file buffer
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        const apiUrl = `${daytonaServerUrl}/toolbox/${sandboxId}/toolbox/files/upload?path=${encodeURIComponent(filePath)}`;

        // Create multipart/form-data body manually
        const { body: formDataBody, contentType } = createMultipartFormData(
          "file",
          fileBuffer,
          file.name,
          file.type || "application/octet-stream"
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
          console.error("Daytona upload error for", file.name, ":", errorText);
          results.push({
            name: file.name,
            success: false,
            error: `${response.status}: ${errorText}`,
          });
        } else {
          results.push({ name: file.name, success: true });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.push({ name: file.name, success: false, error: msg });
      }
    }

    const allSuccess = results.every((r) => r.success);

    return NextResponse.json(
      { success: allSuccess, results },
      { status: allSuccess ? 200 : 207 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to upload files";
    console.error("Error uploading files:", message, error);
    return NextResponse.json(
      { error: "Failed to upload files", details: message },
      { status: 500 },
    );
  }
}
