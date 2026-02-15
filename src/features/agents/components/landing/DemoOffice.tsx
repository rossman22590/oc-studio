"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { OfficeEnvironment, type DeskAgentInfo } from "../office3d/OfficeEnvironment";
import { AgentBoxes } from "../office3d/AgentBoxes";
import { RoomCameraBounds } from "../office3d/RoomCameraBounds";
import { DemoRobotPlayer } from "./DemoRobotPlayer";
import type { AgentBoxData } from "../AgentOfficeScene";

/* ─── Dummy agent data for demo ────────────────────────────── */

const DEMO_AGENTS: AgentBoxData[] = [
  {
    id: "demo-alpha",
    name: "Alpha",
    status: "working",
    color: "#FF6B9D",
    position: [-10, 0, -7.9],
    lastMessage: "Analyzing Q4 performance metrics...",
    hasNewMessage: false,
    outputLineCount: 12,
  },
  {
    id: "demo-beta",
    name: "Beta",
    status: "working",
    color: "#C96DD8",
    position: [-5, 0, -7.9],
    lastMessage: "Generating report for stakeholders",
    hasNewMessage: true,
    outputLineCount: 8,
  },
  {
    id: "demo-gamma",
    name: "Gamma",
    status: "idle",
    color: "#79A3FF",
    position: [5, 0, -7.9],
    lastMessage: "Waiting for next task",
    hasNewMessage: false,
    outputLineCount: 0,
  },
  {
    id: "demo-delta",
    name: "Delta",
    status: "working",
    color: "#FFB347",
    position: [10, 0, -7.9],
    lastMessage: "Processing API integration requests",
    hasNewMessage: false,
    outputLineCount: 15,
  },
  {
    id: "demo-epsilon",
    name: "Epsilon",
    status: "idle",
    color: "#77DD77",
    position: [-8, 0, 8],
    lastMessage: "Ready for assignment",
    hasNewMessage: false,
    outputLineCount: 0,
  },
];

const DEMO_DESK_AGENTS = new Map<string, DeskAgentInfo>([
  ["-10,-8", {
    name: "Alpha",
    status: "working",
    outputLineCount: 12,
    color: "#FF6B9D",
    monitorColor: "#FF6B9D",
  }],
  ["-5,-8", {
    name: "Beta",
    status: "working",
    outputLineCount: 8,
    color: "#C96DD8",
    monitorColor: "#C96DD8",
  }],
  ["10,-8", {
    name: "Delta",
    status: "working",
    outputLineCount: 15,
    color: "#FFB347",
    monitorColor: "#FFB347",
  }],
]);

export const DemoOffice = () => {
  return (
    <div className="relative w-full h-[600px] rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden">
      <Canvas
        camera={{
          position: [20, 18, 20],
          fov: 50,
        }}
        shadows
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[10, 20, 10]}
            intensity={1}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <pointLight position={[-10, 10, -10]} intensity={0.3} />

          {/* Office Environment */}
          <OfficeEnvironment
            agentCount={DEMO_AGENTS.length}
            runningCount={DEMO_AGENTS.filter((a) => a.status === "working").length}
            gatewayStatus="connected"
            totalMessages={DEMO_AGENTS.reduce((sum, a) => sum + a.outputLineCount, 0)}
            activityEntries={DEMO_AGENTS.slice(0, 6).map((a) => ({
              id: a.id,
              agentName: a.name,
              action: a.lastMessage || "Active",
              timestamp: Date.now(),
              status: a.status === "working" ? ("running" as const) : ("ok" as const),
            }))}
            deskAgents={DEMO_DESK_AGENTS}
            onOpenFileManager={() => {}}
            tvMuted={true}
            tvVolume={50}
            tvSkipSignal={0}
            kanbanCards={[]}
          />

          {/* Agent Boxes */}
          <AgentBoxes
            agents={DEMO_AGENTS}
            selectedAgentId={null}
            onSelectAgent={() => {}}
          />

          {/* RobotExpressive player character with auto-patrol */}
          <DemoRobotPlayer position={[0, 0, 2]} />

          {/* Camera is controlled by robot - no OrbitControls needed */}
          
          {/* Keep camera inside office bounds */}
          <RoomCameraBounds />
        </Suspense>
      </Canvas>

      {/* Overlay label */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
        <div className="rounded-lg border border-border/40 bg-background/80 backdrop-blur-sm px-3 py-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Interactive Demo</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/80 backdrop-blur-sm px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-muted-foreground">{DEMO_AGENTS.filter((a) => a.status === "working").length} Working</span>
          </div>
          <div className="h-3 w-px bg-border/40" />
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-xs text-muted-foreground">{DEMO_AGENTS.filter((a) => a.status === "idle").length} Idle</span>
          </div>
        </div>
      </div>
    </div>
  );
};
