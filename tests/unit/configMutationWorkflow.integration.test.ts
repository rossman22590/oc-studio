import { describe, expect, it } from "vitest";
import {
  buildConfigMutationFailureMessage,
  resolveConfigMutationStatusLine,
  resolveConfigMutationPostRunEffects,
  runConfigMutationWorkflow,
} from "@/features/agents/operations/configMutationWorkflow";
import { shouldStartNextConfigMutation } from "@/features/agents/operations/configMutationGatePolicy";

describe("configMutationWorkflow integration", () => {
  it("delete workflow maps awaiting-restart outcome to awaiting-restart block phase", async () => {
    const result = await runConfigMutationWorkflow(
      { kind: "delete-agent", isLocalGateway: false },
      {
        executeMutation: async () => undefined,
        shouldAwaitRemoteRestart: async () => true,
      }
    );

    const effects = resolveConfigMutationPostRunEffects(result);
    expect(effects).toEqual({
      shouldReloadAgents: false,
      shouldClearBlock: false,
      awaitingRestartPatch: {
        phase: "awaiting-restart",
        sawDisconnect: false,
      },
    });
  });

  it("rename workflow maps completed outcome to load-and-clear flow", async () => {
    const result = await runConfigMutationWorkflow(
      { kind: "rename-agent", isLocalGateway: false },
      {
        executeMutation: async () => undefined,
        shouldAwaitRemoteRestart: async () => false,
      }
    );

    const effects = resolveConfigMutationPostRunEffects(result);
    let didLoadAgents = false;
    let block: { phase: string; sawDisconnect: boolean } | null = {
      phase: "mutating",
      sawDisconnect: false,
    };
    if (effects.shouldReloadAgents) {
      didLoadAgents = true;
    }
    if (effects.shouldClearBlock) {
      block = null;
    }

    expect(didLoadAgents).toBe(true);
    expect(block).toBeNull();
    expect(effects.awaitingRestartPatch).toBeNull();
  });

  it("workflow errors clear block and set page error message", async () => {
    let block: { phase: string; sawDisconnect: boolean } | null = {
      phase: "mutating",
      sawDisconnect: false,
    };
    let errorMessage: string | null = null;

    try {
      await runConfigMutationWorkflow(
        { kind: "rename-agent", isLocalGateway: false },
        {
          executeMutation: async () => {
            throw new Error("rename exploded");
          },
          shouldAwaitRemoteRestart: async () => false,
        }
      );
    } catch (error) {
      block = null;
      errorMessage = buildConfigMutationFailureMessage({
        kind: "rename-agent",
        error,
      });
    }

    expect(block).toBeNull();
    expect(errorMessage).toBe("rename exploded");
  });

  it("preserves queue gating when restart block is active", () => {
    expect(
      shouldStartNextConfigMutation({
        status: "connected",
        hasRunningAgents: false,
        hasActiveMutation: false,
        hasRestartBlockInProgress: true,
        queuedCount: 1,
      })
    ).toBe(false);

    expect(
      shouldStartNextConfigMutation({
        status: "connected",
        hasRunningAgents: false,
        hasActiveMutation: false,
        hasRestartBlockInProgress: false,
        queuedCount: 1,
      })
    ).toBe(true);
  });

  it("preserves lock-screen status text parity across queued/mutating/awaiting phases", () => {
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
