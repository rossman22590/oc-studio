import { describe, expect, it, vi, beforeEach } from "vitest";

import { removeCronJobsForAgent } from "@/lib/cron/types";
import { deleteGatewayAgent } from "@/lib/gateway/agentConfig";
import { deleteAgentViaStudio } from "@/features/agents/operations/deleteAgentOperation";

vi.mock("@/lib/cron/types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron/types")>("@/lib/cron/types");
  return { ...actual, removeCronJobsForAgent: vi.fn() };
});

vi.mock("@/lib/gateway/agentConfig", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway/agentConfig")>(
    "@/lib/gateway/agentConfig"
  );
  return { ...actual, deleteGatewayAgent: vi.fn() };
});

type FetchJson = <T>(input: RequestInfo | URL, init?: RequestInit) => Promise<T>;

describe("delete agent via studio operation", () => {
  const mockedRemoveCronJobsForAgent = vi.mocked(removeCronJobsForAgent);
  const mockedDeleteGatewayAgent = vi.mocked(deleteGatewayAgent);

  beforeEach(() => {
    mockedRemoveCronJobsForAgent.mockReset();
    mockedDeleteGatewayAgent.mockReset();
  });

  it("runs_steps_in_order_on_success", async () => {
    const calls: string[] = [];
    const fetchJson: FetchJson = vi.fn(async (_input, init) => {
      if (init?.method === "POST") {
        calls.push("trash");
        return { result: { trashDir: "/tmp/trash", moved: [] } } as never;
      }
      throw new Error("Unexpected fetchJson call");
    });

    mockedRemoveCronJobsForAgent.mockImplementation(async () => {
      calls.push("removeCron");
      return 0;
    });
    mockedDeleteGatewayAgent.mockImplementation(async () => {
      calls.push("deleteGatewayAgent");
      return { removed: true, removedBindings: 0 };
    });

    await expect(
      deleteAgentViaStudio({ client: {} as never, agentId: "agent-1", fetchJson })
    ).resolves.toEqual({
      trashed: { trashDir: "/tmp/trash", moved: [] },
      restored: null,
    });

    expect(calls).toEqual(["trash", "removeCron", "deleteGatewayAgent"]);
  });

  it("attempts_restore_when_gateway_delete_fails_and_trash_moved_paths", async () => {
    const calls: string[] = [];
    const originalErr = new Error("boom");

    const fetchJson: FetchJson = vi.fn(async (_input, init) => {
      if (init?.method === "POST") {
        calls.push("trash");
        return {
          result: { trashDir: "/tmp/trash-2", moved: [{ from: "/a", to: "/b" }] },
        } as never;
      }
      if (init?.method === "PUT") {
        calls.push("restore");
        return { result: { restored: [] } } as never;
      }
      throw new Error("Unexpected fetchJson call");
    });

    mockedRemoveCronJobsForAgent.mockImplementation(async () => {
      calls.push("removeCron");
      return 0;
    });
    mockedDeleteGatewayAgent.mockImplementation(async () => {
      calls.push("deleteGatewayAgent");
      throw originalErr;
    });

    await expect(
      deleteAgentViaStudio({ client: {} as never, agentId: "agent-1", fetchJson })
    ).rejects.toBe(originalErr);

    expect(calls).toEqual(["trash", "removeCron", "deleteGatewayAgent", "restore"]);
  });
});
