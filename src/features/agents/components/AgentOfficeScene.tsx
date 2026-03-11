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
import { ShareButton } from "./office3d/ShareButton";
import { GuestPlayer } from "./office3d/GuestPlayer";
import { usePositionSync } from "./office3d/usePositionSync";
import { VoiceChatWidget } from "./office3d/VoiceChatWidget";
import { useAgentSync } from "./office3d/useAgentSync";
import { useGuestChat } from "./office3d/useGuestChat";
import { checkRateLimit, recordMessage } from "@/lib/ably/rateLimiter";

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

type AgentOfficeSceneProps = {
  isGuest?: boolean;
  shareToken?: string | null;
  guestColor?: string;
  interactiveAgentId?: string | null; // For guests: the ONE agent they can interact with
};

const OWNER_SHARE_TOKEN_STORAGE_KEY = "oc-office-share-token";

export const AgentOfficeScene = ({ isGuest = false, shareToken = null, guestColor = "#6366f1", interactiveAgentId = null }: AgentOfficeSceneProps) => {
  const { state, hydrateAgents, setLoading, setError, dispatch } = useAgentStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  
  // For guests: Force selectedAgentId to always be the interactive agent
  useEffect(() => {
    if (isGuest && interactiveAgentId && selectedAgentId !== interactiveAgentId) {
      setSelectedAgentId(interactiveAgentId);
    }
  }, [isGuest, interactiveAgentId, selectedAgentId]);
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

  // Multiplayer: generate a stable userId for this session
  const userIdRef = useRef<string>("");
  if (!userIdRef.current) {
    userIdRef.current = `${isGuest ? "guest" : "owner"}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // Owner/guest active share token for multiplayer sync.
  // - Guests get it from URL param.
  // - Owners get it from generated link and persist in sessionStorage.
  const [ownerShareToken, setOwnerShareToken] = useState<string | null>(shareToken);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Guest always trusts URL token.
    if (isGuest) return;
    // Owner bootstraps from session storage if no token currently set.
    if (ownerShareToken) return;
    const stored = window.sessionStorage.getItem(OWNER_SHARE_TOKEN_STORAGE_KEY);
    if (stored) {
      setOwnerShareToken(stored);
    }
  }, [isGuest, ownerShareToken]);

  const handleOwnerTokenGenerated = useCallback((token: string) => {
    setOwnerShareToken(token);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(OWNER_SHARE_TOKEN_STORAGE_KEY, token);
    }
  }, []);

  const handleOwnerTokenRevoked = useCallback(() => {
    setOwnerShareToken(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(OWNER_SHARE_TOKEN_STORAGE_KEY);
    }
  }, []);

  // Position sync: Ably realtime primary, HTTP polling fallback
  // Owner uses neutral color for sync wire (not applied to 3D model), guest uses chosen color
  const { players: remotePlayers, connected: syncConnected, transport: syncTransport, sendPosition } = usePositionSync({
    token: ownerShareToken,
    userId: userIdRef.current,
    role: isGuest ? "guest" : "owner",
    color: isGuest ? guestColor : "#888888",
    enabled: !!ownerShareToken,
    publishIntervalMs: 1000, // 1Hz publish rate (1 message/second = 3,600/hour per user, reduced to stay under 250k/hour limit)
  });

  // Callback for RobotExpressivePlayer to report position changes
  // sendPosition just stores the latest position in a ref — the sync loop picks it up
  const handlePositionChange = useCallback(
    (position: [number, number, number], rotation: number, animation: string) => {
      sendPosition(position, rotation, animation);
    },
    [sendPosition]
  );
  
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
      clearPendingLivePatch: (agentId: string) => {
        // Clear any pending live patches for the agent
      },
      loadSummarySnapshot: async () => { /* not needed in office view */ },
      requestHistoryRefresh: async (command: { agentId: string; reason: "chat-final-no-trace" }) => {
        void loadAgentHistory(command.agentId);
      },
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

  // Guest chat hook - for guests to send messages via Ably (only for the host-selected agent)
  const guestChat = useGuestChat({
    token: isGuest ? ownerShareToken : null,
    userId: userIdRef.current,
    agentId: isGuest ? interactiveAgentId : null,
    enabled: isGuest && !!ownerShareToken && !!interactiveAgentId,
    onAgentResponse: isGuest
      ? (message, agentId) => {
          // Guest: update agent state with new response (only for the interactive agent)
          if (interactiveAgentId && agentId === interactiveAgentId) {
            const agent = state.agents.find((a) => a.agentId === interactiveAgentId);
            if (agent) {
              dispatch({
                type: "updateAgent",
                agentId: interactiveAgentId,
                patch: {
                  streamText: message,
                  lastResult: message,
                  outputLines: [...agent.outputLines, message],
                },
              });
            }
          }
        }
      : undefined,
  });

  // Handle sending messages to agents
  // - Owner: via gateway
  // - Guest: via Ably (useGuestChat) - ONLY for the host-selected interactive agent
  const handleSendMessage = async (agentId: string, message: string) => {
    if (isGuest) {
      // Guest: can only send to the host-selected interactive agent
      if (agentId !== interactiveAgentId) {
        console.error("Guest can only chat with the host-selected agent:", interactiveAgentId);
        return;
      }
      if (!interactiveAgentId) {
        console.error("No interactive agent selected by host");
        return;
      }
      await guestChat.sendMessage(message);
      return;
    }

    // Owner: send via gateway
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

  // Owner: Hydrate agents from gateway on connection
  // Guest: Will receive agents via Ably sync (see useAgentSync below)
  useEffect(() => {
    if (isGuest) return; // Guests get agents via Ably, not gateway
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
        console.log("[office] Owner loaded agents:", result.seeds.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load agents");
        console.error("[office] Owner failed to load agents:", err);
      } finally {
        setLoading(false);
      }
    };

    loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, client, isGuest]);

  // Owner: Forward agent responses to guests via Ably
  const ablyChannelRef = useRef<ReturnType<import("ably").Realtime["channels"]["get"]> | null>(null);
  const lastPublishedResponseRef = useRef<Map<string, string>>(new Map());
  const forwardedMessagesRef = useRef<Set<string>>(new Set()); // Track forwarded messages to prevent duplicates
  const gatewayClientRef = useRef(client);
  gatewayClientRef.current = client;
  useEffect(() => {
    if (isGuest || !ownerShareToken) return;

    // Set up Ably channel for forwarding agent responses
    const setupAbly = async () => {
      // Check if Ably is blocked before attempting connection
      try {
        const checkRes = await fetch(
          `/api/office/realtime-auth?token=${encodeURIComponent(ownerShareToken)}&userId=${encodeURIComponent(userIdRef.current)}`,
          { cache: "no-store" }
        );
        if (checkRes.status === 401) {
          const checkData = await checkRes.json().catch(() => ({}));
          if (checkData.code === 40112 || checkData.error?.includes("blocked") || checkRes.headers.get("x-ably-error-code") === "40112") {
            console.log("[office] Ably is blocked, skipping Ably and using HTTP polling only");
            return; // Skip Ably setup, HTTP polling will handle it
          }
        }
      } catch {
        // If check fails, try Ably anyway
      }

      try {
        const Ably = await import("ably");
        const channelName = `office:${ownerShareToken}`;
        const client = new Ably.Realtime({
          authUrl: `/api/office/realtime-auth?token=${encodeURIComponent(
            ownerShareToken
          )}&userId=${encodeURIComponent(userIdRef.current)}`,
          clientId: userIdRef.current,
          autoConnect: true,
        });

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Ably connect timeout")), 8000);
          client.connection.once("connected", () => {
            clearTimeout(timeout);
            resolve();
          });
          client.connection.once("failed", (err) => {
            clearTimeout(timeout);
            const error = err as { code?: number; statusCode?: number; message?: string };
            // Check for account blocked error (40112)
            if (error.code === 40112 || (error.statusCode === 401 && error.message?.includes("blocked"))) {
              console.error("[office] Ably account blocked - message limits exceeded. Agent response forwarding disabled.");
              reject(new Error("Ably account blocked - message limits exceeded"));
            } else {
              reject(new Error("Ably connection failed"));
            }
          });
        });

        const channel = client.channels.get(channelName);
        await channel.attach();
        ablyChannelRef.current = channel;

        // Monitor agent state changes and forward responses to guests
        // Only forward responses for the host-selected interactive agent
        const checkAgentResponses = () => {
          if (!interactiveAgentId) return;
          const agent = state.agents.find((a) => a.agentId === interactiveAgentId);
          if (!agent) return;
          
          // Get the latest message from streamText, lastResult, or last outputLine
          const lastMessage = agent.streamText || agent.lastResult || (agent.outputLines.length > 0 ? agent.outputLines[agent.outputLines.length - 1] : null);
          if (lastMessage) {
            // Only publish if message has changed (avoid duplicate publishes)
            const lastPublished = lastPublishedResponseRef.current.get(interactiveAgentId);
            if (lastPublished === lastMessage) return;
            
            console.log("[office] Forwarding agent response to guests:", { agentId: interactiveAgentId, message: lastMessage.substring(0, 50) });
            lastPublishedResponseRef.current.set(interactiveAgentId, lastMessage);
            
            // Forward via Ably if available (with rate limiting)
            if (ablyChannelRef.current) {
              // Check rate limit before publishing
              const rateLimit = checkRateLimit();
              if (rateLimit.allowed && !rateLimit.shouldThrottle) {
                void ablyChannelRef.current.publish(`agent-response:${interactiveAgentId}`, {
                  agentId: interactiveAgentId,
                  message: lastMessage,
                  ts: Date.now(),
                }).then(() => {
                  recordMessage(1);
                }).catch((err) => {
                  const error = err as Error & { code?: number; statusCode?: number };
                  // Check for quota exceeded or account blocked errors
                  if (error.code === 9103 || error.code === 9104 || error.code === 40112 || error.statusCode === 429 || error.statusCode === 401) {
                    console.warn("[office] Ably quota exceeded or account blocked when forwarding agent response");
                  }
                });
              } else if (rateLimit.shouldThrottle) {
                // Throttle: only publish every 5th message when approaching limit
                const shouldPublish = Math.random() < 0.2; // 20% chance
                if (shouldPublish) {
                  void ablyChannelRef.current.publish(`agent-response:${interactiveAgentId}`, {
                    agentId: interactiveAgentId,
                    message: lastMessage,
                    ts: Date.now(),
                  }).then(() => {
                    recordMessage(1);
                  }).catch(() => {});
                }
              }
            }
            
            // Also publish to HTTP endpoint (for polling fallback)
            if (ownerShareToken) {
              void fetch("/api/office/chat", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  token: ownerShareToken,
                  agentId: interactiveAgentId,
                  message: lastMessage,
                }),
                cache: "no-store",
              }).catch(() => {
                // Ignore HTTP failures
              });
            }
          }
        };
        
        // Poll for guest messages via HTTP (fallback when Ably is blocked)
        const pollGuestMessages = async () => {
          const gatewayClient = gatewayClientRef.current;
          if (!ownerShareToken || !gatewayClient || status !== "connected") return;
          try {
            const res = await fetch(
              `/api/office/chat?token=${encodeURIComponent(ownerShareToken)}&userId=${encodeURIComponent(userIdRef.current)}&_=${Date.now()}`,
              { cache: "no-store" }
            );
            if (res.ok) {
              const data = (await res.json()) as { messages?: Array<{ userId: string; agentId: string; message: string; ts: number }> };
              if (Array.isArray(data.messages) && data.messages.length > 0) {
                console.log("[office] Polled guest messages:", data.messages.length);
                for (const msg of data.messages) {
                  // Create unique key for this message (userId + agentId + message + ts)
                  const messageKey = `${msg.userId}:${msg.agentId}:${msg.message}:${msg.ts}`;
                  
                  // Skip if already forwarded
                  if (forwardedMessagesRef.current.has(messageKey)) {
                    console.log("[office] Skipping duplicate message:", messageKey);
                    continue;
                  }
                  
                  // Forward to gateway
                  const agent = state.agents.find((a) => a.agentId === msg.agentId);
                  if (agent) {
                    try {
                      console.log("[office] Forwarding guest message to agent:", { agentId: msg.agentId, userId: msg.userId, message: msg.message.substring(0, 50) });
                      await sendChatMessageViaStudio({
                        client: gatewayClient!,
                        dispatch,
                        getAgent: (id) => state.agents.find((a) => a.agentId === id) ?? null,
                        agentId: msg.agentId,
                        sessionKey: agent.sessionKey,
                        message: msg.message,
                      });
                      // Mark as forwarded
                      forwardedMessagesRef.current.add(messageKey);
                      console.log("[office] Successfully forwarded guest chat from HTTP polling:", { agentId: msg.agentId, userId: msg.userId });
                      
                      // Clean up old entries (keep last 100)
                      if (forwardedMessagesRef.current.size > 100) {
                        const entries = Array.from(forwardedMessagesRef.current);
                        forwardedMessagesRef.current = new Set(entries.slice(-50));
                      }
                    } catch (err) {
                      console.error("[office] Failed to forward guest chat from HTTP:", err);
                    }
                  } else {
                    console.warn("[office] Agent not found for guest message:", msg.agentId);
                  }
                }
              }
            } else {
              console.warn("[office] Failed to poll guest messages:", res.status);
            }
          } catch (err) {
            console.error("[office] Error polling guest messages:", err);
          }
        };
        
        // Poll for guest messages every 5 seconds (reduced frequency to stay under rate limit)
        const pollInterval = setInterval(pollGuestMessages, 5000);
        void pollGuestMessages(); // Initial poll

        // Check every 1 second for new agent responses (more frequent to catch responses quickly)
        // At 1s interval: max 3,600 messages/hour per office
        const interval = setInterval(checkAgentResponses, 1000);
        
        // Run check immediately
        checkAgentResponses();

        return () => {
          clearInterval(interval);
          clearInterval(pollInterval);
          void channel.detach();
          client.close();
        };
      } catch (err) {
        const error = err as Error & { code?: number; statusCode?: number; message?: string };
        if (error.code === 40112 || (error.statusCode === 401 && error.message?.includes("blocked"))) {
          console.error("[office] Ably account blocked - message limits exceeded. Agent response forwarding disabled.");
        } else {
          console.error("[office] Failed to setup Ably for agent responses:", err);
        }
      }
    };

    const cleanup = setupAbly();
    return () => {
      void cleanup.then((cb) => cb?.());
    };
  }, [isGuest, ownerShareToken, interactiveAgentId, userIdRef]);

  // Watch for agent state changes and forward responses immediately (reactive)
  useEffect(() => {
    if (isGuest || !ownerShareToken || !interactiveAgentId) return;
    
    const agent = state.agents.find((a) => a.agentId === interactiveAgentId);
    if (!agent) return;
    
    // Get the latest message
    const lastMessage = agent.streamText || agent.lastResult || (agent.outputLines.length > 0 ? agent.outputLines[agent.outputLines.length - 1] : null);
    if (!lastMessage) return;
    
    // Check if this is a new message
    const lastPublished = lastPublishedResponseRef.current.get(interactiveAgentId);
    if (lastPublished === lastMessage) return;
    
    // Forward immediately via Ably and HTTP
    console.log("[office] Agent state changed, forwarding response:", { agentId: interactiveAgentId, message: lastMessage.substring(0, 50) });
    
    lastPublishedResponseRef.current.set(interactiveAgentId, lastMessage);
    
    // Forward via Ably
    if (ablyChannelRef.current) {
      const rateLimit = checkRateLimit();
      if (rateLimit.allowed && !rateLimit.shouldThrottle) {
        void ablyChannelRef.current.publish(`agent-response:${interactiveAgentId}`, {
          agentId: interactiveAgentId,
          message: lastMessage,
          ts: Date.now(),
        }).then(() => {
          recordMessage(1);
        }).catch((err) => {
          console.error("[office] Failed to publish agent response via Ably:", err);
        });
      }
    }
    
    // Also publish to HTTP endpoint (for polling fallback)
    void fetch("/api/office/chat", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: ownerShareToken,
        agentId: interactiveAgentId,
        message: lastMessage,
      }),
      cache: "no-store",
    }).catch((err) => {
      console.error("[office] Failed to publish agent response via HTTP:", err);
    });
  }, [
    isGuest,
    ownerShareToken,
    interactiveAgentId,
    state.agents.find(a => a.agentId === interactiveAgentId)?.streamText,
    state.agents.find(a => a.agentId === interactiveAgentId)?.lastResult,
    state.agents.find(a => a.agentId === interactiveAgentId)?.outputLines?.length,
  ]);

  // Sync agent state via Ably: owner publishes, guests receive
  // For guests: filter to only the interactive agent
  // NOTE: Owners should always see all agents from gateway, Ably sync is just for sharing with guests
  // IMPORTANT: Owner needs share token to publish, guest needs share token from URL to receive
  useAgentSync({
    token: isGuest ? shareToken : ownerShareToken, // Guest uses URL token, owner uses stored token
    userId: userIdRef.current,
    role: isGuest ? "guest" : "owner",
    enabled: isGuest ? !!shareToken : !!ownerShareToken, // Enable based on token availability
    agentState: isGuest ? [] : state.agents, // Owner publishes, guest receives
    interactiveAgentId: isGuest ? interactiveAgentId : null, // Filter for guests
    onAgentsReceived: isGuest
      ? (agents) => {
          // Guest: receive all agents from owner (filtering happens in UI)
          console.log("[office] Guest received agents via Ably:", agents.length);
          hydrateAgents(agents);
        }
      : undefined,
    onGuestChat: !isGuest && client && status === "connected"
      ? async (agentId, message, userId) => {
          // Create unique key for this message (userId + agentId + message hash)
          // Use message content hash to prevent duplicates even if received multiple times
          const messageHash = message.slice(0, 50); // Use first 50 chars as hash
          const messageKey = `${userId}:${agentId}:${messageHash}`;
          
          // Skip if already forwarded (check last 50 entries)
          if (forwardedMessagesRef.current.has(messageKey)) {
            console.log("[office] Duplicate guest chat message ignored:", { agentId, userId });
            return;
          }
          
          // Owner: forward guest chat to gateway
          const agent = state.agents.find((a) => a.agentId === agentId);
          if (!agent) {
            console.error("[office] Agent not found for guest chat:", agentId);
            return;
          }
          try {
            await sendChatMessageViaStudio({
              client: client!,
              dispatch,
              getAgent: (id) => state.agents.find((a) => a.agentId === id) ?? null,
              agentId,
              sessionKey: agent.sessionKey,
              message,
            });
            // Mark as forwarded
            forwardedMessagesRef.current.add(messageKey);
            console.log("[office] Forwarded guest chat to gateway:", { agentId, userId, message });
            
            // Clean up old entries (keep last 100)
            if (forwardedMessagesRef.current.size > 100) {
              const entries = Array.from(forwardedMessagesRef.current);
              forwardedMessagesRef.current = new Set(entries.slice(-50));
            }
          } catch (err) {
            console.error("[office] Failed to forward guest chat:", err);
          }
        }
      : undefined,
  });

  // Track previous outputLines count to detect new messages
  const prevLineCountsRef = useRef<Map<string, number>>(new Map());
  const [newMessageAgents, setNewMessageAgents] = useState<Set<string>>(new Set());
  const [toastQueue, setToastQueue] = useState<{ id: string; agentName: string; message: string; ts: number }[]>([]);

  // Map agents to 3D box data
  useEffect(() => {
    const colors = ["#FF6B9D", "#C96DD8", "#79A3FF", "#FFB347", "#77DD77"];
    const newMsgSet = new Set<string>();
    const newToasts: { id: string; agentName: string; message: string; ts: number }[] = [];

    // Guests can see all agents (like host), but can only interact with interactive agent
    // This ensures guests see the same agent count as the host
    const agentsToShow = state.agents;

    const boxes: AgentBoxData[] = agentsToShow.map((agent, index) => {
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
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* Top row: 3 buttons */}
        <div className="flex items-center gap-2">
          <Link
            href="/studio"
            className="flex items-center gap-2 rounded-md border border-input/90 bg-background/75 backdrop-blur-sm px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-ring hover:bg-card shadow-lg"
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
          {!isGuest && (
            <>
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
            </>
          )}
          {isGuest && (
            <>
              <div className="flex items-center gap-2 rounded-md border border-primary/50 bg-white dark:bg-white/95 backdrop-blur-sm px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary shadow-lg">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: guestColor }} />
                Guest Mode
              </div>
              <div className="w-0 h-0" /> {/* Spacer */}
              <div className="w-0 h-0" /> {/* Spacer */}
            </>
          )}
        </div>

        {/* Bottom row: 3 buttons */}
        <div className="flex items-center gap-2">
          {!isGuest && (
            <>
                  <ShareButton
                    ownerId={userIdRef.current}
                    agents={state.agents}
                    onTokenGenerated={handleOwnerTokenGenerated}
                    onTokenRevoked={handleOwnerTokenRevoked}
                  />
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
              <VoiceChatWidget
                shareToken={ownerShareToken}
                userId={userIdRef.current}
                enabled={!!ownerShareToken}
              />
            </>
          )}
          {isGuest && (
            <>
              <div className="w-0 h-0" /> {/* Spacer */}
              <div className="w-0 h-0" /> {/* Spacer */}
              <VoiceChatWidget
                shareToken={shareToken}
                userId={userIdRef.current}
                enabled={!!shareToken}
              />
            </>
          )}
        </div>
      </div>

      {/* Title overlay */}
      <div className="absolute top-4 right-4 z-10 glass-panel px-4 py-2">
        <h1 className="console-title text-2xl text-foreground">
          {isGuest ? "Guest View" : "Agent Office"}
        </h1>
        {ownerShareToken && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {syncConnected ? `${remotePlayers.length + 1} in office` : "Syncing..."}
          </p>
        )}
      </div>

      {/* Sync status indicator (bottom-left) */}
      {ownerShareToken && (
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-md border border-input/50 bg-background/75 backdrop-blur-sm px-3 py-1.5 text-xs font-mono text-muted-foreground shadow">
          <span className={`h-2 w-2 rounded-full ${syncConnected ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
          {syncTransport === "ably" ? "Realtime" : syncTransport === "polling" ? "Polling" : "Connecting..."}
          {syncConnected && ` · ${remotePlayers.length + 1} in office`}
        </div>
      )}

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
        {isGuest ? (
          // Guest: Show status based on agent sync (Ably), not gateway
          state.agents.length > 0 ? (
            <div className="flex items-center gap-2 rounded-md border-2 border-primary/60 bg-white px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-primary shadow-lg">
              <span className="h-3 w-3 rounded-full bg-primary animate-pulse" />
              Viewing • {state.agents.length} agent{state.agents.length !== 1 ? "s" : ""} (View Only)
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border-2 border-yellow-400 bg-white px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-yellow-700 shadow-lg">
              <span className="h-3 w-3 rounded-full bg-yellow-400 animate-pulse" />
              Waiting for agents...
            </div>
          )
        ) : (
          // Owner: Show gateway connection status
          status === "connected" ? (
            <div className="flex items-center gap-2 rounded-md border-2 border-primary/60 bg-white px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-primary shadow-lg">
              <span className="h-3 w-3 rounded-full bg-primary animate-pulse" />
              Connected • {state.agents.length} agent{state.agents.length !== 1 ? "s" : ""}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-gray-700 shadow-lg">
              <Cable className="h-4 w-4" />
              {status === "connecting" ? "Connecting..." : "Disconnected - Agents will appear when connected"}
            </div>
          )
        )}
      </div>

      {/* 3D Canvas */}
      <Canvas
        camera={{
          position: [20, 20, 20],
          fov: 50,
        }}
        shadows
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'block',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0
        }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
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
            onSelectAgent={(agentId: string) => {
              // Guests can only select the host-selected interactive agent
              if (isGuest && agentId !== interactiveAgentId) {
                console.log("Guest can only interact with host-selected agent:", interactiveAgentId);
                return;
              }
              setSelectedAgentId(agentId);
            }}
            onOpenChat={(agentId: string) => {
              // Guests can only open chat for the host-selected interactive agent
              if (isGuest && agentId !== interactiveAgentId) {
                console.log("Guest can only chat with host-selected agent:", interactiveAgentId);
                return;
              }
              setSelectedAgentId(agentId);
              setChatModalOpen(true);
              // Load/refresh chat history when opening modal (owner only)
              if (!isGuest) {
                void loadAgentHistory(agentId);
              }
            }}
            onViewDetails={isGuest ? () => {
              // Guests cannot view details - only the interactive agent is accessible
              console.log("Guests can only interact with the host-selected agent");
            } : (agentId: string) => {
              setSelectedAgentId(agentId);
              setDetailsModalOpen(true);
            }}
          />

          {/* RobotExpressive player character */}
          {/* Owner: no color tint (default model colors), Guest: their chosen color */}
          <RobotExpressivePlayer
            position={[0, 0, 2]}
            color={isGuest ? guestColor : undefined}
            onPositionChange={handlePositionChange}
          />

          {/* Remote players (guests or owner, depending on perspective) */}
          {remotePlayers.map((player) => (
            <GuestPlayer key={player.userId} player={player} />
          ))}

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

      {/* Thought Bubble Overlay (owner only) */}
      {!isGuest && selectedAgent && selectedAgent.lastMessage && !chatModalOpen && (
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
          isWaitingForResponse={isGuest ? guestChat.isWaitingForResponse : false}
        />
      )}

      {/* Agent Details Modal (owner only) */}
      {!isGuest && detailsModalOpen && selectedAgent && (
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

      {/* File Manager Modal (owner only) */}
      {!isGuest && fileManagerOpen && (
        <FileManagerModal onClose={() => setFileManagerOpen(false)} />
      )}

      {/* Swarm Dispatch Modal (owner only) */}
      {!isGuest && swarmModalOpen && (
        <SwarmDispatchModal
          agents={state.agents}
          onDispatch={handleSwarmDispatch}
          onClose={() => setSwarmModalOpen(false)}
          disabled={status !== "connected"}
        />
      )}

      {/* Chatroom Modal (owner only) */}
      {!isGuest && chatroomOpen && (
        <ChatroomModal
          onClose={() => setChatroomOpen(false)}
          onSendMessage={handleSendMessage}
        />
      )}

      {/* Kanban Board Modal (owner only) */}
      {!isGuest && kanbanOpen && (
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
