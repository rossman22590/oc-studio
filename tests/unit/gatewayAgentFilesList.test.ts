import { describe, expect, it, vi } from "vitest";

import { listGatewayAgentFiles } from "@/lib/gateway/agentFiles";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";

const createMockClient = (handler: (method: string, params: unknown) => unknown) => {
  return { call: vi.fn(async (method: string, params: unknown) => handler(method, params)) } as unknown as GatewayClient;
};

describe("listGatewayAgentFiles", () => {
  it("strips workspace root when gateway returns absolute paths and a workspace field", async () => {
    const client = createMockClient((method) => {
      if (method === "agents.files.list") {
        return {
          agentId: "new-agent-2",
          workspace: "/home/daytona/.openclaw/workspace-new-agent-2",
          files: [
            {
              name: "AGENTS.md",
              path: "/home/daytona/.openclaw/workspace-new-agent-2/AGENTS.md",
              isDirectory: false,
              size: 123,
              updatedAtMs: 1,
            },
          ],
        };
      }
      throw new Error(`Unexpected method: ${method}`);
    });

    const result = await listGatewayAgentFiles({ client, agentId: "new-agent-2" });
    expect(result.path).toBe("");
    expect(result.entries).toEqual([
      {
        name: "AGENTS.md",
        path: "AGENTS.md",
        isDirectory: false,
        size: 123,
        updatedAtMs: 1,
      },
    ]);
  });
});

