"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { X, Plus, GripVertical, CheckCircle2, Loader2, AlertCircle, ChevronDown, ChevronUp, CornerDownLeft } from "lucide-react";
import { useAgentStore } from "@/features/agents/state/store";
import { buildAvatarDataUrl } from "@/lib/avatars/multiavatar";

/* ─── Types ────────────────────────────────────────────────── */

export type KanbanAgentEntry = {
  agentId: string;
  agentName: string;
  avatarSeed: string;
  status: "pending" | "running" | "complete" | "error";
  result: string | null;
  prevOutputCount: number;
  /** Timestamp when the task was dispatched — used to ignore stale results */
  dispatchedAt: number;
};

export type KanbanCard = {
  id: string;
  title: string;
  description: string;
  agents: KanbanAgentEntry[];
  createdAt: number;
  completedAt: number | null;
};

type KanbanBoardModalProps = {
  onClose: () => void;
  onSendMessage?: (agentId: string, message: string) => void;
  cards: KanbanCard[];
  onCardsChange: (cards: KanbanCard[]) => void;
};

/* ─── Constants ────────────────────────────────────────────── */

const STORAGE_KEY = "openclaw.kanban.cards";

const AGENT_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f97316",
  "#8b5cf6", "#06b6d4", "#ef4444", "#22c55e",
  "#d946ef", "#f59e0b", "#3b82f6", "#10b981",
];

const getCardStatus = (card: KanbanCard): "new" | "in_progress" | "complete" => {
  if (card.agents.length === 0) return "new";
  const allDone = card.agents.every((a) => a.status === "complete" || a.status === "error");
  if (allDone) return "complete";
  const anyStarted = card.agents.some((a) => a.status === "running" || a.status === "complete" || a.status === "error");
  if (anyStarted) return "in_progress";
  return "in_progress"; // pending = dispatched but waiting
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
};

/* ─── Persistence helpers ──────────────────────────────────── */

export const loadKanbanCards = (): KanbanCard[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as KanbanCard[];
  } catch {
    return [];
  }
};

export const saveKanbanCards = (cards: KanbanCard[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch {
    // ignore
  }
};

/* ─── Wall View (compact, read-only for 3D office) ─────────── */

export const KanbanWallView = ({ cards }: { cards: KanbanCard[] }) => {
  const newCards = cards.filter((c) => getCardStatus(c) === "new");
  const inProgress = cards.filter((c) => getCardStatus(c) === "in_progress");
  const complete = cards.filter((c) => getCardStatus(c) === "complete");

  const columns = [
    { label: "New", color: "#3b82f6", bg: "#1e3a5f", items: newCards },
    { label: "In Progress", color: "#f59e0b", bg: "#4a3520", items: inProgress },
    { label: "Complete", color: "#22c55e", bg: "#1a3d2a", items: complete },
  ];

  return (
    <div
      style={{
        width: 600,
        height: 340,
        display: "flex",
        gap: 6,
        padding: 12,
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        background: "#0f1117",
        borderRadius: 6,
        color: "#e2e8f0",
        overflow: "hidden",
      }}
    >
      {columns.map((col) => (
        <div
          key={col.label}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minWidth: 0,
          }}
        >
          {/* Column header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 8px",
              borderRadius: 4,
              background: col.bg,
              marginBottom: 2,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: col.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {col.label}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                background: col.color,
                color: "#000",
                borderRadius: 99,
                padding: "1px 6px",
                minWidth: 18,
                textAlign: "center",
              }}
            >
              {col.items.length}
            </span>
          </div>

          {/* Cards */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 3 }}>
            {col.items.slice(0, 5).map((card) => (
              <div
                key={card.id}
                style={{
                  padding: "5px 7px",
                  borderRadius: 4,
                  background: "#1a1d27",
                  border: "1px solid #2a2d3a",
                  fontSize: 10,
                  lineHeight: 1.3,
                }}
              >
                <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {card.title}
                </div>
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {card.agents.slice(0, 4).map((a) => (
                    <div
                      key={a.agentId}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 99,
                        border: `1.5px solid ${a.status === "complete" ? "#22c55e" : a.status === "running" ? "#f59e0b" : a.status === "error" ? "#ef4444" : "#64748b"}`,
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={buildAvatarDataUrl(a.avatarSeed)}
                        alt=""
                        style={{ width: "100%", height: "100%" }}
                      />
                    </div>
                  ))}
                  {card.agents.length > 4 && (
                    <span style={{ fontSize: 9, color: "#64748b", lineHeight: "14px" }}>
                      +{card.agents.length - 4}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {col.items.length > 5 && (
              <div style={{ fontSize: 9, color: "#64748b", textAlign: "center", padding: 2 }}>
                +{col.items.length - 5} more
              </div>
            )}
            {col.items.length === 0 && (
              <div style={{ fontSize: 9, color: "#475569", textAlign: "center", padding: 8 }}>
                Empty
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─── Auto-completion hook (runs at parent level, always active) ── */

export const useKanbanAutoComplete = (
  cards: KanbanCard[],
  onCardsChange: (cards: KanbanCard[]) => void,
) => {
  const { state } = useAgentStore();
  const agents = state.agents;

  useEffect(() => {
    if (cards.length === 0) return;

    let changed = false;
    const updated = cards.map((card) => {
      const updatedAgents = card.agents.map((entry) => {
        if (entry.status === "complete" || entry.status === "error") return entry;

        const storeAgent = agents.find((a) => a.agentId === entry.agentId);
        if (!storeAgent) return entry;

        const dispatched = entry.dispatchedAt || card.createdAt;

        // Mark as running if the agent is running and this run started after dispatch
        if (storeAgent.status === "running" && entry.status === "pending") {
          changed = true;
          return { ...entry, status: "running" as const };
        }

        // Agent finished — only capture if the response came AFTER we dispatched
        if (storeAgent.status !== "running" && (entry.status === "running" || entry.status === "pending")) {
          // Guard: if agent hasn't responded since our dispatch, skip
          const responseTime = storeAgent.lastAssistantMessageAt ?? 0;
          if (responseTime < dispatched) return entry; // stale result, ignore

          const currentCount = storeAgent.outputLines.length;
          if (currentCount > entry.prevOutputCount) {
            const newLines = storeAgent.outputLines.slice(entry.prevOutputCount);
            const responseParts = newLines.filter((l: string) => !l.startsWith("> "));
            const responseText = responseParts.join("\n").trim();
            if (responseText) {
              changed = true;
              return {
                ...entry,
                status: (storeAgent.status === "error" ? "error" : "complete") as "error" | "complete",
                result: responseText,
              };
            }
          }
          // Fallback — check lastResult if it's fresh
          if (storeAgent.lastResult && entry.status === "running" && responseTime >= dispatched) {
            changed = true;
            return {
              ...entry,
              status: (storeAgent.status === "error" ? "error" : "complete") as "error" | "complete",
              result: storeAgent.lastResult,
            };
          }
        }

        return entry;
      });

      const allDone = updatedAgents.every((a) => a.status === "complete" || a.status === "error");
      const wasComplete = card.completedAt !== null;
      const nowComplete = allDone && updatedAgents.length > 0;

      if (nowComplete && !wasComplete) changed = true;

      return {
        ...card,
        agents: updatedAgents,
        completedAt: nowComplete && !wasComplete ? Date.now() : card.completedAt,
      };
    });

    if (changed) {
      onCardsChange(updated);
    }
  }, [agents, cards, onCardsChange]);
};

/* ─── Main Modal ───────────────────────────────────────────── */

export const KanbanBoardModal = ({
  onClose,
  onSendMessage,
  cards,
  onCardsChange,
}: KanbanBoardModalProps) => {
  const { state } = useAgentStore();
  const agents = state.agents;
  const dragCardIdRef = useRef<string | null>(null);

  /* ─── New card form state ─── */
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);

  /* ─── Expanded results ─── */
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  /* ─── Reply state (cardId → reply text) ─── */
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  /* ─── Derived columns ─── */
  const newCards = useMemo(() => cards.filter((c) => getCardStatus(c) === "new"), [cards]);
  const inProgressCards = useMemo(() => cards.filter((c) => getCardStatus(c) === "in_progress"), [cards]);
  const completeCards = useMemo(() => cards.filter((c) => getCardStatus(c) === "complete"), [cards]);

  /* ─── Toggle agent selection ─── */
  const handleToggleAgent = useCallback((agentId: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedAgentIds.size === agents.length) {
      setSelectedAgentIds(new Set());
    } else {
      setSelectedAgentIds(new Set(agents.map((a) => a.agentId)));
    }
  }, [agents, selectedAgentIds.size]);

  /* ─── Create & dispatch ─── */
  const handleCreateCard = useCallback(() => {
    if (!formTitle.trim() || !formDesc.trim() || selectedAgentIds.size === 0) return;

    const agentEntries: KanbanAgentEntry[] = agents
      .filter((a) => selectedAgentIds.has(a.agentId))
      .map((a) => ({
        agentId: a.agentId,
        agentName: a.name,
        avatarSeed: a.avatarSeed || a.name || a.agentId,
        status: "pending" as const,
        result: null,
        prevOutputCount: a.outputLines.length,
        dispatchedAt: Date.now(),
      }));

    const newCard: KanbanCard = {
      id: crypto.randomUUID(),
      title: formTitle.trim(),
      description: formDesc.trim(),
      agents: agentEntries,
      createdAt: Date.now(),
      completedAt: null,
    };

    // Dispatch to all selected agents
    if (onSendMessage) {
      for (const entry of agentEntries) {
        onSendMessage(entry.agentId, formDesc.trim());
      }
    }

    onCardsChange([...cards, newCard]);
    setFormTitle("");
    setFormDesc("");
    setSelectedAgentIds(new Set());
    setShowForm(false);
  }, [formTitle, formDesc, selectedAgentIds, agents, cards, onCardsChange, onSendMessage]);

  /* ─── Delete card ─── */
  const handleDeleteCard = useCallback(
    (cardId: string) => {
      onCardsChange(cards.filter((c) => c.id !== cardId));
    },
    [cards, onCardsChange]
  );

  /* ─── Reply to a completed card — resets agents, dispatches, moves back to In Progress ─── */
  const handleReply = useCallback(
    (cardId: string) => {
      const replyText = (replyTexts[cardId] ?? "").trim();
      if (!replyText) return;

      const card = cards.find((c) => c.id === cardId);
      if (!card) return;

      const now = Date.now();
      const updatedCards = cards.map((c) => {
        if (c.id !== cardId) return c;
        return {
          ...c,
          description: replyText,
          completedAt: null,
          agents: c.agents.map((entry) => {
            const storeAgent = agents.find((a) => a.agentId === entry.agentId);
            return {
              ...entry,
              status: "pending" as const,
              result: null,
              prevOutputCount: storeAgent?.outputLines.length ?? entry.prevOutputCount,
              dispatchedAt: now,
            };
          }),
        };
      });

      // Dispatch the reply to all agents on this card
      if (onSendMessage) {
        for (const entry of card.agents) {
          onSendMessage(entry.agentId, replyText);
        }
      }

      onCardsChange(updatedCards);
      setReplyTexts((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
    },
    [cards, agents, replyTexts, onCardsChange, onSendMessage]
  );

  /* ─── Drag & Drop ─── */
  const handleDragStart = useCallback((cardId: string) => {
    dragCardIdRef.current = cardId;
  }, []);

  const handleDrop = useCallback(
    (targetColumn: "new" | "in_progress" | "complete") => {
      const cardId = dragCardIdRef.current;
      if (!cardId) return;
      dragCardIdRef.current = null;

      // For now drag-drop is purely visual reordering — actual status is derived from agent state
      // We only allow manual move to "complete" (mark as done) or re-dispatch
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;

      if (targetColumn === "complete") {
        // Force-complete all agents
        const updated = cards.map((c) => {
          if (c.id !== cardId) return c;
          return {
            ...c,
            agents: c.agents.map((a) => ({
              ...a,
              status: a.status === "complete" || a.status === "error" ? a.status : ("complete" as const),
              result: a.result || "(manually completed)",
            })),
            completedAt: c.completedAt || Date.now(),
          };
        });
        onCardsChange(updated);
      }
    },
    [cards, onCardsChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  /* ─── Toggle result expand ─── */
  const toggleExpand = useCallback((cardId: string) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  /* ─── Close on Escape ─── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  /* ─── Agent color helper ─── */
  const getAgentColor = useCallback(
    (agentId: string) => {
      const idx = agents.findIndex((a) => a.agentId === agentId);
      return AGENT_COLORS[idx >= 0 ? idx % AGENT_COLORS.length : 0];
    },
    [agents]
  );

  /* ─── Render a single card ─── */
  const renderCard = (card: KanbanCard, column: "new" | "in_progress" | "complete") => {
    const isExpanded = expandedResults.has(card.id);

    return (
      <div
        key={card.id}
        draggable
        onDragStart={() => handleDragStart(card.id)}
        className="group rounded-lg border border-border/50 bg-background/90 p-3 shadow-sm transition hover:border-primary/30 hover:shadow-md cursor-grab active:cursor-grabbing"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            <h4 className="text-sm font-semibold text-foreground truncate">{card.title}</h4>
          </div>
          <button
            onClick={() => handleDeleteCard(card.id)}
            className="shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition opacity-0 group-hover:opacity-100"
            aria-label="Delete card"
            tabIndex={0}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Description preview */}
        <p className="text-xs text-muted-foreground leading-relaxed mb-2.5 line-clamp-2">
          {card.description}
        </p>

        {/* Agent chips */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {card.agents.map((entry) => {
            const color = getAgentColor(entry.agentId);
            const statusIcon =
              entry.status === "complete" ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : entry.status === "running" ? (
                <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
              ) : entry.status === "error" ? (
                <AlertCircle className="h-3 w-3 text-red-500" />
              ) : (
                <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
              );

            return (
              <div
                key={entry.agentId}
                className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-1.5 py-0.5"
                title={`${entry.agentName}: ${entry.status}`}
              >
                <img
                  src={buildAvatarDataUrl(entry.avatarSeed)}
                  alt={entry.agentName}
                  className="h-4 w-4 rounded-full border"
                  style={{ borderColor: color }}
                />
                <span className="text-[10px] font-medium text-foreground/80 max-w-16 truncate">
                  {entry.agentName}
                </span>
                {statusIcon}
              </div>
            );
          })}
        </div>

        {/* Timestamp */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {formatTime(card.createdAt)}
          </span>
          {card.completedAt && (
            <span className="text-[10px] text-green-500 font-semibold">
              Done {formatTime(card.completedAt)}
            </span>
          )}
        </div>

        {/* Results (complete column) */}
        {column === "complete" && card.agents.some((a) => a.result) && (
          <div className="mt-2 border-t border-border/40 pt-2">
            <button
              onClick={() => toggleExpand(card.id)}
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary hover:text-primary/80 transition"
              tabIndex={0}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {isExpanded ? "Hide" : "Show"} Results ({card.agents.filter((a) => a.result).length})
            </button>
            {isExpanded && (
              <div className="mt-2 space-y-2">
                {card.agents
                  .filter((a) => a.result)
                  .map((entry) => (
                    <div key={entry.agentId} className="rounded-md bg-muted/50 p-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <img
                          src={buildAvatarDataUrl(entry.avatarSeed)}
                          alt={entry.agentName}
                          className="h-4 w-4 rounded-full"
                        />
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: getAgentColor(entry.agentId) }}
                        >
                          {entry.agentName}
                        </span>
                        {entry.status === "error" && (
                          <span className="text-[9px] font-bold text-red-500 uppercase">Error</span>
                        )}
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin">
                        {entry.result}
                      </p>
                    </div>
                  ))}

                {/* Reply input */}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={replyTexts[card.id] ?? ""}
                    onChange={(e) =>
                      setReplyTexts((prev) => ({ ...prev, [card.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleReply(card.id);
                      }
                    }}
                    placeholder="Reply to follow up…"
                    className="flex-1 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-label="Reply to card"
                  />
                  <button
                    onClick={() => handleReply(card.id)}
                    disabled={!(replyTexts[card.id] ?? "").trim()}
                    className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    aria-label="Send reply"
                    tabIndex={0}
                  >
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    Reply
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Kanban Board"
    >
      <div
        className="relative flex flex-col w-[95vw] max-w-7xl h-[85vh] rounded-2xl border border-border/60 bg-background shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header ─── */}
        <div className="flex items-center gap-3 border-b border-border/50 px-6 py-3 bg-background/80 backdrop-blur-sm shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15">
            <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
          </div>
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-foreground">
            Kanban Board
          </h2>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
            {cards.length} cards
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-primary/90 shadow-sm"
              aria-label="Add new card"
              tabIndex={0}
            >
              <Plus className="h-3.5 w-3.5" />
              New Task
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
              aria-label="Close kanban"
              tabIndex={0}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ─── New card form ─── */}
        {showForm && (
          <div className="border-b border-border/50 bg-muted/20 px-6 py-4 shrink-0">
            <div className="flex flex-col gap-3 max-w-2xl mx-auto">
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Task title…"
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                autoFocus
              />
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Task description / prompt to send to agents…"
                rows={3}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
              {/* Agent multi-select */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Assign Agents ({selectedAgentIds.size}/{agents.length})
                  </p>
                  <button
                    onClick={handleSelectAll}
                    className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition"
                    tabIndex={0}
                    type="button"
                  >
                    {selectedAgentIds.size === agents.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {agents.map((agent, idx) => {
                    const isSelected = selectedAgentIds.has(agent.agentId);
                    const color = AGENT_COLORS[idx % AGENT_COLORS.length];
                    const avatarUrl = buildAvatarDataUrl(agent.avatarSeed || agent.name || agent.agentId);

                    return (
                      <button
                        key={agent.agentId}
                        type="button"
                        onClick={() => handleToggleAgent(agent.agentId)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                          isSelected
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : "border-border/50 bg-background text-muted-foreground hover:border-border"
                        }`}
                        tabIndex={0}
                      >
                        <img
                          src={avatarUrl}
                          alt={agent.name}
                          className="h-5 w-5 rounded-full border"
                          style={{ borderColor: isSelected ? color : "transparent" }}
                        />
                        <span>{agent.name}</span>
                        {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-border/60 px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCard}
                  disabled={!formTitle.trim() || !formDesc.trim() || selectedAgentIds.size === 0}
                  className="rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  type="button"
                >
                  Create &amp; Dispatch
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Columns ─── */}
        <div className="flex-1 flex gap-4 p-4 overflow-x-auto min-h-0">
          {/* New column */}
          <div
            className="flex-1 min-w-[280px] flex flex-col rounded-xl bg-muted/20 border border-border/30"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop("new")}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground">
                  New
                </h3>
              </div>
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-500">
                {newCards.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              {newCards.map((card) => renderCard(card, "new"))}
              {newCards.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  No new tasks
                </p>
              )}
            </div>
          </div>

          {/* In Progress column */}
          <div
            className="flex-1 min-w-[280px] flex flex-col rounded-xl bg-muted/20 border border-border/30"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop("in_progress")}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground">
                  In Progress
                </h3>
              </div>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                {inProgressCards.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              {inProgressCards.map((card) => renderCard(card, "in_progress"))}
              {inProgressCards.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  No active tasks
                </p>
              )}
            </div>
          </div>

          {/* Complete column */}
          <div
            className="flex-1 min-w-[280px] flex flex-col rounded-xl bg-muted/20 border border-border/30"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop("complete")}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground">
                  Complete
                </h3>
              </div>
              <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-500">
                {completeCards.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              {completeCards.map((card) => renderCard(card, "complete"))}
              {completeCards.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  No completed tasks
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
