"use client";

import { useEffect, useRef, useState } from "react";

const STATS = [
  { value: "∞", label: "Agents Supported", suffix: "" },
  { value: 50, label: "ms Latency", suffix: "ms" },
  { value: 3, label: "Dimensions", suffix: "D" },
  { value: 24, label: "Always Running", suffix: "/7" },
];

const AnimatedCounter = ({ target, suffix, visible }: { target: number | string; suffix: string; visible: boolean }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible || typeof target !== "number") return;
    let frame: number;
    const duration = 1500;
    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [visible, target]);

  if (typeof target === "string") {
    return <span>{target}</span>;
  }
  return <span>{count}{suffix}</span>;
};

export const Stats = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative py-16 sm:py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
          {STATS.map((stat, i) => (
            <div
              key={i}
              className={`text-center transition-all duration-700 ease-out ${
                visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter text-foreground mb-2">
                <AnimatedCounter target={stat.value} suffix={stat.suffix} visible={visible} />
              </div>
              <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
