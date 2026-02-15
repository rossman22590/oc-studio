"use client";

import { useEffect, useRef, useState } from "react";
import { Cable, Compass, Rocket } from "lucide-react";

const STEPS = [
  {
    icon: Cable,
    number: "01",
    title: "Connect",
    description: "Point MachineClaw at your gateway — local or remote. One URL, one token, instant fleet access.",
  },
  {
    icon: Compass,
    number: "02",
    title: "Explore",
    description: "Step into the 3D office. See every agent at their workstation. Click, chat, or walk around.",
  },
  {
    icon: Rocket,
    number: "03",
    title: "Command",
    description: "Dispatch tasks, manage kanban boards, upload files, and watch results stream back in real-time.",
  },
];

export const HowItWorks = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" ref={ref} className="relative py-24 sm:py-32 md:py-40 px-6">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div
          className={`text-center mb-16 sm:mb-20 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <span className="inline-block text-xs font-semibold text-primary tracking-[0.2em] uppercase mb-4">Getting Started</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight mb-5">
            <span className="text-foreground">Up and Running in </span>
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Minutes</span>
          </h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className={`relative text-center transition-all duration-700 ease-out ${
                visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              {/* Connector line (desktop only) */}
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-16 left-[calc(50%+40px)] w-[calc(100%-80px)] h-px bg-gradient-to-r from-primary/30 to-primary/10" />
              )}

              {/* Icon */}
              <div className="relative inline-flex mb-6">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 transition-all duration-300 hover:bg-primary/10 hover:border-primary/30 hover:scale-105">
                  <step.icon className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-lg shadow-primary/30">
                  {step.number}
                </div>
              </div>

              <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
