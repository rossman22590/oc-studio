"use client";

import { Zap, Pause, AlertTriangle } from "lucide-react";
import type { AgentState } from "@/features/agents/state/store";
import { buildAvatarDataUrl } from "@/lib/avatars/multiavatar";

type AgentQuickCardProps = {
  agent: AgentState;
  isSelected: boolean;
  onSelect: (agentId: string) => void;
};

const AgentQuickCard = ({ agent, isSelected, onSelect }: AgentQuickCardProps) => {
  const avatarSeed = agent.avatarSeed || agent.agentId;
  const avatarUrl = buildAvatarDataUrl(avatarSeed);
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";

  return (
    <button
      type="button"
      onClick={() => onSelect(agent.agentId)}
      className={`stat-card group flex items-center gap-3 text-left transition-all ${
        isSelected
          ? "border-primary/50 shadow-[0_0_20px_-6px] shadow-primary/20"
          : ""
      }`}
    >
      <div className="relative shrink-0">
        <img
          src={avatarUrl}
          alt=""
          className={`h-9 w-9 rounded-lg transition-shadow ${
            isSelected ? "ring-2 ring-primary/60 ring-offset-1 ring-offset-background" : ""
          }`}
        />
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
            isRunning ? "bg-emerald-400" : isError ? "bg-red-400" : "bg-muted-foreground/40"
          }`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-foreground">
            {agent.name}
          </span>
          {isRunning ? (
            <Zap className="h-3 w-3 shrink-0 text-primary" />
          ) : isError ? (
            <AlertTriangle className="h-3 w-3 shrink-0 text-red-400" />
          ) : null}
        </div>
        <p className="truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {isRunning ? "Active" : agent.status === "idle" ? "Idle" : agent.status}
        </p>
      </div>
    </button>
  );
};

type AgentQuickCardsProps = {
  agents: AgentState[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
};

export const AgentQuickCards = ({ agents, selectedAgentId, onSelectAgent }: AgentQuickCardsProps) => {
  if (agents.length === 0) return null;

  return (
    <div className="fade-up grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {agents.slice(0, 6).map((agent) => (
        <AgentQuickCard
          key={agent.agentId}
          agent={agent}
          isSelected={agent.agentId === selectedAgentId}
          onSelect={onSelectAgent}
        />
      ))}
    </div>
  );
};
