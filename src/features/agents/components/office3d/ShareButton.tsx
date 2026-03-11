"use client";

import { useState, useCallback } from "react";
import { Share2, Copy, Check, Trash2, X, Link2 } from "lucide-react";
import type { AgentState } from "@/features/agents/state/store";

type ShareButtonProps = {
  ownerId: string;
  agents: AgentState[];
  onTokenGenerated?: (token: string) => void;
  onTokenRevoked?: () => void;
};

export const ShareButton = ({ ownerId, agents, onTokenGenerated, onTokenRevoked }: ShareButtonProps) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const handleGenerateLink = useCallback(async () => {
    if (!selectedAgentId) {
      alert("Please select an agent to share");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/office/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, interactiveAgentId: selectedAgentId }),
      });
      if (!res.ok) throw new Error("Failed to generate link");
      const data = (await res.json()) as {
        token: string;
        shareUrl: string;
        expiresAt: number;
      };
      setShareToken(data.token);
      setShareUrl(data.shareUrl);
      setExpiresAt(data.expiresAt);
      onTokenGenerated?.(data.token);
    } catch (err) {
      console.error("Failed to generate share link:", err);
    } finally {
      setLoading(false);
    }
  }, [ownerId, selectedAgentId]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  const handleRevoke = useCallback(async () => {
    if (!shareToken) return;
    try {
      await fetch(`/api/office/share?token=${encodeURIComponent(shareToken)}`, {
        method: "DELETE",
      });
      setShareToken(null);
      setShareUrl(null);
      setExpiresAt(null);
      onTokenRevoked?.();
    } catch (err) {
      console.error("Failed to revoke link:", err);
    }
  }, [shareToken]);

  const handleClose = () => {
    setModalOpen(false);
  };

  const formatExpiry = (ts: number) => {
    const remaining = ts - Date.now();
    if (remaining <= 0) return "Expired";
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m remaining`;
  };

  return (
    <>
      {/* Share button in overlay */}
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-2 rounded-md border border-primary/50 bg-white dark:bg-white/95 backdrop-blur-sm px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary transition hover:border-primary hover:bg-primary hover:text-white shadow-lg"
        title="Invite someone to your office"
        aria-label="Share office link"
        tabIndex={0}
      >
        <Share2 className="h-4 w-4" />
        Invite
      </button>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl mx-4">
            {/* Close */}
            <button
              onClick={handleClose}
              className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Close share modal"
              tabIndex={0}
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header */}
            <div className="mb-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Link2 className="h-5 w-5 text-primary" />
                Invite to Office
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Share a link so someone can visit your 3D office
              </p>
            </div>

            {/* Content */}
            {!shareUrl ? (
              <div className="space-y-4">
                {/* Agent selection */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">
                    Select Agent to Share
                  </label>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Guests will only be able to interact with this agent (click lobster, send chat)
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {agents.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No agents available
                      </p>
                    ) : (
                      agents.map((agent) => (
                        <button
                          key={agent.agentId}
                          onClick={() => setSelectedAgentId(agent.agentId)}
                          className={`w-full rounded-lg border-2 px-3 py-2.5 text-left transition ${
                            selectedAgentId === agent.agentId
                              ? "border-primary bg-primary/10"
                              : "border-border bg-muted/30 hover:border-primary/50"
                          }`}
                          tabIndex={0}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">{agent.name}</span>
                            {selectedAgentId === agent.agentId && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {agent.status === "running" ? "Running" : "Idle"}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerateLink}
                  disabled={loading || !selectedAgentId || agents.length === 0}
                  className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  tabIndex={0}
                >
                  {loading ? "Generating..." : "Generate Invite Link"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Link display */}
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-transparent text-xs text-foreground outline-none truncate"
                    tabIndex={0}
                  />
                  <button
                    onClick={handleCopy}
                    className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-primary/90"
                    aria-label="Copy link"
                    tabIndex={0}
                  >
                    {copied ? (
                      <span className="flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" /> Copied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </span>
                    )}
                  </button>
                </div>

                {/* Expiry info */}
                {expiresAt && (
                  <p className="text-xs text-muted-foreground text-center">
                    Link expires in {formatExpiry(expiresAt)}
                  </p>
                )}

                {/* Revoke */}
                <button
                  onClick={handleRevoke}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2.5 text-sm font-semibold text-destructive transition hover:bg-destructive/10"
                  tabIndex={0}
                >
                  <Trash2 className="h-4 w-4" />
                  Revoke Link
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
