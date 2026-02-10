import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { fetchJson as defaultFetchJson } from "@/lib/http";
import { removeCronJobsForAgent } from "@/lib/cron/types";
import { deleteGatewayAgent } from "@/lib/gateway/agentConfig";
import {
  runDeleteAgentTransaction,
  type DeleteAgentTransactionResult,
  type RestoreAgentStateResult,
  type TrashAgentStateResult,
} from "@/features/agents/operations/deleteAgentTransaction";

type FetchJson = typeof defaultFetchJson;

export const deleteAgentViaStudio = async (params: {
  client: GatewayClient;
  agentId: string;
  fetchJson?: FetchJson;
  logError?: (message: string, error: unknown) => void;
}): Promise<DeleteAgentTransactionResult> => {
  const fetchJson = params.fetchJson ?? defaultFetchJson;
  const logError = params.logError ?? ((message, error) => console.error(message, error));

  return runDeleteAgentTransaction(
    {
      trashAgentState: async (agentId) => {
        const { result } = await fetchJson<{ result: TrashAgentStateResult }>(
          "/api/gateway/agent-state",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ agentId }),
          }
        );
        return result;
      },
      restoreAgentState: async (agentId, trashDir) => {
        const { result } = await fetchJson<{ result: RestoreAgentStateResult }>(
          "/api/gateway/agent-state",
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ agentId, trashDir }),
          }
        );
        return result;
      },
      removeCronJobsForAgent: async (agentId) => {
        await removeCronJobsForAgent(params.client, agentId);
      },
      deleteGatewayAgent: async (agentId) => {
        await deleteGatewayAgent({ client: params.client, agentId });
      },
      logError,
    },
    params.agentId
  );
};

