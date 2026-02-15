import type { Metadata } from "next";
import { Bebas_Neue, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "MachineClaw Studio",
  description: "Focused operator studio for the OpenClaw gateway.",
};

const display = Bebas_Neue({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var r=document.documentElement;var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=t?t==='dark':m;r.classList.toggle('dark',d);var a=localStorage.getItem('openclaw.ui.accent')||'magenta';var p={magenta:{primary:'oklch(0.60 0.24 335)',accent:'oklch(0.55 0.18 300)'},violet:{primary:'oklch(0.62 0.24 292)',accent:'oklch(0.56 0.18 275)'},indigo:{primary:'oklch(0.60 0.19 270)',accent:'oklch(0.56 0.16 255)'},blue:{primary:'oklch(0.62 0.20 256)',accent:'oklch(0.58 0.16 230)'},cyan:{primary:'oklch(0.66 0.15 220)',accent:'oklch(0.61 0.12 205)'},teal:{primary:'oklch(0.64 0.16 190)',accent:'oklch(0.58 0.14 170)'},emerald:{primary:'oklch(0.66 0.18 154)',accent:'oklch(0.60 0.14 142)'},lime:{primary:'oklch(0.74 0.18 130)',accent:'oklch(0.68 0.14 118)'},amber:{primary:'oklch(0.76 0.18 82)',accent:'oklch(0.70 0.14 70)'},orange:{primary:'oklch(0.72 0.19 55)',accent:'oklch(0.66 0.16 45)'},red:{primary:'oklch(0.62 0.23 28)',accent:'oklch(0.57 0.18 20)'},rose:{primary:'oklch(0.64 0.22 14)',accent:'oklch(0.58 0.17 8)'}};var c=p[a]||p.magenta;r.style.setProperty('--primary',c.primary);r.style.setProperty('--accent',c.accent);r.style.setProperty('--ring',c.primary);r.style.setProperty('--chart-1',c.primary);r.style.setProperty('--chart-2',c.accent);r.style.setProperty('--sidebar-primary',c.primary);r.style.setProperty('--sidebar-ring',c.primary);}catch(e){}})();",
          }}
        />
      </head>
      <body className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
