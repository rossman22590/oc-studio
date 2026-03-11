"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AgentStoreSeed, AgentState } from "@/features/agents/state/store";
import { checkRateLimit, recordMessage } from "@/lib/ably/rateLimiter";

/* ─── Types ─── */
type AgentSyncPayload = {
  agents: Array<{
    // AgentStoreSeed fields
    agentId: string;
    name: string;
    sessionKey: string;
    avatarSeed?: string | null;
    avatarUrl?: string | null;
    model?: string | null;
    thinkingLevel?: string | null;
    sessionExecHost?: "sandbox" | "gateway" | "node";
    sessionExecSecurity?: "deny" | "allowlist" | "full";
    sessionExecAsk?: "off" | "on-miss" | "always";
    toolCallingEnabled?: boolean;
    showThinkingTraces?: boolean;
    // Additional runtime fields for display
    status: "running" | "idle" | "stopped" | "error";
    outputLines: string[];
    lastResult?: string | null;
    streamText?: string | null;
  }>;
  ts: number;
};

type GuestChatMessage = {
  userId: string;
  agentId: string;
  message: string;
  ts: number;
};

type UseAgentSyncOptions = {
  token: string | null;
  userId: string;
  role: "owner" | "guest";
  enabled?: boolean;
  /** Owner's agent state to publish */
  agentState?: AgentState[];
  /** For guests: only sync this agent ID */
  interactiveAgentId?: string | null;
  /** Called when guests receive agent updates */
  onAgentsReceived?: (agents: AgentStoreSeed[]) => void;
  /** Owner: called when guest sends a chat message (forward to gateway) */
  onGuestChat?: (agentId: string, message: string, userId: string) => void | Promise<void>;
};

/**
 * Syncs agent state via Ably so guests can see agents without gateway access.
 * - Owner: Publishes agent state when it changes
 * - Guest: Subscribes to agent state updates
 */
export const useAgentSync = ({
  token,
  userId,
  role,
  enabled = true,
  agentState = [],
  interactiveAgentId = null,
  onAgentsReceived,
  onGuestChat,
}: UseAgentSyncOptions) => {
  const mountedRef = useRef(true);
  const publishTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPublishedRef = useRef<string>("");
  const hasPublishedRef = useRef<boolean>(false);
  // Polling fallback timers
  const pollPublishTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollGetTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usingPollingRef = useRef<boolean>(false);
  const pollGetInFlightRef = useRef<boolean>(false);

  // Stable refs
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const roleRef = useRef(role);
  roleRef.current = role;
  const agentStateRef = useRef(agentState);
  agentStateRef.current = agentState;
  const onGuestChatRef = useRef(onGuestChat);
  onGuestChatRef.current = onGuestChat;

  useEffect(() => {
    if (!token || !enabled) {
      if (publishTimerRef.current) {
        clearInterval(publishTimerRef.current);
        publishTimerRef.current = null;
      }
      return;
    }

    mountedRef.current = true;
    let ablyClient: import("ably").Realtime | null = null;
    let ablyChannel: ReturnType<import("ably").Realtime["channels"]["get"]> | null = null;

    /* ── Polling (always active for guests, fallback for owner) ── */
    const startPolling = (isFallback = false) => {
      if (usingPollingRef.current) return; // Already running
      usingPollingRef.current = true;
      if (isFallback) {
        console.log("[AgentSync] Using polling fallback");
      } else {
        console.log("[AgentSync] Starting polling (guests always use polling, owner uses as backup)");
      }

      // Owner: POST agent state to API
      if (roleRef.current === "owner") {
        const doPublish = async () => {
          if (!mountedRef.current || pollGetInFlightRef.current) return;
          const agents = agentStateRef.current;
          if (agents.length === 0) return;

          pollGetInFlightRef.current = true;
          try {
            const res = await fetch("/api/office/agents", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: tokenRef.current,
                agents: agents.map((a) => ({
                  agentId: a.agentId,
                  name: a.name,
                  sessionKey: a.sessionKey,
                  avatarSeed: a.avatarSeed,
                  avatarUrl: a.avatarUrl,
                  model: a.model,
                  thinkingLevel: a.thinkingLevel,
                  sessionExecHost: a.sessionExecHost,
                  sessionExecSecurity: a.sessionExecSecurity,
                  sessionExecAsk: a.sessionExecAsk,
                  toolCallingEnabled: a.toolCallingEnabled,
                  showThinkingTraces: a.showThinkingTraces,
                  status: a.status === "error" ? "stopped" : a.status,
                  outputLines: a.outputLines,
                  lastResult: a.lastResult,
                  streamText: a.streamText,
                })),
              }),
              cache: "no-store",
            });
            if (res.ok) {
              console.log("[AgentSync] Published agents via polling:", agents.length);
            }
          } catch (err) {
            console.error("[AgentSync] Polling publish failed:", err);
          } finally {
            pollGetInFlightRef.current = false;
          }
        };

        void doPublish();
        pollPublishTimerRef.current = setInterval(doPublish, 10000); // Every 10 seconds (reduced frequency)
      }

      // Guest: GET agent state from API
      if (roleRef.current === "guest" && onAgentsReceived) {
        const doGet = async () => {
          if (!mountedRef.current || pollGetInFlightRef.current) return;
          pollGetInFlightRef.current = true;
          try {
            const res = await fetch(
              `/api/office/agents?token=${encodeURIComponent(tokenRef.current!)}&_=${Date.now()}`,
              { cache: "no-store" }
            );
            if (res.ok) {
              const data = (await res.json()) as { agents?: Array<{
                agentId: string;
                name: string;
                sessionKey: string;
                avatarSeed?: string | null;
                avatarUrl?: string | null;
                model?: string | null;
                thinkingLevel?: string | null;
                sessionExecHost?: "sandbox" | "gateway" | "node";
                sessionExecSecurity?: "deny" | "allowlist" | "full";
                sessionExecAsk?: "off" | "on-miss" | "always";
                toolCallingEnabled?: boolean;
                showThinkingTraces?: boolean;
                status: "running" | "idle" | "stopped" | "error";
                outputLines: string[];
                lastResult?: string | null;
                streamText?: string | null;
              }> };
              if (Array.isArray(data.agents) && mountedRef.current) {
                console.log("[AgentSync] Guest received agents via polling:", data.agents.length);
                // Convert to AgentStoreSeed format
                const receivedAgents: AgentStoreSeed[] = data.agents.map((a) => ({
                  agentId: a.agentId,
                  name: a.name,
                  sessionKey: a.sessionKey,
                  avatarSeed: a.avatarSeed,
                  avatarUrl: a.avatarUrl,
                  model: a.model,
                  thinkingLevel: a.thinkingLevel,
                  sessionExecHost: a.sessionExecHost,
                  sessionExecSecurity: a.sessionExecSecurity,
                  sessionExecAsk: a.sessionExecAsk,
                  toolCallingEnabled: a.toolCallingEnabled,
                  showThinkingTraces: a.showThinkingTraces,
                }));
                onAgentsReceived(receivedAgents);
              }
            }
          } catch (err) {
            console.error("[AgentSync] Polling get failed:", err);
          } finally {
            pollGetInFlightRef.current = false;
          }
        };

        void doGet();
        pollGetTimerRef.current = setInterval(doGet, 10000); // Every 10 seconds (reduced frequency)
      }
    };

    // For guests: Always start polling immediately (works even when Ably is blocked)
    // For owner: Start polling as backup (publishes to HTTP endpoint)
    if (roleRef.current === "guest" && onAgentsReceived) {
      // Guests always poll - this ensures they see agents even if Ably never connects
      startPolling(false);
    } else if (roleRef.current === "owner") {
      // Owner starts polling backup immediately (publishes to HTTP)
      startPolling(false);
    }

    // Check if Ably is blocked before attempting connection
    const checkAblyAvailable = async (): Promise<boolean> => {
      try {
        const res = await fetch(
          `/api/office/realtime-auth?token=${encodeURIComponent(tokenRef.current ?? "")}&userId=${encodeURIComponent(userIdRef.current)}`,
          { cache: "no-store" }
        );
        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          if (data.error?.includes("blocked") || res.headers.get("x-ably-error-code") === "40112") {
            console.log("[AgentSync] Ably is blocked, skipping Ably and using HTTP polling only");
            return false;
          }
        }
        return res.ok;
      } catch {
        return true; // If check fails, try Ably anyway
      }
    };

    const startAbly = async () => {
      // Skip Ably if it's blocked
      const ablyAvailable = await checkAblyAvailable();
      if (!ablyAvailable) {
        console.log("[AgentSync] Ably unavailable, using HTTP polling only");
        return;
      }
      try {
        const Ably = await import("ably");
        const channelName = `office:${tokenRef.current}`;

        const client = new Ably.Realtime({
          authUrl: `/api/office/realtime-auth?token=${encodeURIComponent(
            tokenRef.current ?? ""
          )}&userId=${encodeURIComponent(userIdRef.current)}`,
          clientId: userIdRef.current,
          autoConnect: true,
        });

        ablyClient = client;

        // Wait for connection
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
              console.error("[AgentSync] Ably account blocked - message limits exceeded. Ably sync disabled.");
              reject(new Error("Ably account blocked - message limits exceeded"));
            } else {
              reject(new Error("Ably connection failed"));
            }
          });
        });

        if (!mountedRef.current) {
          client.close();
          return;
        }

        const channel = client.channels.get(channelName);
        ablyChannel = channel as unknown as typeof ablyChannel;

        await channel.attach();
        if (!mountedRef.current) {
          client.close();
          return;
        }

        // Owner: Publish agent state periodically
        if (roleRef.current === "owner") {
          const publishAgents = async () => {
            if (!mountedRef.current || !ablyChannel) return;
            const agents = agentStateRef.current;
            console.log("[AgentSync] Owner publishing agents:", agents.length);
            if (agents.length === 0) {
              console.warn("[AgentSync] Owner has no agents to publish");
              return;
            }

            // Create a hash of agent state to avoid redundant publishes
            const agentHash = JSON.stringify(
              agents.map((a) => ({
                id: a.agentId,
                name: a.name,
                status: a.status,
                lineCount: a.outputLines.length,
                lastResult: a.lastResult,
                streamText: a.streamText,
              }))
            );

            // Always publish on first connection, or when state changes
            // This ensures guests see agents immediately when they connect
            if (hasPublishedRef.current && agentHash === lastPublishedRef.current) return;
            lastPublishedRef.current = agentHash;
            hasPublishedRef.current = true;

            try {
              // Check rate limit before publishing
              const rateLimit = checkRateLimit();
              if (!rateLimit.allowed) {
                console.warn("[AgentSync] Rate limit exceeded, skipping Ably publish (using HTTP only)");
                return;
              }
              
              const payload: AgentSyncPayload = {
                agents: agents.map((a) => ({
                  // AgentStoreSeed fields
                  agentId: a.agentId,
                  name: a.name,
                  sessionKey: a.sessionKey,
                  avatarSeed: a.avatarSeed,
                  avatarUrl: a.avatarUrl,
                  model: a.model,
                  thinkingLevel: a.thinkingLevel,
                  sessionExecHost: a.sessionExecHost,
                  sessionExecSecurity: a.sessionExecSecurity,
                  sessionExecAsk: a.sessionExecAsk,
                  toolCallingEnabled: a.toolCallingEnabled,
                  showThinkingTraces: a.showThinkingTraces,
                  // Runtime fields for display
                  status: a.status === "error" ? "stopped" : a.status,
                  outputLines: a.outputLines,
                  lastResult: a.lastResult,
                  streamText: a.streamText,
                })),
                ts: Date.now(),
              };
              await ablyChannel.publish("agents", payload);
              recordMessage(1); // Record 1 message
              console.log("[AgentSync] Successfully published", agents.length, "agents");
              // Also publish to HTTP endpoint as backup
              try {
                await fetch("/api/office/agents", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    token: tokenRef.current,
                    agents: payload.agents,
                  }),
                  cache: "no-store",
                });
              } catch {
                // Ignore HTTP backup failures
              }
            } catch (err) {
              const error = err as Error & { code?: number; statusCode?: number };
              // Check for quota exceeded or account blocked errors
              if (error.code === 9103 || error.code === 9104 || error.code === 40112 || error.statusCode === 429 || error.statusCode === 401) {
                console.error("[AgentSync] Ably quota exceeded or account blocked - switching to polling:", err);
                startPolling();
              } else {
                console.error("[AgentSync] Failed to publish agents:", err);
              }
            }
          };

          // Publish immediately, then every 10 seconds (reduced to stay under 250k/hour limit)
          // At 10s interval: 360 messages/hour per office
          void publishAgents();
          publishTimerRef.current = setInterval(publishAgents, 10000);
          
          // Note: HTTP backup publishing is already handled by startPolling() which runs immediately for owner
          // The HTTP publish in the Ably publish function above is an additional backup

          // Owner: Subscribe to guest chat messages and forward to gateway
          if (onGuestChatRef.current) {
            await channel.subscribe("guest-chat", async (message) => {
              if (!mountedRef.current) return;
              const data = message.data as GuestChatMessage | undefined;
              if (!data || typeof data !== "object" || !data.agentId || !data.message) return;
              console.log("[AgentSync] Owner received guest chat:", data);
              // Note: Receiving messages doesn't count toward publish limit, only publishing does
              await onGuestChatRef.current?.(data.agentId, data.message, data.userId);
            });
          }
        }

        // Guest: Subscribe to agent updates
        if (roleRef.current === "guest" && onAgentsReceived) {
          console.log("[AgentSync] Guest subscribing to agents channel");
          await channel.subscribe("agents", (message) => {
            if (!mountedRef.current) return;
            console.log("[AgentSync] Guest received agents message:", message);
            const data = message.data as AgentSyncPayload | undefined;
            if (!data || typeof data !== "object" || !Array.isArray(data.agents)) {
              console.warn("[AgentSync] Guest received invalid agents data:", data);
              return;
            }
            console.log("[AgentSync] Guest processing", data.agents.length, "agents");

            // Convert to AgentStoreSeed format (what hydrateAgents expects)
            const receivedAgents: AgentStoreSeed[] = data.agents.map((a) => ({
              agentId: a.agentId,
              name: a.name,
              sessionKey: a.sessionKey,
              avatarSeed: a.avatarSeed,
              avatarUrl: a.avatarUrl,
              model: a.model,
              thinkingLevel: a.thinkingLevel,
              sessionExecHost: a.sessionExecHost,
              sessionExecSecurity: a.sessionExecSecurity,
              sessionExecAsk: a.sessionExecAsk,
              toolCallingEnabled: a.toolCallingEnabled,
              showThinkingTraces: a.showThinkingTraces,
            }));

            onAgentsReceived(receivedAgents);
          });
        }
      } catch (err) {
        const error = err as Error & { code?: number; statusCode?: number; message?: string };
        if (error.code === 40112 || (error.statusCode === 401 && error.message?.includes("blocked"))) {
          console.error("[AgentSync] Ably account blocked - message limits exceeded. Switching to polling fallback.");
          startPolling();
        } else {
          console.error("[AgentSync] Ably initialization failed, switching to polling:", err);
          startPolling();
        }
      }
    };

    void startAbly();

    return () => {
      mountedRef.current = false;
      if (publishTimerRef.current) {
        clearInterval(publishTimerRef.current);
        publishTimerRef.current = null;
      }
      if (pollPublishTimerRef.current) {
        clearInterval(pollPublishTimerRef.current);
        pollPublishTimerRef.current = null;
      }
      if (pollGetTimerRef.current) {
        clearInterval(pollGetTimerRef.current);
        pollGetTimerRef.current = null;
      }
      // Reset publish flag on cleanup so next connection publishes immediately
      hasPublishedRef.current = false;
      lastPublishedRef.current = "";
      usingPollingRef.current = false;

      if (ablyChannel) {
        void ablyChannel.detach();
      }
      if (ablyClient) {
        ablyClient.close();
      }
    };
  }, [token, enabled, role, onAgentsReceived]);

  return {};
};
