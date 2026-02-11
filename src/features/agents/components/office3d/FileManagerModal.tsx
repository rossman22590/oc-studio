import { useState, useEffect, useCallback } from "react";
import {
  X,
  FolderOpen,
  FileText,
  FileCode,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Download,
  Search,
  Image as ImageIcon,
} from "lucide-react";
import { useAgentStore } from "@/features/agents/state/store";
import { useGatewayConnection } from "@/lib/gateway/GatewayClient";
import { createStudioSettingsCoordinator } from "@/lib/studio/coordinator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* ────────── types ────────── */

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  updatedAtMs?: number;
}

interface FilePreview {
  file: FileEntry;
  content: string;
  type: "markdown" | "code" | "text" | "pdf" | "image" | "unknown";
}

type FileManagerModalProps = {
  onClose: () => void;
};

/* ────────── helpers ────────── */

const formatSize = (bytes: number | undefined) => {
  if (bytes == null || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 10) / 10} ${sizes[i]}`;
};

const getFileType = (fileName: string): FilePreview["type"] => {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "md") return "markdown";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
  if (
    [
      "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "css", "html",
      "json", "xml", "yaml", "yml", "sh", "bash", "go", "rs", "php", "rb",
      "swift", "kt", "toml", "ini", "cfg", "conf", "env",
    ].includes(ext)
  )
    return "code";
  if (["txt", "log", "csv"].includes(ext)) return "text";
  return "text";
};

/* ────────── component ────────── */

export const FileManagerModal = ({ onClose }: FileManagerModalProps) => {
  const { state } = useAgentStore();
  const [settingsCoordinator] = useState(() => createStudioSettingsCoordinator());
  const { client, status, gatewayUrl } = useGatewayConnection(settingsCoordinator);

  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview state
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [brokenImage, setBrokenImage] = useState(false);

  const agents = state.agents.map((a) => ({ id: a.agentId, name: a.name }));

  /* ── Load agents list from gateway (same as regular File Manager UI) ── */
  const [agentsFromGateway, setAgentsFromGateway] = useState<
    { id: string; name: string }[]
  >([]);

  useEffect(() => {
    if (status !== "connected" || !client) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await client.call<{
          agents: Array<{
            id: string;
            name?: string;
            identity?: { name?: string };
          }>;
        }>("agents.list", {});
        if (cancelled) return;
        setAgentsFromGateway(
          result.agents.map((a) => ({
            id: a.id,
            name: a.name || a.identity?.name || a.id,
          })),
        );
      } catch {
        /* fall back to store agents */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [client, status]);

  // Prefer gateway list, fall back to store
  const agentList = agentsFromGateway.length > 0 ? agentsFromGateway : agents;

  /* ──────────────────────────────────────────────────────────────────────
   * Fetch files via the SAME server-side API route the regular UI uses:
   *   GET /api/gateway/workspace-files?agentId=...&path=...&gatewayUrl=...
   * This goes through Daytona Toolbox / SSH on the server — reliable.
   * ──────────────────────────────────────────────────────────────────── */
  const loadFiles = useCallback(
    async (agentId: string, path: string) => {
      if (!gatewayUrl) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          agentId,
          path: path || "",
          gatewayUrl,
        });
        const response = await fetch(
          `/api/gateway/workspace-files?${params.toString()}`,
        );
        if (!response.ok)
          throw new Error(`Failed to load files: ${response.statusText}`);
        const data = await response.json();
        if (data.error) {
          setError(data.error);
          setFiles(data.entries || []);
        } else {
          setFiles(data.entries || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load files");
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [gatewayUrl],
  );

  useEffect(() => {
    if (selectedAgent) {
      void loadFiles(selectedAgent, currentPath);
    }
  }, [selectedAgent, currentPath, loadFiles]);

  /* ── Navigation ── */
  const handleAgentSelect = (agentId: string) => {
    setSelectedAgent(agentId);
    setCurrentPath("");
    setFiles([]);
    setPreview(null);
    setSearchQuery("");
  };

  const handleFileClick = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      setCurrentPath(entry.path);
    } else {
      setBrokenImage(false);
      await previewFile(entry);
    }
  };

  const handleBack = () => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
  };

  /* ──────────────────────────────────────────────────────────────────────
   * Read file content via the SAME read API the regular UI uses:
   *   GET /api/gateway/workspace-files/read?agentId=...&path=...&gatewayUrl=...
   * ──────────────────────────────────────────────────────────────────── */
  const previewFile = async (file: FileEntry) => {
    if (!gatewayUrl) return;
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({
        agentId: selectedAgent,
        path: file.path || file.name,
        gatewayUrl,
      });
      const response = await fetch(
        `/api/gateway/workspace-files/read?${params.toString()}`,
      );
      if (!response.ok)
        throw new Error(`Failed to read file: ${response.statusText}`);
      const data = await response.json();
      setPreview({ file, content: data.content, type: getFileType(file.name) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setPreviewLoading(false);
    }
  };

  /* ── Download ── */
  const downloadFile = async (file: FileEntry, content?: string) => {
    try {
      let fileContent = content;
      if (!fileContent && gatewayUrl) {
        const params = new URLSearchParams({
          agentId: selectedAgent,
          path: file.path || file.name,
          gatewayUrl,
        });
        const response = await fetch(
          `/api/gateway/workspace-files/read?${params.toString()}`,
        );
        if (!response.ok) throw new Error("Failed to read file");
        const data = await response.json();
        fileContent = data.content;
      }
      if (!fileContent) return;
      const blob = new Blob([fileContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  /* ── Filter ── */
  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const pathParts = currentPath ? currentPath.split("/") : [];

  /* ────────── Render ────────── */

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-4xl max-h-[85vh] flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-primary" />
            <h2 className="console-title text-xl">File Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Agent selector ── */}
        <div className="border-b border-border px-6 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Agent:
            </span>
            {agentList.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                No agents available
              </span>
            ) : (
              agentList.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handleAgentSelect(a.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                    selectedAgent === a.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  {a.name}
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Search + refresh ── */}
        {selectedAgent && (
          <div className="flex items-center gap-2 border-b border-border px-6 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files and folders..."
                className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              onClick={() => loadFiles(selectedAgent, currentPath)}
              disabled={loading}
              className="rounded p-1.5 hover:bg-muted transition disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        )}

        {/* ── Breadcrumb ── */}
        {selectedAgent && (
          <div className="flex items-center gap-1 border-b border-border px-6 py-2 text-xs text-muted-foreground">
            {currentPath && (
              <button
                onClick={handleBack}
                className="rounded p-1 hover:bg-muted transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="font-mono text-muted-foreground">
              workspace-{selectedAgent}
            </span>
            {pathParts.map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button
                  onClick={() =>
                    setCurrentPath(pathParts.slice(0, i + 1).join("/"))
                  }
                  className="hover:text-foreground transition font-medium"
                >
                  {part}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── Error banner ── */}
        {error && (
          <div className="mx-6 mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">
              dismiss
            </button>
          </div>
        )}

        {/* ── File list ── */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {!selectedAgent ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <FolderOpen className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">Select an agent to browse files</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              <p className="text-sm">Loading files...</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <FileText className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">
                {searchQuery
                  ? "No files match your search"
                  : "No files in this directory"}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => handleFileClick(file)}
                  className="group w-full flex items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-primary/10 cursor-pointer"
                >
                  {file.isDirectory ? (
                    <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate flex-1">
                    {file.name}
                  </span>
                  {!file.isDirectory && file.size != null && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatSize(file.size)}
                    </span>
                  )}
                  {!file.isDirectory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void downloadFile(file);
                      }}
                      className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-muted transition"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                  {file.isDirectory && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── File preview overlay ── */}
      {(preview || previewLoading) && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setPreview(null);
            setPreviewLoading(false);
          }}
        >
          <div
            className="glass-panel w-full max-w-4xl max-h-[85vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                {preview?.type === "markdown" ? (
                  <FileText className="h-5 w-5 text-primary" />
                ) : preview?.type === "code" ? (
                  <FileCode className="h-5 w-5 text-primary" />
                ) : (
                  <FileText className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {preview?.file.name ?? "Loading…"}
                  </h2>
                  {preview?.file.size != null && (
                    <p className="text-xs text-muted-foreground">
                      {formatSize(preview.file.size)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {preview && (
                  <button
                    onClick={() => downloadFile(preview.file, preview.content)}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                )}
                <button
                  onClick={() => {
                    setPreview(null);
                    setPreviewLoading(false);
                  }}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-auto p-6">
              {previewLoading ? (
                <div className="flex items-center justify-center h-48">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !preview ? null : preview.type === "markdown" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {preview.content}
                  </ReactMarkdown>
                </div>
              ) : preview.type === "code" ? (
                <pre className="rounded-lg bg-muted/30 p-4 overflow-x-auto">
                  <code className="text-sm font-mono text-foreground">
                    {preview.content}
                  </code>
                </pre>
              ) : preview.type === "image" ? (
                brokenImage ? (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <ImageIcon className="h-16 w-16 mb-3 opacity-50" />
                    <p className="text-sm font-semibold">Image failed to load</p>
                    <button
                      onClick={() => downloadFile(preview.file, preview.content)}
                      className="mt-4 flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition"
                    >
                      <Download className="h-4 w-4" />
                      Download instead
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <img
                      src={preview.content}
                      alt={preview.file.name}
                      className="max-w-full max-h-[60vh] object-contain rounded-lg"
                      onError={() => setBrokenImage(true)}
                    />
                  </div>
                )
              ) : preview.type === "pdf" ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <FileText className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-sm">PDF preview not supported</p>
                  <button
                    onClick={() => downloadFile(preview.file, preview.content)}
                    className="mt-4 flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition"
                  >
                    <Download className="h-4 w-4" />
                    Download to view
                  </button>
                </div>
              ) : (
                <pre className="rounded-lg bg-muted/30 p-4 overflow-x-auto whitespace-pre-wrap break-words">
                  <code className="text-sm font-mono text-foreground">
                    {preview.content}
                  </code>
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
