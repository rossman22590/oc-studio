import { describe, expect, it } from "vitest";

import {
  buildOutputLinesFromTranscriptEntries,
  createTranscriptEntryFromLine,
  mergeTranscriptEntriesWithHistory,
  sortTranscriptEntries,
  type TranscriptEntry,
} from "@/features/agents/state/transcript";

const createEntry = (params: {
  line: string;
  sessionKey?: string;
  source: "local-send" | "runtime-chat" | "runtime-agent" | "history" | "legacy";
  sequence: number;
  timestampMs?: number;
  runId?: string | null;
  role?: "user" | "assistant" | "tool" | "system" | "other";
  kind?: "meta" | "user" | "assistant" | "thinking" | "tool";
  confirmed?: boolean;
  entryId?: string;
}): TranscriptEntry => {
  const entry = createTranscriptEntryFromLine({
    line: params.line,
    sessionKey: params.sessionKey ?? "agent:agent-1:studio:test-session",
    source: params.source,
    sequenceKey: params.sequence,
    timestampMs: params.timestampMs,
    runId: params.runId,
    role: params.role,
    kind: params.kind,
    confirmed: params.confirmed,
    entryId: params.entryId,
  });
  if (!entry) {
    throw new Error("Expected transcript entry");
  }
  return entry;
};

describe("transcript", () => {
  it("orders local user turns before assistant text at equal timestamps", () => {
    const entries = sortTranscriptEntries([
      createEntry({
        line: "assistant reply",
        source: "runtime-chat",
        sequence: 2,
        timestampMs: 1000,
        role: "assistant",
        kind: "assistant",
      }),
      createEntry({
        line: "> hello",
        source: "local-send",
        sequence: 1,
        timestampMs: 1000,
        role: "user",
        kind: "user",
      }),
    ]);

    expect(buildOutputLinesFromTranscriptEntries(entries)).toEqual(["> hello", "assistant reply"]);
  });

  it("merges history entries by confirming optimistic local entries", () => {
    const existing = [
      createEntry({
        line: "> hello",
        source: "local-send",
        sequence: 1,
        timestampMs: 1000,
        role: "user",
        kind: "user",
        confirmed: false,
      }),
      createEntry({
        line: "assistant reply",
        source: "runtime-chat",
        sequence: 2,
        timestampMs: 1500,
        role: "assistant",
        kind: "assistant",
        confirmed: false,
      }),
    ];

    const history = [
      createEntry({
        line: "> hello",
        source: "history",
        sequence: 10,
        timestampMs: 1000,
        role: "user",
        kind: "user",
        confirmed: true,
        entryId: "history:hello",
      }),
      createEntry({
        line: "assistant reply",
        source: "history",
        sequence: 11,
        timestampMs: 1500,
        role: "assistant",
        kind: "assistant",
        confirmed: true,
        entryId: "history:reply",
      }),
    ];

    const merged = mergeTranscriptEntriesWithHistory({
      existingEntries: existing,
      historyEntries: history,
    });

    expect(merged.entries).toHaveLength(2);
    expect(merged.confirmedCount).toBe(2);
    expect(merged.mergedCount).toBe(0);
    expect(merged.entries.every((entry) => entry.confirmed)).toBe(true);
  });

  it("keeps repeated identical messages as separate entries", () => {
    const existing = [
      createEntry({
        line: "> ping",
        source: "local-send",
        sequence: 1,
        timestampMs: 1000,
        role: "user",
        kind: "user",
        confirmed: false,
        entryId: "local:1",
      }),
      createEntry({
        line: "> ping",
        source: "local-send",
        sequence: 2,
        timestampMs: 3000,
        role: "user",
        kind: "user",
        confirmed: false,
        entryId: "local:2",
      }),
    ];

    const history = [
      createEntry({
        line: "> ping",
        source: "history",
        sequence: 10,
        timestampMs: 1000,
        role: "user",
        kind: "user",
        confirmed: true,
        entryId: "history:1",
      }),
      createEntry({
        line: "> ping",
        source: "history",
        sequence: 11,
        timestampMs: 3000,
        role: "user",
        kind: "user",
        confirmed: true,
        entryId: "history:2",
      }),
    ];

    const merged = mergeTranscriptEntriesWithHistory({
      existingEntries: existing,
      historyEntries: history,
    });

    expect(merged.entries).toHaveLength(2);
    expect(buildOutputLinesFromTranscriptEntries(merged.entries)).toEqual(["> ping", "> ping"]);
    expect(merged.entries[0]?.timestampMs).toBe(1000);
    expect(merged.entries[1]?.timestampMs).toBe(3000);
  });

  it("reports conflicts when multiple optimistic candidates are possible", () => {
    const existing = [
      createEntry({
        line: "> hello",
        source: "local-send",
        sequence: 1,
        timestampMs: 1000,
        role: "user",
        kind: "user",
        confirmed: false,
        entryId: "local:a",
      }),
      createEntry({
        line: "> hello",
        source: "local-send",
        sequence: 2,
        timestampMs: 1000,
        role: "user",
        kind: "user",
        confirmed: false,
        entryId: "local:b",
      }),
    ];

    const history = [
      createEntry({
        line: "> hello",
        source: "history",
        sequence: 10,
        timestampMs: 1000,
        role: "user",
        kind: "user",
        confirmed: true,
        entryId: "history:hello",
      }),
    ];

    const merged = mergeTranscriptEntriesWithHistory({
      existingEntries: existing,
      historyEntries: history,
    });

    expect(merged.conflictCount).toBe(1);
    expect(merged.entries).toHaveLength(2);
    const confirmed = merged.entries.filter((entry) => entry.confirmed);
    expect(confirmed).toHaveLength(1);
  });
});
