import { describe, expect, it } from "vitest";
import {
  compileGuidedAgentCreation,
  createDefaultGuidedDraft,
  deriveGuidedPresetCapabilitySummary,
  resolveGuidedControlsForPreset,
  resolveGuidedDraftFromPresetBundle,
} from "@/features/agents/creation/compiler";
import type { GuidedAgentCreationDraft } from "@/features/agents/creation/types";

const createDraft = (): GuidedAgentCreationDraft => {
  const draft = createDefaultGuidedDraft();
  return {
    ...draft,
    starterKit: "engineer",
    controlLevel: "balanced",
    customInstructions: "Prefer minimal, test-backed diffs.",
    userProfile: "Product engineer who prefers concise summaries.",
    toolNotes: "Use git history and markdown formatting conventions.",
    memoryNotes: "Remember recurring formatting preferences.",
    heartbeatEnabled: false,
    heartbeatChecklist: ["Check stale release notes.", "Confirm source links.", "Report only blockers."],
  };
};

describe("compileGuidedAgentCreation", () => {
  it("compiles default starter draft without legacy outcome-form errors", () => {
    const result = compileGuidedAgentCreation({
      name: "Agent",
      draft: createDefaultGuidedDraft(),
    });
    expect(result.validation.errors).toEqual([]);
  });

  it("maps researcher + conservative to safe defaults", () => {
    const draft = createDraft();
    draft.starterKit = "researcher";
    draft.controlLevel = "conservative";
    draft.controls = resolveGuidedControlsForPreset({
      starterKit: draft.starterKit,
      controlLevel: draft.controlLevel,
    });
    const result = compileGuidedAgentCreation({
      name: "Research Agent",
      draft,
    });

    expect(result.validation.errors).toEqual([]);
    expect(result.agentOverrides.sandbox).toEqual({
      mode: "all",
      workspaceAccess: "ro",
    });
    expect(result.agentOverrides.tools?.profile).toBe("minimal");
    expect(result.agentOverrides.tools?.allow).toBeUndefined();
    expect(result.agentOverrides.tools?.alsoAllow).toContain("group:web");
    expect(result.agentOverrides.tools?.deny).toContain("group:runtime");
    expect(result.agentOverrides.tools?.deny).toContain("write");
    expect(result.agentOverrides.tools?.deny).toContain("edit");
    expect(result.agentOverrides.tools?.deny).toContain("apply_patch");
    expect(result.files["AGENTS.md"]).toBeUndefined();
    expect(result.files["IDENTITY.md"]).toContain("Role: Research analyst");
    expect(result.files["IDENTITY.md"]).toContain("Creature: Analyst Cartographer");
    expect(result.files["SOUL.md"]).toContain("## Core Truths");
    expect(result.files["SOUL.md"]).toContain("Evidence beats intuition when stakes are non-trivial.");
    expect(result.execApprovals).toBeNull();
  });

  it("maps engineer + balanced to coding defaults with runtime enabled", () => {
    const draft = createDraft();
    draft.starterKit = "engineer";
    draft.controlLevel = "balanced";
    draft.controls = resolveGuidedControlsForPreset({
      starterKit: draft.starterKit,
      controlLevel: draft.controlLevel,
    });
    const result = compileGuidedAgentCreation({
      name: "Engineer Agent",
      draft,
    });

    expect(result.validation.errors).toEqual([]);
    expect(Object.keys(result.files).sort()).toEqual(["IDENTITY.md", "SOUL.md"]);
    expect(result.files["AGENTS.md"]).toBeUndefined();
    expect(result.files["IDENTITY.md"]).toContain("Role: Software engineer");
    expect(result.files["IDENTITY.md"]).toContain("Creature: Pragmatic Builder");
    expect(result.files["SOUL.md"]).toContain("## Core Truths");
    expect(result.files["SOUL.md"]).toContain("Small scoped changes reduce operational risk.");
    expect(result.agentOverrides.tools?.profile).toBe("coding");
    expect(result.agentOverrides.tools?.alsoAllow).toContain("group:runtime");
    expect(result.agentOverrides.tools?.deny).not.toContain("group:runtime");
    expect(result.agentOverrides.tools?.deny).toContain("write");
    expect(result.agentOverrides.tools?.deny).toContain("edit");
    expect(result.agentOverrides.tools?.deny).toContain("apply_patch");
    expect(result.execApprovals).toEqual({
      security: "allowlist",
      ask: "on-miss",
      allowlist: [],
    });
  });

  it("maps marketer + conservative to messaging defaults", () => {
    const draft = createDraft();
    draft.starterKit = "marketer";
    draft.controlLevel = "conservative";
    draft.controls = resolveGuidedControlsForPreset({
      starterKit: draft.starterKit,
      controlLevel: draft.controlLevel,
    });
    const result = compileGuidedAgentCreation({
      name: "Marketing Agent",
      draft,
    });

    expect(result.validation.errors).toEqual([]);
    expect(result.agentOverrides.tools?.profile).toBe("messaging");
    expect(result.agentOverrides.tools?.alsoAllow).toContain("group:web");
    expect(result.agentOverrides.tools?.deny).toContain("group:runtime");
    expect(result.agentOverrides.tools?.deny).toContain("write");
    expect(result.agentOverrides.tools?.deny).toContain("edit");
    expect(result.agentOverrides.tools?.deny).toContain("apply_patch");
    expect(result.files["AGENTS.md"]).toBeUndefined();
    expect(result.files["IDENTITY.md"]).toContain("Role: Marketing operator");
    expect(result.files["IDENTITY.md"]).toContain("Creature: Signal Operator");
    expect(result.files["SOUL.md"]).toContain("Message-market fit beats channel hacks.");
    expect(result.execApprovals).toBeNull();
  });

  it("keeps contradiction validation for manual control overrides", () => {
    const draft = createDraft();
    draft.controlLevel = "autopilot";
    draft.controls = resolveGuidedControlsForPreset({
      starterKit: draft.starterKit,
      controlLevel: draft.controlLevel,
    });
    draft.controls.allowExec = false;

    const result = compileGuidedAgentCreation({
      name: "Broken Agent",
      draft,
    });

    expect(result.validation.errors).toContain("Auto exec requires runtime tools to be enabled.");
  });

  it("forces sandbox mode to all when compiling guided agent creation", () => {
    const draft = createDraft();
    draft.controls.allowExec = true;
    draft.controls.execAutonomy = "ask-first";
    draft.controls.sandboxMode = "off";

    const result = compileGuidedAgentCreation({
      name: "Sandbox Normalization Agent",
      draft,
    });

    expect(result.validation.errors).toEqual([]);
    expect(result.agentOverrides.sandbox).toEqual({
      mode: "all",
      workspaceAccess: draft.controls.workspaceAccess,
    });
  });

  it("maps PR Engineer bundle to engineer + autopilot defaults", () => {
    const draft = resolveGuidedDraftFromPresetBundle({
      bundle: "pr-engineer",
      seed: createDefaultGuidedDraft(),
    });

    expect(draft.starterKit).toBe("engineer");
    expect(draft.controlLevel).toBe("autopilot");
    expect(draft.controls.toolsProfile).toBe("coding");
    expect(draft.controls.allowExec).toBe(true);
    expect(draft.controls.sandboxMode).toBe("all");
    expect(draft.controls.workspaceAccess).toBe("rw");
    expect(draft.controls.toolsAllow).toContain("group:web");
    expect(draft.controls.toolsAllow).toContain("group:fs");
    expect(draft.heartbeatEnabled).toBe(false);
  });

  it("maps Autonomous Engineer bundle to engineer + autopilot defaults", () => {
    const draft = resolveGuidedDraftFromPresetBundle({
      bundle: "autonomous-engineer",
      seed: createDefaultGuidedDraft(),
    });

    expect(draft.starterKit).toBe("engineer");
    expect(draft.controlLevel).toBe("autopilot");
    expect(draft.controls.allowExec).toBe(true);
    expect(draft.controls.execAutonomy).toBe("auto");
    expect(draft.controls.fileEditAutonomy).toBe("auto-edit");
    expect(draft.controls.sandboxMode).toBe("all");
    expect(draft.controls.workspaceAccess).toBe("rw");
  });

  it("derives capability chips from controls", () => {
    const draft = resolveGuidedDraftFromPresetBundle({
      bundle: "pr-engineer",
      seed: createDefaultGuidedDraft(),
    });
    const capability = deriveGuidedPresetCapabilitySummary({
      controls: draft.controls,
    });

    expect(capability.chips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "command", label: "Command", enabled: true, value: "On" }),
        expect.objectContaining({ id: "web", label: "Web access", enabled: true, value: "On" }),
        expect.objectContaining({
          id: "files",
          label: "File tools",
          enabled: true,
          value: "On",
        }),
      ])
    );
  });

  it("does not include risk or caveat metadata in capability chips", () => {
    const draft = resolveGuidedDraftFromPresetBundle({
      bundle: "research-analyst",
      seed: createDefaultGuidedDraft(),
    });
    const capability = deriveGuidedPresetCapabilitySummary({
      controls: draft.controls,
    });

    expect("risk" in capability).toBe(false);
    expect("caveats" in capability).toBe(false);
  });
});
