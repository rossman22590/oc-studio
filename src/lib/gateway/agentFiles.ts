import { AGENT_FILE_NAMES, type AgentFileName } from "@/lib/agents/agentFiles";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";

type AgentsFilesGetResponse = {
  file?: { missing?: unknown; content?: unknown };
};

type AgentsFilesListResponse = {
  path?: unknown;
  workspace?: unknown;
  cwd?: unknown;
  entries?: unknown;
  files?: unknown;
  items?: unknown;
};

type AgentsListResult = {
  defaultId: string;
  agents: Array<{ id: string }>;
};

const resolveAgentId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("agentId is required.");
  }
  return trimmed;
};

export const readGatewayAgentFile = async (params: {
  client: GatewayClient;
  agentId: string;
  name: AgentFileName;
}): Promise<{ exists: boolean; content: string }> => {
  const agentId = resolveAgentId(params.agentId);
  const response = await params.client.call<AgentsFilesGetResponse>("agents.files.get", {
    agentId,
    name: params.name,
  });
  const file = response?.file;
  const fileRecord = file && typeof file === "object" ? (file as Record<string, unknown>) : null;
  const missing = fileRecord?.missing === true;
  const content =
    fileRecord && typeof fileRecord.content === "string" ? fileRecord.content : "";
  return { exists: !missing, content };
};

export const writeGatewayAgentFile = async (params: {
  client: GatewayClient;
  agentId: string;
  name: AgentFileName;
  content: string;
}): Promise<void> => {
  const agentId = resolveAgentId(params.agentId);
  await params.client.call("agents.files.set", {
    agentId,
    name: params.name,
    content: params.content,
  });
};

export type GatewayAgentFileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  updatedAtMs?: number;
};

const normalizeAgentFilePath = (value: string | null | undefined): string => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "/" || raw === ".") return "";
  const normalized = raw.replaceAll("\\", "/").replace(/^\/+/, "");
  const parts = normalized
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("Path must not include '.' or '..' segments.");
  }
  return parts.join("/");
};

const coerceBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const coerceNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parseListEntry = (
  raw: unknown,
  basePath: string
): GatewayAgentFileEntry | null => {
  if (typeof raw === "string") {
    const name = raw.trim();
    if (!name) return null;
    const path = basePath ? `${basePath}/${name}` : name;
    return { name, path, isDirectory: false };
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const nameRaw = typeof record.name === "string" ? record.name.trim() : "";
  const pathRaw = typeof record.path === "string" ? record.path.trim() : "";
  const resolvedPath = pathRaw ? normalizeAgentFilePath(pathRaw) : "";
  const name =
    nameRaw ||
    (resolvedPath ? resolvedPath.split("/").slice(-1)[0] ?? "" : "");
  if (!name) return null;
  const entryPath = resolvedPath || (basePath ? `${basePath}/${name}` : name);

  const isDirectory =
    coerceBoolean(record.isDirectory) ??
    coerceBoolean(record.dir) ??
    (typeof record.kind === "string" ? record.kind === "dir" : null) ??
    (typeof record.type === "string"
      ? record.type === "dir" || record.type === "directory"
      : null) ??
    false;

  const size = coerceNumber(record.size) ?? undefined;
  const updatedAtMs =
    coerceNumber(record.updatedAtMs) ??
    coerceNumber(record.mtimeMs) ??
    coerceNumber(record.modifiedAtMs) ??
    undefined;

  return { name, path: entryPath, isDirectory, size, updatedAtMs };
};

export const listGatewayAgentFiles = async (params: {
  client: GatewayClient;
  agentId: string;
  path?: string | null;
}): Promise<{ path: string; entries: GatewayAgentFileEntry[] }> => {
  const agentId = resolveAgentId(params.agentId);
  const basePath = normalizeAgentFilePath(params.path);

  const tryPayloads = [
    { agentId, path: basePath },
    { agentId, dir: basePath },
    { agentId, directory: basePath },
    { agentId, prefix: basePath },
    { agentId },
  ];

  let response: unknown = null;
  let lastErr: unknown = null;

  for (const payload of tryPayloads) {
    try {
      response = await params.client.call<AgentsFilesListResponse>("agents.files.list", payload);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("unknown method")) {
        break;
      }
    }
  }

  if (lastErr) {
    throw lastErr instanceof Error ? lastErr : new Error("Failed to list agent files.");
  }

  const record = response && typeof response === "object" ? (response as Record<string, unknown>) : null;
  const rawEntries =
    record?.entries ?? record?.files ?? record?.items ?? (Array.isArray(response) ? response : null);

  const entriesArray = Array.isArray(rawEntries) ? rawEntries : [];
  let parsed = entriesArray
    .map((entry) => parseListEntry(entry, basePath))
    .filter((entry): entry is GatewayAgentFileEntry => Boolean(entry));

  // Some gateways return absolute host paths for list entries. The gateway `agents.files.get/set`
  // expects workspace-relative `name`/`path` values, so strip the resolved workspace root when
  // possible (using the returned `path` field as the server-side directory).
  const serverDirRaw =
    record && typeof record.workspace === "string"
      ? record.workspace
      : record && typeof record.path === "string"
        ? record.path
        : record && typeof record.cwd === "string"
          ? record.cwd
          : "";
  let workspaceRoot: string | null = null;
  if (serverDirRaw && typeof serverDirRaw === "string") {
    try {
      const serverDir = normalizeAgentFilePath(serverDirRaw);
      if (!basePath) {
        workspaceRoot = serverDir;
      } else if (serverDir === basePath) {
        workspaceRoot = "";
      } else if (serverDir.endsWith(`/${basePath}`)) {
        workspaceRoot = serverDir.slice(0, -(basePath.length + 1));
      } else {
        workspaceRoot = serverDir;
      }
    } catch {
      workspaceRoot = null;
    }
  }

  if (workspaceRoot && workspaceRoot !== "") {
    const prefix = `${workspaceRoot}/`;
    parsed = parsed.map((entry) => {
      if (entry.path.startsWith(prefix)) {
        return { ...entry, path: entry.path.slice(prefix.length) };
      }
      return entry;
    });
  }

  parsed.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { path: basePath, entries: parsed };
};

export const readGatewayAgentTextFile = async (params: {
  client: GatewayClient;
  agentId: string;
  path: string;
}): Promise<{ exists: boolean; content: string }> => {
  const agentId = resolveAgentId(params.agentId);
  const normalizedPath = normalizeAgentFilePath(params.path);
  if (!normalizedPath) {
    throw new Error("File path is required.");
  }

  const shouldRetryWithPath = (err: unknown) => {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    if (!msg.includes("invalid agents.files.get params")) return false;
    // Only retry with { path } when the gateway schema indicates { name } isn't accepted.
    return msg.includes("unexpected property 'name'") || msg.includes("required property 'path'");
  };

  let response: AgentsFilesGetResponse | null = null;
  try {
    response = await params.client.call<AgentsFilesGetResponse>("agents.files.get", {
      agentId,
      name: normalizedPath,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.toLowerCase().includes("unknown method")) {
      throw err instanceof Error ? err : new Error("Failed to read agent file.");
    }
    if (!shouldRetryWithPath(err)) {
      throw err instanceof Error ? err : new Error("Failed to read agent file.");
    }
    try {
      response = await params.client.call<AgentsFilesGetResponse>("agents.files.get", {
        agentId,
        path: normalizedPath,
      });
    } catch (fallbackErr) {
      // If the fallback fails due to schema mismatch (e.g. it rejects `path`), surface the original error.
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message.toLowerCase() : "";
      if (
        fallbackMsg.includes("invalid agents.files.get params") &&
        fallbackMsg.includes("unexpected property 'path'") &&
        fallbackMsg.includes("required property 'name'")
      ) {
        throw err instanceof Error ? err : new Error("Failed to read agent file.");
      }
      throw fallbackErr instanceof Error
        ? fallbackErr
        : new Error("Failed to read agent file.");
    }
  }

  const file = response?.file;
  const fileRecord = file && typeof file === "object" ? (file as Record<string, unknown>) : null;
  const missing = fileRecord?.missing === true;
  const content =
    fileRecord && typeof fileRecord.content === "string" ? fileRecord.content : "";
  return { exists: !missing, content };
};

export const writeGatewayAgentTextFile = async (params: {
  client: GatewayClient;
  agentId: string;
  path: string;
  content: string;
}): Promise<void> => {
  const agentId = resolveAgentId(params.agentId);
  const normalizedPath = normalizeAgentFilePath(params.path);
  if (!normalizedPath) {
    throw new Error("File path is required.");
  }

  const shouldRetryWithPath = (err: unknown) => {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    if (!msg.includes("invalid agents.files.set params")) return false;
    return msg.includes("unexpected property 'name'") || msg.includes("required property 'path'");
  };

  try {
    await params.client.call("agents.files.set", {
      agentId,
      name: normalizedPath,
      content: params.content,
    });
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.toLowerCase().includes("unknown method")) {
      throw err instanceof Error ? err : new Error("Failed to write agent file.");
    }
    if (!shouldRetryWithPath(err)) {
      throw err instanceof Error ? err : new Error("Failed to write agent file.");
    }
    try {
      await params.client.call("agents.files.set", {
        agentId,
        path: normalizedPath,
        content: params.content,
      });
      return;
    } catch (fallbackErr) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message.toLowerCase() : "";
      if (
        fallbackMsg.includes("invalid agents.files.set params") &&
        fallbackMsg.includes("unexpected property 'path'") &&
        fallbackMsg.includes("required property 'name'")
      ) {
        throw err instanceof Error ? err : new Error("Failed to write agent file.");
      }
      throw fallbackErr instanceof Error
        ? fallbackErr
        : new Error("Failed to write agent file.");
    }
  }
};

const resolveTemplateAgentId = async (params: {
  client: GatewayClient;
  targetAgentId: string;
}): Promise<string> => {
  const result = await params.client.call<AgentsListResult>("agents.list", {});
  const defaultId = typeof result.defaultId === "string" ? result.defaultId.trim() : "";
  if (defaultId && defaultId !== params.targetAgentId) {
    return defaultId;
  }
  const agents = Array.isArray(result.agents) ? result.agents : [];
  const hasMain = agents.some((agent) => agent?.id === "main");
  if (hasMain && params.targetAgentId !== "main") {
    return "main";
  }
  const fallback = agents.find((agent) => agent?.id && agent.id !== params.targetAgentId)?.id ?? "";
  if (fallback) return fallback;
  throw new Error("No template agent available to bootstrap brain files.");
};

export type BootstrapAgentBrainFilesResult = {
  templateAgentId: string;
  updated: AgentFileName[];
  skipped: AgentFileName[];
};

export const bootstrapAgentBrainFilesFromTemplate = async (params: {
  client: GatewayClient;
  agentId: string;
  templateAgentId?: string | null;
  fileNames?: readonly AgentFileName[];
}): Promise<BootstrapAgentBrainFilesResult> => {
  const targetAgentId = params.agentId.trim();
  if (!targetAgentId) {
    throw new Error("Agent id is required to bootstrap brain files.");
  }
  const resolvedNames = params.fileNames ?? AGENT_FILE_NAMES;
  const templateAgentId =
    params.templateAgentId?.trim() ||
    (await resolveTemplateAgentId({ client: params.client, targetAgentId }));
  if (templateAgentId === targetAgentId) {
    throw new Error("Template agent cannot be the same as the target agent.");
  }

  const reads = await Promise.all(
    resolvedNames.map(async (name) => {
      const [target, template] = await Promise.all([
        readGatewayAgentFile({ client: params.client, agentId: targetAgentId, name }),
        readGatewayAgentFile({ client: params.client, agentId: templateAgentId, name }),
      ]);
      return { name, target, template };
    })
  );

  const toUpdate: Array<{ name: AgentFileName; content: string }> = [];
  const skipped: AgentFileName[] = [];

  for (const entry of reads) {
    const targetBlank = !entry.target.exists || entry.target.content.trim().length === 0;
    const templateBlank = !entry.template.exists || entry.template.content.trim().length === 0;
    if (!targetBlank) {
      skipped.push(entry.name);
      continue;
    }
    if (templateBlank) {
      skipped.push(entry.name);
      continue;
    }
    toUpdate.push({ name: entry.name, content: entry.template.content });
  }

  await Promise.all(
    toUpdate.map(async (entry) => {
      await writeGatewayAgentFile({
        client: params.client,
        agentId: targetAgentId,
        name: entry.name,
        content: entry.content,
      });
    })
  );

  return {
    templateAgentId,
    updated: toUpdate.map((entry) => entry.name),
    skipped,
  };
};
