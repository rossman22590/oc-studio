"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GatewayBrowserClient,
  type GatewayHelloOk,
} from "./openclaw/GatewayBrowserClient";
import type { StudioSettings, StudioSettingsPatch } from "@/lib/studio/settings";

export type ReqFrame = {
  type: "req";
  id: string;
  method: string;
  params: unknown;
};

export type ResFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number;
  };
};

export type GatewayStateVersion = {
  presence: number;
  health: number;
};

export type EventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: GatewayStateVersion;
};

export type GatewayFrame = ReqFrame | ResFrame | EventFrame;

export const parseGatewayFrame = (raw: string): GatewayFrame | null => {
  try {
    return JSON.parse(raw) as GatewayFrame;
  } catch {
    return null;
  }
};

export const buildAgentMainSessionKey = (agentId: string, mainKey: string) => {
  const trimmedAgent = agentId.trim();
  const trimmedKey = mainKey.trim() || "main";
  return `agent:${trimmedAgent}:${trimmedKey}`;
};

export const parseAgentIdFromSessionKey = (sessionKey: string): string | null => {
  const match = sessionKey.match(/^agent:([^:]+):/);
  return match ? match[1] : null;
};

export const isSameSessionKey = (a: string, b: string) => {
  const left = a.trim();
  const right = b.trim();
  return left.length > 0 && left === right;
};

const DEFAULT_GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? "ws://127.0.0.1:18789";
const DEFAULT_GATEWAY_TOKEN = process.env.NEXT_PUBLIC_GATEWAY_TOKEN ?? "";

const STORAGE_KEY_GATEWAY_URL = "openclaw.gateway.url";
const STORAGE_KEY_GATEWAY_TOKEN = "openclaw.gateway.token";

const loadFromLocalStorage = (key: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored?.trim() || fallback;
  } catch {
    return fallback;
  }
};

const saveToLocalStorage = (key: string, value: string): void => {
  if (typeof window === "undefined") return;
  try {
    if (value.trim()) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn(`Failed to save to localStorage: ${key}`, err);
  }
};

type StatusHandler = (status: GatewayStatus) => void;

type EventHandler = (event: EventFrame) => void;

export type GatewayStatus = "disconnected" | "connecting" | "connected";

export type GatewayConnectOptions = {
  gatewayUrl: string;
  token?: string;
};

export type GatewayErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
};

export class GatewayResponseError extends Error {
  code: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;

  constructor(payload: GatewayErrorPayload) {
    super(payload.message || "Gateway request failed");
    this.name = "GatewayResponseError";
    this.code = payload.code;
    this.details = payload.details;
    this.retryable = payload.retryable;
    this.retryAfterMs = payload.retryAfterMs;
  }
}

export class GatewayClient {
  private client: GatewayBrowserClient | null = null;
  private statusHandlers = new Set<StatusHandler>();
  private eventHandlers = new Set<EventHandler>();
  private status: GatewayStatus = "disconnected";
  private pendingConnect: Promise<void> | null = null;
  private resolveConnect: (() => void) | null = null;
  private rejectConnect: ((error: Error) => void) | null = null;
  private manualDisconnect = false;
  private lastHello: GatewayHelloOk | null = null;

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  onEvent(handler: EventHandler) {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  async connect(options: GatewayConnectOptions) {
    if (!options.gatewayUrl.trim()) {
      throw new Error("Gateway URL is required.");
    }
    if (this.client) {
      throw new Error("Gateway is already connected or connecting.");
    }

    this.manualDisconnect = false;
    this.updateStatus("connecting");

    this.pendingConnect = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
    });

    this.client = new GatewayBrowserClient({
      url: options.gatewayUrl,
      token: options.token,
      onHello: (hello) => {
        this.lastHello = hello;
        this.updateStatus("connected");
        this.resolveConnect?.();
        this.clearConnectPromise();
      },
      onEvent: (event) => {
        this.eventHandlers.forEach((handler) => handler(event));
      },
      onClose: ({ code, reason }) => {
        const err = new Error(`Gateway closed (${code}): ${reason}`);
        if (this.rejectConnect) {
          this.rejectConnect(err);
          this.clearConnectPromise();
        }
        this.updateStatus(this.manualDisconnect ? "disconnected" : "connecting");
        if (this.manualDisconnect) {
          console.info("Gateway disconnected.");
        }
      },
      onGap: ({ expected, received }) => {
        console.warn(`Gateway event gap expected ${expected}, received ${received}.`);
      },
    });

    this.client.start();

    try {
      await this.pendingConnect;
    } catch (err) {
      this.client.stop();
      this.client = null;
      this.updateStatus("disconnected");
      throw err;
    }
  }

  disconnect() {
    if (!this.client) {
      return;
    }

    this.manualDisconnect = true;
    this.client.stop();
    this.client = null;
    this.clearConnectPromise();
    this.updateStatus("disconnected");
    console.info("Gateway disconnected.");
  }

  async call<T = unknown>(method: string, params: unknown): Promise<T> {
    if (!method.trim()) {
      throw new Error("Gateway method is required.");
    }
    if (!this.client || !this.client.connected) {
      throw new Error("Gateway is not connected.");
    }

    const payload = await this.client.request<T>(method, params);
    return payload as T;
  }

  getLastHello() {
    return this.lastHello;
  }

  private updateStatus(status: GatewayStatus) {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  private clearConnectPromise() {
    this.pendingConnect = null;
    this.resolveConnect = null;
    this.rejectConnect = null;
  }
}

export const isGatewayDisconnectLikeError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (!msg) return false;
  if (
    msg.includes("gateway not connected") ||
    msg.includes("gateway is not connected") ||
    msg.includes("gateway client stopped")
  ) {
    return true;
  }

  const match = msg.match(/gateway closed \\((\\d+)\\)/);
  if (!match) return false;
  const code = Number(match[1]);
  return Number.isFinite(code) && code === 1012;
};

type SessionSettingsPatchPayload = {
  key: string;
  model?: string | null;
  thinkingLevel?: string | null;
};

export type GatewaySessionsPatchResult = {
  ok: true;
  key: string;
  entry?: {
    thinkingLevel?: string;
  };
  resolved?: {
    modelProvider?: string;
    model?: string;
  };
};

export type SyncGatewaySessionSettingsParams = {
  client: GatewayClient;
  sessionKey: string;
  model?: string | null;
  thinkingLevel?: string | null;
};

export const syncGatewaySessionSettings = async ({
  client,
  sessionKey,
  model,
  thinkingLevel,
}: SyncGatewaySessionSettingsParams) => {
  const key = sessionKey.trim();
  if (!key) {
    throw new Error("Session key is required.");
  }
  const includeModel = model !== undefined;
  const includeThinkingLevel = thinkingLevel !== undefined;
  if (!includeModel && !includeThinkingLevel) {
    throw new Error("At least one session setting must be provided.");
  }
  const payload: SessionSettingsPatchPayload = { key };
  if (includeModel) {
    payload.model = model ?? null;
  }
  if (includeThinkingLevel) {
    payload.thinkingLevel = thinkingLevel ?? null;
  }
  return await client.call<GatewaySessionsPatchResult>("sessions.patch", payload);
};

const formatGatewayError = (error: unknown) => {
  if (error instanceof GatewayResponseError) {
    return `Gateway error (${error.code}): ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown gateway error.";
};

export type GatewayConnectionState = {
  client: GatewayClient;
  status: GatewayStatus;
  gatewayUrl: string;
  token: string;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  setGatewayUrl: (value: string) => void;
  setToken: (value: string) => void;
  clearError: () => void;
};

type StudioSettingsCoordinatorLike = {
  loadSettings: () => Promise<StudioSettings | null>;
  schedulePatch: (patch: StudioSettingsPatch, debounceMs?: number) => void;
  flushPending: () => Promise<void>;
};

export const useGatewayConnection = (
  settingsCoordinator: StudioSettingsCoordinatorLike
): GatewayConnectionState => {
  const [client] = useState(() => new GatewayClient());
  const didAutoConnect = useRef(false);

  // IRON CLAD: localStorage is the ONLY source of truth for initial values
  const [gatewayUrl, setGatewayUrl] = useState(() =>
    loadFromLocalStorage(STORAGE_KEY_GATEWAY_URL, DEFAULT_GATEWAY_URL)
  );
  const [token, setToken] = useState(() =>
    loadFromLocalStorage(STORAGE_KEY_GATEWAY_TOKEN, DEFAULT_GATEWAY_TOKEN)
  );
  const [status, setStatus] = useState<GatewayStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  // Track last saved values to avoid redundant saves
  const lastSavedRef = useRef({ gatewayUrl: "", token: "" });

  // Status updates from client
  useEffect(() => {
    return client.onStatus((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus !== "connecting") {
        setError(null);
      }
    });
  }, [client]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      client.disconnect();
    };
  }, [client]);

  // Connect function
  const connect = useCallback(async () => {
    setError(null);
    try {
      await client.connect({ gatewayUrl, token });
    } catch (err) {
      setError(formatGatewayError(err));
    }
  }, [client, gatewayUrl, token]);

  // Auto-connect on mount if credentials exist
  useEffect(() => {
    if (didAutoConnect.current) return;
    if (!gatewayUrl.trim()) return;
    didAutoConnect.current = true;
    void connect();
  }, [connect, gatewayUrl]);

  // IRON CLAD SAVE: Immediately save to BOTH localStorage AND file on any change
  useEffect(() => {
    const nextGatewayUrl = gatewayUrl.trim();
    const nextToken = token;
    
    // Skip if values haven't changed
    if (nextGatewayUrl === lastSavedRef.current.gatewayUrl && 
        nextToken === lastSavedRef.current.token) {
      return;
    }
    
    // Update tracking ref
    lastSavedRef.current = { gatewayUrl: nextGatewayUrl, token: nextToken };
    
    // SAVE TO LOCALSTORAGE IMMEDIATELY - SYNCHRONOUS
    saveToLocalStorage(STORAGE_KEY_GATEWAY_URL, nextGatewayUrl);
    saveToLocalStorage(STORAGE_KEY_GATEWAY_TOKEN, nextToken);
    
    // SAVE TO FILE IMMEDIATELY - NO DEBOUNCE
    settingsCoordinator.schedulePatch(
      {
        gateway: {
          url: nextGatewayUrl,
          token: nextToken,
        },
      },
      0 // IMMEDIATE - NO DELAY
    );
  }, [gatewayUrl, token, settingsCoordinator]);

  // Disconnect function
  const disconnect = useCallback(() => {
    setError(null);
    client.disconnect();
  }, [client]);

  // Clear error function
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Wrapper for setGatewayUrl that saves immediately
  const setGatewayUrlWithSave = useCallback((value: string) => {
    const trimmed = value.trim();
    setGatewayUrl(trimmed);
    saveToLocalStorage(STORAGE_KEY_GATEWAY_URL, trimmed);
  }, []);

  // Wrapper for setToken that saves immediately
  const setTokenWithSave = useCallback((value: string) => {
    setToken(value);
    saveToLocalStorage(STORAGE_KEY_GATEWAY_TOKEN, value);
  }, []);

  return {
    client,
    status,
    gatewayUrl,
    token,
    error,
    connect,
    disconnect,
    setGatewayUrl: setGatewayUrlWithSave,
    setToken: setTokenWithSave,
    clearError,
  };
};
