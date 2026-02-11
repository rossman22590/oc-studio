import { X, Bot, Cpu, MessageSquare, Brain, Wrench, Clock, Hash, Zap } from "lucide-react";
import { useAgentStore } from "@/features/agents/state/store";

type AgentDetailsModalProps = {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onOpenChat?: () => void;
};

export const AgentDetailsModal = ({
  agentId,
  agentName,
  onClose,
  onOpenChat,
}: AgentDetailsModalProps) => {
  const { state } = useAgentStore();
  const agent = state.agents.find((a) => a.agentId === agentId);

  if (!agent) return null;

  const statusColor =
    agent.status === "running"
      ? "text-primary"
      : agent.status === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  const statusBg =
    agent.status === "running"
      ? "bg-primary/15 border-primary/40"
      : agent.status === "error"
        ? "bg-destructive/15 border-destructive/40"
        : "bg-muted/50 border-border/60";

  const infoRows: { icon: React.ReactNode; label: string; value: string | React.ReactNode }[] = [
    {
      icon: <Hash className="h-4 w-4" />,
      label: "Agent ID",
      value: agent.agentId,
    },
    {
      icon: <Zap className="h-4 w-4" />,
      label: "Status",
      value: (
        <span className={`font-semibold uppercase ${statusColor}`}>
          {agent.status}
        </span>
      ),
    },
    {
      icon: <Cpu className="h-4 w-4" />,
      label: "Model",
      value: agent.model || "Not configured",
    },
    {
      icon: <Brain className="h-4 w-4" />,
      label: "Thinking Level",
      value: agent.thinkingLevel || "Default",
    },
    {
      icon: <Clock className="h-4 w-4" />,
      label: "Session Key",
      value: agent.sessionKey ? (
        <span className="font-mono text-xs break-all">{agent.sessionKey}</span>
      ) : (
        "No session"
      ),
    },
    {
      icon: <MessageSquare className="h-4 w-4" />,
      label: "Chat Messages",
      value: `${agent.outputLines.length} lines`,
    },
  ];

  const toggleRows: { icon: React.ReactNode; label: string; enabled: boolean }[] = [
    {
      icon: <Wrench className="h-4 w-4" />,
      label: "Tool Calling",
      enabled: agent.toolCallingEnabled,
    },
    {
      icon: <Brain className="h-4 w-4" />,
      label: "Thinking Traces",
      enabled: agent.showThinkingTraces,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-lg max-h-[85vh] flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${statusBg}`}>
              <Bot className={`h-4 w-4 ${statusColor}`} />
            </div>
            <div>
              <h2 className="console-title text-lg">{agentName}</h2>
              <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${statusColor}`}>
                {agent.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Info section */}
          <section className="rounded-md border border-border/80 bg-card/70 p-4">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">
              Configuration
            </div>
            <div className="flex flex-col gap-3">
              {infoRows.map((row, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-md border border-border/60 bg-card/50 px-3 py-2.5"
                >
                  <span className="text-muted-foreground mt-0.5 shrink-0">{row.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {row.label}
                    </div>
                    <div className="text-sm text-foreground mt-0.5 break-words">
                      {row.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Display toggles */}
          <section className="rounded-md border border-border/80 bg-card/70 p-4">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">
              Display Settings
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {toggleRows.map((row, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/50 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{row.icon}</span>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {row.label}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      row.enabled
                        ? "text-primary bg-primary/15"
                        : "text-muted-foreground bg-muted/50"
                    }`}
                  >
                    {row.enabled ? "On" : "Off"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Last message preview */}
          {agent.lastResult && (
            <section className="rounded-md border border-border/80 bg-card/70 p-4">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">
                Last Response
              </div>
              <div className="rounded-md border border-border/60 bg-card/50 px-3 py-2.5 text-xs text-foreground leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                {agent.lastResult.length > 500
                  ? agent.lastResult.slice(0, 500) + "…"
                  : agent.lastResult}
              </div>
            </section>
          )}

          {/* Metadata */}
          <section className="rounded-md border border-border/80 bg-card/70 p-4">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">
              Metadata
            </div>
            <div className="grid gap-2 text-[11px] text-muted-foreground">
              {agent.avatarSeed && (
                <div className="flex justify-between">
                  <span>Avatar Seed</span>
                  <span className="font-mono text-foreground">{agent.avatarSeed}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Session Created</span>
                <span className="font-mono text-foreground">
                  {agent.sessionCreated ? "Yes" : "No"}
                </span>
              </div>
              {agent.historyLoadedAt && (
                <div className="flex justify-between">
                  <span>History Loaded</span>
                  <span className="font-mono text-foreground">
                    {new Date(agent.historyLoadedAt).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {agent.lastActivityAt && (
                <div className="flex justify-between">
                  <span>Last Activity</span>
                  <span className="font-mono text-foreground">
                    {new Date(agent.lastActivityAt).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer actions */}
        <div className="border-t border-border px-6 py-4 flex gap-2">
          {onOpenChat && (
            <button
              onClick={onOpenChat}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <MessageSquare className="h-4 w-4" />
              Open Chat
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
