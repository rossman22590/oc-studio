"use client";

import { AgentOfficeScene } from "@/features/agents/components/AgentOfficeScene";
import { AgentStoreProvider } from "@/features/agents/state/store";

export default function AgentOfficePage() {
  return (
    <AgentStoreProvider>
      <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-background touch-none hidden md:block">
        <AgentOfficeScene />
      </div>
      <div className="md:hidden flex items-center justify-center h-screen">
        <div className="text-center p-4">
          <p className="text-lg font-semibold mb-2">3D Office not available on mobile</p>
          <p className="text-sm text-muted-foreground mb-4">Please use a desktop or tablet to access the 3D office view.</p>
          <a href="/studio" className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition">
            Go to Studio
          </a>
        </div>
      </div>
    </AgentStoreProvider>
  );
}
