"use client";

import { AgentOfficeScene } from "@/features/agents/components/AgentOfficeScene";
import { AgentStoreProvider } from "@/features/agents/state/store";

export default function AgentOfficePage() {
  return (
    <AgentStoreProvider>
      <div className="h-screen w-screen overflow-hidden bg-background">
        <AgentOfficeScene />
      </div>
    </AgentStoreProvider>
  );
}
