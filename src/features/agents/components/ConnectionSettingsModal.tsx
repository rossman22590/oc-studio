import { useEffect, useRef } from "react";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import { X } from "lucide-react";

type ConnectionSettingsModalProps = {
  isOpen: boolean;
  gatewayUrl: string;
  token: string;
  status: GatewayStatus;
  error: string | null;
  onClose: () => void;
  onGatewayUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

const statusStyles: Record<GatewayStatus, { label: string; className: string }> = {
  disconnected: {
    label: "Disconnected",
    className: "border border-border/70 bg-muted text-muted-foreground",
  },
  connecting: {
    label: "Connecting",
    className: "border border-border/70 bg-secondary text-secondary-foreground",
  },
  connected: {
    label: "Connected",
    className: "border border-primary/30 bg-primary/15 text-foreground",
  },
};

export const ConnectionSettingsModal = ({
  isOpen,
  gatewayUrl,
  token,
  status,
  error,
  onClose,
  onGatewayUrlChange,
  onTokenChange,
  onConnect,
  onDisconnect,
}: ConnectionSettingsModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const statusConfig = statusStyles[status];
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connection-modal-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-2xl rounded-lg border border-border bg-card/95 p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2
              id="connection-modal-title"
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              Gateway Connection
            </h2>
            <p className="mt-1 text-lg font-semibold text-foreground">
              Connect to your OpenClaw Gateway
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input/80 bg-background/70 p-2 text-muted-foreground transition hover:border-ring hover:bg-card hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status Badge */}
        <div className="mb-6 flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-md px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] ${statusConfig.className}`}
          >
            {statusConfig.label}
          </span>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Gateway URL
            </span>
            <input
              className="h-12 rounded-md border border-input bg-background/75 px-4 font-mono text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              type="text"
              value={gatewayUrl}
              onChange={(event) => onGatewayUrlChange(event.target.value)}
              placeholder="wss://18789-xxx.proxy.daytona.works or ws://127.0.0.1:18789"
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Gateway Token
            </span>
            <input
              className="h-12 rounded-md border border-input bg-background/75 px-4 font-mono text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              type="password"
              value={token}
              onChange={(event) => onTokenChange(event.target.value)}
              placeholder="Enter your gateway token"
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          {error ? (
            <div className="rounded-md border border-destructive bg-destructive px-4 py-3 text-sm text-destructive-foreground">
              {error}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input/90 bg-background/70 px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-border hover:bg-muted/65"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={isConnected ? onDisconnect : onConnect}
            disabled={isConnecting || !gatewayUrl.trim()}
            className="rounded-md border border-primary bg-primary px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isConnected ? "Disconnect" : isConnecting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
};
