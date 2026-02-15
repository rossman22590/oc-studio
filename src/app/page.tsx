"use client";

import dynamic from "next/dynamic";

const LandingPage = dynamic(() => import("@/features/agents/components/LandingPage").then(mod => ({ default: mod.LandingPage })), {
  ssr: false,
});

export default function Home() {
  return <LandingPage />;
}
