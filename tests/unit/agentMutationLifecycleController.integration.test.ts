import { describe, expect, it, vi } from "vitest";

import {
  buildMutationSideEffectCommands,
  buildQueuedMutationBlock,
  resolveMutationStartGuard,
  resolvePendingSetupAutoRetryIntent,
} from "@/features/agents/operations/agentMutationLifecycleController";
import {
  resolveGuidedCreateCompletion,
  runGuidedCreateWorkflow,
} from "@/features/agents/operations/guidedCreateWorkflow";
import {
  resolveConfigMutationStatusLine,
  runConfigMutationWorkflow,
} from "@/features/agents/operations/configMutationWorkflow";
import type { AgentGuidedSetup } from "@/features/agents/operations/createAgentOperation";

const createSetup = (): AgentGuidedSetup => ({
  agentOverrides: {
    sandbox: { mode: "non-main", workspaceAccess: "ro" },
    tools: { profile: "coding", alsoAllow: ["group:runtime"], deny: ["group:web"] },
  },
  files: {
    "AGENTS.md": "# Mission",
  },
  execApprovals: {
    security: "allowlist",
    ask: "always",
    allowlist: [{ pattern: "/usr/bin/git" }],
  },
});

describe("agentMutationLifecycleController integration", () => {
  it("page create handler maps controller decisions to guided create flow side effects", async () => {
    const setup = createSetup();
    const guardDenied = resolveMutationStartGuard({
      status: "disconnected",
      hasCreateBlock: false,
      hasRenameBlock: false,
      hasDeleteBlock: false,
    });

    expect(guardDenied).toEqual({
      kind: "deny",
      reason: "not-connected",
    });

    const guardAllowed = resolveMutationStartGuard({
      status: "connected",
      hasCreateBlock: false,
      hasRenameBlock: false,
      hasDeleteBlock: false,
    });
    expect(guardAllowed).toEqual({ kind: "allow" });

    const queued = buildQueuedMutationBlock({
      kind: "create-agent",
      agentId: "",
      agentName: "Agent One",
      startedAt: 42,
    });
    expect(queued.phase).toBe("queued");

    const pendingByAgentId: Record<string, AgentGuidedSetup> = {};
    const result = await runGuidedCreateWorkflow(
      {
        name: "Agent One",
        setup,
        isLocalGateway: true,
      },
      {
        createAgent: async () => ({ id: "agent-1" }),
        applySetup: async () => {
          throw new Error("setup failed");
        },
        upsertPending: (agentId, nextSetup) => {
          pendingByAgentId[agentId] = nextSetup;
        },
        removePending: (agentId) => {
          delete pendingByAgentId[agentId];
        },
      }
    );

    const completion = resolveGuidedCreateCompletion({
      agentName: "Agent One",
      result,
    });

    expect(result.setupStatus).toBe("pending");
    expect(pendingByAgentId["agent-1"]).toEqual(setup);
    expect(completion.shouldReloadAgents).toBe(true);
    expect(completion.pendingErrorMessage).toContain("guided setup is pending");
  });

  it("page rename and delete handlers share lifecycle guard plus post-run transitions", async () => {
    const blocked = resolveMutationStartGuard({
      status: "connected",
      hasCreateBlock: true,
      hasRenameBlock: false,
      hasDeleteBlock: false,
    });
    expect(blocked).toEqual({
      kind: "deny",
      reason: "create-block-active",
    });

    const allowed = resolveMutationStartGuard({
      status: "connected",
      hasCreateBlock: false,
      hasRenameBlock: false,
      hasDeleteBlock: false,
    });
    expect(allowed).toEqual({ kind: "allow" });

    const executeMutation = vi.fn(async () => undefined);

    const renameCompleted = await runConfigMutationWorkflow(
      {
        kind: "rename-agent",
        isLocalGateway: false,
      },
      {
        executeMutation,
        shouldAwaitRemoteRestart: async () => false,
      }
    );
    expect(buildMutationSideEffectCommands({ disposition: renameCompleted.disposition })).toEqual([
      { kind: "reload-agents" },
      { kind: "clear-mutation-block" },
      { kind: "set-mobile-pane", pane: "chat" },
    ]);

    const deleteAwaitingRestart = await runConfigMutationWorkflow(
      {
        kind: "delete-agent",
        isLocalGateway: false,
      },
      {
        executeMutation,
        shouldAwaitRemoteRestart: async () => true,
      }
    );
    expect(buildMutationSideEffectCommands({ disposition: deleteAwaitingRestart.disposition })).toEqual(
      [{ kind: "patch-mutation-block", patch: { phase: "awaiting-restart", sawDisconnect: false } }]
    );
    expect(executeMutation).toHaveBeenCalledTimes(2);
  });

  it("page pending setup auto-retry effect only runs for controller retry intents", () => {
    const applyPendingCreateSetupForAgentId = vi.fn();

    const retryIntent = resolvePendingSetupAutoRetryIntent({
      status: "connected",
      agentsLoadedOnce: true,
      loadedScopeMatches: true,
      hasActiveCreateBlock: false,
      retryBusyAgentId: null,
      pendingSetupsByAgentId: {
        "agent-2": {},
      },
      knownAgentIds: new Set(["agent-2"]),
      attemptedAgentIds: new Set<string>(),
      inFlightAgentIds: new Set<string>(),
    });

    if (retryIntent.kind === "retry") {
      applyPendingCreateSetupForAgentId({
        agentId: retryIntent.agentId,
        source: "auto",
      });
    }
    expect(applyPendingCreateSetupForAgentId).toHaveBeenCalledTimes(1);

    const skipIntent = resolvePendingSetupAutoRetryIntent({
      status: "connected",
      agentsLoadedOnce: true,
      loadedScopeMatches: true,
      hasActiveCreateBlock: false,
      retryBusyAgentId: null,
      pendingSetupsByAgentId: {
        "agent-2": {},
      },
      knownAgentIds: new Set(["agent-2"]),
      attemptedAgentIds: new Set(["agent-2"]),
      inFlightAgentIds: new Set<string>(),
    });

    if (skipIntent.kind === "retry") {
      applyPendingCreateSetupForAgentId({
        agentId: skipIntent.agentId,
        source: "auto",
      });
    }
    expect(skipIntent).toEqual({
      kind: "skip",
      reason: "no-eligible-agent",
    });
    expect(applyPendingCreateSetupForAgentId).toHaveBeenCalledTimes(1);
  });

  it("uses typed mutation commands for lifecycle side effects instead of inline branching", async () => {
    const commandLog: string[] = [];
    const runCommands = async (
      disposition: "completed" | "awaiting-restart"
    ): Promise<{ phase: string; sawDisconnect: boolean } | null> => {
      let block: { phase: string; sawDisconnect: boolean } | null = {
        phase: "mutating",
        sawDisconnect: false,
      };
      for (const command of buildMutationSideEffectCommands({ disposition })) {
        if (command.kind === "reload-agents") {
          commandLog.push("reload");
          continue;
        }
        if (command.kind === "clear-mutation-block") {
          commandLog.push("clear");
          block = null;
          continue;
        }
        if (command.kind === "set-mobile-pane") {
          commandLog.push(`pane:${command.pane}`);
          continue;
        }
        commandLog.push(`patch:${command.patch.phase}`);
        block = {
          phase: command.patch.phase,
          sawDisconnect: command.patch.sawDisconnect,
        };
      }
      return block;
    };

    const completedBlock = await runCommands("completed");
    const awaitingBlock = await runCommands("awaiting-restart");

    expect(completedBlock).toBeNull();
    expect(awaitingBlock).toEqual({
      phase: "awaiting-restart",
      sawDisconnect: false,
    });
    expect(commandLog).toEqual(["reload", "clear", "pane:chat", "patch:awaiting-restart"]);
  });

  it("preserves lock-status text behavior across queued, mutating, and awaiting-restart phases", () => {
    expect(
      resolveConfigMutationStatusLine({
        block: { phase: "queued", sawDisconnect: false },
        status: "connected",
      })
    ).toBe("Waiting for active runs to finish");

    expect(
      resolveConfigMutationStatusLine({
        block: { phase: "mutating", sawDisconnect: false },
        status: "connected",
      })
    ).toBe("Submitting config change");

    expect(
      resolveConfigMutationStatusLine({
        block: { phase: "awaiting-restart", sawDisconnect: false },
        status: "connected",
      })
    ).toBe("Waiting for gateway to restart");

    expect(
      resolveConfigMutationStatusLine({
        block: { phase: "awaiting-restart", sawDisconnect: true },
        status: "disconnected",
      })
    ).toBe("Gateway restart in progress");

    expect(
      resolveConfigMutationStatusLine({
        block: { phase: "awaiting-restart", sawDisconnect: true },
        status: "connected",
      })
    ).toBe("Gateway is back online, syncing agents");
  });
});
