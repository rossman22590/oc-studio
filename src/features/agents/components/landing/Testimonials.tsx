"use client";

import { useEffect, useRef, useState } from "react";

const SENJA_WIDGET_ID = "698903f7-82e1-43c9-a1e4-507b33742e0a";

export const Testimonials = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const scriptLoaded = useRef(false);

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

  /* Load the Senja script once the section is visible */
  useEffect(() => {
    if (!visible || scriptLoaded.current) return;
    scriptLoaded.current = true;

    const existing = document.querySelector(`script[src*="senja.io"][data-widget="${SENJA_WIDGET_ID}"]`);
    if (existing) return;

    const script = document.createElement("script");
    script.src = `https://widget.senja.io/widget/${SENJA_WIDGET_ID}/platform.js`;
    script.async = true;
    script.setAttribute("data-widget", SENJA_WIDGET_ID);
    document.body.appendChild(script);
  }, [visible]);

  return (
    <section ref={ref} className="relative py-24 sm:py-32 md:py-40 px-6">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div
          className={`text-center mb-14 sm:mb-18 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <span className="inline-block text-xs font-semibold text-primary tracking-[0.2em] uppercase mb-4">Testimonials</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight mb-5">
            <span className="text-foreground">Loved by </span>
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Builders</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            See what people are saying about MachineClaw.
          </p>
        </div>

        {/* Senja embed */}
        <div
          className={`transition-all duration-700 delay-200 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div
            className="senja-embed"
            data-id={SENJA_WIDGET_ID}
            data-mode="shadow"
            data-lazyload="false"
            style={{ display: "block", width: "100%" }}
          />
        </div>
      </div>
    </section>
  );
};
