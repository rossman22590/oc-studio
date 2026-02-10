"use client";

import { Bot, Wifi, MessageSquare, Activity } from "lucide-react";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  pulse?: boolean;
  accentClass?: string;
};

const StatCard = ({ icon, label, value, sub, pulse, accentClass = "text-primary" }: StatCardProps) => (
  <div className="stat-card group">
    <div className="flex items-center justify-between">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span className={`${accentClass} opacity-60 transition-opacity group-hover:opacity-100`}>
        {icon}
      </span>
    </div>
    <div className="mt-2 flex items-end gap-2">
      <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>
      {sub ? (
        <span className="mb-0.5 font-mono text-[10px] text-muted-foreground">{sub}</span>
      ) : null}
      {pulse ? (
        <span className="pulse-dot mb-1.5 ml-auto bg-emerald-400" />
      ) : null}
    </div>
  </div>
);

type StatsBarProps = {
  agentCount: number;
  runningCount: number;
  status: GatewayStatus;
  totalMessages: number;
};

export const StatsBar = ({ agentCount, runningCount, status, totalMessages }: StatsBarProps) => {
  const statusLabel =
    status === "connected"
      ? "Online"
      : status === "connecting"
        ? "Connecting…"
        : "Offline";

  const statusAccent =
    status === "connected"
      ? "text-emerald-400"
      : status === "connecting"
        ? "text-amber-400"
        : "text-muted-foreground";

  return (
    <div className="fade-up grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        icon={<Bot className="h-4 w-4" />}
        label="Agents"
        value={agentCount}
        sub={`${runningCount} active`}
      />
      <StatCard
        icon={<Wifi className="h-4 w-4" />}
        label="Gateway"
        value={statusLabel}
        pulse={status === "connected"}
        accentClass={statusAccent}
      />
      <StatCard
        icon={<MessageSquare className="h-4 w-4" />}
        label="Messages"
        value={totalMessages}
        sub="this session"
      />
      <StatCard
        icon={<Activity className="h-4 w-4" />}
        label="Active"
        value={runningCount}
        sub={runningCount > 0 ? "running now" : "idle"}
        accentClass={runningCount > 0 ? "text-primary" : "text-muted-foreground"}
      />
    </div>
  );
};
