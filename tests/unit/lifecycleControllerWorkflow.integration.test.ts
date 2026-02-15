import { describe, expect, it } from "vitest";

import type { PendingExecApproval } from "@/features/agents/approvals/types";
import { resolveExecApprovalFollowUpIntent } from "@/features/agents/approvals/execApprovalLifecycleWorkflow";
import {
  beginPendingGuidedSetupRetry,
  selectNextPendingGuidedSetupRetryAgentId,
} from "@/features/agents/creation/pendingSetupRetry";
import {
  runPendingSetupRetryLifecycle,
  shouldAttemptPendingSetupAutoRetry,
} from "@/features/agents/operations/pendingSetupLifecycleWorkflow";
import type { AgentGuidedSetup } from "@/features/agents/operations/createAgentOperation";
import type { AgentState } from "@/features/agents/state/store";

const createAgent = (agentId: string, sessionKey: string): AgentState => ({
  agentId,
  name: agentId,
  sessionKey,
  status: "idle",
  sessionCreated: true,
  awaitingUserInput: false,
  hasUnseenActivity: false,
  outputLines: [],
  lastResult: null,
  lastDiff: null,
  runId: null,
  runStartedAt: null,
  streamText: null,
  thinkingTrace: null,
  latestOverride: null,
  latestOverrideKind: null,
  lastAssistantMessageAt: null,
  lastActivityAt: null,
  latestPreview: null,
  lastUserMessage: null,
  draft: "",
  sessionSettingsSynced: true,
  historyLoadedAt: null,
  historyFetchLimit: null,
  historyFetchedCount: null,
  historyMaybeTruncated: false,
  toolCallingEnabled: true,
  showThinkingTraces: true,
  model: "openai/gpt-5",
  thinkingLevel: "medium",
  avatarSeed: agentId,
  avatarUrl: null,
});

const createApproval = (): PendingExecApproval => ({
  id: "approval-1",
  agentId: null,
  sessionKey: "agent:agent-1:main",
  command: "npm run test",
  cwd: "/repo",
  host: "gateway",
  security: "allowlist",
  ask: "always",
  resolvedPath: "/usr/bin/npm",
  createdAtMs: 1,
  expiresAtMs: 2,
  resolving: false,
  error: null,
});

const createSetup = (): AgentGuidedSetup => ({
  agentOverrides: {
    sandbox: { mode: "non-main", workspaceAccess: "ro" },
    tools: { profile: "coding", alsoAllow: ["group:runtime"], deny: [] },
  },
  files: {},
  execApprovals: null,
});

describe("lifecycleControllerWorkflow integration", () => {
  it("pending setup auto-retry path preserves existing guard semantics", () => {
    const shouldRun = shouldAttemptPendingSetupAutoRetry({
      status: "connected",
      agentsLoadedOnce: true,
      loadedScopeMatches: true,
      hasActiveCreateBlock: false,
      retryBusyAgentId: null,
    });
    expect(shouldRun).toBe(true);

    const inFlightAgentIds = new Set<string>();
    const pendingSetupsByAgentId = { "agent-1": createSetup() };
    const targetAgentId = selectNextPendingGuidedSetupRetryAgentId({
      pendingSetupsByAgentId,
      knownAgentIds: new Set(["agent-1"]),
      attemptedAgentIds: new Set(),
      inFlightAgentIds,
    });
    expect(targetAgentId).toBe("agent-1");

    const startedFirst = beginPendingGuidedSetupRetry(inFlightAgentIds, "agent-1");
    const startedSecond = beginPendingGuidedSetupRetry(inFlightAgentIds, "agent-1");
    expect(startedFirst).toBe(true);
    expect(startedSecond).toBe(false);
  });

  it("manual retry failure still clears busy state and surfaces user error", async () => {
    let busyAgentId: string | null = null;
    let surfacedError: string | null = null;

    const runManualRetry = async (agentId: string) => {
      busyAgentId = agentId;
      try {
        return await runPendingSetupRetryLifecycle(
          { agentId, source: "manual" },
          {
            executeRetry: async () => {
              throw new Error("setup exploded");
            },
            isDisconnectLikeError: () => false,
            resolveAgentName: () => "Agent One",
            onApplied: async () => undefined,
            onError: (message) => {
              surfacedError = message;
            },
          }
        );
      } finally {
        busyAgentId = busyAgentId === agentId ? null : busyAgentId;
      }
    };

    const applied = await runManualRetry("agent-1");
    expect(applied).toBe(false);
    expect(busyAgentId).toBeNull();
    expect(surfacedError).toBe('Guided setup retry failed for "Agent One". setup exploded');
  });

  it("allow-once and allow-always still trigger follow-up message send once", () => {
    const approval = createApproval();
    const agents = [createAgent("agent-1", "agent:agent-1:main")];
    let sendCount = 0;

    for (const decision of ["allow-once", "allow-always"] as const) {
      const intent = resolveExecApprovalFollowUpIntent({
        decision,
        approval,
        agents,
        followUpMessage: "An exec approval was granted.",
      });
      if (intent.shouldSend) {
        sendCount += 1;
      }
    }

    expect(sendCount).toBe(2);
  });

  it("deny decision does not trigger follow-up message send", () => {
    const intent = resolveExecApprovalFollowUpIntent({
      decision: "deny",
      approval: createApproval(),
      agents: [createAgent("agent-1", "agent:agent-1:main")],
      followUpMessage: "An exec approval was granted.",
    });

    expect(intent).toEqual({
      shouldSend: false,
      agentId: null,
      sessionKey: null,
      message: null,
    });
  });
});
