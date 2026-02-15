import { buildAgentMainSessionKey, isSameSessionKey } from "@/lib/gateway/GatewayClient";
import { type GatewayModelPolicySnapshot } from "@/lib/gateway/models";
import { resolveAgentAvatarSeed, type StudioSettings } from "@/lib/studio/settings";
import {
  type SummaryPreviewSnapshot,
  type SummarySnapshotPatch,
  type SummaryStatusSnapshot,
} from "@/features/agents/state/runtimeEventBridge";
import type { AgentStoreSeed } from "@/features/agents/state/store";
import {
  deriveHydrateAgentFleetResult,
  resolveAgentName,
  resolveAgentAvatarUrl,
  resolveDefaultModelForAgent,
} from "@/features/agents/operations/agentFleetHydrationDerivation";

type GatewayClientLike = {
  call: (method: string, params: unknown) => Promise<unknown>;
};

type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope?: string;
  agents: Array<{
    id: string;
    name?: string;
    identity?: {
      name?: string;
      theme?: string;
      emoji?: string;
      avatar?: string;
      avatarUrl?: string;
    };
  }>;
};

type SessionsListEntry = {
  key: string;
  updatedAt?: number | null;
  displayName?: string;
  origin?: { label?: string | null; provider?: string | null } | null;
  thinkingLevel?: string;
  modelProvider?: string;
  model?: string;
  execHost?: string | null;
  execSecurity?: string | null;
  execAsk?: string | null;
};

type SessionsListResult = {
  sessions?: SessionsListEntry[];
};

type ExecApprovalsSnapshot = {
  file?: {
    agents?: Record<string, { security?: string | null; ask?: string | null }>;
  };
};

export type HydrateAgentFleetResult = {
  seeds: AgentStoreSeed[];
  sessionCreatedAgentIds: string[];
  sessionSettingsSyncedAgentIds: string[];
  summaryPatches: SummarySnapshotPatch[];
  suggestedSelectedAgentId: string | null;
  configSnapshot: GatewayModelPolicySnapshot | null;
};

export async function hydrateAgentFleetFromGateway(params: {
  client: GatewayClientLike;
  gatewayUrl: string;
  cachedConfigSnapshot: GatewayModelPolicySnapshot | null;
  loadStudioSettings: () => Promise<StudioSettings | null>;
  isDisconnectLikeError: (err: unknown) => boolean;
  logError?: (message: string, error: unknown) => void;
}): Promise<HydrateAgentFleetResult> {
  const logError = params.logError ?? ((message, error) => console.error(message, error));

  let configSnapshot = params.cachedConfigSnapshot;
  if (!configSnapshot) {
    try {
      configSnapshot = (await params.client.call(
        "config.get",
        {}
      )) as GatewayModelPolicySnapshot;
    } catch (err) {
      if (!params.isDisconnectLikeError(err)) {
        logError("Failed to load gateway config while loading agents.", err);
      }
    }
  }

  const gatewayKey = params.gatewayUrl.trim();
  let settings: StudioSettings | null = null;
  if (gatewayKey) {
    try {
      settings = await params.loadStudioSettings();
    } catch (err) {
      logError("Failed to load studio settings while loading agents.", err);
    }
  }

  let execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  try {
    execApprovalsSnapshot = (await params.client.call(
      "exec.approvals.get",
      {}
    )) as ExecApprovalsSnapshot;
  } catch (err) {
    if (!params.isDisconnectLikeError(err)) {
      logError("Failed to load exec approvals while loading agents.", err);
    }
  }

  const agentsResult = (await params.client.call("agents.list", {})) as AgentsListResult;
  const mainKey = agentsResult.mainKey?.trim() || "main";

  const mainSessionKeyByAgent = new Map<string, SessionsListEntry | null>();
  await Promise.all(
    agentsResult.agents.map(async (agent) => {
      try {
        const expectedMainKey = buildAgentMainSessionKey(agent.id, mainKey);
        const sessions = (await params.client.call("sessions.list", {
          agentId: agent.id,
          includeGlobal: false,
          includeUnknown: false,
          search: expectedMainKey,
          limit: 4,
        })) as SessionsListResult;
        const entries = Array.isArray(sessions.sessions) ? sessions.sessions : [];
        const mainEntry =
          entries.find((entry) => isSameSessionKey(entry.key ?? "", expectedMainKey)) ?? null;
        mainSessionKeyByAgent.set(agent.id, mainEntry);
      } catch (err) {
        if (!params.isDisconnectLikeError(err)) {
          logError("Failed to list sessions while resolving agent session.", err);
        }
        mainSessionKeyByAgent.set(agent.id, null);
      }
    })
  );

  /* Restore persisted display prefs (toolCallingEnabled / showThinkingTraces) from localStorage */
  let displayPrefs: Record<string, { toolCallingEnabled?: boolean; showThinkingTraces?: boolean }> = {};
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("oc-display-prefs") : null;
    if (raw) displayPrefs = JSON.parse(raw);
  } catch { /* ignore */ }

  const seeds: AgentStoreSeed[] = agentsResult.agents.map((agent) => {
    const persistedSeed = settings && gatewayKey ? resolveAgentAvatarSeed(settings, gatewayKey, agent.id) : null;
    const avatarSeed = persistedSeed ?? agent.id;
    const avatarUrl = resolveAgentAvatarUrl(agent);
    const name = resolveAgentName(agent);
    const mainSession = mainSessionKeyByAgent.get(agent.id) ?? null;
    const modelProvider = typeof mainSession?.modelProvider === "string" ? mainSession.modelProvider.trim() : "";
    const modelId = typeof mainSession?.model === "string" ? mainSession.model.trim() : "";
    const model =
      modelProvider && modelId
        ? `${modelProvider}/${modelId}`
        : resolveDefaultModelForAgent(agent.id, configSnapshot);
    const thinkingLevel = typeof mainSession?.thinkingLevel === "string" ? mainSession.thinkingLevel : null;
    const agentPrefs = displayPrefs[agent.id];
    return {
      agentId: agent.id,
      name,
      sessionKey: buildAgentMainSessionKey(agent.id, mainKey),
      avatarSeed,
      avatarUrl,
      model,
      thinkingLevel,
      toolCallingEnabled: agentPrefs?.toolCallingEnabled,
      showThinkingTraces: agentPrefs?.showThinkingTraces,
    };
  });

  const sessionCreatedAgentIds: string[] = [];
  for (const seed of seeds) {
    const mainSession = mainSessionKeyByAgent.get(seed.agentId) ?? null;
    if (!mainSession) continue;
    sessionCreatedAgentIds.push(seed.agentId);
  }

  let statusSummary: SummaryStatusSnapshot | null = null;
  let previewResult: SummaryPreviewSnapshot | null = null;
  try {
    const sessionKeys = Array.from(
      new Set(
        agentsResult.agents
          .filter((agent) => Boolean(mainSessionKeyByAgent.get(agent.id)))
          .map((agent) => buildAgentMainSessionKey(agent.id, mainKey))
          .filter((key) => key.trim().length > 0)
      )
    ).slice(0, 64);
    if (sessionKeys.length > 0) {
      const snapshot = await Promise.all([
        params.client.call("status", {}) as Promise<SummaryStatusSnapshot>,
        params.client.call("sessions.preview", {
          keys: sessionKeys,
          limit: 8,
          maxChars: 240,
        }) as Promise<SummaryPreviewSnapshot>,
      ]);
      statusSummary = snapshot[0] ?? null;
      previewResult = snapshot[1] ?? null;
    }
  } catch (err) {
    if (!params.isDisconnectLikeError(err)) {
      logError("Failed to load initial summary snapshot.", err);
    }
  }

  const derived = deriveHydrateAgentFleetResult({
    gatewayUrl: params.gatewayUrl,
    configSnapshot: configSnapshot ?? null,
    settings,
    execApprovalsSnapshot,
    agentsResult,
    mainSessionByAgentId: mainSessionKeyByAgent,
    statusSummary,
    previewResult,
  });

  return derived;
}
