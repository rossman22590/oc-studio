'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FolderOpen, FileText, Download, ArrowLeft, ChevronRight, X, Code, FileCode, RefreshCw, Image as ImageIcon, Pencil, Eye, Save, Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Minus, Link2, CheckSquare, Loader2, Upload, CheckCircle2, AlertCircle, DownloadCloud } from 'lucide-react';
import { HeaderBar } from '@/features/agents/components/HeaderBar';
import { ConnectionSettingsModal } from '@/features/agents/components/ConnectionSettingsModal';
import { useGatewayConnection } from '@/lib/gateway/GatewayClient';
import { createStudioSettingsCoordinator } from '@/lib/studio/coordinator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dynamic from 'next/dynamic';
import JSZip from 'jszip';

// Dynamically import PDFViewer with SSR disabled to prevent server-side issues
const PDFViewer = dynamic(
  () => import('@/features/agents/components/PDFViewer').then((mod) => ({ default: mod.PDFViewer })),
  { ssr: false }
);

interface Agent {
  id: string;
  name: string;
}

interface FileEntry {
  name: string;
  size: number;
  modTime: string;
  isDirectory: boolean;
  path: string;
}

interface FilePreview {
  file: FileEntry;
  content: string;
  type: 'markdown' | 'code' | 'text' | 'pdf' | 'image' | 'unknown';
}

export default function FileManagerPage() {
  const router = useRouter();
  const [settingsCoordinator] = useState(() => createStudioSettingsCoordinator());
  const {
    client,
    status,
    gatewayUrl,
    token,
    error: gatewayError,
    connect,
    disconnect,
    setGatewayUrl,
    setToken,
  } = useGatewayConnection(settingsCoordinator);
  
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [defaultAgentId, setDefaultAgentId] = useState<string>('');
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [brokenImage, setBrokenImage] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editDirty, setEditDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ name: string; success: boolean; error?: string }[]>([]);
  const [showUploadResults, setShowUploadResults] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download All state
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

  // Enable body scrolling for this page (globals.css sets body { overflow: hidden })
  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevY = document.body.style.overflowY;
    const prevX = document.body.style.overflowX;

    document.body.style.overflow = "auto";
    document.body.style.overflowY = "auto";
    document.body.style.overflowX = "hidden";

    return () => {
      document.body.style.overflow = prev;
      document.body.style.overflowY = prevY;
      document.body.style.overflowX = prevX;
    };
  }, []);

  // Load agents from gateway
  useEffect(() => {
    if (status !== 'connected') {
      setAgents([]);
      return;
    }
    
    let cancelled = false;
    const loadAgents = async () => {
      try {
        const result = await client.call<{
          defaultId?: string;
          agents: Array<{
            id: string;
            name?: string;
            identity?: { name?: string };
          }>;
        }>('agents.list', {});
        
        if (cancelled) return;
        
        const agentList = result.agents.map((agent) => ({
          id: agent.id,
          name: agent.name || agent.identity?.name || agent.id,
        }));
        
        setAgents(agentList);
        const resolvedDefaultId = (result.defaultId || '').trim() || agentList[0]?.id || '';
        setDefaultAgentId(resolvedDefaultId);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load agents:', err);
        setError('Failed to load agents from gateway');
      }
    };
    
    void loadAgents();
    return () => {
      cancelled = true;
    };
  }, [client, status]);

  const shouldUseRootWorkspace = (agentId: string) =>
    agentId === 'main' || (defaultAgentId !== '' && agentId === defaultAgentId);

  // Load files when agent or path changes
  useEffect(() => {
    if (!selectedAgent) {
      setFiles([]);
      return;
    }
    loadFiles(selectedAgent, currentPath);
  }, [selectedAgent, currentPath]);

  const loadFiles = async (agentId: string, path: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!gatewayUrl) {
        throw new Error('Gateway URL not configured. Please connect first.');
      }

      const params = new URLSearchParams({
        agentId,
        path: path || '',
        gatewayUrl,
        rootWorkspace: shouldUseRootWorkspace(agentId) ? '1' : '0',
      });

      const response = await fetch(`/api/gateway/workspace-files?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to load files: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check if there's an error message from the API (like workspace not found)
      if (data.error) {
        setError(data.error);
        setFiles(data.entries || []);
      } else {
        setFiles(data.entries || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const getFileType = (fileName: string): FilePreview['type'] => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    
    if (ext === 'md') return 'markdown';
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
    if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'sh', 'bash', 'go', 'rs', 'php', 'rb', 'swift', 'kt'].includes(ext)) return 'code';
    if (['txt', 'log', 'csv'].includes(ext)) return 'text';
    
    return 'text'; // Default to text for unknown types
  };

  const handleFileClick = async (file: FileEntry) => {
    if (file.isDirectory) {
      // Navigate into directory
      const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      setCurrentPath(newPath);
    } else {
      // Preview file
      setBrokenImage(false); // Reset broken image state
      await previewFile(file);
    }
  };

  const previewFile = async (file: FileEntry) => {
    setPreviewLoading(true);
    try {
      if (!gatewayUrl) {
        throw new Error('Gateway URL not configured. Please connect first.');
      }

      const params = new URLSearchParams({
        agentId: selectedAgent,
        path: file.path || file.name,
        gatewayUrl,
        rootWorkspace: shouldUseRootWorkspace(selectedAgent) ? '1' : '0',
      });

      const response = await fetch(`/api/gateway/workspace-files/read?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.statusText}`);
      }

      const data = await response.json();
      const fileType = getFileType(file.name);
      
      // For PDFs, convert content to base64 data URL if needed
      let content = data.content;
      if (fileType === 'pdf') {
        // If content is already a data URL, use it; otherwise convert
        if (typeof content === 'string' && !content.startsWith('data:')) {
          // Assume it's base64, create data URL
          content = `data:application/pdf;base64,${content}`;
        } else if (typeof content === 'string' && content.startsWith('data:')) {
          // Already a data URL
          content = content;
        }
      }
      
      setPreview({
        file,
        content,
        type: fileType,
      });
    } catch (err) {
      console.error('Preview failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to preview file');
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadFile = async (file: FileEntry, content?: string) => {
    try {
      let fileContent = content;
      
      if (!fileContent) {
        if (!gatewayUrl) {
          throw new Error('Gateway URL not configured. Please connect first.');
        }

        const params = new URLSearchParams({
          agentId: selectedAgent,
          path: file.path || file.name,
          gatewayUrl,
          rootWorkspace: shouldUseRootWorkspace(selectedAgent) ? '1' : '0',
        });

        const response = await fetch(`/api/gateway/workspace-files/read?${params.toString()}`, {
          method: 'GET',
        });

        if (!response.ok) {
          throw new Error(`Failed to read file: ${response.statusText}`);
        }

        const data = await response.json();
        fileContent = data.content;
      }

      if (!fileContent) {
        throw new Error('File content is empty');
      }

      const blob = new Blob([fileContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const goUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  /* ─── File saving ─── */
  const saveFile = useCallback(async () => {
    if (!preview || !gatewayUrl || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch('/api/gateway/workspace-files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        throw new Error(data.error || data.details || 'Failed to save file');
      }
      setPreview({ ...preview, content: editContent });
      setEditDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save file';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [preview, gatewayUrl, saving, editContent, selectedAgent, shouldUseRootWorkspace]);

  /* ─── Debounced auto-save (2s after typing stops) ─── */
  const saveRef = useRef(saveFile);
  saveRef.current = saveFile;
  useEffect(() => {
    if (!editDirty || saving || !editMode) return;
    const timer = window.setTimeout(() => {
      void saveRef.current();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [editDirty, saving, editMode, editContent]);

  /* ─── Markdown toolbar helpers ─── */
  const insertMarkdown = useCallback((prefix: string, suffix: string = '', placeholder: string = '') => {
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
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + text.length;
      textarea.setSelectionRange(
        start + prefix.length,
        newCursorPos,
      );
    });
  }, [editContent]);

  const insertLinePrefix = useCallback((prefix: string) => {
    const textarea = editorRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lines = editContent.substring(start, end).split('\n');
    const prefixed = lines.map((line) => `${prefix}${line}`).join('\n');
    const before = editContent.substring(0, start);
    const after = editContent.substring(end);
    const newContent = `${before}${prefixed}${after}`;
    setEditContent(newContent);
    setEditDirty(true);
  }, [editContent]);

  /* ─── Toggle edit mode ─── */
  const handleToggleEdit = useCallback(() => {
    if (!editMode && preview) {
      setEditContent(preview.content);
      setEditDirty(false);
      setSaveError(null);
    }
    setEditMode((prev) => !prev);
  }, [editMode, preview]);

  /* ─── Close preview (save first if dirty) ─── */
  const handleClosePreview = useCallback(async () => {
    if (editDirty && editMode) {
      await saveFile();
    }
    setPreview(null);
    setEditMode(false);
    setEditDirty(false);
    setSaveError(null);
  }, [editDirty, editMode, saveFile]);

  /* ─── Is file editable? ─── */
  const isEditable = preview && preview.type !== 'image' && preview.type !== 'pdf';

  /* ─── Upload files ─── */
  const handleUploadFiles = useCallback(async (fileList: FileList | File[]) => {
    if (!selectedAgent || !gatewayUrl || uploading) return;
    const filesToUpload = Array.from(fileList);
    if (filesToUpload.length === 0) return;

    setUploading(true);
    setUploadResults([]);
    setShowUploadResults(true);

    try {
      const formData = new FormData();
      formData.append('agentId', selectedAgent);
      formData.append('gatewayUrl', gatewayUrl);
      formData.append('rootWorkspace', shouldUseRootWorkspace(selectedAgent) ? '1' : '0');
      formData.append('path', currentPath);

      for (const file of filesToUpload) {
        formData.append('files', file);
      }

      const response = await fetch('/api/gateway/workspace-files/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setUploadResults(data.results || []);

      // Refresh file list after upload
      await loadFiles(selectedAgent, currentPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadResults(Array.from(fileList).map((f) => ({ name: f.name, success: false, error: msg })));
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [selectedAgent, gatewayUrl, uploading, currentPath, shouldUseRootWorkspace, loadFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedAgent) setDragOver(true);
  }, [selectedAgent]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!selectedAgent || !e.dataTransfer.files.length) return;
    void handleUploadFiles(e.dataTransfer.files);
  }, [selectedAgent, handleUploadFiles]);

  /* ─── Download All ─── */
  const recursivelyGetFiles = async (agentId: string, path: string, allFiles: Array<{ path: string; name: string }> = []): Promise<Array<{ path: string; name: string }>> => {
    if (!gatewayUrl) return allFiles;

    const params = new URLSearchParams({
      agentId,
      path: path || '',
      gatewayUrl,
      rootWorkspace: shouldUseRootWorkspace(agentId) ? '1' : '0',
    });

    const response = await fetch(`/api/gateway/workspace-files?${params.toString()}`);
    if (!response.ok) return allFiles;

    const data = await response.json();
    const entries = data.entries || [];

    for (const entry of entries) {
      if (entry.isDirectory) {
        await recursivelyGetFiles(agentId, entry.path, allFiles);
      } else {
        allFiles.push({ path: entry.path, name: entry.name });
      }
    }

    return allFiles;
  };

  const handleDownloadAll = useCallback(async () => {
    if (!selectedAgent || !gatewayUrl || downloadingAll) return;

    setDownloadingAll(true);
    setDownloadProgress({ current: 0, total: 0 });

    try {
      // Get all files recursively
      const allFiles = await recursivelyGetFiles(selectedAgent, currentPath);
      setDownloadProgress({ current: 0, total: allFiles.length });

      if (allFiles.length === 0) {
        alert('No files to download');
        return;
      }

      // Create ZIP
      const zip = new JSZip();

      // Download each file and add to ZIP
      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        setDownloadProgress({ current: i + 1, total: allFiles.length });

        try {
          const params = new URLSearchParams({
            agentId: selectedAgent,
            path: file.path,
            gatewayUrl,
            rootWorkspace: shouldUseRootWorkspace(selectedAgent) ? '1' : '0',
          });

          const response = await fetch(`/api/gateway/workspace-files/read?${params.toString()}`);
          if (!response.ok) continue;

          const data = await response.json();
          let content = data.content;

          // Handle binary files (PDFs, images)
          const isBinary = file.path.toLowerCase().endsWith('.pdf') || 
                          file.path.toLowerCase().match(/\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/i);
          
          if (isBinary && typeof content === 'string' && content.startsWith('data:')) {
            // Extract base64 from data URL
            const base64Match = content.match(/base64,(.+)$/);
            if (base64Match) {
              content = base64Match[1];
            }
          }

          // Get relative path for ZIP structure
          // Remove workspace prefix and current path prefix
          let relativePath = file.path;
          // Remove workspace-{agentId}/ prefix if present
          relativePath = relativePath.replace(/^workspace-[^/]+\//, '');
          // Remove currentPath prefix if we're in a subdirectory
          if (currentPath) {
            const pathPrefix = currentPath + '/';
            if (relativePath.startsWith(pathPrefix)) {
              relativePath = relativePath.substring(pathPrefix.length);
            }
          }

          if (isBinary && typeof content === 'string') {
            zip.file(relativePath, content, { base64: true });
          } else {
            zip.file(relativePath, content);
          }
        } catch (err) {
          console.error(`Failed to download ${file.name}:`, err);
        }
      }

      // Generate and download ZIP
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const zipName = currentPath 
        ? `${currentPath.split('/').pop() || 'workspace'}.zip`
        : `workspace-${selectedAgent}-all.zip`;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download all failed:', err);
      alert('Failed to download files. Please try again.');
    } finally {
      setDownloadingAll(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  }, [selectedAgent, gatewayUrl, currentPath, downloadingAll, shouldUseRootWorkspace]);

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pathParts = currentPath ? currentPath.split('/') : [];

  return (
    <div className="relative min-h-screen w-screen bg-background">
      <div className="relative z-10 flex flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6">
        <div className="w-full shrink-0">
          <HeaderBar
            status={status}
            onConnectionSettings={() => setShowConnectionModal((prev) => !prev)}
            onBrainFiles={() => router.push('/studio')}
            brainFilesOpen={false}
            brainDisabled={agents.length === 0}
            showFilesButton={true}
            showHomeButton={true}
            showSwarmButton={true}
            swarmDisabled={agents.length === 0 || status !== 'connected'}
            onSwarm={() => router.push('/studio')}
            showChatroomButton={true}
            chatroomDisabled={agents.length === 0 || status !== 'connected'}
            onChatroom={() => router.push('/studio')}
            showKanbanButton={true}
            kanbanDisabled={agents.length === 0 || status !== 'connected'}
            onKanban={() => router.push('/studio')}
          />
        </div>

        {error && (
          <div className="w-full shrink-0">
            <div className="rounded-md border border-destructive bg-destructive px-4 py-2 text-sm text-destructive-foreground">
              {error}
            </div>
          </div>
        )}

        <div
          className={`glass-panel fade-up overflow-visible p-4 sm:p-6 relative ${dragOver ? 'ring-2 ring-primary ring-offset-2' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {dragOver && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-primary/10 backdrop-blur-sm rounded-lg border-2 border-dashed border-primary pointer-events-none">
              <Upload className="w-16 h-16 text-primary mb-4 animate-bounce" />
              <p className="text-lg font-bold text-primary">Drop files here to upload</p>
              <p className="text-sm text-muted-foreground mt-1">Files will be uploaded to the current directory</p>
            </div>
          )}

          <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 console-title text-foreground">File Manager</h1>
          
          {/* Agent Selection */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
            <label htmlFor="agent-select" className="font-medium text-sm text-muted-foreground shrink-0">
              Agent:
            </label>
            <select
              id="agent-select"
              value={selectedAgent}
              onChange={(e) => {
                setSelectedAgent(e.target.value);
                setCurrentPath('');
              }}
              disabled={status !== 'connected'}
              className="w-full sm:w-auto flex-1 sm:flex-none px-4 py-2.5 border border-primary/50 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:border-primary/70 transition-colors min-h-[44px]"
            >
              <option value="">
                {status !== 'connected' ? 'Connect to gateway first...' : 'Choose an agent...'}
              </option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Bar and Refresh */}
          {selectedAgent && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files and folders..."
                  className="w-full pl-10 pr-4 py-3 border border-primary/50 rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring shadow-sm hover:border-primary/70 transition-colors min-h-[44px]"
                />
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <button
                  onClick={() => loadFiles(selectedAgent, currentPath)}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-primary/10 hover:bg-primary/20 border border-primary/50 rounded-lg text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium min-h-[44px] flex-1 sm:flex-none"
                  title="Refresh"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
                {/* Upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-primary/10 hover:bg-primary/20 border border-primary/50 rounded-lg text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium min-h-[44px] flex-1 sm:flex-none"
                  aria-label="Upload files"
                  title="Upload files"
                  tabIndex={0}
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                  <span className="hidden sm:inline">{uploading ? 'Uploading…' : 'Upload'}</span>
                </button>
                {/* Download All button */}
                <button
                  onClick={() => void handleDownloadAll()}
                  disabled={downloadingAll || !selectedAgent}
                  className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-primary/10 hover:bg-primary/20 border border-primary/50 rounded-lg text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium min-h-[44px] flex-1 sm:flex-none"
                  aria-label="Download all files"
                  title="Download all files"
                  tabIndex={0}
                >
                  {downloadingAll ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <DownloadCloud className="w-5 h-5" />
                  )}
                  <span className="hidden sm:inline">
                    {downloadingAll 
                      ? `Downloading… ${downloadProgress.current}/${downloadProgress.total}`
                      : 'Download All'}
                  </span>
                </button>
              </div>
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

          {/* Breadcrumb Navigation */}
          {selectedAgent && (
            <div className="mb-4 rounded-md border border-border/80 bg-muted/30 px-3 sm:px-4 py-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm min-w-max">
                {currentPath && (
                  <button
                    onClick={goUp}
                    className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors font-medium min-h-[44px] shrink-0"
                    title="Go up"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Up</span>
                  </button>
                )}
                <span className="text-muted-foreground shrink-0">workspace-{selectedAgent}</span>
                {pathParts.map((part, i) => (
                  <div key={i} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
                    <button
                      onClick={() => {
                        const newPath = pathParts.slice(0, i + 1).join('/');
                        setCurrentPath(newPath);
                      }}
                      className="hover:text-primary transition-colors font-medium truncate max-w-[120px] sm:max-w-none"
                      title={part}
                    >
                      {part}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File Grid */}
          {!selectedAgent ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FolderOpen className="w-16 h-16 mb-4" />
              {status === 'connecting' ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                  <p className="text-lg">Connecting to gateway...</p>
                </div>
              ) : status === 'connected' ? (
                <p className="text-lg">Select an agent to view their workspace</p>
              ) : gatewayError ? (
                <div className="flex flex-col items-center gap-4 max-w-lg text-center">
                  <p className="text-lg text-destructive">Connection Failed</p>
                  <p className="text-sm">{gatewayError}</p>
                  <button
                    onClick={() => setShowConnectionModal(true)}
                    className="px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/50 rounded-lg text-primary transition-colors"
                  >
                    Update Connection Settings
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-lg">Connect to gateway to view agent workspaces</p>
                  <button
                    onClick={() => setShowConnectionModal(true)}
                    className="px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/50 rounded-lg text-primary transition-colors"
                  >
                    Connect to Gateway
                  </button>
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileText className="w-16 h-16 mb-4" />
              <p className="text-lg">
                {searchQuery ? 'No files match your search' : 'No files in this directory'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
              {filteredFiles.map((file, index) => (
                <div
                  key={index}
                  onClick={() => handleFileClick(file)}
                  className="group relative flex flex-col items-center p-3 sm:p-4 rounded-lg border border-border/50 bg-card hover:bg-primary/5 hover:border-primary/50 cursor-pointer transition-all hover:shadow-lg hover:shadow-primary/10 active:scale-95 min-h-[100px] sm:min-h-[120px]"
                >
                  {/* File Icon */}
                  <div className="mb-2 sm:mb-3">
                    {file.isDirectory ? (
                      <FolderOpen className="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
                    ) : (
                      <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-gray-500" />
                    )}
                  </div>

                  {/* File Name */}
                  <p className="text-xs sm:text-sm text-center break-words w-full line-clamp-2 mb-1 sm:mb-2 px-1">
                    {file.name}
                  </p>

                  {/* File Size */}
                  {!file.isDirectory && (
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  )}

                  {/* Download Button (only for files) */}
                  {!file.isDirectory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFile(file);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConnectionSettingsModal
        isOpen={showConnectionModal}
        gatewayUrl={gatewayUrl}
        token={token}
        status={status}
        error={gatewayError}
        onClose={() => setShowConnectionModal(false)}
        onGatewayUrlChange={setGatewayUrl}
        onTokenChange={setToken}
        onConnect={() => void connect()}
        onDisconnect={disconnect}
      />

      {/* Upload results toast */}
      {showUploadResults && uploadResults.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:bottom-6 sm:right-6 sm:left-auto z-[60] w-auto sm:w-80 rounded-lg border border-border bg-card shadow-2xl overflow-hidden animate-scale-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
            <span className="text-sm font-semibold text-foreground">
              Upload {uploading ? 'in progress…' : 'complete'}
            </span>
            {!uploading && (
              <button
                onClick={() => setShowUploadResults(false)}
                className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto p-2 space-y-1">
            {uploading && uploadResults.length === 0 && (
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Uploading files…
              </div>
            )}
            {uploadResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30">
                {r.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                )}
                <span className="text-xs truncate flex-1" title={r.name}>{r.name}</span>
                {r.error && (
                  <span className="text-[10px] text-red-500 truncate max-w-[120px]" title={r.error}>
                    {r.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Preview / Edit Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-2 sm:p-4">
          <div className="relative w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] rounded-lg border border-border bg-card shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/80">
              <div className="flex items-center gap-3">
                {preview.type === 'markdown' ? (
                  <FileText className="w-5 h-5 text-primary" />
                ) : preview.type === 'code' ? (
                  <FileCode className="w-5 h-5 text-primary" />
                ) : (
                  <FileText className="w-5 h-5 text-primary/80" />
                )}
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{preview.file.name}</h2>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">{formatFileSize(preview.file.size)}</p>
                    {editMode && editDirty && (
                      <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Unsaved</span>
                    )}
                    {editMode && !editDirty && !saving && (
                      <span className="text-[10px] font-semibold text-green-500 uppercase tracking-wider">Saved</span>
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
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium shadow-sm transition-colors ${
                      editMode
                        ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border-primary/50 bg-primary/10 hover:bg-primary/20 text-primary'
                    }`}
                    aria-label={editMode ? 'Switch to preview' : 'Switch to edit'}
                    tabIndex={0}
                  >
                    {editMode ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    {editMode ? 'Preview' : 'Edit'}
                  </button>
                )}
                {/* Save button (only in edit mode) */}
                {editMode && (
                  <button
                    onClick={() => void saveFile()}
                    disabled={!editDirty || saving}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-green-500/50 bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 transition-colors text-sm font-medium shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Save file"
                    tabIndex={0}
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                )}
                <button
                  onClick={() => downloadFile(preview.file, editMode ? editContent : preview.content)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/50 bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-sm font-medium shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={() => void handleClosePreview()}
                  className="p-2 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Markdown toolbar (only in edit mode) */}
            {editMode && (
              <div className="flex items-center gap-1 px-6 py-2 border-b border-border/50 bg-muted/30 flex-wrap">
                {/* Bold */}
                <button
                  onClick={() => insertMarkdown('**', '**', 'bold')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Bold (Ctrl+B)"
                  aria-label="Bold"
                  tabIndex={0}
                >
                  <Bold className="w-4 h-4" />
                </button>
                {/* Italic */}
                <button
                  onClick={() => insertMarkdown('*', '*', 'italic')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Italic (Ctrl+I)"
                  aria-label="Italic"
                  tabIndex={0}
                >
                  <Italic className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-border/60 mx-1" />
                {/* H1 */}
                <button
                  onClick={() => insertLinePrefix('# ')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Heading 1"
                  aria-label="Heading 1"
                  tabIndex={0}
                >
                  <Heading1 className="w-4 h-4" />
                </button>
                {/* H2 */}
                <button
                  onClick={() => insertLinePrefix('## ')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Heading 2"
                  aria-label="Heading 2"
                  tabIndex={0}
                >
                  <Heading2 className="w-4 h-4" />
                </button>
                {/* H3 */}
                <button
                  onClick={() => insertLinePrefix('### ')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Heading 3"
                  aria-label="Heading 3"
                  tabIndex={0}
                >
                  <Heading3 className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-border/60 mx-1" />
                {/* Unordered List */}
                <button
                  onClick={() => insertLinePrefix('- ')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Bullet list"
                  aria-label="Bullet list"
                  tabIndex={0}
                >
                  <List className="w-4 h-4" />
                </button>
                {/* Ordered List */}
                <button
                  onClick={() => insertLinePrefix('1. ')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Numbered list"
                  aria-label="Numbered list"
                  tabIndex={0}
                >
                  <ListOrdered className="w-4 h-4" />
                </button>
                {/* Checklist */}
                <button
                  onClick={() => insertLinePrefix('- [ ] ')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Checklist"
                  aria-label="Checklist"
                  tabIndex={0}
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-border/60 mx-1" />
                {/* Blockquote */}
                <button
                  onClick={() => insertLinePrefix('> ')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Blockquote"
                  aria-label="Blockquote"
                  tabIndex={0}
                >
                  <Quote className="w-4 h-4" />
                </button>
                {/* Inline code */}
                <button
                  onClick={() => insertMarkdown('`', '`', 'code')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Inline code"
                  aria-label="Inline code"
                  tabIndex={0}
                >
                  <Code className="w-4 h-4" />
                </button>
                {/* Code block */}
                <button
                  onClick={() => insertMarkdown('\n```\n', '\n```\n', 'code block')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Code block"
                  aria-label="Code block"
                  tabIndex={0}
                >
                  <FileCode className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-border/60 mx-1" />
                {/* Link */}
                <button
                  onClick={() => insertMarkdown('[', '](url)', 'link text')}
                  className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Link"
                  aria-label="Link"
                  tabIndex={0}
                >
                  <Link2 className="w-4 h-4" />
                </button>
                {/* Horizontal rule */}
                <button
                  onClick={() => insertMarkdown('\n---\n', '', '')}
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

            {/* Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 touch-pan-y">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
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
                    // Ctrl+B → bold
                    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                      e.preventDefault();
                      insertMarkdown('**', '**', 'bold');
                    }
                    // Ctrl+I → italic
                    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
                      e.preventDefault();
                      insertMarkdown('*', '*', 'italic');
                    }
                    // Ctrl+S → save
                    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                      e.preventDefault();
                      void saveFile();
                    }
                    // Tab → insert 2 spaces
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const start = e.currentTarget.selectionStart;
                      const end = e.currentTarget.selectionEnd;
                      const newVal = editContent.substring(0, start) + '  ' + editContent.substring(end);
                      setEditContent(newVal);
                      setEditDirty(true);
                      requestAnimationFrame(() => {
                        if (editorRef.current) {
                          editorRef.current.selectionStart = editorRef.current.selectionEnd = start + 2;
                        }
                      });
                    }
                  }}
                  className="w-full h-full min-h-[60vh] resize-none rounded-lg border border-border/60 bg-background px-4 py-3 font-mono text-sm text-foreground leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 scrollbar-thin"
                  placeholder="Start typing…"
                  spellCheck={false}
                />
              ) : preview.type === 'markdown' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {preview.content}
                  </ReactMarkdown>
                </div>
              ) : preview.type === 'code' ? (
                <pre className="bg-muted/30 rounded-lg p-4 overflow-x-auto">
                  <code className="text-sm font-mono text-foreground">
                    {preview.content}
                  </code>
                </pre>
              ) : preview.type === 'pdf' ? (
                <div className="h-full min-h-[600px]">
                  <PDFViewer pdfData={preview.content} fileName={preview.file.name} />
                </div>
              ) : preview.type === 'image' ? (
                brokenImage ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <ImageIcon className="w-24 h-24 mb-4 opacity-50" />
                    <p className="text-lg font-semibold mb-2">Image failed to load</p>
                    <p className="text-sm mb-6">The image file may be corrupted or in an unsupported format</p>
                    <button
                      onClick={() => downloadFile(preview.file, preview.content)}
                      className="flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Download instead
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <img
                      src={preview.content}
                      alt={preview.file.name}
                      className="max-w-full max-h-full object-contain rounded-lg"
                      onError={() => setBrokenImage(true)}
                    />
                  </div>
                )
              ) : (
                <pre className="bg-muted/30 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-words">
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
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round(bytes / Math.pow(k, i) * 10) / 10} ${sizes[i]}`;
}
