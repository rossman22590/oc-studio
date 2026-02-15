"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, MessageSquare, LayoutDashboard, FolderOpen } from "lucide-react";
import { DemoOffice } from "./DemoOffice";

/* ─── Per-tab visual mockups ──────────────────────────── */

const OfficeMockup = () => (
  <div className="w-full max-w-sm mx-auto">
    {/* Isometric floor grid */}
    <div className="relative w-full aspect-square">
      {/* Floor */}
      <div className="absolute inset-4 rounded-2xl bg-gradient-to-br from-muted/40 to-muted/20 border border-border/30"
        style={{ transform: "perspective(800px) rotateX(30deg) rotateZ(-5deg)" }}
      >
        {/* Desks */}
        {[
          { left: "15%", top: "20%" },
          { left: "55%", top: "20%" },
          { left: "15%", top: "55%" },
          { left: "55%", top: "55%" },
        ].map((pos, i) => (
          <div key={i} className="absolute" style={{ left: pos.left, top: pos.top }}>
            <div className="w-16 h-10 rounded-md bg-card border border-border/40 shadow-sm relative">
              <div className="absolute -top-3 left-2 w-5 h-4 rounded-sm bg-primary/30 border border-primary/20" />
              {/* Agent dot */}
              <div className={`absolute -top-1 right-1 w-2 h-2 rounded-full ${i < 2 ? "bg-green-400 animate-pulse" : "bg-amber-400/60"}`} />
            </div>
          </div>
        ))}
        {/* Character */}
        <div className="absolute left-[42%] top-[42%]">
          <div className="w-4 h-4 rounded-full bg-primary shadow-lg shadow-primary/40 animate-bounce" style={{ animationDuration: "2s" }} />
          <div className="w-6 h-1 rounded-full bg-primary/20 blur-sm mx-auto -mt-0.5" />
        </div>
      </div>
      {/* Labels */}
      <div className="absolute bottom-2 left-4 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-[10px] text-muted-foreground">Working</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-[10px] text-muted-foreground">Idle</span>
        </div>
      </div>
    </div>
  </div>
);

const ChatMockup = () => (
  <div className="w-full max-w-sm mx-auto space-y-3">
    {/* Chat header */}
    <div className="flex items-center gap-3 pb-3 border-b border-border/30">
      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
        <span className="text-xs font-bold text-primary">A1</span>
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">Agent Alpha</div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[10px] text-muted-foreground">Online</span>
        </div>
      </div>
    </div>
    {/* Messages */}
    {[
      { from: "user", text: "Analyze the Q4 performance data", align: "right" },
      { from: "agent", text: "Processing your request. I'll analyze revenue trends, growth metrics, and key performance indicators...", align: "left" },
      { from: "agent", text: "Found 3 key insights. Generating report now...", align: "left" },
    ].map((msg, i) => (
      <div key={i} className={`flex ${msg.align === "right" ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
          msg.from === "user"
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card border border-border/40 text-foreground rounded-bl-sm"
        }`}>
          {msg.text}
        </div>
      </div>
    ))}
    {/* Typing indicator */}
    <div className="flex justify-start">
      <div className="bg-card border border-border/40 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.8s" }} />
        ))}
      </div>
    </div>
  </div>
);

const KanbanMockup = () => (
  <div className="w-full max-w-sm mx-auto">
    <div className="grid grid-cols-3 gap-2.5">
      {[
        { title: "New", color: "bg-blue-400", items: [{ label: "Research API docs", agent: "A1" }, { label: "Write unit tests", agent: "A2" }] },
        { title: "In Progress", color: "bg-amber-400", items: [{ label: "Build dashboard", agent: "A3" }] },
        { title: "Complete", color: "bg-green-400", items: [{ label: "Deploy v2.1", agent: "A1" }, { label: "Fix auth bug", agent: "A2" }] },
      ].map((col, ci) => (
        <div key={ci} className="space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <div className={`w-2 h-2 rounded-full ${col.color}`} />
            <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">{col.title}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{col.items.length}</span>
          </div>
          {col.items.map((item, ii) => (
            <div key={ii} className="rounded-lg border border-border/40 bg-card/60 p-2.5 space-y-2 transition-all hover:border-primary/30 hover:shadow-sm">
              <div className="text-[11px] font-medium text-foreground leading-tight">{item.label}</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-[7px] font-bold text-primary">{item.agent}</span>
                  </div>
                </div>
                {ci === 2 && <svg className="h-3 w-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                {ci === 1 && <div className="w-3 h-3 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

const FilesMockup = () => (
  <div className="w-full max-w-sm mx-auto space-y-2">
    {/* Breadcrumb */}
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-3">
      <span>workspace</span>
      <span>/</span>
      <span className="text-foreground font-medium">agent-alpha</span>
    </div>
    {/* File list */}
    {[
      { name: "SOUL.md", icon: "📄", size: "2.4 KB", modified: true },
      { name: "IDENTITY.md", icon: "📄", size: "1.1 KB", modified: false },
      { name: "MEMORY.md", icon: "🧠", size: "8.7 KB", modified: true },
      { name: "tools/", icon: "📁", size: "4 items", modified: false },
      { name: "report.pdf", icon: "📕", size: "340 KB", modified: false },
    ].map((file, i) => (
      <div key={i} className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/40 px-3 py-2.5 transition-all hover:border-primary/30 hover:bg-card/60 group">
        <span className="text-sm">{file.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-foreground truncate">{file.name}</div>
          <div className="text-[10px] text-muted-foreground">{file.size}</div>
        </div>
        {file.modified && (
          <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
        )}
        <svg className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    ))}
    {/* Upload zone */}
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-4 text-center">
      <span className="text-[10px] text-primary font-medium">Drop files here to upload</span>
    </div>
  </div>
);

const MOCKUPS: Record<string, React.FC> = {
  office: OfficeMockup,
  chat: ChatMockup,
  kanban: KanbanMockup,
  files: FilesMockup,
};

/* ─── Tab data ────────────────────────────────────────── */

const TABS = [
  {
    id: "office",
    label: "3D Office",
    icon: Monitor,
    title: "Immersive Agent Workspace",
    description: "Navigate a fully interactive 3D office environment. Agents sit at desks, move between stations, and display live status.",
    features: ["Interactive 3D environment", "Live agent status on monitors", "Third-person character control", "Auto-patrol & observation mode"],
  },
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    title: "Real-Time Agent Communication",
    description: "Stream conversations with individual agents or orchestrate group discussions with full markdown rendering.",
    features: ["Token-by-token streaming", "Group chat with all agents", "Markdown & code rendering", "Conversation history"],
  },
  {
    id: "kanban",
    label: "Kanban",
    icon: LayoutDashboard,
    title: "Visual Task Management",
    description: "Assign tasks to one or many agents. Track progress across columns as agents work and results flow back automatically.",
    features: ["Multi-agent task assignment", "Auto-status tracking", "Result capture on completion", "Reply & follow-up chains"],
  },
  {
    id: "files",
    label: "Files",
    icon: FolderOpen,
    title: "Workspace File Manager",
    description: "Browse, edit, and upload files directly to agent sandboxes with a full markdown editor and drag-and-drop support.",
    features: ["In-browser markdown editor", "Drag-and-drop file upload", "PDF preview support", "Agent brain file editing"],
  },
];

/* ─── Component ───────────────────────────────────────── */

export const Showcase = () => {
  const [activeTab, setActiveTab] = useState("office");
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const ActiveMockup = MOCKUPS[activeTab] ?? OfficeMockup;

  return (
    <section id="showcase" ref={ref} className="relative py-24 sm:py-32 md:py-40 px-6">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className={`text-center mb-14 sm:mb-18 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <span className="inline-block text-xs font-semibold text-primary tracking-[0.2em] uppercase mb-4">Product</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight mb-5">
            <span className="text-foreground">See It </span>
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">In Action</span>
          </h2>
        </div>

        {/* Tabs */}
        <div className={`flex justify-center gap-2 mb-12 transition-all duration-700 delay-100 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5 border border-transparent hover:border-border/40"
              }`}
              aria-label={tab.label}
              tabIndex={0}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content card */}
        <div className={`rounded-3xl border border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="grid md:grid-cols-2 gap-0">
            {/* Left: Visual mockup */}
            <div className="relative bg-gradient-to-br from-primary/5 via-accent/3 to-transparent p-0 flex items-center justify-center min-h-[360px] md:min-h-[440px] border-b md:border-b-0 md:border-r border-border/20 overflow-hidden">
              {activeTab === "office" ? (
                <div className="w-full h-full">
                  <DemoOffice />
                </div>
              ) : (
                <>
                  {/* Window chrome */}
                  <div className="absolute top-5 left-6 z-10 flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400/50" />
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/50" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-400/50" />
                  </div>
                  <div className="w-full p-8 sm:p-12 transition-all duration-500">
                    <ActiveMockup />
                  </div>
                </>
              )}
            </div>

            {/* Right: Info */}
            <div className="p-8 sm:p-12 flex flex-col justify-center">
              <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-4">{active.title}</h3>
              <p className="text-muted-foreground leading-relaxed mb-8">{active.description}</p>
              <ul className="space-y-3">
                {active.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                      <svg className="h-3 w-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
