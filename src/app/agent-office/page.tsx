"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AgentOfficeScene } from "@/features/agents/components/AgentOfficeScene";
import { AgentStoreProvider } from "@/features/agents/state/store";
import { GuestColorPicker } from "@/features/agents/components/office3d/GuestColorPicker";

const AgentOfficeContent = () => {
  const searchParams = useSearchParams();
  const shareToken = searchParams.get("shareToken");
  const isGuest = !!shareToken;

  const [guestColor, setGuestColor] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [validating, setValidating] = useState(false);
  const [interactiveAgentId, setInteractiveAgentId] = useState<string | null>(null);

  // Validate the share token if we're a guest
  useEffect(() => {
    if (!shareToken) return;

    const validateToken = async () => {
      setValidating(true);
      try {
        const res = await fetch(`/api/office/share?token=${encodeURIComponent(shareToken)}`);
        if (!res.ok) {
          setTokenValid(false);
          return;
        }
        const data = (await res.json()) as { valid: boolean; interactiveAgentId?: string | null };
        setTokenValid(data.valid);
        if (data.valid) {
          setInteractiveAgentId(data.interactiveAgentId || null);
          setShowColorPicker(true);
        }
      } catch {
        setTokenValid(false);
      } finally {
        setValidating(false);
      }
    };

    void validateToken();
  }, [shareToken]);

  const handleColorConfirm = (color: string) => {
    setGuestColor(color);
    setShowColorPicker(false);
  };

  const handleColorCancel = () => {
    // Navigate back to studio if guest cancels
    window.location.href = "/studio";
  };

  // Guest: validating token
  if (isGuest && validating) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Validating invite link...</p>
        </div>
      </div>
    );
  }

  // Guest: invalid token
  if (isGuest && tokenValid === false) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center p-6 max-w-md">
          <p className="text-lg font-semibold mb-2 text-foreground">Invalid or Expired Link</p>
          <p className="text-sm text-muted-foreground mb-4">
            This invite link is no longer valid. Ask the office owner for a new one.
          </p>
          <a
            href="/studio"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition"
          >
            Go to Studio
          </a>
        </div>
      </div>
    );
  }

  // Guest: show color picker before entering
  if (isGuest && showColorPicker) {
    return (
      <GuestColorPicker
        onConfirm={handleColorConfirm}
        onCancel={handleColorCancel}
      />
    );
  }

  // Guest: waiting for color selection (shouldn't happen, but safety)
  if (isGuest && !guestColor) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-background touch-none hidden md:block">
        <AgentOfficeScene
          isGuest={isGuest}
          shareToken={shareToken}
          guestColor={guestColor || "#6366f1"}
          interactiveAgentId={interactiveAgentId}
        />
      </div>
      <div className="md:hidden flex items-center justify-center h-screen">
        <div className="text-center p-4">
          <p className="text-lg font-semibold mb-2">3D Office not available on mobile</p>
          <p className="text-sm text-muted-foreground mb-4">
            Please use a desktop or tablet to access the 3D office view.
          </p>
          <a
            href="/studio"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition"
          >
            Go to Studio
          </a>
        </div>
      </div>
    </>
  );
};

export default function AgentOfficePage() {
  return (
    <AgentStoreProvider>
      <Suspense fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }>
        <AgentOfficeContent />
      </Suspense>
    </AgentStoreProvider>
  );
}
