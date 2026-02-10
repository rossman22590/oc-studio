import { ThemeToggle } from "@/components/theme-toggle";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import { Brain, Ellipsis, Cable, FolderOpen, Home, PanelLeftClose, PanelLeftOpen, PanelRightClose } from "lucide-react";
import Link from "next/link";

type HeaderBarProps = {
  status: GatewayStatus;
  onConnectionSettings: () => void;
  onBrainFiles: () => void;
  brainFilesOpen: boolean;
  brainDisabled?: boolean;
  showFilesButton?: boolean;
  showHomeButton?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  rightPanelOpen?: boolean;
  onCloseRightPanel?: () => void;
};

export const HeaderBar = ({
  status,
  onConnectionSettings,
  onBrainFiles,
  brainFilesOpen,
  brainDisabled = false,
  showFilesButton = true,
  showHomeButton = false,
  sidebarCollapsed = false,
  onToggleSidebar,
  rightPanelOpen = false,
  onCloseRightPanel,
}: HeaderBarProps) => {
  return (
    <div className="glass-panel fade-up relative overflow-hidden px-4 py-2">
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
          <button
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
              brainFilesOpen
                ? "border-border bg-muted text-foreground"
                : "border-input/90 bg-background/75 text-foreground hover:border-ring hover:bg-card"
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
            <div className="absolute right-0 top-11 z-20 min-w-44 rounded-md border border-border/80 bg-popover/95 p-1 shadow-lg backdrop-blur">
              <button
                className="w-full rounded-sm px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-foreground transition hover:bg-muted"
                type="button"
                onClick={(event) => {
                  onConnectionSettings();
                  (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute(
                    "open"
                  );
                }}
                data-testid="gateway-settings-toggle"
              >
                Gateway Connection
              </button>
            </div>
          </details>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
};
