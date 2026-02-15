"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { X, Send, Hash, Search, MessageSquare, Users, Maximize2, Minimize2, Menu } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAgentStore } from "@/features/agents/state/store";
import {
  buildFinalAgentChatItems,
  normalizeAssistantDisplayText,
  type AgentChatItem,
} from "@/features/agents/components/chatItems";
import { VoiceDictationButton } from "@/components/VoiceDictationButton";
import { buildAvatarDataUrl } from "@/lib/avatars/multiavatar";
import { rewriteMediaLinesToMarkdown } from "@/lib/text/media-markdown";
import { isMetaMarkdown } from "@/lib/text/message-extract";

// Helper to strip all metadata tags from text
const stripMetaTags = (text: string): string => {
  if (!text) return text;
  return text
    .split("\n")
    .filter((line) => !isMetaMarkdown(line.trim()))
    .join("\n")
    .trim();
};

/* ─── types ───────────────────────────────────────────────── */

type ChatroomModalProps = {
  onClose: () => void;
  onSendMessage?: (agentId: string, message: string) => void;
};

type GroupMessage = {
  id: string;
  role: "user" | "agent";
  agentId?: string;
  agentName?: string;
  avatarSeed?: string;
  text: string;
  timestamp: number;
};

/* ─── constants ────────────────────────────────────────────── */

const GROUP_CHAT_ID = "__group__";

const AGENT_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f97316",
  "#8b5cf6", "#06b6d4", "#ef4444", "#22c55e",
  "#d946ef", "#f59e0b", "#3b82f6", "#10b981",
];

/* ─── localStorage helpers ───────────────────────────────────── */

const STORAGE_KEY = "openclaw.chatroom.groupMessages";
const STORAGE_KEY_ENABLED_AGENTS = "openclaw.chatroom.enabledAgents";

const loadGroupMessages = (): GroupMessage[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GroupMessage[];
  } catch {
    return [];
  }
};

const saveGroupMessages = (messages: GroupMessage[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (err) {
    console.warn("Failed to save group messages to localStorage:", err);
  }
};

const loadEnabledAgents = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENABLED_AGENTS);
    if (!raw) return new Set(); // Default: all enabled
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set(); // Default: all enabled
  }
};

const saveEnabledAgents = (enabled: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_ENABLED_AGENTS, JSON.stringify(Array.from(enabled)));
  } catch (err) {
    console.warn("Failed to save enabled agents to localStorage:", err);
  }
};

const formatTimestamp = (ts: number) => {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
};

/* ─── component ───────────────────────────────────────────── */

export const ChatroomModal = ({ onClose, onSendMessage }: ChatroomModalProps) => {
  const { state } = useAgentStore();
  const agents = state.agents;

  const [selectedAgentId, setSelectedAgentId] = useState<string>(GROUP_CHAT_ID);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAgentToggleModal, setShowAgentToggleModal] = useState(false);
  // Auto-fullscreen on mobile, normal size on desktop
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640; // sm breakpoint
    }
    return false;
  });
  const [showMobileSidebar, setShowMobileSidebar] = useState(false); // Mobile sidebar toggle
  const [visibleGroupMessageCount, setVisibleGroupMessageCount] = useState(0); // Will be initialized based on actual count
  const [visibleChatItemCount, setVisibleChatItemCount] = useState(0); // Will be initialized based on actual count
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false); // Track if user manually scrolled up
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesStartRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ─── Group Chat state ─── */
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>(() => loadGroupMessages());
  // Track which agents are enabled in group chat (default: all enabled)
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(() => loadEnabledAgents());
  // Track which agents are pending a group response: agentId → prevOutputLinesCount
  const pendingGroupRef = useRef<Map<string, number>>(new Map());
  // Track which outputLines we've already captured so we don't double-add
  const capturedLinesRef = useRef<Map<string, number>>(new Map());

  /* ─── Persist group messages to localStorage ─── */
  useEffect(() => {
    saveGroupMessages(groupMessages);
  }, [groupMessages]);

  /* ─── Persist enabled agents to localStorage ─── */
  useEffect(() => {
    saveEnabledAgents(enabledAgents);
  }, [enabledAgents]);

  const isGroupChat = selectedAgentId === GROUP_CHAT_ID;
  const selectedAgent = agents.find((a) => a.agentId === selectedAgentId);

  /* ─── 1:1 Chat items ─── */
  const chatItems: AgentChatItem[] = useMemo(() => {
    if (isGroupChat || !selectedAgent) return [];
    return buildFinalAgentChatItems({
      outputLines: selectedAgent.outputLines,
      showThinkingTraces: selectedAgent.showThinkingTraces,
      toolCallingEnabled: selectedAgent.toolCallingEnabled,
    });
  }, [
    isGroupChat,
    selectedAgent?.outputLines,
    selectedAgent?.showThinkingTraces,
    selectedAgent?.toolCallingEnabled,
  ]);

  const liveAssistantText = selectedAgent?.streamText
    ? normalizeAssistantDisplayText(selectedAgent.streamText)
    : "";
  const liveThinkingText =
    selectedAgent?.showThinkingTraces && selectedAgent?.thinkingTrace
      ? selectedAgent.thinkingTrace.trim()
      : "";

  /* ─── Group chat: watch for agent responses ─── */
  useEffect(() => {
    if (pendingGroupRef.current.size === 0) return;

    for (const agent of agents) {
      const prevCount = pendingGroupRef.current.get(agent.agentId);
      if (prevCount === undefined) continue;

      // Agent is still running — check for streamed content but don't capture yet
      if (agent.status === "running") continue;

      // Agent finished — capture new output lines
      const currentCount = agent.outputLines.length;
      if (currentCount > prevCount) {
        // Get the new lines (skip the "> user message" echo line and grab actual response)
        const newLines = agent.outputLines.slice(prevCount);
        // Filter out user-echo lines that start with "> " and metadata tags
        const responseParts = newLines.filter(
          (l: string) => !l.startsWith("> ") && !isMetaMarkdown(l.trim())
        );
        const responseText = stripMetaTags(responseParts.join("\n"));

        if (responseText) {
          setGroupMessages((prev) => [
            ...prev,
            {
              id: `g-${agent.agentId}-${Date.now()}`,
              role: "agent",
              agentId: agent.agentId,
              agentName: agent.name,
              avatarSeed: agent.avatarSeed || agent.name || agent.agentId,
              text: responseText,
              timestamp: Date.now(),
            },
          ]);
        }
        capturedLinesRef.current.set(agent.agentId, currentCount);
      }

      // Remove from pending
      pendingGroupRef.current.delete(agent.agentId);
    }
  }, [agents]);

  /* ─── Group chat: live streaming indicators ─── */
  const groupLiveAgents = useMemo(() => {
    if (!isGroupChat) return [];
    return agents.filter(
      (a) =>
        pendingGroupRef.current.has(a.agentId) && a.status === "running"
    );
  }, [isGroupChat, agents]);

  /* ─── Filtered agent list ─── */
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;
    const q = searchQuery.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.agentId.toLowerCase().includes(q)
    );
  }, [agents, searchQuery]);

  /* ─── Auto-scroll ─── */
  useEffect(() => {
    // Always scroll to latest unless user has manually scrolled up
    if (!userHasScrolledUp && messagesScrollRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated after slice
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const scrollContainer = messagesScrollRef.current;
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        });
      });
    }
  }, [chatItems.length, liveAssistantText, liveThinkingText, selectedAgentId, groupMessages.length, groupLiveAgents.length, userHasScrolledUp, visibleGroupMessageCount, visibleChatItemCount]);

  /* ─── Lazy load messages on scroll up & track scroll position ─── */
  useEffect(() => {
    if (!messagesScrollRef.current) return;

    const scrollContainer = messagesScrollRef.current;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      
      // Track if user has scrolled up (not near bottom)
      setUserHasScrolledUp(!isNearBottom);
      
      // If scrolled near the top, load more messages
      if (scrollTop < 200) {
        if (isGroupChat && visibleGroupMessageCount < groupMessages.length) {
          const oldScrollHeight = scrollContainer.scrollHeight;
          const newCount = Math.min(visibleGroupMessageCount + 50, groupMessages.length);
          setVisibleGroupMessageCount(newCount);
          // Maintain scroll position after loading
          setTimeout(() => {
            const heightDiff = scrollContainer.scrollHeight - oldScrollHeight;
            scrollContainer.scrollTop = scrollTop + heightDiff;
          }, 0);
        } else if (!isGroupChat && selectedAgent && visibleChatItemCount < chatItems.length) {
          const oldScrollHeight = scrollContainer.scrollHeight;
          const newCount = Math.min(visibleChatItemCount + 50, chatItems.length);
          setVisibleChatItemCount(newCount);
          // Maintain scroll position after loading
          setTimeout(() => {
            const heightDiff = scrollContainer.scrollHeight - oldScrollHeight;
            scrollContainer.scrollTop = scrollTop + heightDiff;
          }, 0);
        }
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [isGroupChat, visibleGroupMessageCount, visibleChatItemCount, groupMessages.length, chatItems.length, selectedAgent]);

  /* ─── Initialize visible count when switching agents/chat mode ─── */
  useEffect(() => {
    // Always reset to last 50 when switching (for performance)
    if (isGroupChat) {
      setVisibleGroupMessageCount(Math.min(50, groupMessages.length));
      setUserHasScrolledUp(false);
    } else if (selectedAgent) {
      setVisibleChatItemCount(Math.min(50, chatItems.length));
      setUserHasScrolledUp(false);
    }
  }, [selectedAgentId, isGroupChat]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedAgentId]);

  /* ─── Build group context for agents to see each other ─── */
  const buildGroupContext = useCallback(
    (userMessage: string) => {
      // Build the recent group chat history (last 20 messages)
      const recent = groupMessages.slice(-20);
      const contextLines = recent.map((m) => {
        if (m.role === "user") return `[You]: ${m.text}`;
        return `[${m.agentName}]: ${m.text}`;
      });
      contextLines.push(`[You]: ${userMessage}`);

      // Only include enabled agents in the context (if enabledAgents is empty, all are enabled)
      const activeAgents = enabledAgents.size === 0
        ? agents
        : agents.filter((a) => enabledAgents.has(a.agentId));
      const agentNames = activeAgents.map((a) => a.name).join(", ");

      return [
        `[GROUP CHAT] You are in a group discussion with these other AI agents: ${agentNames}.`,
        `Below is the recent group chat conversation. Read it, then respond naturally as yourself — be conversational, reference what others said if relevant, agree/disagree, add your perspective.`,
        ``,
        `--- Recent Group Chat ---`,
        ...contextLines,
        `--- End of Chat ---`,
        ``,
        `Now respond with your contribution to the group discussion. Be concise and conversational.`,
      ].join("\n");
    },
    [groupMessages, agents, enabledAgents]
  );

  /* ─── Send handler ─── */
  const handleSend = useCallback(() => {
    if (!message.trim() || !onSendMessage) return;

    if (isGroupChat) {
      // Add user message to group timeline
      const userMsg: GroupMessage = {
        id: `g-user-${Date.now()}`,
        role: "user",
        text: message.trim(),
        timestamp: Date.now(),
      };
      setGroupMessages((prev) => [...prev, userMsg]);

      // Build context and dispatch to enabled agents only
      const context = buildGroupContext(message.trim());

      for (const agent of agents) {
        // Skip disabled agents (if enabledAgents is empty, all are enabled by default)
        if (enabledAgents.size > 0 && !enabledAgents.has(agent.agentId)) {
          continue;
        }
        // Record current outputLines count before sending
        pendingGroupRef.current.set(agent.agentId, agent.outputLines.length);
        // Send with group context
        onSendMessage(agent.agentId, context);
      }

      setMessage("");
      return;
    }

    // 1:1 chat send
    if (!selectedAgentId) return;
    onSendMessage(selectedAgentId, message);
    setMessage("");
  }, [message, onSendMessage, selectedAgentId, isGroupChat, agents, buildGroupContext]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setMessage("");
    setShowMobileSidebar(false); // Close mobile sidebar when agent is selected
    // Reset scroll state when switching agents
    setUserHasScrolledUp(false);
  }, []);

  // Auto-adjust fullscreen on window resize (only enforce on mobile)
  useEffect(() => {
    const handleResize = () => {
      // Only enforce fullscreen on mobile, allow manual toggle on desktop
      if (window.innerWidth < 640) {
        // Mobile - always force fullscreen
        setIsFullscreen(true);
      }
      // Desktop - don't interfere with user's fullscreen toggle
    };

    window.addEventListener('resize', handleResize);
    // Check on mount - only enforce on mobile
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsFullscreen(true);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []); // Empty deps - only run on mount and actual window resize, don't interfere with manual toggles

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Helper: agent color by index
  const getAgentColor = useCallback(
    (agentId: string) => {
      const idx = agents.findIndex((a) => a.agentId === agentId);
      return AGENT_COLORS[idx >= 0 ? idx % AGENT_COLORS.length : 0];
    },
    [agents]
  );

  // Check if any group agent is still running
  const anyGroupAgentRunning = isGroupChat && agents.some((a) => a.status === "running" && pendingGroupRef.current.has(a.agentId));

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Agent Chatroom"
    >
      <div
        className={`relative flex border border-border/60 bg-background shadow-2xl overflow-hidden animate-scale-in ${
          isFullscreen
            ? "w-screen h-screen rounded-none"
            : "w-full sm:w-[95vw] max-w-6xl h-[95vh] sm:h-[85vh] rounded-lg sm:rounded-2xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile sidebar backdrop - only show when sidebar is open */}
        {showMobileSidebar && (
          <div
            className="sm:hidden fixed inset-0 bg-black/60 z-[245] -m-4"
            onClick={() => setShowMobileSidebar(false)}
            aria-hidden="true"
          />
        )}
        {/* ─── LEFT SIDEBAR ─── */}
        {/* Desktop sidebar - always visible on desktop */}
        <div className={`${isFullscreen ? 'w-72' : 'w-72'} shrink-0 flex-col border-r border-border/60 bg-muted/30 hidden sm:flex`}>
          {/* Sidebar header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-foreground">
              Chatroom
            </h2>
            <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
              {agents.length}
            </span>
          </div>

          {/* Search */}
          <div className="px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents…"
                className="w-full rounded-lg bg-muted/60 py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {/* ── Group Chat channel ── */}
            <button
              onClick={() => handleSelectAgent(GROUP_CHAT_ID)}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                isGroupChat
                  ? "bg-primary/12 border border-primary/25"
                  : "hover:bg-muted/60 border border-transparent"
              }`}
              tabIndex={0}
              aria-label="Group Chat with all agents"
            >
              <div className="relative shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border-2 border-primary/40">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p
                    className={`text-sm font-bold truncate ${
                      isGroupChat ? "text-primary" : "text-foreground"
                    }`}
                  >
                    Group Chat
                  </p>
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-primary/70">
                    All
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate leading-snug mt-0.5">
                  {agents.length} agents • chat together
                </p>
              </div>
              {groupMessages.length > 0 && (
                <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                  {groupMessages.length}
                </span>
              )}
            </button>

            {/* Divider */}
            <div className="mx-2 my-1.5 border-t border-border/40" />
            <p className="px-3 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
              Direct Messages
            </p>

            {/* ── Individual agent channels ── */}
            {filteredAgents.map((agent, index) => {
              const isActive = agent.agentId === selectedAgentId;
              const isRunning = agent.status === "running";
              const color = AGENT_COLORS[index % AGENT_COLORS.length];
              const lastLine = agent.streamText || agent.lastResult || "";
              const preview =
                lastLine.length > 50
                  ? lastLine.slice(0, 50) + "…"
                  : lastLine || "No messages yet";
              const avatarUrl = buildAvatarDataUrl(
                agent.avatarSeed || agent.name || agent.agentId
              );

              return (
                <button
                  key={agent.agentId}
                  onClick={() => handleSelectAgent(agent.agentId)}
                  className={`group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                    isActive
                      ? "bg-primary/12 border border-primary/25"
                      : "hover:bg-muted/60 border border-transparent"
                  }`}
                  tabIndex={0}
                  aria-label={`Chat with ${agent.name}`}
                >
                  <div className="relative shrink-0">
                    <img
                      src={avatarUrl}
                      alt={agent.name}
                      className="h-10 w-10 rounded-full border-2"
                      style={{ borderColor: color }}
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                        isRunning ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={`text-sm font-semibold truncate ${
                          isActive ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {agent.name}
                      </p>
                      {isRunning && (
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-green-500">
                          Live
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate leading-snug mt-0.5">
                      {preview}
                    </p>
                  </div>
                  {agent.outputLines.length > 0 && (
                    <span className="mt-1 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                      {agent.outputLines.length}
                    </span>
                  )}
                </button>
              );
            })}

            {filteredAgents.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No agents found
              </p>
            )}
          </div>
        </div>

        {/* ─── MOBILE SIDEBAR ─── (completely separate, only shows on mobile when menu clicked) */}
        {showMobileSidebar && (
          <div className="sm:hidden absolute inset-0 z-[250] flex flex-col bg-background shadow-2xl">
            {/* Mobile sidebar header with close button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background">
              <span className="text-sm font-semibold">Select Agent</span>
              <button
                type="button"
                onClick={() => setShowMobileSidebar(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close sidebar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-border/50">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search agents…"
                  className="w-full rounded-lg bg-muted/60 py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>

            {/* Channel list - same content as desktop */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
              {/* ── Group Chat channel ── */}
              <button
                onClick={() => handleSelectAgent(GROUP_CHAT_ID)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                  isGroupChat
                    ? "bg-primary/12 border border-primary/25"
                    : "hover:bg-muted/60 border border-transparent"
                }`}
                tabIndex={0}
                aria-label="Group Chat with all agents"
              >
                <div className="relative shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border-2 border-primary/40">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p
                      className={`text-sm font-bold truncate ${
                        isGroupChat ? "text-primary" : "text-foreground"
                      }`}
                    >
                      Group Chat
                    </p>
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-primary/70">
                      All
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate leading-snug mt-0.5">
                    {agents.length} agents • chat together
                  </p>
                </div>
                {groupMessages.length > 0 && (
                  <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                    {groupMessages.length}
                  </span>
                )}
              </button>

              {/* Divider */}
              <div className="mx-2 my-1.5 border-t border-border/40" />
              <p className="px-3 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
                Direct Messages
              </p>

              {/* ── Individual agent channels ── */}
              {filteredAgents.map((agent, index) => {
                const isActive = agent.agentId === selectedAgentId;
                const isRunning = agent.status === "running";
                const color = AGENT_COLORS[index % AGENT_COLORS.length];
                const lastLine = agent.streamText || agent.lastResult || "";
                const preview =
                  lastLine.length > 50
                    ? lastLine.slice(0, 50) + "…"
                    : lastLine || "No messages yet";
                const avatarUrl = buildAvatarDataUrl(
                  agent.avatarSeed || agent.name || agent.agentId
                );

                return (
                  <button
                    key={agent.agentId}
                    onClick={() => handleSelectAgent(agent.agentId)}
                    className={`group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                      isActive
                        ? "bg-primary/12 border border-primary/25"
                        : "hover:bg-muted/60 border border-transparent"
                    }`}
                    tabIndex={0}
                    aria-label={`Chat with ${agent.name}`}
                  >
                    <div className="relative shrink-0">
                      <img
                        src={avatarUrl}
                        alt={agent.name}
                        className="h-10 w-10 rounded-full border-2"
                        style={{ borderColor: color }}
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                          isRunning ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={`text-sm font-semibold truncate ${
                            isActive ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {agent.name}
                        </p>
                        {isRunning && (
                          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-green-500">
                            Live
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate leading-snug mt-0.5">
                        {preview}
                      </p>
                    </div>
                    {agent.outputLines.length > 0 && (
                      <span className="mt-1 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                        {agent.outputLines.length}
                      </span>
                    )}
                  </button>
                );
              })}

              {filteredAgents.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No agents found
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── RIGHT PANE ─── */}
        <div className={`flex flex-1 flex-col min-w-0 ${showMobileSidebar ? 'hidden sm:flex' : ''}`}>
          {/* Chat header */}
          <div className="flex items-center gap-2 sm:gap-3 border-b border-border/50 px-3 sm:px-5 py-2.5 sm:py-3 bg-background/80 backdrop-blur-sm">
            {/* Mobile sidebar toggle button */}
            <button
              type="button"
              onClick={() => setShowMobileSidebar((prev) => !prev)}
              className="sm:hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            {isGroupChat ? (
              <>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-sm font-bold text-foreground">Group Chat</h3>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {enabledAgents.size === 0 ? agents.length : enabledAgents.size} of {agents.length} agents
                  </span>
                </div>
                {/* Stacked avatars - clickable to toggle agents */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Toggle modal for agent selection
                    setShowAgentToggleModal((prev) => !prev);
                  }}
                  className="ml-2 flex -space-x-2 hover:opacity-80 transition-opacity cursor-pointer relative z-10"
                  title="Click to toggle agents in group chat"
                >
                  {agents.slice(0, 6).map((a, i) => {
                    const isEnabled = enabledAgents.size === 0 || enabledAgents.has(a.agentId);
                    return (
                      <img
                        key={a.agentId}
                        src={buildAvatarDataUrl(a.avatarSeed || a.name || a.agentId)}
                        alt={a.name}
                        className={`h-6 w-6 rounded-full border-2 border-background transition-all ${
                          isEnabled ? "opacity-100" : "opacity-30 grayscale"
                        }`}
                        style={{ zIndex: 6 - i }}
                      />
                    );
                  })}
                  {agents.length > 6 && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted border-2 border-background text-[9px] font-bold text-muted-foreground">
                      +{agents.length - 6}
                    </div>
                  )}
                </button>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                    {groupMessages.length} messages
                  </span>
                  {/* Fullscreen button - only show on desktop */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFullscreen((prev) => !prev);
                    }}
                    className="hidden sm:flex rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] min-w-[44px] items-center justify-center"
                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-5 w-5" />
                    ) : (
                      <Maximize2 className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    aria-label="Close chatroom"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </>
            ) : selectedAgent ? (
              <>
                <Hash className="h-4 w-4 text-muted-foreground" />
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={buildAvatarDataUrl(
                      selectedAgent.avatarSeed ||
                        selectedAgent.name ||
                        selectedAgent.agentId
                    )}
                    alt={selectedAgent.name}
                    className="h-7 w-7 rounded-full"
                  />
                  <h3 className="text-sm font-bold text-foreground truncate">
                    {selectedAgent.name}
                  </h3>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      selectedAgent.status === "running"
                        ? "bg-green-500 animate-pulse"
                        : "bg-muted-foreground/40"
                    }`}
                  />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {selectedAgent.status === "running" ? "Running" : "Idle"}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                    {chatItems.length} messages
                  </span>
                  {/* Fullscreen button - only show on desktop */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFullscreen((prev) => !prev);
                    }}
                    className="hidden sm:flex rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] min-w-[44px] items-center justify-center"
                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-5 w-5" />
                    ) : (
                      <Maximize2 className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    aria-label="Close chatroom"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select an agent to start chatting
              </p>
            )}
          </div>

          {/* ─── Messages area ─── */}
          <div ref={messagesScrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-thin">

            {/* ── Group Chat messages ── */}
            {isGroupChat && groupMessages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
                <Users className="h-16 w-16 opacity-20" />
                <p className="text-sm font-medium">Group Chat</p>
                <p className="text-xs text-center max-w-sm">
                  Send a message and all {agents.length} agents will respond with their own perspective.
                  They can see each other&apos;s replies — like a real group discussion!
                </p>
              </div>
            )}

            {isGroupChat && (
              <>
                {/* Load more trigger at top */}
                {visibleGroupMessageCount < groupMessages.length && (
                  <div ref={messagesStartRef} className="flex justify-center py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setVisibleGroupMessageCount((prev) => Math.min(prev + 50, groupMessages.length));
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition"
                    >
                      Load {Math.min(50, groupMessages.length - visibleGroupMessageCount)} older messages
                    </button>
                  </div>
                )}
                {/* Render only visible messages (last N messages) */}
                {groupMessages
                  .slice(-visibleGroupMessageCount)
                  .map((msg) => {
                    if (msg.role === "user") {
                  return (
                    <div key={msg.id} className="flex items-start gap-3 justify-end">
                      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 shadow-sm">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground">
                          {msg.text}
                        </p>
                        <p className="mt-1 text-[10px] text-primary-foreground/60 text-right">
                          {formatTimestamp(msg.timestamp)}
                        </p>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-primary">U</span>
                      </div>
                    </div>
                  );
                }

                // Agent message in group
                const agentColor = getAgentColor(msg.agentId || "");
                const avatarUrl = buildAvatarDataUrl(msg.avatarSeed || "");

                return (
                  <div key={msg.id} className="flex items-start gap-3">
                    <img
                      src={avatarUrl}
                      alt={msg.agentName}
                      className="h-8 w-8 rounded-full shrink-0 mt-0.5 border-2"
                      style={{ borderColor: agentColor }}
                    />
                    <div className="max-w-[80%] min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span
                          className="text-xs font-bold"
                          style={{ color: agentColor }}
                        >
                          {msg.agentName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTimestamp(msg.timestamp)}
                        </span>
                      </div>
                      <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3 shadow-sm">
                        <div className="agent-markdown text-sm leading-relaxed text-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {rewriteMediaLinesToMarkdown(stripMetaTags(msg.text))}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                );
                  })}
              </>
            )}

            {/* Group chat: live typing indicators for pending agents */}
            {isGroupChat &&
              agents
                .filter((a) => pendingGroupRef.current.has(a.agentId) && a.status === "running")
                .map((agent) => {
                  const color = getAgentColor(agent.agentId);
                  const avatarUrl = buildAvatarDataUrl(
                    agent.avatarSeed || agent.name || agent.agentId
                  );
                  const liveText = agent.streamText
                    ? normalizeAssistantDisplayText(agent.streamText)
                    : "";

                  return (
                    <div key={`live-${agent.agentId}`} className="flex items-start gap-3">
                      <img
                        src={avatarUrl}
                        alt={agent.name}
                        className="h-8 w-8 rounded-full shrink-0 mt-0.5 border-2 opacity-80"
                        style={{ borderColor: color }}
                      />
                      <div className="max-w-[80%] min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs font-bold" style={{ color }}>
                            {agent.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground animate-pulse">
                            typing…
                          </span>
                        </div>
                        {liveText ? (
                          <div className="rounded-2xl rounded-tl-sm bg-muted/40 border border-border/30 px-4 py-3 shadow-sm">
                            <div className="agent-markdown text-sm leading-relaxed text-foreground/80">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {rewriteMediaLinesToMarkdown(liveText)}
                              </ReactMarkdown>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl rounded-tl-sm bg-muted/50 px-5 py-3.5">
                            <div className="flex gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                              <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                              <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

            {/* ── 1:1 Chat — empty state ── */}
            {!isGroupChat && !selectedAgent && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
                <MessageSquare className="h-16 w-16 opacity-20" />
                <p className="text-sm">Select an agent from the sidebar</p>
              </div>
            )}

            {!isGroupChat && selectedAgent && chatItems.length === 0 && !liveAssistantText && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Hash className="h-12 w-12 opacity-20" />
                <p className="text-sm">No messages yet — start a conversation!</p>
              </div>
            )}

            {/* ── 1:1 Chat messages ── */}
            {!isGroupChat && selectedAgent && (
              <>
                {/* Load more trigger at top for 1:1 chat */}
                {visibleChatItemCount < chatItems.length && (
                  <div className="flex justify-center py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setVisibleChatItemCount((prev) => Math.min(prev + 50, chatItems.length));
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition"
                    >
                      Load {Math.min(50, chatItems.length - visibleChatItemCount)} older messages
                    </button>
                  </div>
                )}
                {/* Render only visible chat items (last N items) */}
                {chatItems
                  .slice(-visibleChatItemCount)
                  .map((item, index) => {
                const isUser = item.kind === "user";
                const agentColor =
                  AGENT_COLORS[
                    agents.findIndex(
                      (a) => a.agentId === selectedAgentId
                    ) % AGENT_COLORS.length
                  ] || "#6366f1";
                const avatarUrl = buildAvatarDataUrl(
                  selectedAgent.avatarSeed ||
                    selectedAgent.name ||
                    selectedAgent.agentId
                );

                if (item.kind === "thinking") {
                  return (
                    <div key={index} className="flex items-start gap-3 max-w-[85%]">
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full shrink-0 mt-0.5 opacity-60"
                      />
                      <div className="rounded-2xl rounded-tl-sm bg-muted/40 border border-border/40 px-4 py-3 min-w-0">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                          💭 Thinking
                        </p>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground">
                          {item.text}
                        </p>
                      </div>
                    </div>
                  );
                }

                if (item.kind === "tool") {
                  return (
                    <div key={index} className="flex items-start gap-3 max-w-[85%]">
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full shrink-0 mt-0.5 opacity-60"
                      />
                      <div className="rounded-2xl rounded-tl-sm bg-accent/10 border border-accent/20 px-4 py-3 min-w-0">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-accent-foreground/70 mb-1.5">
                          🔧 Tool Call
                        </p>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-foreground/80">
                          {item.text}
                        </p>
                      </div>
                    </div>
                  );
                }

                if (isUser) {
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-3 justify-end"
                    >
                      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 shadow-sm">
                        <div className="agent-markdown text-sm leading-relaxed text-primary-foreground [&_*]:text-primary-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {rewriteMediaLinesToMarkdown(item.text)}
                          </ReactMarkdown>
                        </div>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-primary">U</span>
                      </div>
                    </div>
                  );
                }

                // Assistant message
                return (
                  <div key={index} className="flex items-start gap-3">
                    <img
                      src={avatarUrl}
                      alt={selectedAgent.name}
                      className="h-8 w-8 rounded-full shrink-0 mt-0.5 border-2"
                      style={{ borderColor: agentColor }}
                    />
                    <div className="max-w-[80%] min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span
                          className="text-xs font-bold"
                          style={{ color: agentColor }}
                        >
                          {selectedAgent.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTimestamp(Date.now())}
                        </span>
                      </div>
                      <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3 shadow-sm">
                        <div className="agent-markdown text-sm leading-relaxed text-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {rewriteMediaLinesToMarkdown(item.text)}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                );
                  })}
              </>
            )}

            {/* 1:1 Live thinking trace */}
            {!isGroupChat && selectedAgent && liveThinkingText && (
              <div className="flex items-start gap-3 max-w-[85%]">
                <img
                  src={buildAvatarDataUrl(
                    selectedAgent.avatarSeed ||
                      selectedAgent.name ||
                      selectedAgent.agentId
                  )}
                  alt=""
                  className="h-8 w-8 rounded-full shrink-0 mt-0.5 opacity-60"
                />
                <div className="rounded-2xl rounded-tl-sm bg-muted/40 border border-border/40 px-4 py-3 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                    💭 Thinking…
                  </p>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground">
                    {liveThinkingText}
                  </p>
                </div>
              </div>
            )}

            {/* 1:1 Live assistant stream */}
            {!isGroupChat && selectedAgent && liveAssistantText && (
              <div className="flex items-start gap-3">
                <img
                  src={buildAvatarDataUrl(
                    selectedAgent.avatarSeed ||
                      selectedAgent.name ||
                      selectedAgent.agentId
                  )}
                  alt={selectedAgent.name}
                  className="h-8 w-8 rounded-full shrink-0 mt-0.5 border-2 border-primary/50"
                />
                <div className="max-w-[80%] min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-bold text-primary">
                      {selectedAgent.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      typing…
                    </span>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3 shadow-sm">
                    <div className="agent-markdown text-sm leading-relaxed text-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {rewriteMediaLinesToMarkdown(liveAssistantText)}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 1:1 Typing indicator */}
            {!isGroupChat &&
              selectedAgent?.status === "running" &&
              !liveAssistantText &&
              !liveThinkingText && (
                <div className="flex items-start gap-3">
                  <img
                    src={buildAvatarDataUrl(
                      selectedAgent.avatarSeed ||
                        selectedAgent.name ||
                        selectedAgent.agentId
                    )}
                    alt=""
                    className="h-8 w-8 rounded-full shrink-0 mt-0.5 opacity-50"
                  />
                  <div className="rounded-2xl rounded-tl-sm bg-muted/50 px-5 py-3.5">
                    <div className="flex gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

            <div ref={messagesEndRef} />
          </div>

          {/* ─── Input area ─── */}
          {(isGroupChat || selectedAgent) && (
            <div className="border-t border-border/50 bg-background/80 backdrop-blur-sm px-3 sm:px-5 py-2.5 sm:py-3">
              <div className="flex items-end gap-2 flex-wrap sm:flex-nowrap">
                <div className="flex-1 relative w-full min-w-0">
                  <input
                    ref={inputRef}
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      isGroupChat
                        ? (() => {
                            const enabled = enabledAgents.size === 0
                              ? agents
                              : agents.filter((a) => enabledAgents.has(a.agentId));
                            const names = enabled.map((a) => a.name).join(", ");
                            return enabled.length > 0
                              ? `Message: ${names}…`
                              : `Message all ${agents.length} agents…`;
                          })()
                        : `Message ${selectedAgent?.name}…`
                    }
                    className="w-full rounded-xl border border-border/60 bg-muted/40 px-3 sm:px-4 py-2.5 sm:py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/30 transition min-h-[44px]"
                    autoFocus
                    disabled={
                      isGroupChat
                        ? anyGroupAgentRunning
                        : selectedAgent?.status === "running"
                    }
                  />
                </div>
                <VoiceDictationButton
                  onTranscript={(text) =>
                    setMessage((prev) => (prev ? `${prev} ${text}` : text))
                  }
                  disabled={
                    isGroupChat
                      ? anyGroupAgentRunning
                      : selectedAgent?.status === "running"
                  }
                />
                <button
                  onClick={handleSend}
                  disabled={
                    !message.trim() ||
                    (isGroupChat
                      ? anyGroupAgentRunning
                      : selectedAgent?.status === "running")
                  }
                  className="flex h-[46px] min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 sm:px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  aria-label="Send message"
                  tabIndex={0}
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
                {isGroupChat ? (
                  <>
                    Press <kbd className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono">Enter</kbd> to send to all agents · each agent sees the full group conversation
                  </>
                ) : (
                  <>
                    Press <kbd className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono">Enter</kbd> to send · <kbd className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono">Esc</kbd> to close
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Agent Toggle Modal */}
      {showAgentToggleModal && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAgentToggleModal(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Toggle Agents in Group Chat</h3>
                <button
                  type="button"
                  onClick={() => setShowAgentToggleModal(false)}
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Disabled agents won't receive messages in group chat
              </p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <div className="space-y-2">
                {agents.map((agent) => {
                  const isEnabled = enabledAgents.size === 0 || enabledAgents.has(agent.agentId);
                  const color = getAgentColor(agent.agentId);
                  const avatarUrl = buildAvatarDataUrl(
                    agent.avatarSeed || agent.name || agent.agentId
                  );
                  return (
                    <button
                      key={agent.agentId}
                      type="button"
                      onClick={() => {
                        const next = new Set(enabledAgents);
                        if (isEnabled) {
                          next.delete(agent.agentId);
                        } else {
                          next.add(agent.agentId);
                        }
                        setEnabledAgents(next);
                      }}
                      className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 transition-all ${
                        isEnabled
                          ? "border-border bg-muted/40 hover:bg-muted/60"
                          : "border-border/50 bg-muted/20 opacity-60 hover:opacity-80"
                      }`}
                    >
                      <img
                        src={avatarUrl}
                        alt={agent.name}
                        className={`h-10 w-10 rounded-full border-2 shrink-0 ${
                          isEnabled ? "" : "grayscale opacity-50"
                        }`}
                        style={{ borderColor: color }}
                      />
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {agent.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isEnabled ? "Enabled" : "Disabled"}
                        </p>
                      </div>
                      <div
                        className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          isEnabled
                            ? "bg-primary border-primary"
                            : "bg-transparent border-muted-foreground/40"
                        }`}
                      >
                        {isEnabled && (
                          <svg
                            className="h-3 w-3 text-primary-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-border px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    // Enable all
                    setEnabledAgents(new Set(agents.map((a) => a.agentId)));
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition"
                >
                  Enable All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Disable all
                    setEnabledAgents(new Set());
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition"
                >
                  Disable All
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAgentToggleModal(false);
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
