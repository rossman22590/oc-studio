"use client";

import dynamic from "next/dynamic";

const LandingPage = dynamic(() => import("./LandingPage").then(mod => ({ default: mod.LandingPage })), {
  ssr: false,
});

export default function LandingPageClient() {
  return <LandingPage />;
}
