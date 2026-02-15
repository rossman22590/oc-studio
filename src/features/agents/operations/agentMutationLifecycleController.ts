import { type AgentGuidedSetup } from "@/features/agents/operations/createAgentOperation";
import { shouldAttemptPendingSetupAutoRetry } from "@/features/agents/operations/pendingSetupLifecycleWorkflow";
import { selectNextPendingGuidedSetupRetryAgentId } from "@/features/agents/creation/pendingSetupRetry";

export type MutationKind = "create-agent" | "rename-agent" | "delete-agent";

export type MutationBlockPhase = "queued" | "mutating" | "awaiting-restart";

export type MutationBlockState = {
  kind: MutationKind;
  agentId: string;
  agentName: string;
  phase: MutationBlockPhase;
  startedAt: number;
  sawDisconnect: boolean;
};

export type MutationStartGuardResult =
  | { kind: "allow" }
  | {
      kind: "deny";
      reason: "not-connected" | "create-block-active" | "rename-block-active" | "delete-block-active";
    };

export const resolveMutationStartGuard = (params: {
  status: "connected" | "connecting" | "disconnected";
  hasCreateBlock: boolean;
  hasRenameBlock: boolean;
  hasDeleteBlock: boolean;
}): MutationStartGuardResult => {
  if (params.status !== "connected") {
    return { kind: "deny", reason: "not-connected" };
  }
  if (params.hasCreateBlock) {
    return { kind: "deny", reason: "create-block-active" };
  }
  if (params.hasRenameBlock) {
    return { kind: "deny", reason: "rename-block-active" };
  }
  if (params.hasDeleteBlock) {
    return { kind: "deny", reason: "delete-block-active" };
  }
  return { kind: "allow" };
};

export const buildQueuedMutationBlock = (params: {
  kind: MutationKind;
  agentId: string;
  agentName: string;
  startedAt: number;
}): MutationBlockState => {
  return {
    kind: params.kind,
    agentId: params.agentId,
    agentName: params.agentName,
    phase: "queued",
    startedAt: params.startedAt,
    sawDisconnect: false,
  };
};

export const buildMutatingMutationBlock = (block: MutationBlockState): MutationBlockState => {
  return {
    ...block,
    phase: "mutating",
  };
};

export type MutationPostRunIntent =
  | { kind: "clear" }
  | { kind: "awaiting-restart"; patch: { phase: "awaiting-restart"; sawDisconnect: boolean } };

export const resolveMutationPostRunIntent = (params: {
  disposition: "completed" | "awaiting-restart";
}): MutationPostRunIntent => {
  if (params.disposition === "awaiting-restart") {
    return {
      kind: "awaiting-restart",
      patch: {
        phase: "awaiting-restart",
        sawDisconnect: false,
      },
    };
  }
  return { kind: "clear" };
};

export type MutationSideEffectCommand =
  | { kind: "reload-agents" }
  | { kind: "clear-mutation-block" }
  | { kind: "set-mobile-pane"; pane: "chat" }
  | { kind: "patch-mutation-block"; patch: { phase: "awaiting-restart"; sawDisconnect: boolean } };

export const buildMutationSideEffectCommands = (params: {
  disposition: "completed" | "awaiting-restart";
}): MutationSideEffectCommand[] => {
  const postRunIntent = resolveMutationPostRunIntent({
    disposition: params.disposition,
  });
  if (postRunIntent.kind === "clear") {
    return [
      { kind: "reload-agents" },
      { kind: "clear-mutation-block" },
      { kind: "set-mobile-pane", pane: "chat" },
    ];
  }
  return [{ kind: "patch-mutation-block", patch: postRunIntent.patch }];
};

export type PendingSetupAutoRetryIntent =
  | {
      kind: "skip";
      reason:
        | "not-connected"
        | "agents-not-loaded"
        | "scope-mismatch"
        | "create-block-active"
        | "retry-busy"
        | "no-eligible-agent";
    }
  | { kind: "retry"; agentId: string };

const resolvePendingSetupSkipReason = (params: {
  status: "connected" | "connecting" | "disconnected";
  agentsLoadedOnce: boolean;
  loadedScopeMatches: boolean;
  hasActiveCreateBlock: boolean;
  retryBusyAgentId: string | null;
}): PendingSetupAutoRetryIntent => {
  if (params.status !== "connected") {
    return { kind: "skip", reason: "not-connected" };
  }
  if (!params.agentsLoadedOnce) {
    return { kind: "skip", reason: "agents-not-loaded" };
  }
  if (!params.loadedScopeMatches) {
    return { kind: "skip", reason: "scope-mismatch" };
  }
  if (params.hasActiveCreateBlock) {
    return { kind: "skip", reason: "create-block-active" };
  }
  if (params.retryBusyAgentId) {
    return { kind: "skip", reason: "retry-busy" };
  }
  return { kind: "skip", reason: "no-eligible-agent" };
};

export const resolvePendingSetupAutoRetryIntent = (params: {
  status: "connected" | "connecting" | "disconnected";
  agentsLoadedOnce: boolean;
  loadedScopeMatches: boolean;
  hasActiveCreateBlock: boolean;
  retryBusyAgentId: string | null;
  pendingSetupsByAgentId: Record<string, unknown>;
  knownAgentIds: Set<string>;
  attemptedAgentIds: Set<string>;
  inFlightAgentIds: Set<string>;
}): PendingSetupAutoRetryIntent => {
  const shouldAttempt = shouldAttemptPendingSetupAutoRetry({
    status: params.status,
    agentsLoadedOnce: params.agentsLoadedOnce,
    loadedScopeMatches: params.loadedScopeMatches,
    hasActiveCreateBlock: params.hasActiveCreateBlock,
    retryBusyAgentId: params.retryBusyAgentId,
  });
  if (!shouldAttempt) {
    return resolvePendingSetupSkipReason(params);
  }
  const targetAgentId = selectNextPendingGuidedSetupRetryAgentId({
    pendingSetupsByAgentId: params.pendingSetupsByAgentId as Record<string, AgentGuidedSetup>,
    knownAgentIds: params.knownAgentIds,
    attemptedAgentIds: params.attemptedAgentIds,
    inFlightAgentIds: params.inFlightAgentIds,
  });
  if (!targetAgentId) {
    return { kind: "skip", reason: "no-eligible-agent" };
  }
  return { kind: "retry", agentId: targetAgentId };
};

export type MutationTimeoutIntent =
  | { kind: "none" }
  | { kind: "timeout"; reason: "create-timeout" | "rename-timeout" | "delete-timeout" };

const resolveTimeoutReason = (
  kind: MutationKind
): "create-timeout" | "rename-timeout" | "delete-timeout" => {
  if (kind === "create-agent") {
    return "create-timeout";
  }
  if (kind === "rename-agent") {
    return "rename-timeout";
  }
  return "delete-timeout";
};

export const resolveMutationTimeoutIntent = (params: {
  block: MutationBlockState | null;
  nowMs: number;
  maxWaitMs: number;
}): MutationTimeoutIntent => {
  if (!params.block) {
    return { kind: "none" };
  }
  const elapsed = params.nowMs - params.block.startedAt;
  if (elapsed < params.maxWaitMs) {
    return { kind: "none" };
  }
  return {
    kind: "timeout",
    reason: resolveTimeoutReason(params.block.kind),
  };
};
