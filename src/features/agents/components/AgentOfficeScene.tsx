"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { OfficeEnvironment, type DeskAgentInfo, MONITOR_COLORS } from "./office3d/OfficeEnvironment";
import { AgentBoxes, ALL_SNAP_POINTS } from "./office3d/AgentBoxes";
import { RobotExpressivePlayer } from "./office3d/RobotExpressivePlayer";
import { RightDragVerticalCamera } from "./office3d/RightDragVerticalCamera";
import { RoomCameraBounds } from "./office3d/RoomCameraBounds";
import { ThoughtBubble } from "./office3d/ThoughtBubble";
import { ChatModal } from "./office3d/ChatModal";
import { AgentDetailsModal } from "./office3d/AgentDetailsModal";
import { FileManagerModal } from "./office3d/FileManagerModal";
import { useAgentStore, type AgentState } from "@/features/agents/state/store";
import { useGatewayConnection, isGatewayDisconnectLikeError, type EventFrame } from "@/lib/gateway/GatewayClient";
import { hydrateAgentFleetFromGateway } from "@/features/agents/operations/agentFleetHydration";
import { sendChatMessageViaStudio } from "@/features/agents/operations/chatSendOperation";
import { createGatewayRuntimeEventHandler, type GatewayRuntimeEventHandler } from "@/features/agents/state/gatewayRuntimeEventHandler";
import { buildHistorySyncPatch } from "@/features/agents/state/runtimeEventBridge";
import { createStudioSettingsCoordinator } from "@/lib/studio/coordinator";
import { SwarmDispatchModal } from "@/features/agents/components/SwarmDispatchModal";
import { ChatroomModal } from "@/features/agents/components/ChatroomModal";
import { KanbanBoardModal, loadKanbanCards, saveKanbanCards, useKanbanAutoComplete, type KanbanCard } from "@/features/agents/components/KanbanBoardModal";
import Link from "next/link";
import { Home, Cable, Volume2, Volume1, VolumeX, Zap, MessageSquare, SkipForward, Plus, Minus, LayoutGrid } from "lucide-react";

export type AgentBoxData = {
  id: string;
  name: string;
  status: "working" | "idle";
  color: string;
  position: [number, number, number];
  lastMessage?: string;
  hasNewMessage?: boolean;
  outputLineCount: number;
};

export const AgentOfficeScene = () => {
  const { state, hydrateAgents, setLoading, setError, dispatch } = useAgentStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [swarmModalOpen, setSwarmModalOpen] = useState(false);
  const [chatroomOpen, setChatroomOpen] = useState(false);
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [kanbanCards, setKanbanCards] = useState<KanbanCard[]>(() => loadKanbanCards());
  const [agentBoxes, setAgentBoxes] = useState<AgentBoxData[]>([]);
  const [tvMuted, setTvMuted] = useState(true);
  const [tvVolume, setTvVolume] = useState(50);
  const [tvSkipSignal, setTvSkipSignal] = useState(0);
  const historyInFlightRef = useRef<Set<string>>(new Set());
  
  const settingsCoordinator = createStudioSettingsCoordinator();
  const { client, status, gatewayUrl } = useGatewayConnection(settingsCoordinator);

  // Keep a stable ref to the latest agent state so the event handler always reads fresh data
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Load chat history for an agent from the gateway (mirrors homepage logic)
  type ChatHistoryResult = {
    sessionKey: string;
    messages: Record<string, unknown>[];
  };

  const loadAgentHistory = useCallback(
    async (agentId: string) => {
      if (!client || status !== "connected") return;
      const agent = stateRef.current.agents.find((a) => a.agentId === agentId);
      const sessionKey = agent?.sessionKey?.trim();
      if (!agent || !agent.sessionCreated || !sessionKey) return;
      if (historyInFlightRef.current.has(sessionKey)) return;

      historyInFlightRef.current.add(sessionKey);
      const loadedAt = Date.now();
      try {
        const result = await client.call<ChatHistoryResult>("chat.history", {
          sessionKey,
          limit: 200,
        });
        const patch = buildHistorySyncPatch({
          messages: result.messages ?? [],
          currentLines: agent.outputLines,
          loadedAt,
          status: agent.status,
          runId: agent.runId,
        });
        dispatch({ type: "updateAgent", agentId, patch });
      } catch (err) {
        if (!isGatewayDisconnectLikeError(err)) {
          console.error("[office] Failed to load chat history:", err);
        }
      } finally {
        historyInFlightRef.current.delete(sessionKey);
      }
    },
    [client, status, dispatch],
  );

  const runtimeEventHandlerRef = useRef<GatewayRuntimeEventHandler | null>(null);

  // Wire up the gateway runtime event handler so streaming responses update the store
  useEffect(() => {
    if (!client || status !== "connected") return;

    const handler = createGatewayRuntimeEventHandler({
      getStatus: () => status,
      getAgents: () => stateRef.current.agents,
      dispatch,
      // Simplified live-patch: dispatch immediately (the home page batches via RAF for perf)
      queueLivePatch: (agentId: string, patch: Partial<AgentState>) => {
        dispatch({ type: "updateAgent", agentId, patch });
      },
      loadSummarySnapshot: async () => { /* not needed in office view */ },
      loadAgentHistory: (agentId: string) => loadAgentHistory(agentId),
      refreshHeartbeatLatestUpdate: () => {},
      bumpHeartbeatTick: () => {},
      setTimeout: (fn, delayMs) => window.setTimeout(fn, delayMs),
      clearTimeout: (id) => window.clearTimeout(id),
      isDisconnectLikeError: isGatewayDisconnectLikeError,
      logWarn: (message, meta) => console.warn("[office]", message, meta),
      updateSpecialLatestUpdate: () => {},
    });

    runtimeEventHandlerRef.current = handler;
    const unsubscribe = client.onEvent((event: EventFrame) => handler.handleEvent(event));

    return () => {
      runtimeEventHandlerRef.current = null;
      handler.dispose();
      unsubscribe();
    };
  }, [client, status, dispatch, loadAgentHistory]);

  // Auto-load chat history for all agents when connected
  useEffect(() => {
    if (status !== "connected") return;
    for (const agent of state.agents) {
      if (!agent.sessionCreated || agent.historyLoadedAt) continue;
      void loadAgentHistory(agent.agentId);
    }
  }, [state.agents, loadAgentHistory, status]);

  // Toggle mute/unmute for the wall TV YouTube player
  const toggleMusic = () => setTvMuted((prev) => !prev);

  // Handle sending messages to agents — uses the real sessionKey from the agent store
  const handleSendMessage = async (agentId: string, message: string) => {
    if (!client || status !== "connected") {
      console.error("Cannot send message: not connected to gateway");
      return;
    }

    const agent = state.agents.find((a) => a.agentId === agentId);
    if (!agent) {
      console.error("Agent not found in store:", agentId);
      return;
    }

    try {
      await sendChatMessageViaStudio({
        client,
        dispatch,
        getAgent: (id) => state.agents.find((a) => a.agentId === id) ?? null,
        agentId,
        sessionKey: agent.sessionKey,
        message,
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
    }
  };

  // Kanban cards persistence
  const handleKanbanCardsChange = useCallback((updated: KanbanCard[]) => {
    setKanbanCards(updated);
    saveKanbanCards(updated);
  }, []);

  // Kanban auto-completion — always active, even when modal is closed
  useKanbanAutoComplete(kanbanCards, handleKanbanCardsChange);

  // Swarm dispatch — fire tasks to multiple agents in parallel
  const handleSwarmDispatch = async (
    tasks: { agentId: string; sessionKey: string; message: string }[]
  ) => {
    if (!client || status !== "connected") return;
    await Promise.all(
      tasks.map((t) =>
        sendChatMessageViaStudio({
          client,
          dispatch,
          getAgent: (id) =>
            stateRef.current.agents.find((a) => a.agentId === id) ?? null,
          agentId: t.agentId,
          sessionKey: t.sessionKey,
          message: t.message,
        })
      )
    );
  };

  // Hydrate agents from gateway on connection
  useEffect(() => {
    if (status !== "connected" || !client) return;

    const loadAgents = async () => {
      setLoading(true);
      try {
        const result = await hydrateAgentFleetFromGateway({
          client,
          gatewayUrl: gatewayUrl || "",
          cachedConfigSnapshot: null,
          loadStudioSettings: () => settingsCoordinator.loadSettings(),
          isDisconnectLikeError: () => false,
          logError: (message, error) => console.error(message, error),
        });
        hydrateAgents(result.seeds);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load agents");
      } finally {
        setLoading(false);
      }
    };

    loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, client]);

  // Track previous outputLines count to detect new messages
  const prevLineCountsRef = useRef<Map<string, number>>(new Map());
  const [newMessageAgents, setNewMessageAgents] = useState<Set<string>>(new Set());
  const [toastQueue, setToastQueue] = useState<{ id: string; agentName: string; message: string; ts: number }[]>([]);

  // Map agents to 3D box data
  useEffect(() => {
    const colors = ["#FF6B9D", "#C96DD8", "#79A3FF", "#FFB347", "#77DD77"];
    const newMsgSet = new Set<string>();
    const newToasts: { id: string; agentName: string; message: string; ts: number }[] = [];

    const boxes: AgentBoxData[] = state.agents.map((agent, index) => {
      const prevCount = prevLineCountsRef.current.get(agent.agentId) ?? 0;
      const currentCount = agent.outputLines.length;
      const hasNew = currentCount > prevCount && prevCount > 0;

      if (hasNew) {
        newMsgSet.add(agent.agentId);
        // Only toast if chat modal isn't open for this agent
        if (!(chatModalOpen && selectedAgentId === agent.agentId)) {
          const lastLine = agent.lastResult || agent.streamText || "New message";
          newToasts.push({
            id: `${agent.agentId}-${Date.now()}`,
            agentName: agent.name,
            message: lastLine.length > 120 ? lastLine.slice(0, 120) + "…" : lastLine,
            ts: Date.now(),
          });
        }
      }

      prevLineCountsRef.current.set(agent.agentId, currentCount);

      return {
        id: agent.agentId,
        name: agent.name,
        status: agent.status === "running" ? "working" as const : "idle" as const,
        color: colors[index % colors.length],
        position: [0, 0, 0] as [number, number, number],
        lastMessage: agent.streamText || agent.lastResult || undefined,
        hasNewMessage: newMsgSet.has(agent.agentId) || newMessageAgents.has(agent.agentId),
        outputLineCount: currentCount,
      };
    });

    if (newMsgSet.size > 0) {
      setNewMessageAgents(prev => {
        const next = new Set(prev);
        for (const id of newMsgSet) next.add(id);
        return next;
      });
    }

    if (newToasts.length > 0) {
      setToastQueue(prev => [...prev, ...newToasts].slice(-5));
    }

    setAgentBoxes(boxes);
  }, [state.agents, chatModalOpen, selectedAgentId, newMessageAgents]);

  // Auto-dismiss toasts after 5 seconds
  useEffect(() => {
    if (toastQueue.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setToastQueue(prev => prev.filter(t => now - t.ts < 5000));
    }, 1000);
    return () => clearInterval(timer);
  }, [toastQueue.length]);

  const dismissToast = useCallback((id: string) => {
    setToastQueue(prev => prev.filter(t => t.id !== id));
  }, []);

  // Build desk agents map: snap position → agent info for monitor display
  const deskAgents = useMemo(() => {
    const map = new Map<string, DeskAgentInfo>();
    for (const sp of ALL_SNAP_POINTS) {
      if (sp.kind !== "desk") continue;
      // Find which agent is at this snap point by checking stored assignments
      const agentBox = agentBoxes.find((ab) => {
        const stored = localStorage.getItem("oc-office-claw-positions");
        if (!stored) return false;
        try {
          const obj = JSON.parse(stored) as Record<string, string>;
          return obj[sp.id] === ab.id;
        } catch { return false; }
      });
      if (agentBox) {
        const idx = agentBoxes.indexOf(agentBox);
        // Key must match workstation positions (integer coords), not nudged snap coords
        const wx = Math.round(sp.position[0]);
        const wz = Math.round(sp.position[2]);
        map.set(`${wx},${wz}`, {
          name: agentBox.name,
          status: agentBox.status,
          outputLineCount: agentBox.outputLineCount,
          color: agentBox.color,
          monitorColor: MONITOR_COLORS[idx % MONITOR_COLORS.length],
        });
      }
    }
    return map;
  }, [agentBoxes]);

  const selectedAgent = agentBoxes.find((box) => box.id === selectedAgentId);

  return (
    <>
      {/* Top-left controls overlay */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md border border-input/90 bg-background/75 backdrop-blur-sm px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-ring hover:bg-card shadow-lg"
        >
          <Home className="h-4 w-4" />
          Home
        </Link>
        <button
          onClick={() => setChatroomOpen(true)}
          disabled={status !== "connected" || state.agents.length === 0}
          className="flex items-center gap-2 rounded-md border border-primary/50 bg-white dark:bg-white/95 backdrop-blur-sm px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary transition hover:border-primary hover:bg-primary hover:text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          title="Open agent chatroom"
          aria-label="Open chatroom"
          tabIndex={0}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </button>
        <button
          onClick={() => setSwarmModalOpen(true)}
          disabled={status !== "connected" || state.agents.length === 0}
          className="flex items-center gap-2 rounded-md border border-primary/50 bg-white dark:bg-white/95 backdrop-blur-sm px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary transition hover:border-primary hover:bg-primary hover:text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          title="Dispatch tasks to all agents"
        >
          <Zap className="h-4 w-4" />
          Swarm
        </button>
        <button
          onClick={() => setKanbanOpen(true)}
          disabled={status !== "connected" || state.agents.length === 0}
          className="flex items-center gap-2 rounded-md border border-primary/50 bg-white dark:bg-white/95 backdrop-blur-sm px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary transition hover:border-primary hover:bg-primary hover:text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          title="Open kanban board"
          aria-label="Open kanban board"
          tabIndex={0}
        >
          <LayoutGrid className="h-4 w-4" />
          Kanban
        </button>
      </div>

      {/* Title overlay */}
      <div className="absolute top-4 right-4 z-10 glass-panel px-4 py-2">
        <h1 className="console-title text-2xl text-foreground">Agent Office</h1>
      </div>

      {/* TV controls */}
      <div className="absolute top-20 right-4 z-10 flex items-center gap-2">
        <button
          onClick={toggleMusic}
          className="flex items-center gap-2 rounded-md border border-input/90 bg-background/75 backdrop-blur-sm px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-ring hover:bg-card shadow-lg"
          title={tvMuted ? "Unmute office TV" : "Mute office TV"}
          aria-label={tvMuted ? "Unmute office TV" : "Mute office TV"}
          tabIndex={0}
        >
          {tvMuted ? (
            <>
              <VolumeX className="h-4 w-4" />
              Muted
            </>
          ) : (
            <>
              {tvVolume > 50 ? <Volume2 className="h-4 w-4" /> : <Volume1 className="h-4 w-4" />}
              {tvVolume}%
            </>
          )}
        </button>

        {/* Volume down */}
        <button
          onClick={() => setTvVolume((v) => Math.max(0, v - 10))}
          disabled={tvMuted}
          className="flex items-center justify-center rounded-md border border-input/90 bg-background/75 backdrop-blur-sm h-8 w-8 text-foreground transition hover:border-ring hover:bg-card shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          title="Volume down"
          aria-label="Volume down"
          tabIndex={0}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        {/* Volume bar */}
        <div
          className="relative h-2 w-20 rounded-full bg-muted/60 border border-input/50 overflow-hidden"
          title={`Volume: ${tvVolume}%`}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary/70 transition-all"
            style={{ width: `${tvMuted ? 0 : tvVolume}%` }}
          />
        </div>

        {/* Volume up */}
        <button
          onClick={() => setTvVolume((v) => Math.min(100, v + 10))}
          disabled={tvMuted}
          className="flex items-center justify-center rounded-md border border-input/90 bg-background/75 backdrop-blur-sm h-8 w-8 text-foreground transition hover:border-ring hover:bg-card shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          title="Volume up"
          aria-label="Volume up"
          tabIndex={0}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => setTvSkipSignal((n) => n + 1)}
          className="flex items-center gap-2 rounded-md border border-input/90 bg-background/75 backdrop-blur-sm px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-ring hover:bg-card shadow-lg"
          title="Next track"
          aria-label="Skip to next track"
          tabIndex={0}
        >
          <SkipForward className="h-4 w-4" />
          Next
        </button>
      </div>

      {/* Connection status */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        {status === "connected" ? (
          <div className="flex items-center gap-2 rounded-md border-2 border-primary/60 bg-white px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-primary shadow-lg">
            <span className="h-3 w-3 rounded-full bg-primary animate-pulse" />
            Connected • {state.agents.length} agents
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-gray-700 shadow-lg">
            <Cable className="h-4 w-4" />
            {status === "connecting" ? "Connecting..." : "Disconnected"}
          </div>
        )}
      </div>

      {/* 3D Canvas */}
      <Canvas
        camera={{
          position: [20, 20, 20],
          fov: 50,
        }}
        shadows
      >
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[10, 20, 10]}
            intensity={1}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <pointLight position={[-10, 10, -10]} intensity={0.3} />

          {/* Office Environment */}
          <OfficeEnvironment
            agentCount={state.agents.length}
            runningCount={state.agents.filter((a) => a.status === "running").length}
            gatewayStatus={status}
            totalMessages={state.agents.reduce(
              (sum, a) => sum + (a.lastResult ? 1 : 0) + (a.streamText ? 1 : 0),
              0,
            )}
            activityEntries={state.agents
              .filter((a) => a.lastResult || a.streamText)
              .slice(0, 6)
              .map((a) => ({
                id: a.agentId,
                agentName: a.name,
                action: a.streamText || a.lastResult || "Active",
                timestamp: Date.now(),
                status: a.status === "running" ? ("running" as const) : ("ok" as const),
              }))}
            deskAgents={deskAgents}
            onOpenFileManager={() => setFileManagerOpen(true)}
            tvMuted={tvMuted}
            tvVolume={tvVolume}
            tvSkipSignal={tvSkipSignal}
            kanbanCards={kanbanCards}
          />

          {/* Agent Boxes */}
          <AgentBoxes
            agents={agentBoxes}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
            onOpenChat={(agentId: string) => {
              setSelectedAgentId(agentId);
              setChatModalOpen(true);
              // Load/refresh chat history when opening modal
              void loadAgentHistory(agentId);
            }}
            onViewDetails={(agentId: string) => {
              setSelectedAgentId(agentId);
              setDetailsModalOpen(true);
            }}
          />

          {/* RobotExpressive player character */}
          <RobotExpressivePlayer position={[0, 0, 2]} />

          {/* Camera Controls — orbit + right-drag vertical */}
          <RightDragVerticalCamera />
          <RoomCameraBounds />
          <OrbitControls
            makeDefault
            enablePan={false}
            enableZoom={true}
            enableRotate={true}
            minDistance={2}
            maxDistance={18}
            maxPolarAngle={Math.PI / 2.1}
            minPolarAngle={0.2}
            mouseButtons={{
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.DOLLY,
            }}
          />
        </Suspense>
      </Canvas>

      {/* Thought Bubble Overlay */}
      {selectedAgent && selectedAgent.lastMessage && !chatModalOpen && (
        <ThoughtBubble
          agentName={selectedAgent.name}
          message={selectedAgent.lastMessage}
          onOpenChat={() => setChatModalOpen(true)}
        />
      )}

      {/* Chat Modal */}
      {chatModalOpen && selectedAgent && (
        <ChatModal
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          onClose={() => {
            setChatModalOpen(false);
            setSelectedAgentId(null);
          }}
          onSendMessage={handleSendMessage}
        />
      )}

      {/* Agent Details Modal */}
      {detailsModalOpen && selectedAgent && (
        <AgentDetailsModal
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          onClose={() => {
            setDetailsModalOpen(false);
            setSelectedAgentId(null);
          }}
          onOpenChat={() => {
            setDetailsModalOpen(false);
            setChatModalOpen(true);
            void loadAgentHistory(selectedAgent.id);
          }}
        />
      )}

      {/* File Manager Modal */}
      {fileManagerOpen && (
        <FileManagerModal onClose={() => setFileManagerOpen(false)} />
      )}

      {/* Swarm Dispatch Modal */}
      {swarmModalOpen && (
        <SwarmDispatchModal
          agents={state.agents}
          onDispatch={handleSwarmDispatch}
          onClose={() => setSwarmModalOpen(false)}
          disabled={status !== "connected"}
        />
      )}

      {/* Chatroom Modal */}
      {chatroomOpen && (
        <ChatroomModal
          onClose={() => setChatroomOpen(false)}
          onSendMessage={handleSendMessage}
        />
      )}

      {/* Kanban Board Modal */}
      {kanbanOpen && (
        <KanbanBoardModal
          onClose={() => setKanbanOpen(false)}
          onSendMessage={handleSendMessage}
          cards={kanbanCards}
          onCardsChange={handleKanbanCardsChange}
        />
      )}

      {/* Notification Toasts — thought bubble shape */}
      {toastQueue.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex flex-col-reverse items-center gap-3 pointer-events-none">
          {toastQueue.map((toast) => (
            <button
              key={toast.id}
              onClick={() => dismissToast(toast.id)}
              className="pointer-events-auto relative max-w-md rounded-2xl border border-primary/30 bg-background/90 backdrop-blur-lg px-5 py-3 shadow-xl animate-toast-in cursor-pointer transition hover:border-primary/60"
            >
              {/* Thought-bubble tail */}
              <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rotate-45 rounded-sm border-b border-r border-primary/30 bg-background/90 backdrop-blur-lg" />
              <div className="absolute -bottom-6 left-[calc(50%+10px)] w-2.5 h-2.5 rounded-full border border-primary/30 bg-background/90 backdrop-blur-lg" />
              <div className="absolute -bottom-9 left-[calc(50%+18px)] w-1.5 h-1.5 rounded-full border border-primary/30 bg-background/90 backdrop-blur-lg" />

              <p className="text-xs font-bold text-primary tracking-wide uppercase mb-1">{toast.agentName}</p>
              <p className="text-sm text-foreground/80 leading-snug">{toast.message}</p>
            </button>
          ))}
        </div>
      )}
    </>
  );
};
