import { useState, useEffect, useCallback, useRef } from "react";
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
  Pencil,
  Eye,
  Save,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  Link2,
  CheckSquare,
  Loader2,
  Upload,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useAgentStore } from "@/features/agents/state/store";
import { useGatewayConnection } from "@/lib/gateway/GatewayClient";
import { createStudioSettingsCoordinator } from "@/lib/studio/coordinator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import dynamic from "next/dynamic";

// Dynamically import PDFViewer with SSR disabled to prevent server-side issues
const PDFViewer = dynamic(
  () => import("@/features/agents/components/PDFViewer").then((mod) => ({ default: mod.PDFViewer })),
  { ssr: false }
);

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

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editDirty, setEditDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<
    { name: string; success: boolean; error?: string }[]
  >([]);
  const [showUploadResults, setShowUploadResults] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const agents = state.agents.map((a) => ({ id: a.agentId, name: a.name }));

  /* ── Load agents list from gateway (same as regular File Manager UI) ── */
  const [agentsFromGateway, setAgentsFromGateway] = useState<
    { id: string; name: string }[]
  >([]);
  const [defaultAgentId, setDefaultAgentId] = useState<string>("");

  useEffect(() => {
    if (status !== "connected" || !client) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await client.call<{
          defaultId?: string;
          agents: Array<{
            id: string;
            name?: string;
            identity?: { name?: string };
          }>;
        }>("agents.list", {});
        if (cancelled) return;
        const mappedAgents = result.agents.map((a) => ({
          id: a.id,
          name: a.name || a.identity?.name || a.id,
        }));
        setAgentsFromGateway(mappedAgents);
        const resolvedDefaultId = (result.defaultId || "").trim() || mappedAgents[0]?.id || "";
        setDefaultAgentId(resolvedDefaultId);
      } catch {
        /* fall back to store agents */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [client, status]);

  const shouldUseRootWorkspace = useCallback(
    (agentId: string) => agentId === "main" || (defaultAgentId !== "" && agentId === defaultAgentId),
    [defaultAgentId],
  );

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
          rootWorkspace: shouldUseRootWorkspace(agentId) ? "1" : "0",
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
    [gatewayUrl, shouldUseRootWorkspace],
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
        rootWorkspace: shouldUseRootWorkspace(selectedAgent) ? "1" : "0",
      });
      const response = await fetch(
        `/api/gateway/workspace-files/read?${params.toString()}`,
      );
      if (!response.ok)
        throw new Error(`Failed to read file: ${response.statusText}`);
      const data = await response.json();
      const fileType = getFileType(file.name);
      
      // For PDFs, convert content to base64 data URL if needed
      let content = data.content;
      if (fileType === "pdf") {
        // If content is already a data URL, use it; otherwise convert
        if (typeof content === "string" && !content.startsWith("data:")) {
          // Assume it's base64, create data URL
          content = `data:application/pdf;base64,${content}`;
        }
      }
      
      setPreview({ file, content, type: fileType });
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
          rootWorkspace: shouldUseRootWorkspace(selectedAgent) ? "1" : "0",
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

  /* ── File saving ── */
  const saveFile = useCallback(async () => {
    if (!preview || !gatewayUrl || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/gateway/workspace-files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent,
          path: preview.file.path || preview.file.name,
          content: editContent,
          gatewayUrl,
          rootWorkspace: shouldUseRootWorkspace(selectedAgent),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || data.details || "Failed to save file");
      }
      setPreview({ ...preview, content: editContent });
      setEditDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save file";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [preview, gatewayUrl, saving, editContent, selectedAgent, shouldUseRootWorkspace]);

  /* ── Debounced auto-save (2s) ── */
  const saveRef = useRef(saveFile);
  saveRef.current = saveFile;
  useEffect(() => {
    if (!editDirty || saving || !editMode) return;
    const timer = window.setTimeout(() => {
      void saveRef.current();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [editDirty, saving, editMode, editContent]);

  /* ── Markdown toolbar helpers ── */
  const insertMarkdown = useCallback(
    (prefix: string, suffix: string = "", placeholder: string = "") => {
      const textarea = editorRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = editContent.substring(start, end);
      const text = selected || placeholder;
      const before = editContent.substring(0, start);
      const after = editContent.substring(end);
      const newContent = `${before}${prefix}${text}${suffix}${after}`;
      setEditContent(newContent);
      setEditDirty(true);
      requestAnimationFrame(() => {
        textarea.focus();
        const newCursorPos = start + prefix.length + text.length;
        textarea.setSelectionRange(start + prefix.length, newCursorPos);
      });
    },
    [editContent],
  );

  const insertLinePrefix = useCallback(
    (prefix: string) => {
      const textarea = editorRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const lines = editContent.substring(start, end).split("\n");
      const prefixed = lines.map((line) => `${prefix}${line}`).join("\n");
      const before = editContent.substring(0, start);
      const after = editContent.substring(end);
      setEditContent(`${before}${prefixed}${after}`);
      setEditDirty(true);
    },
    [editContent],
  );

  const handleToggleEdit = useCallback(() => {
    if (!editMode && preview) {
      setEditContent(preview.content);
      setEditDirty(false);
      setSaveError(null);
    }
    setEditMode((prev) => !prev);
  }, [editMode, preview]);

  const handleClosePreview = useCallback(async () => {
    if (editDirty && editMode) {
      await saveFile();
    }
    setPreview(null);
    setEditMode(false);
    setEditDirty(false);
    setSaveError(null);
  }, [editDirty, editMode, saveFile]);

  const isEditable =
    preview && preview.type !== "image" && preview.type !== "pdf";

  /* ── Upload files ── */
  const handleUploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!selectedAgent || !gatewayUrl || uploading) return;
      const filesToUpload = Array.from(fileList);
      if (filesToUpload.length === 0) return;

      setUploading(true);
      setUploadResults([]);
      setShowUploadResults(true);

      try {
        const formData = new FormData();
        formData.append("agentId", selectedAgent);
        formData.append("gatewayUrl", gatewayUrl);
        formData.append(
          "rootWorkspace",
          shouldUseRootWorkspace(selectedAgent) ? "1" : "0",
        );
        formData.append("path", currentPath);

        for (const file of filesToUpload) {
          formData.append("files", file);
        }

        const response = await fetch("/api/gateway/workspace-files/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        setUploadResults(data.results || []);

        // Refresh file list
        await loadFiles(selectedAgent, currentPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setUploadResults(
          Array.from(fileList).map((f) => ({
            name: f.name,
            success: false,
            error: msg,
          })),
        );
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [selectedAgent, gatewayUrl, uploading, currentPath, shouldUseRootWorkspace, loadFiles],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (selectedAgent) setDragOver(true);
    },
    [selectedAgent],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (!selectedAgent || !e.dataTransfer.files.length) return;
      void handleUploadFiles(e.dataTransfer.files);
    },
    [selectedAgent, handleUploadFiles],
  );

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
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 rounded p-1.5 hover:bg-muted transition disabled:opacity-50 text-xs font-semibold text-primary"
              title="Upload files"
              aria-label="Upload files"
              tabIndex={0}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void handleUploadFiles(e.target.files);
                }
              }}
            />
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

        {/* ── File list (with drag-drop) ── */}
        <div
          className={`flex-1 overflow-y-auto px-6 py-3 relative ${dragOver ? "ring-2 ring-primary ring-inset" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleFileDrop}
        >
          {/* Drag overlay */}
          {dragOver && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-primary/10 backdrop-blur-sm rounded-lg border-2 border-dashed border-primary pointer-events-none">
              <Upload className="h-10 w-10 text-primary mb-2 animate-bounce" />
              <p className="text-sm font-bold text-primary">
                Drop files here
              </p>
            </div>
          )}

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

        {/* Upload results toast */}
        {showUploadResults && uploadResults.length > 0 && (
          <div className="absolute bottom-4 right-4 z-30 w-64 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30">
              <span className="text-xs font-semibold text-foreground">
                {uploading ? "Uploading…" : "Upload complete"}
              </span>
              {!uploading && (
                <button
                  onClick={() => setShowUploadResults(false)}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                  aria-label="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="max-h-36 overflow-y-auto p-1.5 space-y-1">
              {uploading && uploadResults.length === 0 && (
                <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  Uploading files…
                </div>
              )}
              {uploadResults.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/30"
                >
                  {r.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  )}
                  <span className="text-[11px] truncate flex-1" title={r.name}>
                    {r.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── File preview / edit overlay ── */}
      {(preview || previewLoading) && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => void handleClosePreview()}
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
                  <div className="flex items-center gap-2">
                    {preview?.file.size != null && (
                      <p className="text-xs text-muted-foreground">
                        {formatSize(preview.file.size)}
                      </p>
                    )}
                    {editMode && editDirty && (
                      <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
                        Unsaved
                      </span>
                    )}
                    {editMode && !editDirty && !saving && (
                      <span className="text-[10px] font-semibold text-green-500 uppercase tracking-wider">
                        Saved
                      </span>
                    )}
                    {saving && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-primary uppercase tracking-wider">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Edit / Preview toggle */}
                {isEditable && (
                  <button
                    onClick={handleToggleEdit}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                      editMode
                        ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border-border hover:bg-muted"
                    }`}
                    aria-label={editMode ? "Switch to preview" : "Switch to edit"}
                    tabIndex={0}
                  >
                    {editMode ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                    {editMode ? "Preview" : "Edit"}
                  </button>
                )}
                {/* Save button */}
                {editMode && (
                  <button
                    onClick={() => void saveFile()}
                    disabled={!editDirty || saving}
                    className="flex items-center gap-1.5 rounded-md border border-green-500/50 bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Save file"
                    tabIndex={0}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                )}
                {preview && (
                  <button
                    onClick={() =>
                      downloadFile(
                        preview.file,
                        editMode ? editContent : preview.content,
                      )
                    }
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                )}
                <button
                  onClick={() => void handleClosePreview()}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Markdown toolbar (edit mode only) */}
            {editMode && (
              <div className="flex items-center gap-1 px-6 py-2 border-b border-border/50 bg-muted/30 flex-wrap">
                <button
                  onClick={() => insertMarkdown("**", "**", "bold")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Bold"
                  aria-label="Bold"
                  tabIndex={0}
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  onClick={() => insertMarkdown("*", "*", "italic")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Italic"
                  aria-label="Italic"
                  tabIndex={0}
                >
                  <Italic className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-border/60 mx-1" />
                <button
                  onClick={() => insertLinePrefix("# ")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Heading 1"
                  aria-label="Heading 1"
                  tabIndex={0}
                >
                  <Heading1 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => insertLinePrefix("## ")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Heading 2"
                  aria-label="Heading 2"
                  tabIndex={0}
                >
                  <Heading2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => insertLinePrefix("### ")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Heading 3"
                  aria-label="Heading 3"
                  tabIndex={0}
                >
                  <Heading3 className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-border/60 mx-1" />
                <button
                  onClick={() => insertLinePrefix("- ")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Bullet list"
                  aria-label="Bullet list"
                  tabIndex={0}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => insertLinePrefix("1. ")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Numbered list"
                  aria-label="Numbered list"
                  tabIndex={0}
                >
                  <ListOrdered className="w-4 h-4" />
                </button>
                <button
                  onClick={() => insertLinePrefix("- [ ] ")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Checklist"
                  aria-label="Checklist"
                  tabIndex={0}
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-border/60 mx-1" />
                <button
                  onClick={() => insertLinePrefix("> ")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Blockquote"
                  aria-label="Blockquote"
                  tabIndex={0}
                >
                  <Quote className="w-4 h-4" />
                </button>
                <button
                  onClick={() => insertMarkdown("`", "`", "code")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Inline code"
                  aria-label="Inline code"
                  tabIndex={0}
                >
                  <Code className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    insertMarkdown("\n```\n", "\n```\n", "code block")
                  }
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Code block"
                  aria-label="Code block"
                  tabIndex={0}
                >
                  <FileCode className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-border/60 mx-1" />
                <button
                  onClick={() => insertMarkdown("[", "](url)", "link text")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Link"
                  aria-label="Link"
                  tabIndex={0}
                >
                  <Link2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => insertMarkdown("\n---\n", "", "")}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Horizontal rule"
                  aria-label="Horizontal rule"
                  tabIndex={0}
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Save error banner */}
            {saveError && (
              <div className="px-6 py-2 bg-destructive/10 border-b border-destructive/30 text-destructive text-xs font-medium">
                {saveError}
              </div>
            )}

            {/* Preview / edit content */}
            <div className="flex-1 overflow-auto p-6">
              {previewLoading ? (
                <div className="flex items-center justify-center h-48">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : editMode ? (
                <textarea
                  ref={editorRef}
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value);
                    setEditDirty(true);
                  }}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
                      e.preventDefault();
                      insertMarkdown("**", "**", "bold");
                    }
                    if ((e.ctrlKey || e.metaKey) && e.key === "i") {
                      e.preventDefault();
                      insertMarkdown("*", "*", "italic");
                    }
                    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                      e.preventDefault();
                      void saveFile();
                    }
                    if (e.key === "Tab") {
                      e.preventDefault();
                      const start = e.currentTarget.selectionStart;
                      const end = e.currentTarget.selectionEnd;
                      const newVal =
                        editContent.substring(0, start) +
                        "  " +
                        editContent.substring(end);
                      setEditContent(newVal);
                      setEditDirty(true);
                      requestAnimationFrame(() => {
                        if (editorRef.current) {
                          editorRef.current.selectionStart =
                            editorRef.current.selectionEnd = start + 2;
                        }
                      });
                    }
                  }}
                  className="w-full h-full min-h-[50vh] resize-none rounded-lg border border-border/60 bg-background px-4 py-3 font-mono text-sm text-foreground leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 scrollbar-thin"
                  placeholder="Start typing…"
                  spellCheck={false}
                />
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
                <div className="h-full min-h-[500px]">
                  <PDFViewer pdfData={preview.content} fileName={preview.file.name} />
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
