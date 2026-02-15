import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentCreateModal } from "@/features/agents/components/AgentCreateModal";

const openModal = (overrides?: {
  onClose?: () => void;
  onSubmit?: (payload: unknown) => void;
}) => {
  const onClose = overrides?.onClose ?? vi.fn();
  const onSubmit = overrides?.onSubmit ?? vi.fn();
  render(
    createElement(AgentCreateModal, {
      open: true,
      suggestedName: "New Agent",
      onClose,
      onSubmit,
    })
  );
  return { onClose, onSubmit };
};

describe("AgentCreateModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits guided payload through preset-bundle flow", () => {
    const onSubmit = vi.fn();
    openModal({ onSubmit });

    fireEvent.click(screen.getByRole("button", { name: "Product role" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Collaborative autonomy profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.change(screen.getByLabelText("Agent name"), {
      target: { value: "PR Agent" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Launch agent" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "guided",
        name: "PR Agent",
        avatarSeed: expect.any(String),
        draft: expect.objectContaining({
          starterKit: "engineer",
          controlLevel: "balanced",
        }),
      })
    );
  });

  it("renders outcome-centric domain tiles", () => {
    openModal();

    expect(screen.getByText("What does this agent fully own?")).toBeInTheDocument();
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Owns shipping velocity and product quality.")).toBeInTheDocument();
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Owns acquisition and conversion performance.")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Owns monetization and pricing performance.")).toBeInTheDocument();
    expect(screen.getByText("Execution")).toBeInTheDocument();
    expect(screen.getByText("Systems")).toBeInTheDocument();
    expect(screen.getByText("Strategy")).toBeInTheDocument();
    expect(screen.getByText("Owns prioritization and capital allocation.")).toBeInTheDocument();
    expect(screen.getByText("This agent will be accountable for:")).toBeInTheDocument();
    expect(screen.queryByText(/^Includes:/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Think in terms of roles, not tasks. What responsibility do you want to delegate?")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Knowledge")).not.toBeInTheDocument();
    expect(screen.queryByText("Builder")).not.toBeInTheDocument();
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
    expect(screen.queryByText("Baseline")).not.toBeInTheDocument();
    expect(screen.queryByText("Command: On")).not.toBeInTheDocument();
    expect(screen.queryByText("Web access: Off")).not.toBeInTheDocument();
    expect(screen.queryByText("File tools: On")).not.toBeInTheDocument();
  });

  it("updates accountability preview when a different domain is selected", () => {
    openModal();

    fireEvent.click(screen.getByRole("button", { name: "Revenue role" }));

    expect(screen.getByText("Monitoring revenue performance")).toBeInTheDocument();
    expect(screen.getByText("Identifying root causes of decline")).toBeInTheDocument();
    expect(screen.getByText("Running pricing and offer experiments")).toBeInTheDocument();
    expect(screen.getByText("Reporting progress autonomously")).toBeInTheDocument();
  });

  it("keeps preset cards free of sandbox jargon and risk labels", () => {
    openModal();

    expect(
      screen.queryByText("Sandbox mode non-main does not sandbox the agent main session.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Risk: Moderate")).not.toBeInTheDocument();
  });

  it("supports autonomy profiles and optional fine-tune overrides", () => {
    openModal();

    fireEvent.click(screen.getByRole("button", { name: "Product role" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.click(screen.getByRole("button", { name: "Conservative autonomy profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Show fine-tune capabilities" }));
    fireEvent.click(screen.getByRole("button", { name: "Web access on" }));
    fireEvent.click(screen.getByRole("button", { name: "File changes on" }));
    fireEvent.click(screen.getByRole("button", { name: "Command execution auto" }));

    expect(screen.getByText("Can modify your codebase directly.")).toBeInTheDocument();
    expect(screen.getByText("Can operate your system automatically.")).toBeInTheDocument();
  });

  it("sets sandbox all when command execution is ask first", () => {
    const onSubmit = vi.fn();
    openModal({ onSubmit });

    fireEvent.click(screen.getByRole("button", { name: "Product role" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Show fine-tune capabilities" }));
    fireEvent.click(screen.getByRole("button", { name: "Command execution ask first" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Agent name"), {
      target: { value: "Ask First Agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Launch agent" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          controls: expect.objectContaining({
            allowExec: true,
            execAutonomy: "ask-first",
            sandboxMode: "all",
          }),
        }),
      })
    );
  });

  it("shows avatar controls on customize step and removes task/instruction inputs", () => {
    openModal();

    fireEvent.click(screen.getByRole("button", { name: "Strategy role" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Activation begins immediately.")).toBeInTheDocument();
    expect(screen.getByText("This agent will:")).toBeInTheDocument();
    expect(screen.getByText("On launch it will:")).toBeInTheDocument();
    expect(screen.getByText("Authority:")).toBeInTheDocument();
    expect(screen.getByText("Choose avatar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shuffle avatar selection" })).toBeInTheDocument();
    expect(screen.getByText("Name reflects its role. You can change it later.")).toBeInTheDocument();
    expect(screen.queryByLabelText("First task")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Custom instructions (optional)")).not.toBeInTheDocument();
  });

  it("supports revenue as a first-class preset", () => {
    const onSubmit = vi.fn();
    openModal({ onSubmit });

    fireEvent.click(screen.getByRole("button", { name: "Revenue role" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.change(screen.getByLabelText("Agent name"), {
      target: { value: "Custom Owner Agent" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Launch agent" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          starterKit: "marketer",
        }),
      })
    );
  });

  it("keeps step three focused without advanced configuration controls", () => {
    openModal();

    fireEvent.click(screen.getByRole("button", { name: "Product role" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByRole("button", { name: "Show advanced controls" })).not.toBeInTheDocument();
    expect(screen.queryByText("Tool profile")).not.toBeInTheDocument();
    expect(screen.queryByText("Sandbox mode")).not.toBeInTheDocument();
    expect(screen.queryByText("Approval mode")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Additional tool allowlist entries (comma or newline separated)")
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("First task")).not.toBeInTheDocument();
  });

  it("calls onClose when close is pressed", () => {
    const onClose = vi.fn();
    openModal({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
