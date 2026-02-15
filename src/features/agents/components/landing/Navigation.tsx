"use client";

import { useState, useEffect } from "react";
import { Cable, DoorOpen, Menu, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface NavigationProps {
  status: "connected" | "connecting" | "disconnected";
  onConnectClick: () => void;
}

export const Navigation = ({ status, onConnectClick }: NavigationProps) => {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/70 backdrop-blur-xl border-b border-border/40 shadow-lg shadow-black/5"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Brand */}
          <a href="#" className="group flex items-center gap-2.5 select-none">
            <div className="relative transition-all duration-300 group-hover:scale-110">
              <img src="/logo.png" alt="MachineClaw" className="h-9 w-9 object-contain" />
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-tight text-foreground transition-colors">
              Machine<span className="text-primary">Claw</span>
            </span>
          </a>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {["Features", "How It Works", "Tech"].map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase().replace(/\s+/g, "-")}`}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 rounded-lg hover:bg-foreground/5"
              >
                {label}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {status === "connected" && (
              <button
                onClick={() => router.push("/studio")}
                className="hidden sm:flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
              >
                <DoorOpen className="h-4 w-4" />
                <span>Enter Studio</span>
              </button>
            )}
            <button
              onClick={onConnectClick}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                status === "connected"
                  ? "border border-border/60 text-foreground hover:border-primary/40 hover:bg-primary/5"
                  : "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30"
              }`}
            >
              <Cable className="h-4 w-4" />
              <span className="hidden sm:inline">{status === "connected" ? "Settings" : "Connect"}</span>
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-border/40 text-foreground hover:bg-foreground/5 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            mobileOpen ? "max-h-48 pb-4" : "max-h-0"
          }`}
        >
          <div className="flex flex-col gap-1 pt-2">
            {["Features", "How It Works", "Tech"].map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => setMobileOpen(false)}
                className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-foreground/5"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};
