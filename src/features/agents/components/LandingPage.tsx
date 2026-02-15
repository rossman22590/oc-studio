"use client";

import { useState, useEffect } from "react";
import { ConnectionSettingsModal } from "./ConnectionSettingsModal";
import { useGatewayConnection } from "@/lib/gateway/GatewayClient";
import { createStudioSettingsCoordinator } from "@/lib/studio/coordinator";
import { Navigation } from "./landing/Navigation";
import { Hero } from "./landing/Hero";
import { Stats } from "./landing/Stats";
import { Features } from "./landing/Features";
import { Showcase } from "./landing/Showcase";
import { HowItWorks } from "./landing/HowItWorks";
import { Testimonials } from "./landing/Testimonials";
import { Pricing } from "./landing/Pricing";
import { CTA } from "./landing/CTA";
import { Footer } from "./landing/Footer";

export const LandingPage = () => {
  const [settingsCoordinator] = useState(() => createStudioSettingsCoordinator());
  const { status, gatewayUrl, token, setGatewayUrl, setToken, connect, disconnect, error: gatewayError } = useGatewayConnection(settingsCoordinator);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    /* The app shell sets body { overflow: hidden } for the studio views.
       The landing page needs full-page scrolling, so we override here
       and restore on unmount. */
    const prev = document.body.style.overflow;
    const prevY = document.body.style.overflowY;
    const prevX = document.body.style.overflowX;

    document.body.style.overflow = "auto";
    document.body.style.overflowY = "auto";
    document.body.style.overflowX = "hidden";

    return () => {
      document.body.style.overflow = prev;
      document.body.style.overflowY = prevY;
      document.body.style.overflowX = prevX;
    };
  }, []);

  const handleConnectClick = () => {
    setShowConnectModal(true);
  };

  if (!mounted) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/20 animate-pulse" />
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-hidden bg-background dark:bg-black">
      <Navigation status={status} onConnectClick={handleConnectClick} />
      <Hero status={status} onConnectClick={handleConnectClick} />
      <Stats />
      <Features />
      <Showcase />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <CTA status={status} onConnectClick={handleConnectClick} />
      <Footer status={status} onConnectClick={handleConnectClick} />

      <ConnectionSettingsModal
        isOpen={showConnectModal}
        gatewayUrl={gatewayUrl}
        token={token}
        status={status}
        error={gatewayError}
        onClose={() => setShowConnectModal(false)}
        onGatewayUrlChange={setGatewayUrl}
        onTokenChange={setToken}
        onConnect={() => void connect()}
        onDisconnect={disconnect}
      />
    </div>
  );
};
