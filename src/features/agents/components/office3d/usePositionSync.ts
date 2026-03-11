"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ─── */
export type PlayerData = {
  userId: string;
  role: "owner" | "guest";
  position: [number, number, number];
  rotation: number;
  color: string;
  animation: string;
  lastUpdate: number;
};

type UsePositionSyncOptions = {
  token: string | null;
  userId: string;
  role: "owner" | "guest";
  color: string;
  enabled?: boolean;
  /** How often to publish position updates (ms). Default 50ms = 20Hz. */
  publishIntervalMs?: number;
};

type UsePositionSyncReturn = {
  players: PlayerData[];
  connected: boolean;
  transport: "ably" | "polling" | "none";
  sendPosition: (
    position: [number, number, number],
    rotation: number,
    animation?: string
  ) => void;
};

type WirePayload = {
  userId: string;
  role: "owner" | "guest";
  position: [number, number, number];
  rotation: number;
  color: string;
  animation: string;
  ts: number;
};

const STALE_MS = 15_000; // Remove players not heard from in 15s

/* ─────────────────────────────────────────────────────────────────────────────
 * usePositionSync
 *
 * Primary transport: Ably Realtime pub/sub (instant, <50ms latency)
 * Fallback transport: HTTP polling POST/GET (if Ably auth fails)
 *
 * Both paths use the same PlayerData shape and the same external API.
 * ───────────────────────────────────────────────────────────────────────────── */
export const usePositionSync = ({
  token,
  userId,
  role,
  color,
  enabled = true,
  publishIntervalMs = 50,
}: UsePositionSyncOptions): UsePositionSyncReturn => {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [connected, setConnected] = useState(false);
  const [transport, setTransport] = useState<"ably" | "polling" | "none">("none");

  const mountedRef = useRef(true);
  const remoteMapRef = useRef<Map<string, PlayerData>>(new Map());

  // Latest local position — written by sendPosition, read by publish loop
  const posRef = useRef<[number, number, number]>([0, 0, 0]);
  const rotRef = useRef(0);
  const animRef = useRef("Idle");
  const hasPosRef = useRef(false);

  // Stable refs for values that change but shouldn't restart effects
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const roleRef = useRef(role);
  roleRef.current = role;
  const colorRef = useRef(color);
  colorRef.current = color;

  /* ── sendPosition: just stores latest pose, zero overhead ── */
  const sendPosition = useCallback(
    (position: [number, number, number], rotation: number, animation = "Idle") => {
      posRef.current = position;
      rotRef.current = rotation;
      animRef.current = animation;
      hasPosRef.current = true;
    },
    []
  );

  /* ── Helpers ── */
  const flushPlayers = useCallback(() => {
    setPlayers(Array.from(remoteMapRef.current.values()));
  }, []);

  const upsertRemote = useCallback(
    (p: PlayerData) => {
      if (p.userId === userIdRef.current) return;
      remoteMapRef.current.set(p.userId, p);
      flushPlayers();
    },
    [flushPlayers]
  );

  const removeRemote = useCallback(
    (id: string) => {
      if (remoteMapRef.current.delete(id)) flushPlayers();
    },
    [flushPlayers]
  );

  const cleanStale = useCallback(() => {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of remoteMapRef.current) {
      if (now - p.lastUpdate > STALE_MS) {
        remoteMapRef.current.delete(id);
        changed = true;
      }
    }
    if (changed) flushPlayers();
  }, [flushPlayers]);

  /* ── Build wire payload from current refs ── */
  const buildPayload = useCallback((): WirePayload => ({
    userId: userIdRef.current,
    role: roleRef.current,
    position: posRef.current,
    rotation: rotRef.current,
    color: colorRef.current,
    animation: animRef.current,
    ts: Date.now(),
  }), []);

  /* ══════════════════════════════════════════════════════════════════════════
   * Main effect: connect Ably, fall back to polling if it fails
   * ══════════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!token || !enabled) {
      setPlayers([]);
      setConnected(false);
      setTransport("none");
      remoteMapRef.current.clear();
      return;
    }

    mountedRef.current = true;
    let ablyClient: { close: () => void } | null = null;
    let ablyChannel: {
      publish: (event: string, data: unknown) => Promise<void>;
      subscribe: (event: string, cb: (msg: { data: unknown }) => void) => Promise<void>;
      presence: {
        enter: (data?: unknown) => Promise<void>;
        leave: () => Promise<void>;
        subscribe: (event: string, cb: (member: { clientId: string }) => void) => void;
      };
      detach: () => Promise<void>;
    } | null = null;
    let publishTimer: ReturnType<typeof setInterval> | null = null;
    let cleanupTimer: ReturnType<typeof setInterval> | null = null;
    // Polling fallback timers
    let pollSendTimer: ReturnType<typeof setInterval> | null = null;
    let pollGetTimer: ReturnType<typeof setInterval> | null = null;
    let pollSendInFlight = false;
    let pollGetInFlight = false;
    let usingPolling = false;

    // Stale cleanup runs regardless of transport
    cleanupTimer = setInterval(() => {
      if (mountedRef.current) cleanStale();
    }, 2000);

    /* ── Polling fallback ── */
    const startPolling = () => {
      if (usingPolling) return; // Already running
      usingPolling = true;
      if (mountedRef.current) setTransport("polling");
      console.log("[SYNC] Using polling fallback");

      const doSend = async () => {
        if (!mountedRef.current || pollSendInFlight || !hasPosRef.current) return;
        pollSendInFlight = true;
        try {
          const res = await fetch("/api/office/positions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: tokenRef.current,
              userId: userIdRef.current,
              role: roleRef.current,
              position: posRef.current,
              rotation: rotRef.current,
              color: colorRef.current,
              animation: animRef.current,
            }),
            cache: "no-store",
          });
          if (res.ok) {
            const data = (await res.json()) as { players?: PlayerData[] };
            if (Array.isArray(data.players) && mountedRef.current) {
              for (const p of data.players) {
                if (p.userId !== userIdRef.current) {
                  remoteMapRef.current.set(p.userId, p);
                }
              }
              flushPlayers();
              setConnected(true);
            }
          }
        } catch { /* ignore */ }
        finally { pollSendInFlight = false; }
      };

      const doGet = async () => {
        if (!mountedRef.current || pollGetInFlight) return;
        pollGetInFlight = true;
        try {
          const res = await fetch(
            `/api/office/positions?token=${encodeURIComponent(tokenRef.current!)}&_=${Date.now()}`,
            { cache: "no-store" }
          );
          if (res.ok) {
            const data = (await res.json()) as { players?: PlayerData[] };
            if (Array.isArray(data.players) && mountedRef.current) {
              for (const p of data.players) {
                if (p.userId !== userIdRef.current) {
                  remoteMapRef.current.set(p.userId, p);
                }
              }
              flushPlayers();
              setConnected(true);
            }
          }
        } catch { /* ignore */ }
        finally { pollGetInFlight = false; }
      };

      void doSend();
      void doGet();
      pollSendTimer = setInterval(doSend, 100);
      pollGetTimer = setInterval(doGet, 100);
    };

    /* ── Ably primary ── */
    // Check if Ably is blocked before attempting connection
    const checkAblyAvailable = async (): Promise<boolean> => {
      try {
        const res = await fetch(
          `/api/office/realtime-auth?token=${encodeURIComponent(tokenRef.current!)}&userId=${encodeURIComponent(userIdRef.current)}`,
          { cache: "no-store" }
        );
        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          if (data.error?.includes("blocked") || res.headers.get("x-ably-error-code") === "40112") {
            console.log("[SYNC] Ably is blocked, skipping Ably and using HTTP polling only");
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
        console.log("[SYNC] Ably unavailable, using HTTP polling only");
        startPolling();
        return;
      }

      try {
        const Ably = await import("ably");
        const channelName = `office:${tokenRef.current}`;

        const client = new Ably.Realtime({
          authUrl: `/api/office/realtime-auth?token=${encodeURIComponent(
            tokenRef.current!
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
              console.error("[SYNC] Ably account blocked - message limits exceeded. Switching to polling.");
              reject(new Error("Ably account blocked - switching to polling"));
            } else {
              reject(new Error("Ably connection failed"));
            }
          });
        });

        if (!mountedRef.current) { client.close(); return; }

        const channel = client.channels.get(channelName);
        ablyChannel = channel as unknown as typeof ablyChannel;

        // Attach to channel
        await channel.attach();
        if (!mountedRef.current) { client.close(); return; }

        // Enter presence
        await channel.presence.enter({
          userId: userIdRef.current,
          role: roleRef.current,
          color: colorRef.current,
        });

        // Subscribe to position updates from others
        await channel.subscribe("pos", (message) => {
          if (!mountedRef.current) return;
          const data = message.data as WirePayload | undefined;
          if (!data || typeof data !== "object" || data.userId === userIdRef.current) return;
          upsertRemote({
            userId: data.userId,
            role: data.role,
            position: data.position,
            rotation: data.rotation,
            color: data.color,
            animation: data.animation,
            lastUpdate: data.ts || Date.now(),
          });
        });

        // Presence leave → remove player
        channel.presence.subscribe("leave", (member: { clientId: string }) => {
          if (mountedRef.current) removeRemote(member.clientId);
        });

        // Handle disconnection → switch to polling
        client.connection.on("disconnected", () => {
          console.log("[SYNC] Ably disconnected, switching to polling");
          startPolling();
        });
        client.connection.on("suspended", () => {
          console.log("[SYNC] Ably suspended, switching to polling");
          startPolling();
        });

        // Publish loop: send our position at fixed interval (with rate limiting)
        // Pre-load rate limiter module
        let rateLimiterModule: typeof import("@/lib/ably/rateLimiter") | null = null;
        void import("@/lib/ably/rateLimiter").then((mod) => {
          rateLimiterModule = mod;
        });
        
        publishTimer = setInterval(() => {
          if (!mountedRef.current || !hasPosRef.current) return;
          
          // Check rate limit before publishing (if module loaded)
          if (rateLimiterModule) {
            const rateLimit = rateLimiterModule.checkRateLimit();
            
            if (!rateLimit.allowed) {
              // Rate limit exceeded, switch to polling
              console.warn("[SYNC] Ably rate limit exceeded, switching to polling");
              startPolling();
              return;
            }
            
            // Throttle when approaching limit (skip some publishes)
            if (rateLimit.shouldThrottle) {
              // When throttling, only publish 50% of the time
              if (Math.random() < 0.5) return;
            }
          }
          
          const payload = buildPayload();
          void channel.publish("pos", payload).then(() => {
            if (rateLimiterModule) {
              rateLimiterModule.recordMessage(1);
            }
          }).catch((err) => {
            const error = err as Error & { code?: number; statusCode?: number };
            // Check for quota exceeded or account blocked errors
            if (error.code === 9103 || error.code === 9104 || error.code === 40112 || error.statusCode === 429 || error.statusCode === 401) {
              console.warn("[SYNC] Ably quota exceeded or account blocked, switching to polling");
              startPolling();
            }
            // Other publish failures are not critical, next interval will retry
          });
        }, publishIntervalMs);

        // Immediate first publish
        if (hasPosRef.current) {
          void channel.publish("pos", buildPayload()).catch(() => {});
        }

        if (mountedRef.current) {
          setConnected(true);
          setTransport("ably");
          console.log("[SYNC] Connected via Ably");
        }
      } catch (err) {
        console.warn("[SYNC] Ably failed, falling back to polling:", err);
        startPolling();
      }
    };

    void startAbly();

    /* ── Cleanup ── */
    return () => {
      mountedRef.current = false;
      if (publishTimer) clearInterval(publishTimer);
      if (cleanupTimer) clearInterval(cleanupTimer);
      if (pollSendTimer) clearInterval(pollSendTimer);
      if (pollGetTimer) clearInterval(pollGetTimer);
      remoteMapRef.current.clear();

      if (ablyChannel) {
        void (ablyChannel as { presence: { leave: () => Promise<void> } }).presence.leave().catch(() => {});
        void (ablyChannel as { detach: () => Promise<void> }).detach().catch(() => {});
      }
      if (ablyClient) {
        ablyClient.close();
      }
    };
  }, [token, enabled, publishIntervalMs, buildPayload, cleanStale, flushPlayers, upsertRemote, removeRemote]);

  return { players, connected, transport, sendPosition };
};
