import type { GatewayStatus } from "@/features/agents/operations/gatewayRestartPolicy";

export type PendingSetupRetrySource = "auto" | "manual";

export type PendingSetupAutoRetryGateInput = {
  status: GatewayStatus;
  agentsLoadedOnce: boolean;
  loadedScopeMatches: boolean;
  hasActiveCreateBlock: boolean;
  retryBusyAgentId: string | null;
};

export type PendingSetupRetryRunnerDeps = {
  executeRetry: (agentId: string) => Promise<{ applied: boolean }>;
  isDisconnectLikeError: (error: unknown) => boolean;
  resolveAgentName: (agentId: string) => string;
  onApplied: () => Promise<void> | void;
  onError: (message: string) => void;
};

const FALLBACK_RETRY_ERROR_MESSAGE = "Retrying guided setup failed.";

export const shouldAttemptPendingSetupAutoRetry = (
  input: PendingSetupAutoRetryGateInput
): boolean => {
  if (input.status !== "connected") return false;
  if (!input.agentsLoadedOnce) return false;
  if (!input.loadedScopeMatches) return false;
  if (input.hasActiveCreateBlock) return false;
  if (Boolean(input.retryBusyAgentId)) return false;
  return true;
};

export const shouldSuppressPendingSetupRetryError = (params: {
  source: PendingSetupRetrySource;
  disconnectLike: boolean;
}): boolean => {
  return params.source === "auto" && params.disconnectLike;
};

export const buildPendingSetupRetryErrorMessage = (params: {
  source: PendingSetupRetrySource;
  agentName: string;
  errorMessage: string;
}): string => {
  const resolvedName = params.agentName.trim() || "unknown agent";
  const resolvedError = params.errorMessage.trim() || FALLBACK_RETRY_ERROR_MESSAGE;
  if (params.source === "manual") {
    return `Guided setup retry failed for "${resolvedName}". ${resolvedError}`;
  }
  return `Agent "${resolvedName}" was created, but guided setup is still pending. Retry or discard setup from chat. ${resolvedError}`;
};

export const runPendingSetupRetryLifecycle = async (
  params: { agentId: string; source: PendingSetupRetrySource },
  deps: PendingSetupRetryRunnerDeps
): Promise<boolean> => {
  const resolvedAgentId = params.agentId.trim();
  if (!resolvedAgentId) {
    return false;
  }
  try {
    const result = await deps.executeRetry(resolvedAgentId);
    if (!result.applied) {
      return false;
    }
    await deps.onApplied();
    return true;
  } catch (error) {
    const disconnectLike = deps.isDisconnectLikeError(error);
    if (shouldSuppressPendingSetupRetryError({ source: params.source, disconnectLike })) {
      return false;
    }
    const errorMessage = error instanceof Error ? error.message : FALLBACK_RETRY_ERROR_MESSAGE;
    deps.onError(
      buildPendingSetupRetryErrorMessage({
        source: params.source,
        agentName: deps.resolveAgentName(resolvedAgentId),
        errorMessage,
      })
    );
    return false;
  }
};
