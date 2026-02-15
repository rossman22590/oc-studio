"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, Zap, Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { AgentState } from "@/features/agents/state/store";
import { buildAvatarDataUrl } from "@/lib/avatars/multiavatar";

type SwarmDispatchModalProps = {
  agents: AgentState[];
  onDispatch: (tasks: { agentId: string; sessionKey: string; message: string }[]) => Promise<void>;
  onClose: () => void;
  disabled?: boolean;
};

type AgentTaskStatus = "idle" | "sending" | "sent" | "error";

export const SwarmDispatchModal = ({
  agents,
  onDispatch,
  onClose,
  disabled = false,
}: SwarmDispatchModalProps) => {
  const [tasks, setTasks] = useState<Record<string, string>>(() =>
    Object.fromEntries(agents.map((a) => [a.agentId, ""]))
  );
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [statuses, setStatuses] = useState<Record<string, AgentTaskStatus>>(() =>
    Object.fromEntries(agents.map((a) => [a.agentId, "idle" as const]))
  );
  const [dispatching, setDispatching] = useState(false);
  const [dispatched, setDispatched] = useState(false);
  const inputRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  // Focus the global prompt on mount
  const globalRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    globalRef.current?.focus();
  }, []);

  const handleTaskChange = useCallback((agentId: string, value: string) => {
    setTasks((prev) => ({ ...prev, [agentId]: value }));
  }, []);

  const handleApplyGlobal = useCallback(() => {
    if (!globalPrompt.trim()) return;
    setTasks((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (!next[key].trim()) {
          next[key] = globalPrompt.trim();
        }
      }
      return next;
    });
  }, [globalPrompt]);

  const handleFillAll = useCallback(() => {
    if (!globalPrompt.trim()) return;
    setTasks((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = globalPrompt.trim();
      }
      return next;
    });
  }, [globalPrompt]);

  const tasksToSend = agents
    .filter((a) => tasks[a.agentId]?.trim())
    .map((a) => ({
      agentId: a.agentId,
      sessionKey: a.sessionKey,
      message: tasks[a.agentId].trim(),
    }));

  const handleDispatch = useCallback(async () => {
    if (tasksToSend.length === 0 || dispatching) return;
    setDispatching(true);

    // Mark all as sending
    const sendingStatuses: Record<string, AgentTaskStatus> = {};
    for (const t of tasksToSend) {
      sendingStatuses[t.agentId] = "sending";
    }
    setStatuses((prev) => ({ ...prev, ...sendingStatuses }));

    try {
      await onDispatch(tasksToSend);
      // Mark all as sent
      const sentStatuses: Record<string, AgentTaskStatus> = {};
      for (const t of tasksToSend) {
        sentStatuses[t.agentId] = "sent";
      }
      setStatuses((prev) => ({ ...prev, ...sentStatuses }));
      setDispatched(true);
    } catch {
      // Mark all as error
      const errorStatuses: Record<string, AgentTaskStatus> = {};
      for (const t of tasksToSend) {
        errorStatuses[t.agentId] = "error";
      }
      setStatuses((prev) => ({ ...prev, ...errorStatuses }));
    } finally {
      setDispatching(false);
    }
  }, [tasksToSend, dispatching, onDispatch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void handleDispatch();
      }
    },
    [handleDispatch]
  );

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="glass-panel w-full max-w-3xl max-h-[95vh] sm:max-h-[85vh] flex flex-col animate-scale-in rounded-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            <div>
              <h2 className="console-title text-xl">Swarm Dispatch</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Send tasks to all agents at once
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Global prompt */}
        <div className="border-b border-border px-4 sm:px-6 py-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
            Global prompt (fill all agents)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              ref={globalRef}
              value={globalPrompt}
              onChange={(e) => setGlobalPrompt(e.target.value)}
              placeholder="Type a task to send to every agent..."
              className="flex-1 rounded-md border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[80px]"
              rows={2}
              disabled={dispatching}
            />
            <div className="flex flex-row sm:flex-col gap-1.5 sm:gap-1">
              <button
                onClick={handleFillAll}
                disabled={!globalPrompt.trim() || dispatching}
                className="rounded-md border border-border bg-primary/10 px-3 py-2.5 sm:py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] sm:min-h-0"
                title="Replace all inputs with this prompt"
              >
                Fill All
              </button>
              <button
                onClick={handleApplyGlobal}
                disabled={!globalPrompt.trim() || dispatching}
                className="rounded-md border border-border bg-muted px-3 py-2.5 sm:py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/80 transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] sm:min-h-0"
                title="Fill only empty inputs"
              >
                Fill Empty
              </button>
            </div>
          </div>
        </div>

        {/* Per-agent task inputs */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Zap className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No agents available</p>
            </div>
          ) : (
            agents.map((agent) => {
              const status = statuses[agent.agentId] ?? "idle";
              const avatarUrl = buildAvatarDataUrl(
                agent.avatarSeed ?? agent.agentId
              );

              return (
                <div
                  key={agent.agentId}
                  className={`rounded-lg border p-3 transition ${
                    status === "sent"
                      ? "border-green-500/40 bg-green-500/5"
                      : status === "error"
                        ? "border-destructive/40 bg-destructive/5"
                        : status === "sending"
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-card/50"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {/* Avatar */}
                    <img
                      src={avatarUrl}
                      alt={agent.name}
                      className="h-7 w-7 rounded-full"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground truncate block">
                        {agent.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {agent.status === "running" ? "● Running" : "○ Idle"}
                      </span>
                    </div>
                    {/* Status icon */}
                    {status === "sending" && (
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    )}
                    {status === "sent" && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {status === "error" && (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <textarea
                    ref={(el) => {
                      if (el) inputRefs.current.set(agent.agentId, el);
                    }}
                    value={tasks[agent.agentId] ?? ""}
                    onChange={(e) => handleTaskChange(agent.agentId, e.target.value)}
                    placeholder={`Task for ${agent.name}...`}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
                    rows={2}
                    disabled={dispatching || status === "sent"}
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Dispatch button */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {dispatched ? (
              <span className="text-green-500 font-semibold">
                ✓ Dispatched to {tasksToSend.length} agent{tasksToSend.length !== 1 ? "s" : ""}
              </span>
            ) : (
              <>
                {tasksToSend.length} of {agents.length} agent{agents.length !== 1 ? "s" : ""} will receive tasks
                {tasksToSend.length > 0 && (
                  <span className="ml-2 text-muted-foreground/60">
                    Ctrl+Enter to dispatch
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2 w-full sm:w-auto">
            {dispatched ? (
              <button
                onClick={onClose}
                className="flex items-center justify-center gap-2 rounded-md border border-border bg-muted px-4 py-2.5 text-sm font-semibold hover:bg-muted/80 transition min-h-[44px]"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  disabled={dispatching}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDispatch()}
                  disabled={tasksToSend.length === 0 || dispatching || disabled}
                  className="flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20 min-h-[44px]"
                >
                  {dispatching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">{dispatching ? "Dispatching..." : "Go — Dispatch All"}</span>
                  <span className="sm:hidden">{dispatching ? "Dispatching..." : "Dispatch"}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
