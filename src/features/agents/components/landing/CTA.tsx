"use client";

import { useEffect, useRef, useState } from "react";
import { Cable, DoorOpen, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface CTAProps {
  status: "connected" | "connecting" | "disconnected";
  onConnectClick: () => void;
}

export const CTA = ({ status, onConnectClick }: CTAProps) => {
  const router = useRouter();
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
    <section ref={ref} className="relative py-24 sm:py-32 md:py-40 px-6">
      <div
        className={`relative max-w-4xl mx-auto text-center transition-all duration-1000 ${
          visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-[0.98]"
        }`}
      >
        {/* Background card with glow */}
        <div className="relative rounded-[2rem] border border-primary/15 bg-gradient-to-br from-primary/8 via-accent/4 to-transparent p-12 sm:p-16 md:p-20 overflow-hidden">
          {/* Ambient light */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-[300px] h-[200px] bg-accent/8 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter mb-6 leading-[0.95]">
              <span className="text-foreground">Ready to Take</span>
              <br />
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Control?</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
              Connect your gateway and start commanding your agent fleet in under a minute.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
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
                </button>
              ) : (
                <button
                  onClick={onConnectClick}
                  className="group relative inline-flex items-center gap-3 rounded-full bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-2xl shadow-primary/30 transition-all duration-300 hover:shadow-3xl hover:shadow-primary/40 hover:scale-[1.03] active:scale-[0.98]"
                  aria-label="Connect to gateway"
                  tabIndex={0}
                >
                  <Cable className="h-5 w-5 transition-transform group-hover:rotate-12" />
                  <span>Connect Now</span>
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
