"use client";

import { Users, MessageSquare, Settings, Brain, FolderOpen } from "lucide-react";

type MobilePane = "fleet" | "chat" | "settings" | "brain";

type MobileBottomNavProps = {
  activePane: MobilePane;
  onPaneChange: (pane: MobilePane) => void;
  settingsDisabled?: boolean;
  brainDisabled?: boolean;
  hasRunningAgent?: boolean;
};

const navItems: Array<{
  pane: MobilePane;
  label: string;
  icon: typeof Users;
}> = [
  { pane: "fleet", label: "Fleet", icon: Users },
  { pane: "chat", label: "Chat", icon: MessageSquare },
  { pane: "settings", label: "Settings", icon: Settings },
  { pane: "brain", label: "Brain", icon: Brain },
];

export const MobileBottomNav = ({
  activePane,
  onPaneChange,
  settingsDisabled = false,
  brainDisabled = false,
  hasRunningAgent = false,
}: MobileBottomNavProps) => {
  return (
    <nav className="mobile-bottom-nav xl:hidden" data-testid="mobile-bottom-nav">
      <div className="grid grid-cols-4 gap-1">
        {navItems.map(({ pane, label, icon: Icon }) => {
          const disabled =
            (pane === "settings" && settingsDisabled) ||
            (pane === "brain" && brainDisabled);
          const isActive = activePane === pane;

          return (
            <button
              key={pane}
              type="button"
              disabled={disabled}
              onClick={() => onPaneChange(pane)}
              className={`relative flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 transition-all ${
                isActive
                  ? "bg-primary/12 text-primary"
                  : disabled
                    ? "text-muted-foreground/30"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {isActive ? (
                <span className="absolute inset-x-3 top-0 h-[2px] rounded-full bg-primary" />
              ) : null}
              <Icon className="h-5 w-5" />
              <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.12em]">
                {label}
              </span>
              {pane === "chat" && hasRunningAgent ? (
                <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
