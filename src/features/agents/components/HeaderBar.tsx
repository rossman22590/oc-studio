"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect, useState } from "react";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import { Brain, Ellipsis, Cable, FolderOpen, Home, PanelLeftClose, PanelLeftOpen, PanelRightClose, Box, Zap, MessageSquare, LayoutGrid } from "lucide-react";
import Link from "next/link";

type HeaderBarProps = {
  status: GatewayStatus;
  onConnectionSettings: () => void;
  onBrainFiles: () => void;
  brainFilesOpen: boolean;
  brainDisabled?: boolean;
  showFilesButton?: boolean;
  showHomeButton?: boolean;
  showSwarmButton?: boolean;
  swarmDisabled?: boolean;
  onSwarm?: () => void;
  showChatroomButton?: boolean;
  chatroomDisabled?: boolean;
  onChatroom?: () => void;
  showKanbanButton?: boolean;
  kanbanDisabled?: boolean;
  onKanban?: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  rightPanelOpen?: boolean;
  onCloseRightPanel?: () => void;
  showConnectionSettings?: boolean;
};

const ACCENT_STORAGE_KEY = "openclaw.ui.accent";

type AccentPreset = {
  id: string;
  name: string;
  primary: string;
  accent: string;
  swatch: string;
};

const ACCENT_PRESETS: AccentPreset[] = [
  { id: "magenta", name: "Magenta", primary: "oklch(0.60 0.24 335)", accent: "oklch(0.55 0.18 300)", swatch: "#d946ef" },
  { id: "violet", name: "Violet", primary: "oklch(0.62 0.24 292)", accent: "oklch(0.56 0.18 275)", swatch: "#8b5cf6" },
  { id: "indigo", name: "Indigo", primary: "oklch(0.60 0.19 270)", accent: "oklch(0.56 0.16 255)", swatch: "#6366f1" },
  { id: "blue", name: "Blue", primary: "oklch(0.62 0.20 256)", accent: "oklch(0.58 0.16 230)", swatch: "#3b82f6" },
  { id: "cyan", name: "Cyan", primary: "oklch(0.66 0.15 220)", accent: "oklch(0.61 0.12 205)", swatch: "#06b6d4" },
  { id: "teal", name: "Teal", primary: "oklch(0.64 0.16 190)", accent: "oklch(0.58 0.14 170)", swatch: "#14b8a6" },
  { id: "emerald", name: "Emerald", primary: "oklch(0.66 0.18 154)", accent: "oklch(0.60 0.14 142)", swatch: "#10b981" },
  { id: "lime", name: "Lime", primary: "oklch(0.74 0.18 130)", accent: "oklch(0.68 0.14 118)", swatch: "#84cc16" },
  { id: "amber", name: "Amber", primary: "oklch(0.76 0.18 82)", accent: "oklch(0.70 0.14 70)", swatch: "#f59e0b" },
  { id: "orange", name: "Orange", primary: "oklch(0.72 0.19 55)", accent: "oklch(0.66 0.16 45)", swatch: "#f97316" },
  { id: "red", name: "Red", primary: "oklch(0.62 0.23 28)", accent: "oklch(0.57 0.18 20)", swatch: "#ef4444" },
  { id: "rose", name: "Rose", primary: "oklch(0.64 0.22 14)", accent: "oklch(0.58 0.17 8)", swatch: "#f43f5e" },
];

const applyAccentPreset = (preset: AccentPreset) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--primary", preset.primary);
  root.style.setProperty("--accent", preset.accent);
  root.style.setProperty("--ring", preset.primary);
  root.style.setProperty("--chart-1", preset.primary);
  root.style.setProperty("--chart-2", preset.accent);
  root.style.setProperty("--sidebar-primary", preset.primary);
  root.style.setProperty("--sidebar-ring", preset.primary);
};

export const HeaderBar = ({
  status,
  onConnectionSettings,
  onBrainFiles,
  brainFilesOpen,
  brainDisabled = false,
<<<<<<< HEAD
  showFilesButton = true,
  showHomeButton = false,
  showSwarmButton = true,
  swarmDisabled = false,
  onSwarm,
  showChatroomButton = true,
  chatroomDisabled = false,
  onChatroom,
  showKanbanButton = true,
  kanbanDisabled = false,
  onKanban,
  sidebarCollapsed = false,
  onToggleSidebar,
  rightPanelOpen = false,
  onCloseRightPanel,
}: HeaderBarProps) => {
  const [selectedAccentId, setSelectedAccentId] = useState<string | null>(null);
  const [accentReady, setAccentReady] = useState(false);

  useEffect(() => {
    try {
      const storedAccentId = localStorage.getItem(ACCENT_STORAGE_KEY);
      const fallbackId = ACCENT_PRESETS[0]?.id ?? "magenta";
      const resolvedId = ACCENT_PRESETS.some((entry) => entry.id === storedAccentId)
        ? (storedAccentId as string)
        : fallbackId;
      setSelectedAccentId(resolvedId);
      const preset = ACCENT_PRESETS.find((entry) => entry.id === resolvedId);
      if (preset) applyAccentPreset(preset);
    } catch {
      setSelectedAccentId(ACCENT_PRESETS[0]?.id ?? "magenta");
    } finally {
      setAccentReady(true);
    }
  }, []);

  useEffect(() => {
    if (!accentReady || !selectedAccentId) return;
    const preset = ACCENT_PRESETS.find((entry) => entry.id === selectedAccentId);
    if (!preset) return;
    applyAccentPreset(preset);
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, preset.id);
    } catch {
      // ignore localStorage errors
    }
  }, [accentReady, selectedAccentId]);

  return (
    <div className="glass-panel fade-up relative z-[120] overflow-visible px-4 py-2">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,color-mix(in_oklch,var(--primary)_7%,transparent)_48%,transparent_100%)] opacity-55" />
      <div className="relative grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 flex items-center gap-2">
          <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0">
            <img src="/logo.png" alt="MachineClaw" className="h-8 w-8 sm:h-10 sm:w-10" />
            <p className="console-title text-2xl leading-none text-foreground sm:text-3xl">
              MachineClaw
            </p>
          </Link>
        </div>

        <div className="flex items-center justify-end gap-2">
          {/* Sidebar toggle — desktop only */}
          {onToggleSidebar ? (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="hidden xl:flex items-center gap-1.5 rounded-md border border-input/90 bg-background/75 px-2.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-ring hover:bg-card"
              title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
              data-testid="sidebar-toggle"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          ) : null}
          {/* Close right panel — desktop only, visible when brain/settings open */}
          {rightPanelOpen && onCloseRightPanel ? (
            <button
              type="button"
              onClick={onCloseRightPanel}
              className="hidden xl:flex items-center gap-1.5 rounded-md border border-input/90 bg-background/75 px-2.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-ring hover:bg-card"
              title="Close side panel"
              data-testid="close-right-panel"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          ) : null}
          {status === "connecting" ? (
            <span
              className="inline-flex items-center rounded-md border border-border/70 bg-secondary px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-secondary-foreground"
              data-testid="gateway-connecting-indicator"
            >
              Connecting
            </span>
          ) : null}
          <button
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
              status === "connected"
                ? "border-green-500/50 bg-green-500/15 text-foreground hover:border-green-500 hover:bg-green-500/20"
                : "border-input/90 bg-background/75 text-foreground hover:border-ring hover:bg-card"
            }`}
            type="button"
            onClick={onConnectionSettings}
            data-testid="connect-button"
          >
            {status === "connected" ? (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                Connected
              </>
            ) : (
              <>
                <Cable className="h-4 w-4" />
                Connect
              </>
            )}
          </button>
          {showHomeButton && (
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md border border-input/90 bg-background/75 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-ring hover:bg-card"
              data-testid="home-link"
            >
              <Home className="h-4 w-4" />
              Home
            </Link>
          )}
          {showFilesButton && (
            <Link
              href="/file-manager"
              className="flex items-center gap-2 rounded-md border border-input/90 bg-background/75 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-ring hover:bg-card"
              data-testid="file-manager-link"
            >
              <FolderOpen className="h-4 w-4" />
              Files
            </Link>
          )}
          <Link
            href="/agent-office"
            className="flex items-center gap-2 rounded-md border border-input/90 bg-background/75 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-ring hover:bg-card"
            data-testid="agent-office-link"
          >
            <Box className="h-4 w-4" />
            Office
          </Link>
          {showChatroomButton && onChatroom ? (
            <button
              className="flex items-center gap-2 rounded-md border border-primary/50 bg-white dark:bg-white/95 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary transition hover:border-primary hover:bg-primary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              onClick={onChatroom}
              data-testid="chatroom-button"
              disabled={chatroomDisabled}
              aria-label="Open chatroom"
              tabIndex={0}
            >
              <MessageSquare className="h-4 w-4" />
              Chat
            </button>
          ) : null}
          {showKanbanButton && onKanban ? (
            <button
              className="flex items-center gap-2 rounded-md border border-primary/50 bg-white dark:bg-white/95 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary transition hover:border-primary hover:bg-primary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              onClick={onKanban}
              data-testid="kanban-button"
              disabled={kanbanDisabled}
              aria-label="Open kanban board"
              tabIndex={0}
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </button>
          ) : null}
          {showSwarmButton && onSwarm ? (
            <button
              className="flex items-center gap-2 rounded-md border border-primary/50 bg-white dark:bg-white/95 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary transition hover:border-primary hover:bg-primary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              onClick={onSwarm}
              data-testid="swarm-dispatch-button"
              disabled={swarmDisabled}
            >
              <Zap className="h-4 w-4" />
              Swarm
            </button>
          ) : null}
          <button
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
              brainFilesOpen
                ? "border-border bg-surface-2 text-foreground"
                : "border-input/90 bg-surface-3 text-foreground hover:border-border hover:bg-surface-2"
            }`}
            type="button"
            onClick={onBrainFiles}
            data-testid="brain-files-toggle"
            disabled={brainDisabled}
          >
            <Brain className="h-4 w-4" />
            Brain
          </button>
          <details className="group relative">
            <summary
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-input/80 bg-background/70 text-muted-foreground transition hover:border-ring hover:bg-card hover:text-foreground [&::-webkit-details-marker]:hidden"
              data-testid="studio-menu-toggle"
            >
              <Ellipsis className="h-4 w-4" />
              <span className="sr-only">Open studio menu</span>
            </summary>
            <div className="absolute right-0 top-11 z-[220] min-w-44 rounded-md border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur">
              {showConnectionSettings ? (
                <button
                  className="w-full rounded-sm px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-foreground transition hover:bg-muted"
                  type="button"
                  onClick={() => {
                    onConnectionSettings();
                  }}
                  data-testid="gateway-settings-toggle"
                >
                  Gateway Connection
                </button>
              ) : null}
              <div className="my-1 border-t border-border/80" />
              <div className="px-2 pb-1 pt-1">
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Accent Color
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {ACCENT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      aria-label={`Set accent color to ${preset.name}`}
                      title={preset.name}
                      onClick={() => setSelectedAccentId(preset.id)}
                      className={`h-7 w-7 rounded-full border-2 transition hover:scale-105 ${
                        selectedAccentId === preset.id
                          ? "border-foreground shadow-sm"
                          : "border-border/80"
                      }`}
                      style={{ backgroundColor: preset.swatch }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </details>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
};
