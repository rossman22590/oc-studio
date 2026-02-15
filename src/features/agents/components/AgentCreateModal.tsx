"use client";

import { useMemo, useState } from "react";
import {
  ChartLine,
  Compass,
  Layers,
  ListChecks,
  type LucideIcon,
  Shuffle,
  TrendingUp,
  Workflow,
} from "lucide-react";
import {
  compileGuidedAgentCreation,
  createDefaultGuidedDraft,
  hasGuidedGroupCapability,
  resolveGuidedControlsForPreset,
  resolveGuidedDraftFromPresetBundle,
} from "@/features/agents/creation/compiler";
import type {
  AgentCreateModalSubmitPayload,
  AgentPresetBundle,
  GuidedCreationControls,
  GuidedAgentCreationDraft,
} from "@/features/agents/creation/types";
import { randomUUID } from "@/lib/uuid";
import { AgentAvatar } from "@/features/agents/components/AgentAvatar";

type AgentCreateModalProps = {
  open: boolean;
  suggestedName: string;
  busy?: boolean;
  submitError?: string | null;
  onClose: () => void;
  onSubmit: (payload: AgentCreateModalSubmitPayload) => Promise<void> | void;
};

const fieldClassName =
  "w-full rounded-md border border-border/80 bg-surface-3 px-3 py-2 text-xs text-foreground outline-none";
const labelClassName =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";
const controlOptionClassName = (
  selected: boolean,
  emphasis: "neutral" | "guided" | "full" = "neutral"
): string => {
  if (selected) {
    if (emphasis === "full") {
      return "rounded-md border border-primary/60 bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";
    }
    if (emphasis === "guided") {
      return "rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-left text-xs font-semibold text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";
    }
    return "rounded-md border border-primary/45 bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";
  }
  return "rounded-md border border-border/80 bg-surface-3 px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";
};

type StarterDirectionTile = {
  id: string;
  bundle: AgentPresetBundle;
  title: string;
  description: string;
  accountabilityPoints: string[];
  launchActions: string[];
  icon: LucideIcon;
  railClassName: string;
  iconClassName: string;
};

const STARTER_DIRECTIONS: StarterDirectionTile[] = [
  {
    id: "execution",
    bundle: "coordinator",
    title: "Execution",
    description: "Owns delivery across priorities.",
    accountabilityPoints: [
      "Tracking milestones across active priorities",
      "Escalating and resolving blockers quickly",
      "Maintaining clear ownership and follow-through",
      "Publishing progress updates on cadence",
    ],
    launchActions: [
      "Audit current priorities and active milestones",
      "Identify bottlenecks and unresolved blockers",
      "Propose and begin executing next actions",
    ],
    icon: ListChecks,
    railClassName: "border-l-slate-500/25",
    iconClassName: "text-slate-500/70",
  },
  {
    id: "product",
    bundle: "pr-engineer",
    title: "Product",
    description: "Owns shipping velocity and product quality.",
    accountabilityPoints: [
      "Maintaining consistent shipping velocity",
      "Reducing defect volume and regressions",
      "Unblocking implementation bottlenecks",
      "Reporting product delivery progress",
    ],
    launchActions: [
      "Review active product work and quality signals",
      "Flag execution bottlenecks and defect risk",
      "Start the highest-leverage delivery actions",
    ],
    icon: Layers,
    railClassName: "border-l-blue-500/25",
    iconClassName: "text-blue-500/65",
  },
  {
    id: "growth",
    bundle: "growth-operator",
    title: "Growth",
    description: "Owns acquisition and conversion performance.",
    accountabilityPoints: [
      "Monitoring traffic and conversion trends",
      "Diagnosing funnel drop-offs",
      "Running acquisition and conversion experiments",
      "Reporting performance and next actions",
    ],
    launchActions: [
      "Assess current acquisition and funnel performance",
      "Identify the highest-impact optimization opportunities",
      "Launch targeted growth experiments",
    ],
    icon: TrendingUp,
    railClassName: "border-l-emerald-500/25",
    iconClassName: "text-emerald-500/70",
  },
  {
    id: "revenue",
    bundle: "growth-operator",
    title: "Revenue",
    description: "Owns monetization and pricing performance.",
    accountabilityPoints: [
      "Monitoring revenue performance",
      "Identifying root causes of decline",
      "Running pricing and offer experiments",
      "Reporting progress autonomously",
    ],
    launchActions: [
      "Audit current monetization and pricing signals",
      "Surface key revenue constraints and opportunities",
      "Start priority pricing and offer experiments",
    ],
    icon: ChartLine,
    railClassName: "border-l-amber-500/25",
    iconClassName: "text-amber-500/70",
  },
  {
    id: "systems",
    bundle: "autonomous-engineer",
    title: "Systems",
    description: "Owns operational leverage and automation.",
    accountabilityPoints: [
      "Replacing repetitive manual workflows",
      "Keeping automation runs reliable",
      "Stabilizing reporting pipelines",
      "Driving throughput with fewer handoffs",
    ],
    launchActions: [
      "Map repetitive workflows and manual bottlenecks",
      "Prioritize automations with immediate leverage",
      "Begin implementation of high-value system improvements",
    ],
    icon: Workflow,
    railClassName: "border-l-cyan-500/25",
    iconClassName: "text-cyan-500/65",
  },
  {
    id: "strategy",
    bundle: "research-analyst",
    title: "Strategy",
    description: "Owns prioritization and capital allocation.",
    accountabilityPoints: [
      "Clarifying priorities and strategic tradeoffs",
      "Evaluating options with evidence",
      "Recommending allocation decisions",
      "Summarizing rationale for leadership",
    ],
    launchActions: [
      "Review active priorities and strategic constraints",
      "Frame key tradeoffs and decision paths",
      "Deliver an initial direction with clear rationale",
    ],
    icon: Compass,
    railClassName: "border-l-violet-500/25",
    iconClassName: "text-violet-500/60",
  },
];

type CommandMode = "off" | "ask-first" | "auto";
type FileMode = "off" | "on";
type AutonomyProfileId = "conservative" | "collaborative" | "autonomous";

const AUTONOMY_PROFILES: Array<{
  id: AutonomyProfileId;
  title: string;
  description: string;
  details: string[];
}> = [
  {
    id: "conservative",
    title: "Conservative",
    description: "Acts with review required.",
    details: [
      "No direct codebase writes",
      "Code and files access is off by default",
      "No automatic system actions",
    ],
  },
  {
    id: "collaborative",
    title: "Collaborative",
    description: "Acts with approval.",
    details: [
      "Can modify code and files directly",
      "Runs system actions with approval",
      "Uses web access for context",
    ],
  },
  {
    id: "autonomous",
    title: "Autonomous",
    description: "Acts independently.",
    details: [
      "Can modify your codebase directly",
      "Can operate your system automatically",
      "Uses web access while iterating",
    ],
  },
];

const STEP_HEADER_COPY: Record<
  "starter" | "control" | "customize",
  { title: string; subtext: string }
> = {
  starter: {
    title: "Define Ownership",
    subtext: "Assign full accountability.",
  },
  control: {
    title: "Set Authority Level",
    subtext: "Define how independently this agent can act.",
  },
  customize: {
    title: "Launch Agent",
    subtext: "Review mandate and activate.",
  },
};

const DIRECTION_DEFAULT_NAMES: Record<string, string> = {
  execution: "Execution Operator",
  product: "Product Builder",
  growth: "Growth Engine",
  revenue: "Revenue Operator",
  systems: "Systems Operator",
  strategy: "Strategy Lead",
};

const isGenericSuggestedName = (value: string): boolean =>
  /^new agent(?:\s+\d+)?$/i.test(value.trim());

const setGroupCapability = (params: {
  controls: GuidedCreationControls;
  group: string;
  enabled: boolean;
}): GuidedCreationControls => {
  const nextAllow = new Set(params.controls.toolsAllow);
  const nextDeny = new Set(params.controls.toolsDeny);
  if (params.enabled) {
    nextAllow.add(params.group);
    nextDeny.delete(params.group);
  } else {
    nextDeny.add(params.group);
    nextAllow.delete(params.group);
  }
  return {
    ...params.controls,
    toolsAllow: Array.from(nextAllow),
    toolsDeny: Array.from(nextDeny),
  };
};

export const AgentCreateModal = ({
  open,
  suggestedName,
  busy = false,
  submitError = null,
  onClose,
  onSubmit,
}: AgentCreateModalProps) => {
  const defaultDirection = STARTER_DIRECTIONS[0];
  const initialSuggestedName =
    DIRECTION_DEFAULT_NAMES[defaultDirection?.id ?? "execution"] ?? "Execution Operator";
  const initialName = isGenericSuggestedName(suggestedName)
    ? initialSuggestedName
    : suggestedName.trim() || initialSuggestedName;
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState(() => initialName);
  const [nameWasEdited, setNameWasEdited] = useState(false);
  const [guidedDraft, setGuidedDraft] = useState<GuidedAgentCreationDraft>(() => {
    const seed = createDefaultGuidedDraft();
    if (!defaultDirection) return seed;
    return resolveGuidedDraftFromPresetBundle({
      bundle: defaultDirection.bundle,
      seed,
    });
  });
  const [selectedDirectionId, setSelectedDirectionId] = useState<string>(
    defaultDirection?.id ?? "execution"
  );
  const [avatarSeed, setAvatarSeed] = useState(() => randomUUID());
  const [showCapabilityOverrides, setShowCapabilityOverrides] = useState(false);

  const compiledGuided = useMemo(
    () => compileGuidedAgentCreation({ name, draft: guidedDraft }),
    [guidedDraft, name]
  );

  const steps = ["starter", "control", "customize"] as const;
  const stepKey = steps[stepIndex] ?? "starter";
  const stepHeader = STEP_HEADER_COPY[stepKey];

  const canGoNext =
    stepKey === "starter"
      ? Boolean(guidedDraft.starterKit)
      : stepKey === "control"
        ? true
        : stepKey === "customize"
          ? false
          : false;

  const canSubmit =
    stepKey === "customize" &&
    name.trim().length > 0 &&
    compiledGuided.validation.errors.length === 0;

  const moveNext = () => {
    if (!canGoNext) return;
    setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  };

  const moveBack = () => {
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const updatePresetBundle = (direction: StarterDirectionTile) => {
    setSelectedDirectionId(direction.id);
    setName((current) => {
      if (nameWasEdited) return current;
      return DIRECTION_DEFAULT_NAMES[direction.id] ?? current;
    });
    setGuidedDraft((current) => ({
      ...resolveGuidedDraftFromPresetBundle({
        bundle: direction.bundle,
        seed: current,
      }),
    }));
  };

  const webAccessEnabled = hasGuidedGroupCapability({
    controls: guidedDraft.controls,
    group: "group:web",
  });
  const fileToolsEnabled = hasGuidedGroupCapability({
    controls: guidedDraft.controls,
    group: "group:fs",
  });
  const fileMode: FileMode =
    fileToolsEnabled && guidedDraft.controls.fileEditAutonomy === "auto-edit" ? "on" : "off";
  const commandMode: CommandMode = !guidedDraft.controls.allowExec
    ? "off"
    : guidedDraft.controls.execAutonomy === "auto"
      ? "auto"
      : "ask-first";
  const selectedAutonomyProfile: AutonomyProfileId =
    commandMode === "auto"
      ? "autonomous"
      : commandMode === "ask-first"
        ? "collaborative"
        : "conservative";
  const selectedDirection =
    STARTER_DIRECTIONS.find((direction) => direction.id === selectedDirectionId) ??
    STARTER_DIRECTIONS[0];
  const authoritySummary =
    selectedAutonomyProfile === "autonomous"
      ? "Autonomous - acts independently"
      : selectedAutonomyProfile === "collaborative"
        ? "Collaborative - acts with approval"
        : "Conservative - acts with review required";

  const updateWebAccess = (enabled: boolean) => {
    setGuidedDraft((current) => ({
      ...current,
      controls: setGroupCapability({
        controls: current.controls,
        group: "group:web",
        enabled,
      }),
    }));
  };

  const updateFileMode = (mode: FileMode) => {
    setGuidedDraft((current) => {
      let controls = setGroupCapability({
        controls: current.controls,
        group: "group:fs",
        enabled: mode === "on",
      });
      if (mode === "off") {
        controls = { ...controls, fileEditAutonomy: "propose-only" };
      }
      if (mode === "on") {
        controls = {
          ...controls,
          fileEditAutonomy: "auto-edit",
          workspaceAccess: "rw",
        };
      }
      return {
        ...current,
        controls,
      };
    });
  };

  const updateCommandMode = (mode: CommandMode) => {
    setGuidedDraft((current) => {
      if (mode === "off") {
        return {
          ...current,
          controls: {
            ...current.controls,
            allowExec: false,
            execAutonomy: "ask-first",
          },
        };
      }
      if (mode === "ask-first") {
        return {
          ...current,
          controls: {
            ...current.controls,
            allowExec: true,
            execAutonomy: "ask-first",
            approvalSecurity: "allowlist",
            approvalAsk: "always",
            sandboxMode: "all",
          },
        };
      }
      return {
        ...current,
        controls: {
          ...current.controls,
          allowExec: true,
          execAutonomy: "auto",
          approvalSecurity: "full",
          approvalAsk: "off",
          sandboxMode: "all",
        },
      };
    });
  };

  const applyAutonomyProfile = (profile: AutonomyProfileId) => {
    setGuidedDraft((current) => {
      if (profile === "conservative") {
        let controls = resolveGuidedControlsForPreset({
          starterKit: current.starterKit,
          controlLevel: "conservative",
        });
        controls = setGroupCapability({
          controls,
          group: "group:web",
          enabled: true,
        });
        controls = setGroupCapability({
          controls,
          group: "group:fs",
          enabled: false,
        });
        controls = {
          ...controls,
          fileEditAutonomy: "propose-only",
          workspaceAccess: controls.workspaceAccess === "none" ? "ro" : controls.workspaceAccess,
          allowExec: false,
          execAutonomy: "ask-first",
        };
        return {
          ...current,
          controlLevel: "conservative",
          controls,
        };
      }

      if (profile === "collaborative") {
        let controls = resolveGuidedControlsForPreset({
          starterKit: current.starterKit,
          controlLevel: "balanced",
        });
        controls = setGroupCapability({
          controls,
          group: "group:web",
          enabled: true,
        });
        controls = setGroupCapability({
          controls,
          group: "group:fs",
          enabled: true,
        });
        controls = {
          ...controls,
          fileEditAutonomy: "auto-edit",
          workspaceAccess: "rw",
          allowExec: true,
          execAutonomy: "ask-first",
          approvalSecurity: "allowlist",
          approvalAsk: "always",
        };
        return {
          ...current,
          controlLevel: "balanced",
          controls,
        };
      }

      let controls = resolveGuidedControlsForPreset({
        starterKit: current.starterKit,
        controlLevel: "autopilot",
      });
      controls = setGroupCapability({
        controls,
        group: "group:web",
        enabled: true,
      });
      controls = setGroupCapability({
        controls,
        group: "group:fs",
        enabled: true,
      });
      controls = {
        ...controls,
        fileEditAutonomy: "auto-edit",
        workspaceAccess: "rw",
        allowExec: true,
        execAutonomy: "auto",
        approvalSecurity: "full",
        approvalAsk: "off",
        sandboxMode: "all",
      };
      return {
        ...current,
        controlLevel: "autopilot",
        controls,
      };
    });
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;
    void onSubmit({ mode: "guided", name: trimmedName, draft: guidedDraft, avatarSeed });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-background/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create agent"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-4xl rounded-lg border border-border bg-card"
        onClick={(event) => event.stopPropagation()}
        data-testid="agent-create-modal"
      >
        <div className="flex items-center justify-between border-b border-border/80 px-5 py-4">
          <div>
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              New Agent
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">{stepHeader.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stepHeader.subtext}</div>
          </div>
          <button
            type="button"
            className="rounded-md border border-border/80 bg-surface-3 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition hover:border-border hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        </div>

        <div className="h-[clamp(440px,62vh,620px)] overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
          {stepKey === "starter" ? (
            <div className="grid gap-3" data-testid="agent-create-starter-step">
              <div className="text-sm text-muted-foreground">
                What does this agent fully own?
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {STARTER_DIRECTIONS.map((direction) => {
                  const Icon = direction.icon;
                  const isSelected = selectedDirectionId === direction.id;
                  return (
                  <button
                    key={direction.id}
                    type="button"
                    aria-label={`${direction.title} role`}
                    className={`min-h-[108px] rounded-md border border-l-2 px-4 py-2 text-left transition duration-150 ease-out ${
                      isSelected
                        ? `border-2 border-primary/60 bg-surface-2/95 ${direction.railClassName} shadow-md`
                        : `border-border/80 bg-surface-1 ${direction.railClassName} hover:border-border hover:bg-surface-2 hover:shadow-sm`
                    }`}
                    onClick={() => updatePresetBundle(direction)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-border/70 bg-surface-2/95 shadow-inner">
                        <Icon
                          className={`h-3.5 w-3.5 ${
                            direction.iconClassName
                          }`}
                          strokeWidth={1.5}
                        />
                      </span>
                      <div
                        className={`font-mono text-[11px] uppercase tracking-[0.12em] ${
                          isSelected ? "font-bold text-foreground" : "font-semibold text-muted-foreground"
                        }`}
                      >
                        {direction.title}
                      </div>
                      {direction.id === "execution" ? (
                        <span className="rounded border border-border/70 bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
                          Default starting point
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm text-foreground">{direction.description}</div>
                  </button>
                  );
                })}
              </div>
              <div className="rounded-md border border-border/80 bg-surface-1 px-4 py-3">
                <div className="text-xs font-semibold text-foreground">
                  This agent will be accountable for:
                </div>
                <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                  {selectedDirection.accountabilityPoints.map((point) => (
                    <li key={`${selectedDirection.id}-${point}`}>{point}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {stepKey === "control" ? (
            <div className="grid gap-3" data-testid="agent-create-control-step">
              <div className="grid gap-3 md:grid-cols-3">
                {AUTONOMY_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    aria-label={`${profile.title} autonomy profile`}
                    className={`rounded-md border px-4 py-4 text-left transition ${
                      selectedAutonomyProfile === profile.id
                        ? "border-primary/60 bg-surface-2 shadow-sm"
                        : "border-border/80 bg-surface-1 hover:border-border hover:bg-surface-2"
                    }`}
                    onClick={() => applyAutonomyProfile(profile.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {profile.title}
                      </div>
                      {profile.id === "collaborative" ? (
                        <span className="rounded border border-primary/35 bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          Recommended
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs text-foreground">{profile.description}</div>
                    <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                      {profile.details.map((detail) => (
                        <li key={`${profile.id}-${detail}`}>{detail}</li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>

              <button
                type="button"
                aria-label={showCapabilityOverrides ? "Hide fine-tune capabilities" : "Show fine-tune capabilities"}
                className="rounded-md border border-border/70 bg-surface-1 px-2.5 py-1.5 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition hover:border-border hover:bg-surface-2"
                onClick={() => setShowCapabilityOverrides((current) => !current)}
              >
                {showCapabilityOverrides
                  ? "Hide fine-tune capabilities"
                  : "Fine-tune capabilities (optional)"}
              </button>

              {showCapabilityOverrides ? (
                <div className="grid gap-2.5 rounded-md border border-border/70 bg-surface-1/70 p-2.5">
                  <div className="grid gap-0.5">
                    <div className={labelClassName}>Web Access</div>
                    <div className="text-[11px] text-muted-foreground">Internet research and fetch tools.</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <button
                        type="button"
                        aria-label="Web access off"
                        className={controlOptionClassName(!webAccessEnabled, "neutral")}
                        onClick={() => updateWebAccess(false)}
                      >
                        Off
                      </button>
                      <button
                        type="button"
                        aria-label="Web access on"
                        className={controlOptionClassName(webAccessEnabled, "guided")}
                        onClick={() => updateWebAccess(true)}
                      >
                        On
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-0.5">
                    <div className={labelClassName}>Code and Files</div>
                    <div className="text-[11px] text-muted-foreground">Controls codebase and file modification behavior.</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <button
                        type="button"
                        aria-label="File changes off"
                        className={controlOptionClassName(fileMode === "off", "neutral")}
                        onClick={() => updateFileMode("off")}
                      >
                        Off
                      </button>
                      <button
                        type="button"
                        aria-label="File changes on"
                        className={controlOptionClassName(fileMode === "on", "full")}
                        onClick={() => updateFileMode("on")}
                      >
                        On
                      </button>
                    </div>
                    <div
                      className={`min-h-4 text-[11px] ${
                        fileMode === "on" ? "text-muted-foreground" : "text-transparent"
                      }`}
                      aria-hidden={fileMode !== "on"}
                    >
                      {fileMode === "on" ? "Can modify your codebase directly." : "\u00A0"}
                    </div>
                  </div>

                  <div className="grid gap-0.5">
                    <div className={labelClassName}>System Access</div>
                    <div className="text-[11px] text-muted-foreground">Controls system actions and command execution.</div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <button
                        type="button"
                        aria-label="Command execution off"
                        className={controlOptionClassName(commandMode === "off", "neutral")}
                        onClick={() => updateCommandMode("off")}
                      >
                        Off
                      </button>
                      <button
                        type="button"
                        aria-label="Command execution ask first"
                        className={controlOptionClassName(commandMode === "ask-first", "guided")}
                        onClick={() => updateCommandMode("ask-first")}
                      >
                        Ask first
                      </button>
                      <button
                        type="button"
                        aria-label="Command execution auto"
                        className={controlOptionClassName(commandMode === "auto", "full")}
                        onClick={() => updateCommandMode("auto")}
                      >
                        Auto
                      </button>
                    </div>
                    <div
                      className={`min-h-4 text-[11px] ${
                        commandMode === "auto" ? "text-muted-foreground" : "text-transparent"
                      }`}
                      aria-hidden={commandMode !== "auto"}
                    >
                      {commandMode === "auto" ? "Can operate your system automatically." : "\u00A0"}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {stepKey === "customize" ? (
            <div className="grid gap-4" data-testid="agent-create-customize-step">
              <div className="grid gap-4">
                <div className="grid gap-1">
                  <div className="text-sm font-semibold text-foreground">Activation begins immediately.</div>
                </div>
                <div className="rounded-md border border-border/80 bg-surface-1 px-3 py-2">
                  <div className="text-xs font-semibold text-foreground">This agent will:</div>
                  <div className="mt-2 grid gap-1.5 text-xs text-foreground">
                    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2">
                      <span className="text-muted-foreground">Own:</span>
                      <span>
                        {selectedDirection.title} - {selectedDirection.description.replace(/^Owns\s+/i, "").replace(/\.$/, "")}
                      </span>
                    </div>
                    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2">
                      <span className="text-muted-foreground">Authority:</span>
                      <span>{authoritySummary}</span>
                    </div>
                  </div>
                  <div className="mt-3 text-xs font-semibold text-foreground">On launch it will:</div>
                  <ul className="mt-1.5 list-disc pl-4 text-xs text-muted-foreground">
                    {selectedDirection.launchActions.map((action) => (
                      <li key={`${selectedDirection.id}-${action}`}>{action}</li>
                    ))}
                  </ul>
                </div>
                <label className={labelClassName}>
                  Agent name
                  <input
                    value={name}
                    onChange={(event) => {
                      setNameWasEdited(true);
                      setName(event.target.value);
                    }}
                    className={`mt-1 ${fieldClassName}`}
                    placeholder="My agent"
                  />
                </label>
                <div className="-mt-2 text-[11px] text-muted-foreground">
                  Name reflects its role. You can change it later.
                </div>
                <div className="grid justify-items-center gap-2 border-t border-border/70 pt-3">
                  <div className={labelClassName}>Choose avatar</div>
                  <AgentAvatar
                    seed={avatarSeed}
                    name={name.trim() || "New Agent"}
                    size={64}
                    isSelected
                  />
                  <button
                    type="button"
                    aria-label="Shuffle avatar selection"
                    className="inline-flex items-center gap-2 rounded-md border border-border/80 bg-surface-3 px-3 py-2 text-xs text-muted-foreground transition hover:border-border hover:bg-surface-2"
                    onClick={() => setAvatarSeed(randomUUID())}
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                    Shuffle
                  </button>
                  <div className="text-center text-[11px] text-muted-foreground">
                    You can rename or change the avatar later.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {submitError ? (
            <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/12 px-3 py-2 text-xs text-destructive">
              {submitError}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border/80 px-5 py-3">
          {stepKey === "customize" ? (
            <div />
          ) : (
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Step {stepIndex + 1} of {steps.length}
            </div>
          )}
          {stepKey === "customize" ? (
            <div className="grid justify-items-end gap-1">
              <div className="text-[11px] text-muted-foreground">
                You can adjust ownership and authority later.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border/80 bg-surface-3 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition hover:border-border hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={moveBack}
                  disabled={stepIndex === 0 || busy}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="rounded-md border border-transparent bg-primary px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                  onClick={handleSubmit}
                  disabled={!canSubmit || busy}
                >
                  {busy ? "Launching..." : "Launch agent"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-transparent bg-primary px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                onClick={moveNext}
                disabled={!canGoNext || busy}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
