'use client';

import { useState, useEffect } from 'react';
import { Search, FolderOpen, FileText, Download, ArrowLeft, ChevronRight, X, Code, FileCode } from 'lucide-react';
import { HeaderBar } from '@/features/agents/components/HeaderBar';
import { ConnectionSettingsModal } from '@/features/agents/components/ConnectionSettingsModal';
import { useGatewayConnection } from '@/lib/gateway/GatewayClient';
import { createStudioSettingsCoordinator } from '@/lib/studio/coordinator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
      });

      const response = await fetch(`/api/gateway/workspace-files/read?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.statusText}`);
      }

      const data = await response.json();
      setPreview({
        file,
        content: data.content,
        type: getFileType(file.name),
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

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pathParts = currentPath ? currentPath.split('/') : [];

  return (
    <div className="relative min-h-screen w-screen overflow-hidden bg-background">
      <div className="relative z-10 flex h-screen flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6">
        <div className="w-full">
          <HeaderBar
            status={status}
            onConnectionSettings={() => setShowConnectionModal((prev) => !prev)}
            onBrainFiles={() => {}}
            brainFilesOpen={false}
            brainDisabled={true}
            showFilesButton={false}
            showHomeButton={true}
          />
        </div>

        {error && (
          <div className="w-full">
            <div className="rounded-md border border-destructive bg-destructive px-4 py-2 text-sm text-destructive-foreground">
              {error}
            </div>
          </div>
        )}

        <div className="glass-panel fade-up min-h-0 flex-1 overflow-hidden p-4 sm:p-6">
          <h1 className="text-2xl font-bold mb-6 console-title text-foreground">File Manager</h1>
          
          {/* Agent Selection */}
          <div className="flex items-center gap-4 mb-6">
            <label htmlFor="agent-select" className="font-medium text-sm text-muted-foreground">
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
              className="px-4 py-2 border border-pink-400/50 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:border-pink-500/70 transition-colors"
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

          {/* Search Bar */}
          {selectedAgent && (
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files and folders..."
                className="w-full pl-10 pr-4 py-3 border border-pink-400/50 rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pink-500 shadow-sm hover:border-pink-500/70 transition-colors"
              />
            </div>
          )}

          {/* Breadcrumb Navigation */}
          {selectedAgent && (
            <div className="mb-4 rounded-md border border-border/80 bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-2 text-sm">
                {currentPath && (
                  <button
                    onClick={goUp}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 transition-colors font-medium"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Up
                  </button>
                )}
                <span className="text-muted-foreground">workspace-{selectedAgent}</span>
                {pathParts.map((part, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    <button
                      onClick={() => {
                        const newPath = pathParts.slice(0, i + 1).join('/');
                        setCurrentPath(newPath);
                      }}
                      className="hover:text-pink-600 dark:hover:text-pink-400 transition-colors font-medium"
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
                  <div className="animate-spin w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full" />
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
                    className="px-4 py-2 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-400/50 rounded-lg text-pink-600 dark:text-pink-400 transition-colors"
                  >
                    Update Connection Settings
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-lg">Connect to gateway to view agent workspaces</p>
                  <button
                    onClick={() => setShowConnectionModal(true)}
                    className="px-4 py-2 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-400/50 rounded-lg text-pink-600 dark:text-pink-400 transition-colors"
                  >
                    Connect to Gateway
                  </button>
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileText className="w-16 h-16 mb-4" />
              <p className="text-lg">
                {searchQuery ? 'No files match your search' : 'No files in this directory'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
              {filteredFiles.map((file, index) => (
                <div
                  key={index}
                  onClick={() => handleFileClick(file)}
                  className="group relative flex flex-col items-center p-4 rounded-lg border border-border/50 bg-card hover:bg-pink-500/5 hover:border-pink-500/50 cursor-pointer transition-all hover:shadow-lg hover:shadow-pink-500/10"
                >
                  {/* File Icon */}
                  <div className="mb-3">
                    {file.isDirectory ? (
                      <FolderOpen className="w-12 h-12 text-pink-500" />
                    ) : (
                      <FileText className="w-12 h-12 text-gray-500" />
                    )}
                  </div>

                  {/* File Name */}
                  <p className="text-sm text-center break-words w-full line-clamp-2 mb-2">
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
                      className="absolute top-2 right-2 p-1.5 rounded bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
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

      {/* File Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="relative w-full max-w-5xl max-h-[90vh] m-4 rounded-lg border border-border bg-card shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/80">
              <div className="flex items-center gap-3">
                {preview.type === 'markdown' ? (
                  <FileText className="w-5 h-5 text-pink-500" />
                ) : preview.type === 'code' ? (
                  <FileCode className="w-5 h-5 text-pink-600" />
                ) : (
                  <FileText className="w-5 h-5 text-pink-400" />
                )}
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{preview.file.name}</h2>
                  <p className="text-xs text-muted-foreground">{formatFileSize(preview.file.size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadFile(preview.file, preview.content)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border border-pink-400/50 bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 transition-colors text-sm font-medium shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="p-2 rounded-md hover:bg-pink-500/10 text-muted-foreground hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full" />
                </div>
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
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <FileText className="w-16 h-16 mb-4" />
                  <p className="text-lg mb-4">PDF preview not yet supported</p>
                  <button
                    onClick={() => downloadFile(preview.file, preview.content)}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-pink-500 to-pink-600 text-white hover:from-pink-600 hover:to-pink-700 transition-all shadow-lg shadow-pink-500/30 hover:shadow-xl hover:shadow-pink-500/40 font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Download to view
                  </button>
                </div>
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
