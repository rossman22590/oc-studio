"use client";

import { useEffect, useRef, useState } from "react";
import { Zap, Brain, Sparkles, Users, BarChart3, FileText, MessageSquare, Gamepad2, Layers, Shield, Workflow, Network } from "lucide-react";

const FEATURES = [
  {
    icon: Brain,
    title: "3D Agent Office",
    description: "Walk through a living 3D office. Watch agents work at desks, move between stations, and respond in real-time.",
    gradient: "from-violet-500/20 to-purple-600/20",
  },
  {
    icon: Zap,
    title: "Swarm Dispatch",
    description: "Fire tasks to your entire fleet at once. One command, every agent moves.",
    gradient: "from-amber-500/20 to-orange-600/20",
  },
  {
    icon: Sparkles,
    title: "Kanban Boards",
    description: "Track tasks across columns with per-agent status. See work flow from new to complete.",
    gradient: "from-emerald-500/20 to-teal-600/20",
  },
  {
    icon: Users,
    title: "Agent Chatroom",
    description: "Group chat with your fleet. Agents see each other's context and collaborate autonomously.",
    gradient: "from-blue-500/20 to-indigo-600/20",
  },
  {
    icon: Gamepad2,
    title: "Third-Person Control",
    description: "Walk around the office as an animated character. WASD movement, jump on furniture, auto-patrol.",
    gradient: "from-pink-500/20 to-rose-600/20",
  },
  {
    icon: FileText,
    title: "Workspace Editor",
    description: "Full markdown editor for agent brain files. Edit SOUL, IDENTITY, MEMORY — deploy instantly.",
    gradient: "from-cyan-500/20 to-blue-600/20",
  },
  {
    icon: MessageSquare,
    title: "Streaming Chat",
    description: "Real-time token streaming. Watch agents think, reason, and respond character by character.",
    gradient: "from-fuchsia-500/20 to-pink-600/20",
  },
  {
    icon: BarChart3,
    title: "Live Monitoring",
    description: "Activity feeds, status indicators, and performance metrics. Always know what your fleet is doing.",
    gradient: "from-lime-500/20 to-green-600/20",
  },
  {
    icon: Network,
    title: "Remote Gateways",
    description: "Connect to local or remote gateways. Tailscale, EC2, SSH tunnels — all first-class.",
    gradient: "from-orange-500/20 to-red-600/20",
  },
  {
    icon: Layers,
    title: "Dual-Mode UX",
    description: "Switch between focused workspace and spatial canvas. Attention-first or creative orchestration.",
    gradient: "from-sky-500/20 to-blue-600/20",
  },
  {
    icon: Workflow,
    title: "File Upload",
    description: "Drag-and-drop files directly into agent sandboxes. PDF viewer, binary support, progress tracking.",
    gradient: "from-yellow-500/20 to-amber-600/20",
  },
  {
    icon: Shield,
    title: "Private & Secure",
    description: "Token-based auth. Local persistence only. Your agents, your data, your control.",
    gradient: "from-slate-500/20 to-zinc-600/20",
  },
];

const FeatureCard = ({ feature, index }: { feature: typeof FEATURES[number]; index: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`group relative rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm p-6 sm:p-8 transition-all duration-700 ease-out hover:border-primary/30 hover:bg-card/60 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      {/* Glow on hover */}
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      <div className="relative">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/15 transition-all duration-300 group-hover:bg-primary/15 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/10">
          <feature.icon className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
        </div>
        <h3 className="mb-2.5 text-lg font-bold text-foreground tracking-tight">{feature.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
      </div>
    </div>
  );
};

export const Features = () => {
  return (
    <section id="features" className="relative py-24 sm:py-32 md:py-40 px-6">
      {/* Section glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16 sm:mb-20">
          <span className="inline-block text-xs font-semibold text-primary tracking-[0.2em] uppercase mb-4">Capabilities</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight mb-5">
            <span className="text-foreground">Everything You Need to </span>
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Command</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A complete control center for your AI agent fleet — from orchestration to observation.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {FEATURES.map((feature, i) => (
            <FeatureCard key={i} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
};
