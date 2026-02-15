"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Zap, Infinity, Sparkles, Users, Gamepad2, FileText, MessageSquare, BarChart3, Layers, Shield, Workflow, Network, Brain } from "lucide-react";

const FREE_FEATURES = [
  { icon: Infinity, text: "Unlimited Agents" },
  { icon: Brain, text: "3D Agent Office" },
  { icon: Zap, text: "Swarm Dispatch" },
  { icon: Sparkles, text: "Kanban Boards" },
  { icon: Users, text: "Agent Chatroom" },
  { icon: Gamepad2, text: "Third-Person Control" },
  { icon: FileText, text: "Workspace Editor" },
  { icon: MessageSquare, text: "Streaming Chat" },
  { icon: BarChart3, text: "Real-Time Analytics" },
  { icon: Layers, text: "File Management" },
  { icon: Shield, text: "Secure Gateway" },
  { icon: Workflow, text: "Task Orchestration" },
  { icon: Network, text: "Multi-Agent Collaboration" },
];

export const Pricing = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} id="pricing" className="relative py-24 sm:py-32 md:py-40 px-6 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent pointer-events-none" />
      
      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div
          className={`text-center mb-16 transition-all duration-1000 delay-100 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter mb-6 leading-[0.95]">
            <span className="text-foreground">It's</span>{" "}
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Free
            </span>
          </h2>
          <p className="text-xl sm:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Everything you need to command your AI agent fleet. No credit card. No limits. Just pure power.
          </p>
        </div>

        {/* Pricing Card */}
        <div
          className={`max-w-4xl mx-auto transition-all duration-1000 delay-200 ${
            visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-[0.98]"
          }`}
        >
          <div className="relative rounded-[2rem] border border-primary/20 bg-gradient-to-br from-background via-primary/5 to-accent/5 p-8 sm:p-12 md:p-16 overflow-hidden shadow-2xl shadow-primary/10">
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/15 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative">
              {/* Price */}
              <div className="text-center mb-12">
                <div className="inline-flex items-baseline gap-2 mb-4">
                  <span className="text-7xl sm:text-8xl md:text-9xl font-black bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    $0
                  </span>
                  <span className="text-2xl sm:text-3xl text-muted-foreground font-semibold">/forever</span>
                </div>
                <p className="text-lg text-muted-foreground">
                  No hidden fees. No usage limits. No catch.
                </p>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-12">
                {FREE_FEATURES.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={index}
                      className={`group flex items-center gap-3 p-4 rounded-xl bg-background/50 border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all duration-500 ${
                        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                      }`}
                      style={{
                        transitionDelay: `${index * 30}ms`,
                      }}
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{feature.text}</span>
                    </div>
                  );
                })}
              </div>

              {/* CTA */}
              <div className="text-center pt-8 border-t border-border/40">
                <p className="text-lg font-semibold text-foreground mb-2">
                  Ready to get started?
                </p>
                <p className="text-sm text-muted-foreground">
                  Connect your gateway and start commanding your fleet in seconds.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
