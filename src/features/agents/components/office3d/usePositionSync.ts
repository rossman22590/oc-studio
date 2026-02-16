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
  syncIntervalMs?: number;
};

type UsePositionSyncReturn = {
  players: PlayerData[];
  connected: boolean;
  sendPosition: (
    position: [number, number, number],
    rotation: number,
    animation?: string
  ) => void;
  debug?: {
    token: string | null;
    userId: string;
    remoteCount: number;
    lastSend: number;
    lastReceive: number;
    errors: number;
  };
};

const STALE_REMOTE_MS = 20_000;

/**
 * SIMPLIFIED: Pure HTTP polling that ALWAYS works.
 * No Ably complexity - just reliable POST/GET every 100ms.
 */
export const usePositionSync = ({
  token,
  userId,
  role,
  color,
  enabled = true,
  syncIntervalMs = 100,
}: UsePositionSyncOptions): UsePositionSyncReturn => {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [connected, setConnected] = useState(false);

  const mountedRef = useRef(true);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const getTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendInFlightRef = useRef(false);
  const getInFlightRef = useRef(false);
  const errorCountRef = useRef(0);
  const remoteMapRef = useRef<Map<string, PlayerData>>(new Map());
  const lastSendRef = useRef(0);
  const lastReceiveRef = useRef(0);

  // Latest position data to send
  const latestPosRef = useRef<[number, number, number]>([0, 0, 0]);
  const latestRotRef = useRef(0);
  const latestAnimRef = useRef("Idle");
  const hasPositionRef = useRef(false);

  // Use refs for values that change but shouldn't recreate the sync loop
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const roleRef = useRef(role);
  roleRef.current = role;
  const colorRef = useRef(color);
  colorRef.current = color;

  // Called by the player component to update our latest position
  const sendPosition = useCallback(
    (
      position: [number, number, number],
      rotation: number,
      animation = "Idle"
    ) => {
      latestPosRef.current = position;
      latestRotRef.current = rotation;
      latestAnimRef.current = animation;
      hasPositionRef.current = true;
    },
    []
  );

  const applyRemotePlayers = useCallback((incoming: PlayerData[]) => {
    const map = new Map<string, PlayerData>();
    const selfId = userIdRef.current;
    for (const player of incoming) {
      if (player.userId === selfId) continue;
      map.set(player.userId, player);
    }
    remoteMapRef.current = map;
    const newPlayers = Array.from(map.values());
    setPlayers(newPlayers);
    setConnected(true);
    errorCountRef.current = 0;
    lastReceiveRef.current = Date.now();
    
    // DEBUG LOG
    if (newPlayers.length > 0) {
      console.log(`[SYNC] Received ${newPlayers.length} remote players:`, newPlayers.map(p => `${p.userId}(${p.role})`));
    }
  }, []);

  // Cleanup stale players
  const cleanupStaleRemotes = useCallback(() => {
    const now = Date.now();
    let changed = false;
    for (const [id, player] of remoteMapRef.current) {
      if (now - player.lastUpdate > STALE_REMOTE_MS) {
        remoteMapRef.current.delete(id);
        changed = true;
        console.log(`[SYNC] Removed stale player: ${id}`);
      }
    }
    if (changed) {
      setPlayers(Array.from(remoteMapRef.current.values()));
    }
  }, []);

  // Send our position to server
  const doSend = useCallback(async () => {
    if (!mountedRef.current || sendInFlightRef.current) return;
    if (!tokenRef.current || !enabled) return;
    if (!hasPositionRef.current) return; // Don't send until we have a position

    sendInFlightRef.current = true;
    try {
      const res = await fetch("/api/office/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenRef.current,
          userId: userIdRef.current,
          role: roleRef.current,
          position: latestPosRef.current,
          rotation: latestRotRef.current,
          color: colorRef.current,
          animation: latestAnimRef.current,
        }),
        cache: "no-store",
      });
      
      if (!res.ok) {
        console.error(`[SYNC] POST failed: ${res.status} ${res.statusText}`);
        errorCountRef.current += 1;
        return;
      }
      
      const data = (await res.json()) as { ok?: boolean; players?: PlayerData[] };
      if (Array.isArray(data.players)) {
        applyRemotePlayers(data.players);
      }
      lastSendRef.current = Date.now();
      errorCountRef.current = 0;
    } catch (err) {
      console.error("[SYNC] POST error:", err);
      errorCountRef.current += 1;
    } finally {
      sendInFlightRef.current = false;
    }
  }, [enabled, applyRemotePlayers]);

  // Get all players from server
  const doGet = useCallback(async () => {
    if (!mountedRef.current || getInFlightRef.current) return;
    if (!tokenRef.current || !enabled) return;

    getInFlightRef.current = true;
    try {
      const res = await fetch(
        `/api/office/positions?token=${encodeURIComponent(tokenRef.current)}&ts=${Date.now()}`,
        { cache: "no-store" }
      );
      
      if (!res.ok) {
        console.error(`[SYNC] GET failed: ${res.status} ${res.statusText}`);
        errorCountRef.current += 1;
        return;
      }
      
      const data = (await res.json()) as { players?: PlayerData[] };
      if (Array.isArray(data.players)) {
        applyRemotePlayers(data.players);
      }
    } catch (err) {
      console.error("[SYNC] GET error:", err);
      errorCountRef.current += 1;
    } finally {
      getInFlightRef.current = false;
    }
  }, [enabled, applyRemotePlayers]);

  // Main sync loop
  useEffect(() => {
    if (!token || !enabled) {
      console.log(`[SYNC] Disabled - token: ${token}, enabled: ${enabled}`);
      setPlayers([]);
      setConnected(false);
      remoteMapRef.current.clear();
      return;
    }

    console.log(`[SYNC] Starting sync - token: ${token}, userId: ${userId}, role: ${role}`);
    mountedRef.current = true;
    errorCountRef.current = 0;

    // Immediate first sync
    void doSend();
    void doGet();

    // Start timers
    sendTimerRef.current = setInterval(doSend, syncIntervalMs);
    getTimerRef.current = setInterval(doGet, syncIntervalMs);
    cleanupTimerRef.current = setInterval(cleanupStaleRemotes, 1000);

    return () => {
      console.log(`[SYNC] Cleaning up - userId: ${userIdRef.current}`);
      mountedRef.current = false;
      if (sendTimerRef.current) clearInterval(sendTimerRef.current);
      if (getTimerRef.current) clearInterval(getTimerRef.current);
      if (cleanupTimerRef.current) clearInterval(cleanupTimerRef.current);
      sendTimerRef.current = null;
      getTimerRef.current = null;
      cleanupTimerRef.current = null;
      remoteMapRef.current.clear();
    };
  }, [token, enabled, syncIntervalMs, doSend, doGet, cleanupStaleRemotes]);

  return {
    players,
    connected,
    sendPosition,
    debug: {
      token: tokenRef.current,
      userId: userIdRef.current,
      remoteCount: remoteMapRef.current.size,
      lastSend: lastSendRef.current,
      lastReceive: lastReceiveRef.current,
      errors: errorCountRef.current,
    },
  };
};
