import { describe, expect, it, vi } from "vitest";
import {
  buildPendingSetupRetryErrorMessage,
  runPendingSetupRetryLifecycle,
  shouldAttemptPendingSetupAutoRetry,
  shouldSuppressPendingSetupRetryError,
} from "@/features/agents/operations/pendingSetupLifecycleWorkflow";

describe("pendingSetupLifecycleWorkflow", () => {
  it("allows auto-retry only when connected, loaded, and not blocked", () => {
    expect(
      shouldAttemptPendingSetupAutoRetry({
        status: "connected",
        agentsLoadedOnce: true,
        loadedScopeMatches: true,
        hasActiveCreateBlock: false,
        retryBusyAgentId: null,
      })
    ).toBe(true);

    expect(
      shouldAttemptPendingSetupAutoRetry({
        status: "connecting",
        agentsLoadedOnce: true,
        loadedScopeMatches: true,
        hasActiveCreateBlock: false,
        retryBusyAgentId: null,
      })
    ).toBe(false);
    expect(
      shouldAttemptPendingSetupAutoRetry({
        status: "connected",
        agentsLoadedOnce: false,
        loadedScopeMatches: true,
        hasActiveCreateBlock: false,
        retryBusyAgentId: null,
      })
    ).toBe(false);
    expect(
      shouldAttemptPendingSetupAutoRetry({
        status: "connected",
        agentsLoadedOnce: true,
        loadedScopeMatches: false,
        hasActiveCreateBlock: false,
        retryBusyAgentId: null,
      })
    ).toBe(false);
    expect(
      shouldAttemptPendingSetupAutoRetry({
        status: "connected",
        agentsLoadedOnce: true,
        loadedScopeMatches: true,
        hasActiveCreateBlock: true,
        retryBusyAgentId: null,
      })
    ).toBe(false);
    expect(
      shouldAttemptPendingSetupAutoRetry({
        status: "connected",
        agentsLoadedOnce: true,
        loadedScopeMatches: true,
        hasActiveCreateBlock: false,
        retryBusyAgentId: "agent-1",
      })
    ).toBe(false);
  });

  it("resolves manual retry failure message with agent name and original error", () => {
    expect(
      buildPendingSetupRetryErrorMessage({
        source: "manual",
        agentName: "Agent One",
        errorMessage: "setup exploded",
      })
    ).toBe('Guided setup retry failed for "Agent One". setup exploded');
  });

  it("suppresses auto-retry disconnect-like failures without surfacing user error", () => {
    expect(
      shouldSuppressPendingSetupRetryError({
        source: "auto",
        disconnectLike: true,
      })
    ).toBe(true);

    expect(
      shouldSuppressPendingSetupRetryError({
        source: "manual",
        disconnectLike: true,
      })
    ).toBe(false);

    expect(
      shouldSuppressPendingSetupRetryError({
        source: "auto",
        disconnectLike: false,
      })
    ).toBe(false);
  });

  it("rejects empty agent id before retry side effects", async () => {
    const executeRetry = vi.fn(async () => ({ applied: true }));
    const onApplied = vi.fn(async () => undefined);
    const onError = vi.fn();

    const result = await runPendingSetupRetryLifecycle(
      {
        agentId: "   ",
        source: "manual",
      },
      {
        executeRetry,
        isDisconnectLikeError: () => false,
        resolveAgentName: () => "unused",
        onApplied,
        onError,
      }
    );

    expect(result).toBe(false);
    expect(executeRetry).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
