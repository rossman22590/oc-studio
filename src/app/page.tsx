import type { Metadata } from "next";
import LandingPageClient from "@/features/agents/components/LandingPageClient";

export const metadata: Metadata = {
  title: "MachineClaw — Command Your AI Agent Fleet",
  description: "Orchestrate, monitor, and collaborate with your AI agents through an immersive 3D workspace. Real-time control, swarm dispatch, kanban boards, and more.",
  openGraph: {
    title: "MachineClaw — Command Your AI Agent Fleet",
    description: "Orchestrate, monitor, and collaborate with your AI agents through an immersive 3D workspace. Real-time control, swarm dispatch, kanban boards, and more.",
    images: [
      {
        url: "/og-image",
        width: 1200,
        height: 630,
        alt: "MachineClaw — AI Agent Command Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MachineClaw — Command Your AI Agent Fleet",
    description: "Orchestrate, monitor, and collaborate with your AI agents through an immersive 3D workspace.",
    images: ["/og-image"],
  },
};

export default function Home() {
  return <LandingPageClient />;
}
