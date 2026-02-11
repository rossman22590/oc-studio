"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { AgentState } from "@/features/agents/state/store";
import { formatCronPayload, formatCronSchedule, type CronJobSummary } from "@/lib/cron/types";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import type { AgentHeartbeatSummary } from "@/lib/gateway/agentConfig";
import {
  listGatewayAgentFiles,
  readGatewayAgentFile,
  readGatewayAgentTextFile,
  writeGatewayAgentFile,
  type GatewayAgentFileEntry,
} from "@/lib/gateway/agentFiles";
import {
  AGENT_FILE_META,
  AGENT_FILE_NAMES,
  AGENT_FILE_PLACEHOLDERS,
  createAgentFilesState,
  isAgentFileName,
  type AgentFileName,
} from "@/lib/agents/agentFiles";

const AgentInspectHeader = ({
  label,
  title,
  onClose,
  closeTestId,
  closeDisabled,
}: {
  label: string;
  title: string;
  onClose: () => void;
  closeTestId: string;
  closeDisabled?: boolean;
}) => {
  return (
    <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
      <div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <div className="console-title text-2xl leading-none text-foreground">{title}</div>
      </div>
      <button
        className="rounded-md border border-border/80 bg-card/70 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-border hover:bg-muted/65"
        type="button"
        data-testid={closeTestId}
        disabled={closeDisabled}
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
};

type AgentSettingsPanelProps = {
  agent: AgentState;
  onClose: () => void;
  onRename: (value: string) => Promise<boolean>;
  onNewSession: () => Promise<void> | void;
  onDelete: () => void;
  canDelete?: boolean;
  onToolCallingToggle: (enabled: boolean) => void;
  onThinkingTracesToggle: (enabled: boolean) => void;
  cronJobs: CronJobSummary[];
  cronLoading: boolean;
  cronError: string | null;
  cronRunBusyJobId: string | null;
  cronDeleteBusyJobId: string | null;
  onRunCronJob: (jobId: string) => Promise<void> | void;
  onDeleteCronJob: (jobId: string) => Promise<void> | void;
  heartbeats?: AgentHeartbeatSummary[];
  heartbeatLoading?: boolean;
  heartbeatError?: string | null;
  heartbeatRunBusyId?: string | null;
  heartbeatDeleteBusyId?: string | null;
  onRunHeartbeat?: (heartbeatId: string) => Promise<void> | void;
  onDeleteHeartbeat?: (heartbeatId: string) => Promise<void> | void;
};

const formatHeartbeatSchedule = (heartbeat: AgentHeartbeatSummary) =>
  `Every ${heartbeat.heartbeat.every}`;

const formatHeartbeatTarget = (heartbeat: AgentHeartbeatSummary) =>
  `Target: ${heartbeat.heartbeat.target}`;

const formatHeartbeatSource = (heartbeat: AgentHeartbeatSummary) =>
  heartbeat.source === "override" ? "Override" : "Inherited";

export const AgentSettingsPanel = ({
  agent,
  onClose,
  onRename,
  onNewSession,
  onDelete,
  canDelete = true,
  onToolCallingToggle,
  onThinkingTracesToggle,
  cronJobs,
  cronLoading,
  cronError,
  cronRunBusyJobId,
  cronDeleteBusyJobId,
  onRunCronJob,
  onDeleteCronJob,
  heartbeats = [],
  heartbeatLoading = false,
  heartbeatError = null,
  heartbeatRunBusyId = null,
  heartbeatDeleteBusyId = null,
  onRunHeartbeat = () => {},
  onDeleteHeartbeat = () => {},
}: AgentSettingsPanelProps) => {
  const [nameDraft, setNameDraft] = useState(agent.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);

  useEffect(() => {
    setNameDraft(agent.name);
    setRenameError(null);
  }, [agent.agentId, agent.name]);

  const handleRename = async () => {
    const next = nameDraft.trim();
    if (!next) {
      setRenameError("Agent name is required.");
      return;
    }
    if (next === agent.name) {
      setRenameError(null);
      return;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      const ok = await onRename(next);
      if (!ok) {
        setRenameError("Failed to rename agent.");
        return;
      }
      setNameDraft(next);
    } finally {
      setRenameSaving(false);
    }
  };

  const handleNewSession = async () => {
    setSessionBusy(true);
    try {
      await onNewSession();
    } finally {
      setSessionBusy(false);
    }
  };

  return (
    <div
      className="agent-inspect-panel"
      data-testid="agent-settings-panel"
      style={{ position: "relative", left: "auto", top: "auto", width: "100%", height: "100%" }}
    >
      <AgentInspectHeader
        label="Agent settings"
        title={agent.name}
        onClose={onClose}
        closeTestId="agent-settings-close"
      />

      <div className="flex flex-col gap-4 p-4">
        <section
          className="rounded-md border border-border/80 bg-card/70 p-4"
          data-testid="agent-settings-identity"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Identity
          </div>
          <label className="mt-3 flex flex-col gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>Agent name</span>
            <input
              aria-label="Agent name"
              className="h-10 rounded-md border border-border bg-card/75 px-3 text-xs font-semibold text-foreground outline-none"
              value={nameDraft}
              disabled={renameSaving}
              onChange={(event) => setNameDraft(event.target.value)}
            />
          </label>
          {renameError ? (
            <div className="mt-3 rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
              {renameError}
            </div>
          ) : null}
          <div className="mt-3 flex justify-end">
            <button
              className="rounded-md border border-transparent bg-primary/90 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              type="button"
              onClick={() => {
                void handleRename();
              }}
              disabled={renameSaving}
            >
              {renameSaving ? "Saving..." : "Update Name"}
            </button>
          </div>
        </section>

        <section
          className="rounded-md border border-border/80 bg-card/70 p-4"
          data-testid="agent-settings-display"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Display
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/80 bg-card/75 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Show tool calls</span>
              <input
                aria-label="Show tool calls"
                type="checkbox"
                className="h-4 w-4 rounded border-input text-foreground"
                checked={agent.toolCallingEnabled}
                onChange={(event) => onToolCallingToggle(event.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/80 bg-card/75 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Show thinking</span>
              <input
                aria-label="Show thinking"
                type="checkbox"
                className="h-4 w-4 rounded border-input text-foreground"
                checked={agent.showThinkingTraces}
                onChange={(event) => onThinkingTracesToggle(event.target.checked)}
              />
            </label>
          </div>
        </section>

        <section
          className="rounded-md border border-border/80 bg-card/70 p-4"
          data-testid="agent-settings-session"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Session
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            Start this agent in a fresh session and clear the visible transcript in Studio.
          </div>
          <button
            className="mt-3 w-full rounded-md border border-border/80 bg-card/75 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-border hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-70"
            type="button"
            onClick={() => {
              void handleNewSession();
            }}
            disabled={sessionBusy}
          >
            {sessionBusy ? "Starting..." : "New session"}
          </button>
        </section>

        <section
          className="rounded-md border border-border/80 bg-card/70 p-4"
          data-testid="agent-settings-cron"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Cron jobs
          </div>
          {cronLoading ? (
            <div className="mt-3 text-[11px] text-muted-foreground">Loading cron jobs...</div>
          ) : null}
          {!cronLoading && cronError ? (
            <div className="mt-3 rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
              {cronError}
            </div>
          ) : null}
          {!cronLoading && !cronError && cronJobs.length === 0 ? (
            <div className="mt-3 text-[11px] text-muted-foreground">
              No cron jobs for this agent.
            </div>
          ) : null}
          {!cronLoading && !cronError && cronJobs.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {cronJobs.map((job) => {
                const runBusy = cronRunBusyJobId === job.id;
                const deleteBusy = cronDeleteBusyJobId === job.id;
                const busy = runBusy || deleteBusy;
                return (
                  <div
                    key={job.id}
                    className="group/cron flex items-start justify-between gap-2 rounded-md border border-border/80 bg-card/75 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
                        {job.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatCronSchedule(job.schedule)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatCronPayload(job.payload)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition group-focus-within/cron:opacity-100 group-hover/cron:opacity-100">
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-card/70 text-muted-foreground transition hover:border-border hover:bg-muted/65 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        aria-label={`Run cron job ${job.name} now`}
                        onClick={() => {
                          void onRunCronJob(job.id);
                        }}
                        disabled={busy}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-destructive/40 bg-transparent text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        aria-label={`Delete cron job ${job.name}`}
                        onClick={() => {
                          void onDeleteCronJob(job.id);
                        }}
                        disabled={busy}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        <section
          className="rounded-md border border-border/80 bg-card/70 p-4"
          data-testid="agent-settings-heartbeat"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Heartbeats
          </div>
          {heartbeatLoading ? (
            <div className="mt-3 text-[11px] text-muted-foreground">Loading heartbeats...</div>
          ) : null}
          {!heartbeatLoading && heartbeatError ? (
            <div className="mt-3 rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
              {heartbeatError}
            </div>
          ) : null}
          {!heartbeatLoading && !heartbeatError && heartbeats.length === 0 ? (
            <div className="mt-3 text-[11px] text-muted-foreground">
              No heartbeats for this agent.
            </div>
          ) : null}
          {!heartbeatLoading && !heartbeatError && heartbeats.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {heartbeats.map((heartbeat) => {
                const runBusy = heartbeatRunBusyId === heartbeat.id;
                const deleteBusy = heartbeatDeleteBusyId === heartbeat.id;
                const busy = runBusy || deleteBusy;
                const deleteAllowed = heartbeat.source === "override";
                return (
                  <div
                    key={heartbeat.id}
                    className="group/heartbeat flex items-start justify-between gap-2 rounded-md border border-border/80 bg-card/75 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
                        {heartbeat.agentId}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatHeartbeatSchedule(heartbeat)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatHeartbeatTarget(heartbeat)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatHeartbeatSource(heartbeat)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition group-focus-within/heartbeat:opacity-100 group-hover/heartbeat:opacity-100">
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-card/70 text-muted-foreground transition hover:border-border hover:bg-muted/65 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        aria-label={`Run heartbeat for ${heartbeat.agentId} now`}
                        onClick={() => {
                          void onRunHeartbeat(heartbeat.id);
                        }}
                        disabled={busy}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-destructive/40 bg-transparent text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        aria-label={`Delete heartbeat for ${heartbeat.agentId}`}
                        onClick={() => {
                          void onDeleteHeartbeat(heartbeat.id);
                        }}
                        disabled={busy || !deleteAllowed}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        {canDelete ? (
          <section className="rounded-md border border-destructive/30 bg-destructive/4 p-4">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-destructive">
              Delete agent
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              Removes the agent from the gateway config and deletes its cron jobs.
            </div>
            <button
              className="mt-3 w-full rounded-md border border-destructive/50 bg-transparent px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-destructive shadow-sm transition hover:bg-destructive/10"
              type="button"
              onClick={onDelete}
            >
              Delete agent
            </button>
          </section>
        ) : (
          <section className="rounded-md border border-border/80 bg-card/70 p-4">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              System agent
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              The main agent is reserved and cannot be deleted.
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

type AgentBrainPanelProps = {
  client: GatewayClient;
  agents: AgentState[];
  selectedAgentId: string | null;
  onClose: () => void;
};

type AgentFilesState = ReturnType<typeof createAgentFilesState>;

type UseAgentFilesEditorResult = {
  agentFiles: AgentFilesState;
  agentFileTab: AgentFileName;
  agentFilesLoading: boolean;
  agentFilesSaving: boolean;
  agentFilesDirty: boolean;
  agentFilesError: string | null;
  setAgentFileContent: (value: string) => void;
  handleAgentFileTabChange: (nextTab: AgentFileName) => Promise<void>;
  saveAgentFiles: () => Promise<boolean>;
};

const useAgentFilesEditor = (params: {
  client: GatewayClient | null | undefined;
  agentId: string | null | undefined;
}): UseAgentFilesEditorResult => {
  const { client, agentId } = params;
  const [agentFiles, setAgentFiles] = useState(createAgentFilesState);
  const [agentFileTab, setAgentFileTab] = useState<AgentFileName>(AGENT_FILE_NAMES[0]);
  const [agentFilesLoading, setAgentFilesLoading] = useState(false);
  const [agentFilesSaving, setAgentFilesSaving] = useState(false);
  const [agentFilesDirty, setAgentFilesDirty] = useState(false);
  const [agentFilesError, setAgentFilesError] = useState<string | null>(null);

  const loadAgentFiles = useCallback(async () => {
    setAgentFilesLoading(true);
    setAgentFilesError(null);
    try {
      const trimmedAgentId = agentId?.trim();
      if (!trimmedAgentId) {
        setAgentFiles(createAgentFilesState());
        setAgentFilesDirty(false);
        setAgentFilesError("Agent ID is missing for this agent.");
        return;
      }
      if (!client) {
        setAgentFilesError("Gateway client is not available.");
        return;
      }
      const supportedMethods = client.getLastHello()?.features?.methods ?? null;
      if (Array.isArray(supportedMethods) && !supportedMethods.includes("agents.files.get")) {
        setAgentFiles(createAgentFilesState());
        setAgentFilesDirty(false);
        setAgentFilesError(
          "This gateway does not expose agents.files.get. If you're connecting through a proxy, configure gateway.trustedProxies (so the gateway can treat you as local), or run Studio on the gateway host. Otherwise update OpenClaw."
        );
        return;
      }
      const results = await Promise.all(
        AGENT_FILE_NAMES.map(async (name) => {
          const file = await readGatewayAgentFile({ client, agentId: trimmedAgentId, name });
          return { name, content: file.content, exists: file.exists };
        })
      );
      const nextState = createAgentFilesState();
      for (const file of results) {
        if (!isAgentFileName(file.name)) continue;
        nextState[file.name] = {
          content: file.content ?? "",
          exists: Boolean(file.exists),
        };
      }
      setAgentFiles(nextState);
      setAgentFilesDirty(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load agent files.";
      setAgentFilesError(message);
    } finally {
      setAgentFilesLoading(false);
    }
  }, [agentId, client]);

  const saveAgentFiles = useCallback(async () => {
    setAgentFilesSaving(true);
    setAgentFilesError(null);
    try {
      const trimmedAgentId = agentId?.trim();
      if (!trimmedAgentId) {
        setAgentFilesError("Agent ID is missing for this agent.");
        return false;
      }
      if (!client) {
        setAgentFilesError("Gateway client is not available.");
        return false;
      }
      const supportedMethods = client.getLastHello()?.features?.methods ?? null;
      if (Array.isArray(supportedMethods) && !supportedMethods.includes("agents.files.set")) {
        setAgentFilesError(
          "This gateway does not expose agents.files.set. If you're connecting through a proxy, configure gateway.trustedProxies (so the gateway can treat you as local), or run Studio on the gateway host. Otherwise update OpenClaw."
        );
        return false;
      }
      await Promise.all(
        AGENT_FILE_NAMES.map(async (name) => {
          await writeGatewayAgentFile({
            client,
            agentId: trimmedAgentId,
            name,
            content: agentFiles[name].content,
          });
        })
      );
      const nextState = createAgentFilesState();
      for (const name of AGENT_FILE_NAMES) {
        nextState[name] = {
          content: agentFiles[name].content,
          exists: true,
        };
      }
      setAgentFiles(nextState);
      setAgentFilesDirty(false);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save agent files.";
      setAgentFilesError(message);
      return false;
    } finally {
      setAgentFilesSaving(false);
    }
  }, [agentFiles, agentId, client]);

  const handleAgentFileTabChange = useCallback(
    async (nextTab: AgentFileName) => {
      if (nextTab === agentFileTab) return;
      if (agentFilesDirty && !agentFilesSaving) {
        const saved = await saveAgentFiles();
        if (!saved) return;
      }
      setAgentFileTab(nextTab);
    },
    [agentFileTab, agentFilesDirty, agentFilesSaving, saveAgentFiles]
  );

  const setAgentFileContent = useCallback(
    (value: string) => {
      setAgentFiles((prev) => ({
        ...prev,
        [agentFileTab]: { ...prev[agentFileTab], content: value },
      }));
      setAgentFilesDirty(true);
    },
    [agentFileTab]
  );

  /* ── debounced auto-save: 1.5 s after typing stops ── */
  const saveRef = useRef(saveAgentFiles);
  saveRef.current = saveAgentFiles;
  useEffect(() => {
    if (!agentFilesDirty || agentFilesSaving) return;
    const timer = window.setTimeout(() => {
      void saveRef.current();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [agentFilesDirty, agentFilesSaving, agentFiles]);

  useEffect(() => {
    void loadAgentFiles();
  }, [loadAgentFiles]);

  useEffect(() => {
    if (!AGENT_FILE_NAMES.includes(agentFileTab)) {
      setAgentFileTab(AGENT_FILE_NAMES[0]);
    }
  }, [agentFileTab]);

  return {
    agentFiles,
    agentFileTab,
    agentFilesLoading,
    agentFilesSaving,
    agentFilesDirty,
    agentFilesError,
    setAgentFileContent,
    handleAgentFileTabChange,
    saveAgentFiles,
  };
};

type WorkspaceSelectedFile = {
  path: string;
  exists: boolean;
  content: string;
};

type UseAgentWorkspaceBrowserResult = {
  cwd: string;
  entries: GatewayAgentFileEntry[];
  loading: boolean;
  error: string | null;
  selectedFile: WorkspaceSelectedFile | null;
  selectedLoading: boolean;
  selectedError: string | null;
  goUp: () => void;
  openEntry: (entry: GatewayAgentFileEntry) => void;
  refresh: () => void;
};

const useAgentWorkspaceBrowser = (params: {
  client: GatewayClient | null | undefined;
  agentId: string | null | undefined;
  enabled: boolean;
}): UseAgentWorkspaceBrowserResult => {
  const { client, agentId, enabled } = params;
  const [cwd, setCwd] = useState("");
  const [entries, setEntries] = useState<GatewayAgentFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<WorkspaceSelectedFile | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const trimmedAgentId = agentId?.trim();
      if (!trimmedAgentId) {
        setEntries([]);
        setSelectedFile(null);
        setError("Agent ID is missing for this agent.");
        return;
      }
      if (!client) {
        setEntries([]);
        setSelectedFile(null);
        setError("Gateway client is not available.");
        return;
      }

      // Use Daytona API to list ALL workspace files (not just brain files)
      // Get gateway URL from localStorage with fallback to env var
      const DEFAULT_GATEWAY_URL =
        process.env.NEXT_PUBLIC_GATEWAY_URL ?? "ws://127.0.0.1:18789";
      const gatewayUrl = typeof window !== "undefined" 
        ? (localStorage.getItem("openclaw.gateway.url")?.trim() || DEFAULT_GATEWAY_URL)
        : DEFAULT_GATEWAY_URL;
      
      if (!gatewayUrl) {
        throw new Error("Gateway URL is not configured. Please set it in connection settings.");
      }
      
      const response = await fetch(
        `/api/gateway/workspace-files?agentId=${encodeURIComponent(trimmedAgentId)}&path=${encodeURIComponent(cwd)}&gatewayUrl=${encodeURIComponent(gatewayUrl)}`
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch workspace files: ${response.statusText}`);
      }
      const data = await response.json();
      setEntries(data.entries || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list workspace files.";
      setError(message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, client, cwd, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    setCwd("");
    setEntries([]);
    setSelectedFile(null);
    setSelectedError(null);
    setError(null);
  }, [agentId, enabled]);

  const goUp = useCallback(() => {
    if (!cwd) return;
    const next = cwd.split("/").slice(0, -1).join("/");
    setCwd(next);
    setSelectedFile(null);
  }, [cwd]);

  const openEntry = useCallback(
    (entry: GatewayAgentFileEntry) => {
      if (entry.isDirectory) {
        setCwd(entry.path);
        setSelectedFile(null);
        setSelectedError(null);
        return;
      }
      const trimmedAgentId = agentId?.trim() ?? "";
      if (!trimmedAgentId) {
        setSelectedError("Agent ID is not available.");
        return;
      }
      
      console.log("Opening file:", entry.path, "isDirectory:", entry.isDirectory);
      
      setSelectedLoading(true);
      setSelectedError(null);
      
      // Use API route to read file via Daytona
      const DEFAULT_GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "ws://127.0.0.1:18789";
      const gatewayUrl = typeof window !== "undefined" 
        ? (localStorage.getItem("openclaw.gateway.url")?.trim() || DEFAULT_GATEWAY_URL)
        : DEFAULT_GATEWAY_URL;
      
      fetch(`/api/gateway/workspace-files/read?agentId=${encodeURIComponent(trimmedAgentId)}&path=${encodeURIComponent(entry.path)}&gatewayUrl=${encodeURIComponent(gatewayUrl)}`)
        .then(async (response) => {
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to read file: ${response.statusText}`);
          }
          return response.json();
        })
        .then((data) => {
          const content = data.content ?? "";
          const maxChars = 250_000;
          setSelectedFile({
            path: entry.path,
            exists: true,
            content: content.length > maxChars ? content.slice(0, maxChars) : content,
          });
          if (content.length > maxChars) {
            setSelectedError(`File too large; showing first ${maxChars.toLocaleString()} chars.`);
          }
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Failed to read file.";
          setSelectedFile(null);
          setSelectedError(message);
        })
        .finally(() => setSelectedLoading(false));
    },
    [agentId]
  );

  return {
    cwd,
    entries,
    loading,
    error,
    selectedFile,
    selectedLoading,
    selectedError,
    goUp,
    openEntry,
    refresh: () => void refresh(),
  };
};

export const AgentBrainPanel = ({
  client,
  agents,
  selectedAgentId,
  onClose,
}: AgentBrainPanelProps) => {
  const selectedAgent = useMemo(
    () =>
      selectedAgentId
        ? agents.find((entry) => entry.agentId === selectedAgentId) ?? null
        : null,
    [agents, selectedAgentId]
  );

  const {
    agentFiles,
    agentFileTab,
    agentFilesLoading,
    agentFilesSaving,
    agentFilesDirty,
    agentFilesError,
    setAgentFileContent,
    handleAgentFileTabChange,
    saveAgentFiles,
  } = useAgentFilesEditor({ client, agentId: selectedAgent?.agentId ?? null });
  const [panelMode, setPanelMode] = useState<"brain" | "workspace">("brain");
  const workspace = useAgentWorkspaceBrowser({
    client,
    agentId: selectedAgent?.agentId ?? null,
    enabled: panelMode === "workspace",
  });
  const [previewMode, setPreviewMode] = useState(true);

  const handleTabChange = useCallback(
    async (nextTab: AgentFileName) => {
      await handleAgentFileTabChange(nextTab);
    },
    [handleAgentFileTabChange]
  );

  const handleClose = useCallback(async () => {
    if (agentFilesSaving) return;
    if (agentFilesDirty) {
      const saved = await saveAgentFiles();
      if (!saved) return;
    }
    onClose();
  }, [agentFilesDirty, agentFilesSaving, onClose, saveAgentFiles]);

  const handleModeChange = useCallback(
    async (nextMode: "brain" | "workspace") => {
      if (nextMode === panelMode) return;
      if (agentFilesSaving) return;
      if (agentFilesDirty) {
        const saved = await saveAgentFiles();
        if (!saved) return;
      }
      setPanelMode(nextMode);
    },
    [agentFilesDirty, agentFilesSaving, panelMode, saveAgentFiles]
  );

  return (
    <div
      className="agent-inspect-panel flex min-h-0 flex-col overflow-hidden"
      data-testid="agent-brain-panel"
      style={{ position: "relative", left: "auto", top: "auto", width: "100%", height: "100%" }}
    >
      <AgentInspectHeader
        label="Brain files"
        title={selectedAgent?.name ?? "No agent selected"}
        onClose={() => {
          void handleClose();
        }}
        closeTestId="agent-brain-close"
        closeDisabled={agentFilesSaving}
      />

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <section className="flex min-h-0 flex-1 flex-col" data-testid="agent-brain-files">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {panelMode === "brain"
                ? AGENT_FILE_META[agentFileTab].hint
                : "Browse the agent workspace and data files."}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-1">
            <button
              type="button"
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                panelMode === "brain"
                  ? "border-border bg-background text-foreground"
                  : "border-border/70 bg-card/60 text-muted-foreground hover:bg-muted/70"
              }`}
              onClick={() => void handleModeChange("brain")}
            >
              Brain
            </button>
            <button
              type="button"
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                panelMode === "workspace"
                  ? "border-border bg-background text-foreground"
                  : "border-border/70 bg-card/60 text-muted-foreground hover:bg-muted/70"
              }`}
              onClick={() => void handleModeChange("workspace")}
            >
              Workspace
            </button>
          </div>

          {agentFilesError ? (
            <div className="mt-3 rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
              {agentFilesError}
            </div>
          ) : null}

          {panelMode === "brain" ? (
            <>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                {AGENT_FILE_NAMES.map((name) => {
                  const active = name === agentFileTab;
                  const label = AGENT_FILE_META[name].title.replace(".md", "");
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                        active
                          ? "border-border bg-background text-foreground shadow-sm"
                          : "border-transparent bg-muted/60 text-muted-foreground hover:border-border/80 hover:bg-muted"
                      }`}
                      onClick={() => {
                        void handleTabChange(name);
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-end gap-1">
                <button
                  type="button"
                  className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                    previewMode
                      ? "border-border bg-background text-foreground"
                      : "border-border/70 bg-card/60 text-muted-foreground hover:bg-muted/70"
                  }`}
                  onClick={() => setPreviewMode(true)}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                    previewMode
                      ? "border-border/70 bg-card/60 text-muted-foreground hover:bg-muted/70"
                      : "border-border bg-background text-foreground"
                  }`}
                  onClick={() => setPreviewMode(false)}
                >
                  Edit
                </button>
              </div>

              <div className="mt-3 min-h-0 flex-1 rounded-md bg-muted/30 p-2">
                {previewMode ? (
                  <div className="agent-markdown h-full overflow-y-auto rounded-md border border-border/80 bg-background/80 px-3 py-2 text-xs text-foreground">
                    {agentFiles[agentFileTab].content.trim().length === 0 ? (
                      <p className="text-muted-foreground">
                        {AGENT_FILE_PLACEHOLDERS[agentFileTab]}
                      </p>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {agentFiles[agentFileTab].content}
                      </ReactMarkdown>
                    )}
                  </div>
                ) : (
                  <textarea
                    className="h-full min-h-0 w-full resize-none overflow-y-auto rounded-md border border-border/80 bg-background/80 px-3 py-2 font-mono text-xs text-foreground outline-none"
                    value={agentFiles[agentFileTab].content}
                    placeholder={
                      agentFiles[agentFileTab].content.trim().length === 0
                        ? AGENT_FILE_PLACEHOLDERS[agentFileTab]
                        : undefined
                    }
                    disabled={agentFilesLoading || agentFilesSaving}
                    onChange={(event) => {
                      setAgentFileContent(event.target.value);
                    }}
                  />
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 pt-2">
                <div className="text-xs text-muted-foreground">
                  {agentFilesDirty ? "Unsaved changes" : "All changes saved"}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Directory
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-md border border-border/70 bg-card/60 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={workspace.goUp}
                    disabled={!workspace.cwd}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-border/70 bg-card/60 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={workspace.refresh}
                    disabled={workspace.loading}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="rounded-md border border-border/80 bg-background/75 px-3 py-2 font-mono text-[11px] text-muted-foreground/90">
                {workspace.cwd ? `/${workspace.cwd}` : "/"}
              </div>

              {workspace.error ? (
                <div className="rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
                  {workspace.error}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border/80 bg-card/60">
                <div className="h-full overflow-y-auto p-2">
                  {workspace.loading ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      Loading...
                    </div>
                  ) : null}
                  {!workspace.loading && workspace.entries.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      No files found.
                    </div>
                  ) : null}
                  {workspace.entries.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left font-mono text-[11px] uppercase tracking-[0.12em] transition hover:bg-muted/60 ${
                        workspace.selectedFile?.path === entry.path
                          ? "bg-muted/70 text-foreground"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => workspace.openEntry(entry)}
                    >
                      <span className="truncate">
                        {entry.isDirectory ? `${entry.name}/` : entry.name}
                      </span>
                      {typeof entry.size === "number" && !entry.isDirectory ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground/70">
                          {entry.size.toLocaleString()}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border/80 bg-background/80">
                <div className="h-full overflow-y-auto p-3">
                  {workspace.selectedLoading ? (
                    <div className="text-xs text-muted-foreground">Loading file...</div>
                  ) : null}
                  {workspace.selectedError ? (
                    <div className="rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
                      {workspace.selectedError}
                    </div>
                  ) : null}
                  {!workspace.selectedLoading && 
                   !workspace.selectedError && 
                   !workspace.selectedFile ? (
                    <div className="text-xs text-muted-foreground">
                      Select a file to preview it.
                    </div>
                  ) : null}
                  {workspace.selectedFile ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {workspace.selectedFile?.exists ? "File" : "Missing"}
                          </div>
                          <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground/90">
                            {workspace.selectedFile?.path}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rounded-md border border-border/80 bg-card/70 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-border hover:bg-muted/65"
                          onClick={() => {
                            const blob = new Blob([workspace.selectedFile?.content ?? ""], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = workspace.selectedFile?.path.split("/").pop() ?? "file.txt";
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Download
                        </button>
                      </div>
                      <pre className="mt-3 whitespace-pre-wrap break-words rounded-md border border-border/80 bg-card/60 p-3 font-mono text-xs text-foreground">
                        {workspace.selectedFile?.content.trim().length ?? 0 > 0
                          ? workspace.selectedFile?.content
                          : "(empty)"}
                      </pre>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
