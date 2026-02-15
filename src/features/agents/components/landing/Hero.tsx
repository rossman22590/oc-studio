"use client";

import { useState, useEffect } from "react";
import { Cable, ArrowRight, ChevronDown, DoorOpen, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

interface HeroProps {
  status: "connected" | "connecting" | "disconnected";
  onConnectClick: () => void;
}

/* Floating particle for ambient movement */
const Particle = ({ delay, size, x, duration }: { delay: number; size: number; x: number; duration: number }) => (
  <div
    className="absolute rounded-full bg-primary/20 blur-sm pointer-events-none"
    style={{
      width: size,
      height: size,
      left: `${x}%`,
      bottom: "-10%",
      animation: `floatUp ${duration}s ease-in-out ${delay}s infinite`,
    }}
  />
);

export const Hero = ({ status, onConnectClick }: HeroProps) => {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [particles, setParticles] = useState<Array<{ delay: number; size: number; x: number; duration: number }>>([]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    // Generate particles client-side only
    setParticles(
      Array.from({ length: 20 }, () => ({
        delay: Math.random() * 8,
        size: Math.random() * 4 + 2,
        x: Math.random() * 100,
        duration: Math.random() * 8 + 12,
      }))
    );
  }, []);

  return (
    <section className="relative w-full flex items-center justify-center px-6 pt-28 pb-20 sm:pt-36 sm:pb-24 overflow-hidden" style={{ minHeight: "100vh" }}>
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[400px] bg-accent/6 rounded-full blur-[100px]" />
        <div className="absolute top-1/3 right-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px]" />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map((p, i) => (
          <Particle key={i} {...p} />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-5xl mx-auto text-center">
        {/* Badge */}
        <div
          className={`inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 mb-8 sm:mb-10 transition-all duration-700 delay-75 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary tracking-wide uppercase">AI Agent Command Center</span>
        </div>

        {/* Headline */}
        <h1
          className={`mb-6 sm:mb-8 text-5xl sm:text-7xl md:text-8xl lg:text-[6.5rem] font-black tracking-tighter leading-[0.9] text-center transition-all duration-1000 delay-100 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <span className="block text-foreground">Command Your</span>
          <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-[shimmer_3s_ease-in-out_infinite]">
            Agent Fleet
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className={`mb-10 sm:mb-14 text-lg sm:text-xl md:text-2xl text-muted-foreground leading-relaxed text-center max-w-2xl mx-auto transition-all duration-1000 delay-200 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          Orchestrate, monitor, and collaborate with your AI agents through an immersive 3D workspace.
          Real-time control at your fingertips.
        </p>

        {/* CTA buttons */}
        <div
          className={`flex flex-col sm:flex-row justify-center items-center gap-4 mb-20 sm:mb-24 transition-all duration-1000 delay-300 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          {status === "connected" ? (
            <button
              onClick={() => router.push("/studio")}
              className="group relative inline-flex items-center gap-3 rounded-full bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-2xl shadow-primary/30 transition-all duration-300 hover:shadow-3xl hover:shadow-primary/40 hover:scale-[1.03] active:scale-[0.98]"
              aria-label="Enter Studio"
              tabIndex={0}
            >
              <DoorOpen className="h-5 w-5 transition-transform group-hover:rotate-12" />
              <span>Enter Studio</span>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              <div className="absolute inset-0 rounded-full bg-primary opacity-0 blur-2xl transition-opacity group-hover:opacity-40" />
            </button>
          ) : (
            <button
              onClick={onConnectClick}
              className="group relative inline-flex items-center gap-3 rounded-full bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-2xl shadow-primary/30 transition-all duration-300 hover:shadow-3xl hover:shadow-primary/40 hover:scale-[1.03] active:scale-[0.98]"
              aria-label="Get started - Connect to gateway"
              tabIndex={0}
            >
              <Cable className="h-5 w-5 transition-transform group-hover:rotate-12" />
              <span>Get Started</span>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              <div className="absolute inset-0 rounded-full bg-primary opacity-0 blur-2xl transition-opacity group-hover:opacity-40" />
            </button>
          )}
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/30 backdrop-blur-sm px-7 py-4 text-base font-semibold text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Learn More</span>
            <ChevronDown className="h-4 w-4" />
          </a>
        </div>

        {/* Scroll indicator */}
        <div
          className={`flex flex-col items-center gap-3 text-muted-foreground/40 transition-all duration-1000 delay-500 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-muted-foreground/20 to-muted-foreground/40" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">Scroll</span>
        </div>
      </div>
    </section>
  );
};
