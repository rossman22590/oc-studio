"use client";

import { Clock } from "lucide-react";

export type ActivityEntry = {
  id: string;
  agentName: string;
  action: string;
  timestamp: number;
  status: "ok" | "error" | "running" | "pending";
};

const statusDot: Record<ActivityEntry["status"], string> = {
  ok: "bg-emerald-400",
  error: "bg-red-400",
  running: "bg-primary animate-pulse",
  pending: "bg-amber-400",
};

const statusLabel: Record<ActivityEntry["status"], string> = {
  ok: "OK",
  error: "ERR",
  running: "RUN",
  pending: "WAIT",
};

const formatTimeAgo = (ts: number) => {
  const delta = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
};

type ActivityFeedProps = {
  entries: ActivityEntry[];
  maxItems?: number;
};

export const ActivityFeed = ({ entries, maxItems = 8 }: ActivityFeedProps) => {
  const visible = entries.slice(0, maxItems);

  return (
    <div className="glass-panel fade-up-delay flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <Clock className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
          Recent Activity
        </span>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground">
          {entries.length} events
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-4 py-6 text-center font-mono text-[11px] text-muted-foreground">
            No recent activity
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {visible.map((entry) => (
              <div key={entry.id} className="activity-row">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${statusDot[entry.status]}`}
                  title={statusLabel[entry.status]}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-foreground">
                      {entry.agentName}
                    </span>
                    <span className="shrink-0 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                      {statusLabel[entry.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {entry.action}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">
                  {formatTimeAgo(entry.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
