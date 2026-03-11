import { NextResponse } from "next/server";
import { resolveGatewaySshTarget, resolveConfiguredSshTarget } from "@/lib/ssh/gateway-host";
import * as childProcess from "node:child_process";

export const runtime = "nodejs";

type WorkspaceFileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  updatedAtMs?: number;
};

type WorkspaceFilesResponse = {
  path: string;
  entries: WorkspaceFileEntry[];
};

const isValidAgentId = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Basic validation - no path traversal
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) return false;
  return true;
};

const isValidPath = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  // Allow empty string for root
  if (trimmed === "") return true;
  // No path traversal
  if (trimmed.includes("..")) return false;
  return true;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const path = searchParams.get("path") || "";
    const gatewayUrl = searchParams.get("gatewayUrl");
    const rootWorkspaceParam = searchParams.get("rootWorkspace");
    const useRootWorkspace =
      rootWorkspaceParam === "1" ||
      (typeof rootWorkspaceParam === "string" && rootWorkspaceParam.toLowerCase() === "true");

    if (!isValidAgentId(agentId)) {
      return NextResponse.json(
        { error: "Invalid or missing agentId parameter." },
        { status: 400 }
      );
    }

    if (!isValidPath(path)) {
      return NextResponse.json(
        { error: "Invalid path parameter." },
        { status: 400 }
      );
    }

    if (!gatewayUrl) {
      return NextResponse.json(
        { error: "Gateway URL is required." },
        { status: 400 }
      );
    }

    // Determine workspace directory (main uses absolute for Daytona; others relative, resolves from home)
    const workspaceDir = agentId === "main" || useRootWorkspace
      ? "/home/daytona/.openclaw/workspace"
      : `.openclaw/workspace-${agentId}`;
    
    const targetPath = path.trim()
      ? `${workspaceDir}/${path.trim()}`
      : workspaceDir;

    // Check if using Daytona - use API directly (daytona.works or daytonaproxy*.net)
    const isDaytona = gatewayUrl.includes("daytona.works") || gatewayUrl.includes("daytonaproxy");
    
    if (isDaytona) {
      // Extract sandbox ID: wss://18789-<uuid>.proxy.daytona.works or ...daytonaproxy01.net
      const match = gatewayUrl.match(/\/\/\d+-([a-f0-9-]+)\./);
      const sandboxId = match ? match[1] : null;
      
      if (!sandboxId) {
        throw new Error("Could not extract Daytona sandbox ID from gateway URL");
      }

      const daytonaApiKey = process.env.DAYTONA_API_KEY;
      const daytonaServerUrl = process.env.DAYTONA_SERVER_URL || "https://app.daytona.io/api";
      const daytonaTarget = process.env.DAYTONA_TARGET || "us";
      
      if (!daytonaApiKey) {
        throw new Error("DAYTONA_API_KEY environment variable is required for Daytona workspaces");
      }

      // Use Daytona Toolbox API to list files
      const apiUrl = `${daytonaServerUrl}/toolbox/${sandboxId}/toolbox/files?path=${encodeURIComponent(targetPath)}`;
      
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${daytonaApiKey}`,
          "x-daytona-target": daytonaTarget,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Daytona list-files error:", errorText);
        
        // If workspace directory doesn't exist yet, create it automatically
        if (errorText.includes("no such file or directory")) {
          console.log(`Workspace directory not found for agent "${agentId}", creating it now...`);
          
          try {
            // Create the workspace directory via Daytona Toolbox API
            const createDirUrl = `${daytonaServerUrl}/toolbox/${sandboxId}/toolbox/files/folder?path=${encodeURIComponent(targetPath)}&mode=0755`;
            const createDirResponse = await fetch(createDirUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${daytonaApiKey}`,
                "x-daytona-target": daytonaTarget,
              },
            });
            
            if (createDirResponse.ok || createDirResponse.status === 409) {
              console.log(`Created workspace directory for agent "${agentId}"`);
            } else {
              const createError = await createDirResponse.text();
              console.error("Failed to create workspace directory:", createError);
            }
          } catch (createErr) {
            console.error("Error creating workspace directory:", createErr);
          }
          
          // Return empty entries — the directory now exists (or we at least tried)
          return NextResponse.json(
            { path: path.trim(), entries: [] },
            { status: 200 }
          );
        }
        
        throw new Error(`Daytona API error: ${response.status} ${errorText}`);
      }

      const rawResponse = await response.text();
      const files = JSON.parse(rawResponse) as Array<Record<string, unknown>>;

      // Convert Daytona response to our format (Daytona uses isDir, modTime)
      const entries: WorkspaceFileEntry[] = files
        .filter(f => f.name !== "." && f.name !== "..")
        .map(f => {
          const isDir = f.isDir === true;
          return {
            name: f.name as string,
            path: path.trim() ? `${path.trim()}/${f.name}` : (f.name as string),
            isDirectory: isDir,
            size: isDir ? undefined : (f.size as number),
            updatedAtMs: f.modTime != null ? (typeof f.modTime === "number" ? f.modTime * 1000 : new Date(f.modTime as string).getTime()) : undefined,
          };
        });

      // Sort: directories first, then alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return NextResponse.json({ path: path.trim(), entries });
    }

    // Check if we need SSH or can run locally
    const configuredSshTarget = resolveConfiguredSshTarget();
    const isLocal = !configuredSshTarget || 
                    configuredSshTarget === "localhost" || 
                    configuredSshTarget === "127.0.0.1" ||
                    configuredSshTarget.includes("@localhost") ||
                    configuredSshTarget.includes("@127.0.0.1");

    let result: childProcess.SpawnSyncReturns<string>;

    if (isLocal) {
      // Run locally without SSH - expand ~ to home directory
      const home = process.env.HOME || process.env.USERPROFILE || "";
      const expandedPath = targetPath.replace(/^~/, home).replace(/\//g, process.platform === "win32" ? "\\" : "/");
      
      // Use dir on Windows, ls on Unix
      if (process.platform === "win32") {
        result = childProcess.spawnSync(
          "powershell",
          [
            "-Command",
            `Get-ChildItem -Path "${expandedPath}" -Force -ErrorAction SilentlyContinue | ForEach-Object { $isDir = $_.PSIsContainer; $size = if ($isDir) { 0 } else { $_.Length }; $time = [int]($_.LastWriteTime - [datetime]'1970-01-01').TotalSeconds; "$($_.Mode) 0 user group $size $time $($_.Name)" }`
          ],
          { encoding: "utf8" }
        );
      } else {
        result = childProcess.spawnSync(
          "bash",
          ["-c", `ls -la --time-style=+%s "${expandedPath}" 2>/dev/null || echo "EMPTY_DIR"`],
          { encoding: "utf8" }
        );
      }
    } else {
      // Check if using Daytona (daytona.works or daytonaproxy*.net)
      const isDaytonaLegacy = gatewayUrl.includes("daytona.works") || gatewayUrl.includes("daytonaproxy");
      
      if (isDaytonaLegacy) {
        // Extract sandbox ID: ...18789-<uuid>.proxy.daytona.works or ...daytonaproxy01.net
        const match = gatewayUrl.match(/\/\/\d+-([a-f0-9-]+)\./);
        const workspaceId = match ? match[1] : null;
        
        if (!workspaceId) {
          throw new Error("Could not extract Daytona workspace ID from gateway URL");
        }

        const daytonaApiKey = process.env.DAYTONA_API_KEY;
        const daytonaServerUrl = process.env.DAYTONA_SERVER_URL || "https://app.daytona.io/api";
        
        if (!daytonaApiKey) {
          throw new Error("DAYTONA_API_KEY environment variable is required for Daytona workspaces");
        }

        // Use Daytona API to list files
        const apiUrl = `${daytonaServerUrl}/workspace/${workspaceId}/sandbox/fs/list-files`;
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${daytonaApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: targetPath }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          
          // If workspace directory doesn't exist, return empty entries gracefully
          if (errorText.includes("no such file or directory") || errorText.includes("not found")) {
            console.log(`Legacy Daytona: workspace not found for agent "${agentId}", returning empty entries`);
            return NextResponse.json({ path: path.trim(), entries: [] }, { status: 200 });
          }
          
          throw new Error(`Daytona API error: ${response.status} ${errorText}`);
        }

        const files = await response.json() as Array<{
          name: string;
          is_dir: boolean;
          size: number;
          mod_time: number;
        }>;

        // Convert Daytona response to our format
        const entries: WorkspaceFileEntry[] = files
          .filter(f => f.name !== "." && f.name !== "..")
          .map(f => ({
            name: f.name,
            path: path.trim() ? `${path.trim()}/${f.name}` : f.name,
            isDirectory: f.is_dir,
            size: f.is_dir ? undefined : f.size,
            updatedAtMs: f.mod_time ? f.mod_time * 1000 : undefined,
          }));

        // Sort: directories first, then alphabetically
        entries.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        return NextResponse.json({ path: path.trim(), entries });
      }
      
      // Regular SSH for non-Daytona environments
      const sshTarget = resolveGatewaySshTarget();
      result = childProcess.spawnSync(
        "ssh",
        [
          "-o",
          "BatchMode=yes",
          sshTarget,
          `ls -la --time-style=+%s "${targetPath}" 2>/dev/null || echo "EMPTY_DIR"`
        ],
        { encoding: "utf8" }
      );
    }

    if (result.error) {
      throw new Error(`Failed to execute command: ${result.error.message}`);
    }

    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";

    console.log("Workspace files - command output:", { stdout, stderr, status: result.status });

    if (result.status !== 0 && !stdout.includes("EMPTY_DIR")) {
      throw new Error(stderr.trim() || "Failed to list workspace files");
    }

    // Parse ls output
    const lines = stdout.split("\n").filter(line => line.trim());
    const entries: WorkspaceFileEntry[] = [];
    
    console.log("Workspace files - parsing lines:", lines.length);
    
    for (const line of lines) {
      // Skip total line, empty lines, and EMPTY_DIR marker
      if (line.startsWith("total") || line.trim() === "" || line.includes("EMPTY_DIR")) continue;
      
      // Parse output: permissions links owner group size timestamp name
      const parts = line.trim().split(/\s+/);
      if (parts.length < 7) continue;
      
      const permissions = parts[0];
      const size = parseInt(parts[4], 10);
      const timestamp = parseInt(parts[5], 10);
      const name = parts.slice(6).join(" ");
      
      // Skip . and ..
      if (name === "." || name === "..") continue;
      
      // Check if directory (Windows: d--- in Mode, Unix: d in permissions)
      const isDirectory = permissions.startsWith("d") || permissions.includes("d---");
      
      const entryPath = path.trim() ? `${path.trim()}/${name}` : name;
      
      entries.push({
        name,
        path: entryPath,
        isDirectory,
        size: isDirectory || isNaN(size) ? undefined : size,
        updatedAtMs: isNaN(timestamp) ? undefined : timestamp * 1000
      });
    }

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const response: WorkspaceFilesResponse = {
      path: path.trim(),
      entries
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list workspace files.";
    console.error("Workspace files listing error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
