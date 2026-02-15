"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GatewayBrowserClient,
  type GatewayHelloOk,
} from "./openclaw/GatewayBrowserClient";
import type {
  StudioGatewaySettings,
  StudioSettings,
  StudioSettingsPatch,
} from "@/lib/studio/settings";
import type { StudioSettingsResponse } from "@/lib/studio/coordinator";
import { GatewayResponseError } from "@/lib/gateway/errors";

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

const CONNECT_FAILED_CLOSE_CODE = 4008;

const parseConnectFailedCloseReason = (
  reason: string
): { code: string; message: string } | null => {
  const trimmed = reason.trim();
  if (!trimmed.toLowerCase().startsWith("connect failed:")) return null;
  const remainder = trimmed.slice("connect failed:".length).trim();
  if (!remainder) return null;
  const idx = remainder.indexOf(" ");
  const code = (idx === -1 ? remainder : remainder.slice(0, idx)).trim();
  if (!code) return null;
  const message = (idx === -1 ? "" : remainder.slice(idx + 1)).trim();
  return { code, message: message || "connect failed" };
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

export type GatewayGapInfo = { expected: number; received: number };

type GapHandler = (info: GatewayGapInfo) => void;

export type GatewayStatus = "disconnected" | "connecting" | "connected";

export type GatewayConnectOptions = {
  gatewayUrl: string;
  token?: string;
  authScopeKey?: string;
  clientName?: string;
  disableDeviceAuth?: boolean;
};

export { GatewayResponseError } from "@/lib/gateway/errors";
export type { GatewayErrorPayload } from "@/lib/gateway/errors";

export class GatewayClient {
  private client: GatewayBrowserClient | null = null;
  private statusHandlers = new Set<StatusHandler>();
  private eventHandlers = new Set<EventHandler>();
  private gapHandlers = new Set<GapHandler>();
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

  onGap(handler: GapHandler) {
    this.gapHandlers.add(handler);
    return () => {
      this.gapHandlers.delete(handler);
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
      authScopeKey: options.authScopeKey,
      clientName: options.clientName,
      disableDeviceAuth: options.disableDeviceAuth,
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
	        const connectFailed =
	          code === CONNECT_FAILED_CLOSE_CODE ? parseConnectFailedCloseReason(reason) : null;
	        const err = connectFailed
	          ? new GatewayResponseError({
	              code: connectFailed.code,
	              message: connectFailed.message,
	            })
	          : new Error(`Gateway closed (${code}): ${reason}`);
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
        this.gapHandlers.forEach((handler) => handler({ expected, received }));
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

  getStatus() {
    return this.status;
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
  execHost?: "sandbox" | "gateway" | "node" | null;
  execSecurity?: "deny" | "allowlist" | "full" | null;
  execAsk?: "off" | "on-miss" | "always" | null;
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
  execHost?: "sandbox" | "gateway" | "node" | null;
  execSecurity?: "deny" | "allowlist" | "full" | null;
  execAsk?: "off" | "on-miss" | "always" | null;
};

export const syncGatewaySessionSettings = async ({
  client,
  sessionKey,
  model,
  thinkingLevel,
  execHost,
  execSecurity,
  execAsk,
}: SyncGatewaySessionSettingsParams) => {
  const key = sessionKey.trim();
  if (!key) {
    throw new Error("Session key is required.");
  }
  const includeModel = model !== undefined;
  const includeThinkingLevel = thinkingLevel !== undefined;
  const includeExecHost = execHost !== undefined;
  const includeExecSecurity = execSecurity !== undefined;
  const includeExecAsk = execAsk !== undefined;
  if (
    !includeModel &&
    !includeThinkingLevel &&
    !includeExecHost &&
    !includeExecSecurity &&
    !includeExecAsk
  ) {
    throw new Error("At least one session setting must be provided.");
  }
  const payload: SessionSettingsPatchPayload = { key };
  if (includeModel) {
    payload.model = model ?? null;
  }
  if (includeThinkingLevel) {
    payload.thinkingLevel = thinkingLevel ?? null;
  }
  if (includeExecHost) {
    payload.execHost = execHost ?? null;
  }
  if (includeExecSecurity) {
    payload.execSecurity = execSecurity ?? null;
  }
  if (includeExecAsk) {
    payload.execAsk = execAsk ?? null;
  }
  return await client.call<GatewaySessionsPatchResult>("sessions.patch", payload);
};

const doctorFixHint =
  "Run `npx openclaw doctor --fix` on the gateway host (or `pnpm openclaw doctor --fix` in a source checkout).";

const formatGatewayError = (error: unknown) => {
  if (error instanceof GatewayResponseError) {
    if (error.code === "INVALID_REQUEST" && /invalid config/i.test(error.message)) {
      return `Gateway error (${error.code}): ${error.message}. ${doctorFixHint}`;
    }
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
  localGatewayDefaults: StudioGatewaySettings | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  useLocalGatewayDefaults: () => void;
  setGatewayUrl: (value: string) => void;
  setToken: (value: string) => void;
  clearError: () => void;
};

type StudioSettingsCoordinatorLike = {
  loadSettings: () => Promise<StudioSettings | null>;
  loadSettingsEnvelope?: () => Promise<StudioSettingsResponse>;
  schedulePatch: (patch: StudioSettingsPatch, debounceMs?: number) => void;
  flushPending: () => Promise<void>;
};

// Singleton instance shared across all pages
let globalGatewayClient: GatewayClient | null = null;

const getOrCreateGatewayClient = (): GatewayClient => {
  if (!globalGatewayClient) {
    globalGatewayClient = new GatewayClient();
  }
  return globalGatewayClient;
};

export const useGatewayConnection = (
  settingsCoordinator: StudioSettingsCoordinatorLike
): GatewayConnectionState => {
  const [client] = useState(() => getOrCreateGatewayClient());
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
  const [localGatewayDefaults, setLocalGatewayDefaults] = useState<StudioGatewaySettings | null>(null);

  // Track last saved values to avoid redundant saves
  const lastSavedRef = useRef({ gatewayUrl: "", token: "" });

  // Load local gateway defaults from openclaw.json if available
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const settings = await settingsCoordinator.loadSettings();
        // Check if we can get localGatewayDefaults from settings-store
        // For now, we'll try to load from openclaw.json via the settings coordinator
        // This is a best-effort attempt - localStorage is still the source of truth
      } catch {
        // Ignore errors - localStorage is the source of truth
      }
    };
    void loadDefaults();
  }, [settingsCoordinator]);

  // Status updates from client
  useEffect(() => {
    return client.onStatus((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus !== "connecting") {
        setError(null);
      }
    });
  }, [client]);

  // DO NOT disconnect on unmount - keep connection alive across page navigations
  // The singleton client persists across all pages

  // Connect function
  const connect = useCallback(async () => {
    setError(null);
    try {
      await client.connect({ gatewayUrl, token });
    } catch (err) {
      setError(formatGatewayError(err));
    }
  }, [client, gatewayUrl, token]);

  // Auto-connect on mount if credentials exist and not already connected
  useEffect(() => {
    if (didAutoConnect.current) return;
    if (!gatewayUrl.trim()) return;
    if (client.getStatus() === 'connected') return; // Already connected from another page
    didAutoConnect.current = true;
    void connect();
  }, [connect, gatewayUrl, client]);

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

  // Use local gateway defaults helper
  const useLocalGatewayDefaults = useCallback(() => {
    if (!localGatewayDefaults) {
      return;
    }
    setGatewayUrl(localGatewayDefaults.url);
    setToken(localGatewayDefaults.token);
    setError(null);
  }, [localGatewayDefaults]);

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
    localGatewayDefaults,
    error,
    connect,
    disconnect,
    useLocalGatewayDefaults,
    setGatewayUrl: setGatewayUrlWithSave,
    setToken: setTokenWithSave,
    clearError,
  };
};
