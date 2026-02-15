"use client";

import { useRouter } from "next/navigation";

interface FooterProps {
  status: "connected" | "connecting" | "disconnected";
  onConnectClick: () => void;
}

export const Footer = ({ status, onConnectClick }: FooterProps) => {
  const router = useRouter();

  return (
    <footer className="relative border-t border-border/30 py-14 sm:py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/logo.png" alt="MachineClaw" className="h-8 w-8 object-contain" />
              <span className="text-base font-bold tracking-tight text-foreground">
                Machine<span className="text-primary">Claw</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              The command center for your AI agent fleet.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-8 sm:gap-12">
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Product</h4>
              <ul className="space-y-2">
                {[
                  { label: "Features", id: "features" },
                  { label: "Showcase", id: "showcase" },
                  { label: "How It Works", id: "how-it-works" },
                  { label: "Pricing", id: "pricing" },
                ].map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const element = document.getElementById(item.id);
                        if (element) {
                          const navHeight = 80;
                          const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
                          const offsetPosition = elementPosition - navHeight;
                          window.scrollTo({
                            top: offsetPosition,
                            behavior: "smooth",
                          });
                        }
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Connect</h4>
              <ul className="space-y-2">
                <li>
                  <button
                    onClick={() => status === "connected" ? router.push("/studio") : onConnectClick()}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    {status === "connected" ? "Enter Studio" : "Get Started"}
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-border/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground/60">
            © {new Date().getFullYear()} MachineClaw. All rights reserved.
          </p>
          <div className="flex items-center gap-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`h-1 w-1 rounded-full ${i === 1 ? "bg-primary" : "bg-muted-foreground/20"}`} />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};
