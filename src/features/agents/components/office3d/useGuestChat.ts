"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ─── */
type ChatMessage = {
  userId: string;
  agentId: string;
  message: string;
  ts: number;
};

type AgentResponse = {
  agentId: string;
  message: string;
  ts: number;
};

type UseGuestChatOptions = {
  token: string | null;
  userId: string;
  agentId: string | null;
  enabled?: boolean;
  /** Called when agent sends a response (message, agentId) */
  onAgentResponse?: (message: string, agentId: string) => void;
};

/**
 * Hook for guests to send chat messages to an agent via Ably.
 * Messages are sent to the owner, who forwards them to the gateway.
 * Agent responses come back via Ably.
 */
export const useGuestChat = ({
  token,
  userId,
  agentId,
  enabled = true,
  onAgentResponse,
}: UseGuestChatOptions) => {
  const mountedRef = useRef(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const ablyChannelRef = useRef<ReturnType<import("ably").Realtime["channels"]["get"]> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usingPollingRef = useRef(false);
  const lastResponseTsRef = useRef<number>(0);
  const lastSentMessageRef = useRef<string | null>(null);
  const lastSentMessageTsRef = useRef<number>(0);

  // Stable refs
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;
  const onAgentResponseRef = useRef(onAgentResponse);
  onAgentResponseRef.current = onAgentResponse;

  useEffect(() => {
    if (!token || !agentId || !enabled) {
      setIsConnected(false);
      return;
    }

    mountedRef.current = true;
    let ablyClient: import("ably").Realtime | null = null;
    let ablyChannel: ReturnType<import("ably").Realtime["channels"]["get"]> | null = null;

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
            console.log("[GuestChat] Ably is blocked, skipping Ably and using HTTP polling only");
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
        console.log("[GuestChat] Ably unavailable, using HTTP polling only");
        startPolling();
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
              console.error("[GuestChat] Ably account blocked - message limits exceeded. Guest chat disabled.");
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
        ablyChannelRef.current = channel;

        await channel.attach();
        if (!mountedRef.current) {
          client.close();
          return;
        }

        setIsConnected(true);

        // Subscribe to agent responses for the host-selected interactive agent
        if (agentIdRef.current) {
          await channel.subscribe(`agent-response:${agentIdRef.current}`, (message) => {
            if (!mountedRef.current) return;
            const data = message.data as AgentResponse | undefined;
            if (!data || typeof data !== "object" || data.agentId !== agentIdRef.current) return;
            // Agent responded, allow next message
            setIsWaitingForResponse(false);
            lastSentMessageRef.current = null;
            onAgentResponseRef.current?.(data.message, data.agentId);
          });
        }
      } catch (err) {
        const error = err as Error & { code?: number; statusCode?: number; message?: string };
        if (error.code === 40112 || (error.statusCode === 401 && error.message?.includes("blocked"))) {
          console.error("[GuestChat] Ably account blocked - switching to HTTP polling");
        } else {
          console.error("[GuestChat] Ably initialization failed, switching to HTTP polling:", err);
        }
        setIsConnected(false);
        // Fall back to HTTP polling
        startPolling();
      }
    };

    /* ── HTTP Polling Fallback ── */
    const startPolling = () => {
      if (usingPollingRef.current) return;
      usingPollingRef.current = true;
      console.log("[GuestChat] Using HTTP polling fallback");

      const pollForResponses = async () => {
        if (!mountedRef.current || !tokenRef.current || !agentIdRef.current) return;
        try {
          const res = await fetch(
            `/api/office/chat?token=${encodeURIComponent(tokenRef.current)}&agentId=${encodeURIComponent(agentIdRef.current)}&_=${Date.now()}`,
            { cache: "no-store" }
          );
          if (res.ok) {
            const data = (await res.json()) as { responses?: AgentResponse[] };
            console.log("[GuestChat] Polled for responses:", { 
              hasResponses: Array.isArray(data.responses) && data.responses.length > 0,
              responses: data.responses,
              lastResponseTs: lastResponseTsRef.current 
            });
            if (Array.isArray(data.responses) && data.responses.length > 0) {
              for (const response of data.responses) {
                if (response.ts > lastResponseTsRef.current && response.agentId === agentIdRef.current) {
                  console.log("[GuestChat] Received new agent response:", { 
                    agentId: response.agentId, 
                    message: response.message.substring(0, 50),
                    ts: response.ts 
                  });
                  lastResponseTsRef.current = response.ts;
                  // Agent responded, allow next message
                  setIsWaitingForResponse(false);
                  lastSentMessageRef.current = null;
                  onAgentResponseRef.current?.(response.message, response.agentId);
                } else {
                  console.log("[GuestChat] Ignored response (old or wrong agent):", { 
                    responseTs: response.ts, 
                    lastTs: lastResponseTsRef.current,
                    agentId: response.agentId,
                    expectedAgentId: agentIdRef.current
                  });
                }
              }
            }
            setIsConnected(true);
          } else {
            console.warn("[GuestChat] Polling response not OK:", res.status);
          }
        } catch (err) {
          console.error("[GuestChat] Polling failed:", err);
        }
      };

      void pollForResponses();
      pollTimerRef.current = setInterval(pollForResponses, 5000); // Poll every 5 seconds (reduced frequency)
    };

    void startAbly();

    return () => {
      mountedRef.current = false;
      setIsConnected(false);
      ablyChannelRef.current = null;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      usingPollingRef.current = false;
      if (ablyChannel) {
        void ablyChannel.detach();
      }
      if (ablyClient) {
        ablyClient.close();
      }
    };
  }, [token, agentId, enabled, onAgentResponse]);

  // Send a chat message to the agent (via Ably or HTTP fallback)
  const sendMessage = useCallback(
    async (message: string) => {
      if (!tokenRef.current || !agentIdRef.current) {
        console.error("[GuestChat] Cannot send message: missing token or agentId");
        return false;
      }

      // Prevent sending if waiting for response
      if (isWaitingForResponse) {
        console.log("[GuestChat] Waiting for agent response, please wait...");
        return false;
      }

      const trimmedMessage = message.trim();
      if (!trimmedMessage) {
        return false;
      }

      // Prevent duplicate sends (same message within 2 seconds)
      const now = Date.now();
      if (
        lastSentMessageRef.current === trimmedMessage &&
        now - lastSentMessageTsRef.current < 2000
      ) {
        console.log("[GuestChat] Duplicate message prevented");
        return false;
      }

      // Mark as waiting for response
      setIsWaitingForResponse(true);
      lastSentMessageRef.current = trimmedMessage;
      lastSentMessageTsRef.current = now;

      const payload: ChatMessage = {
        userId: userIdRef.current,
        agentId: agentIdRef.current,
        message: trimmedMessage,
        ts: now,
      };

      let sent = false;

      // Try Ably first if connected (with rate limiting)
      if (ablyChannelRef.current) {
        try {
          // Check rate limit before publishing
          const rateLimiter = await import("@/lib/ably/rateLimiter");
          const rateLimit = rateLimiter.checkRateLimit();
          if (rateLimit.allowed && !rateLimit.shouldThrottle) {
            await ablyChannelRef.current.publish("guest-chat", payload);
            rateLimiter.recordMessage(1);
            sent = true;
            console.log("[GuestChat] Message sent via Ably");
          } else if (rateLimit.shouldThrottle) {
            // When throttling, use HTTP for chat messages (they're less frequent)
            console.log("[GuestChat] Rate limit high, using HTTP for chat");
          } else {
            console.warn("[GuestChat] Rate limit exceeded, using HTTP");
          }
        } catch (err) {
          console.warn("[GuestChat] Ably publish failed, falling back to HTTP:", err);
        }
      }

      // Fallback to HTTP if Ably didn't work
      if (!sent) {
        try {
          const res = await fetch("/api/office/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: tokenRef.current,
              userId: userIdRef.current,
              agentId: agentIdRef.current,
              message: payload.message,
            }),
            cache: "no-store",
          });
          if (res.ok) {
            sent = true;
            console.log("[GuestChat] Message sent via HTTP polling");
          } else {
            console.error("[GuestChat] Failed to send message via HTTP");
            // If send failed, allow retry
            setIsWaitingForResponse(false);
            lastSentMessageRef.current = null;
          }
        } catch (err) {
          console.error("[GuestChat] Failed to send message:", err);
          // If send failed, allow retry
          setIsWaitingForResponse(false);
          lastSentMessageRef.current = null;
        }
      }

      return sent;
    },
    [isWaitingForResponse]
  );

  return {
    sendMessage,
    isConnected,
    isWaitingForResponse,
  };
};
