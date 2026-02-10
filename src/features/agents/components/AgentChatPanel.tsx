import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";

import type { AgentState as AgentRecord } from "@/features/agents/state/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Cog, Shuffle } from "lucide-react";
import type { GatewayModelChoice } from "@/lib/gateway/models";
import { isToolMarkdown, isTraceMarkdown } from "@/lib/text/message-extract";
import { isNearBottom } from "@/lib/dom";
import { AgentAvatar } from "./AgentAvatar";
import {
  buildFinalAgentChatItems,
  normalizeAssistantDisplayText,
  summarizeToolLabel,
  type AgentChatItem,
} from "./chatItems";
import { EmptyStatePanel } from "./EmptyStatePanel";

// Extract image URLs from text (http/https URLs and data URIs)
const IMAGE_URL_REGEX = /(data:image\/[^;]+;base64,[^\s]+|https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(?:\?[^\s]*)?\b)/gi;

const extractImageUrls = (text: string): string[] => {
  const matches = text.match(IMAGE_URL_REGEX);
  return matches ? [...new Set(matches)] : [];
};

const renderMessageWithImages = (text: string) => {
  const imageUrls = extractImageUrls(text);
  
  if (imageUrls.length === 0) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>;
  }

  // Remove image URLs from text for markdown rendering
  const textWithoutImages = text.replace(IMAGE_URL_REGEX, "").trim();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {imageUrls.map((url, i) => (
          <img
            key={i}
            src={url}
            alt="Pasted image"
            className="max-w-xs h-auto rounded-md border border-border/50"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ))}
      </div>
      {textWithoutImages && (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{textWithoutImages}</ReactMarkdown>
      )}
    </div>
  );
};

type AgentChatPanelProps = {
  agent: AgentRecord;
  isSelected: boolean;
  canSend: boolean;
  models: GatewayModelChoice[];
  stopBusy: boolean;
  onOpenSettings: () => void;
  onModelChange: (value: string | null) => void;
  onThinkingChange: (value: string | null) => void;
  onDraftChange: (value: string) => void;
  onSend: (message: string) => void;
  onStopRun: () => void;
  onAvatarShuffle: () => void;
};

const AgentChatFinalItems = memo(function AgentChatFinalItems({
  agentId,
  name,
  avatarSeed,
  avatarUrl,
  chatItems,
  autoExpandThinking,
  lastThinkingItemIndex,
}: {
  agentId: string;
  name: string;
  avatarSeed: string;
  avatarUrl: string | null;
  chatItems: AgentChatItem[];
  autoExpandThinking: boolean;
  lastThinkingItemIndex: number;
}) {
  return (
    <>
      {chatItems.map((item, index) => {
        if (item.kind === "thinking") {
          return (
            <details
              key={`chat-${agentId}-thinking-${index}`}
              className="rounded-md border border-border/70 bg-muted/55 text-[11px] text-muted-foreground"
              open={autoExpandThinking && index === lastThinkingItemIndex}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.11em] [&::-webkit-details-marker]:hidden">
                <AgentAvatar seed={avatarSeed} name={name} avatarUrl={avatarUrl} size={22} />
                <span>Thinking</span>
              </summary>
              <div className="agent-markdown px-2 pb-2 text-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
              </div>
            </details>
          );
        }
        if (item.kind === "user") {
          return (
            <div
              key={`chat-${agentId}-user-${index}`}
              className="rounded-md border border-border/70 bg-muted/70 px-3 py-2 text-foreground"
            >
              {renderMessageWithImages(`> ${item.text}`)}
            </div>
          );
        }
        if (item.kind === "tool") {
          const { summaryText, body } = summarizeToolLabel(item.text);
          return (
            <details
              key={`chat-${agentId}-tool-${index}`}
              className="rounded-md border border-border/70 bg-muted/55 px-2 py-1 text-[11px] text-muted-foreground"
            >
              <summary className="cursor-pointer select-none font-mono text-[10px] font-semibold uppercase tracking-[0.11em]">
                {summaryText}
              </summary>
              {body ? (
                <div className="agent-markdown mt-1 text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                </div>
              ) : null}
            </details>
          );
        }
        return (
          <div
            key={`chat-${agentId}-assistant-${index}`}
            className="agent-markdown rounded-md border border-transparent px-0.5"
          >
            {renderMessageWithImages(item.text)}
          </div>
        );
      })}
    </>
  );
});

const AgentChatTranscript = memo(function AgentChatTranscript({
  agentId,
  name,
  avatarSeed,
  avatarUrl,
  status,
  chatItems,
  autoExpandThinking,
  lastThinkingItemIndex,
  liveThinkingText,
  liveAssistantText,
  showTypingIndicator,
  outputLineCount,
  liveAssistantCharCount,
  liveThinkingCharCount,
  scrollToBottomNextOutputRef,
}: {
  agentId: string;
  name: string;
  avatarSeed: string;
  avatarUrl: string | null;
  status: AgentRecord["status"];
  chatItems: AgentChatItem[];
  autoExpandThinking: boolean;
  lastThinkingItemIndex: number;
  liveThinkingText: string;
  liveAssistantText: string;
  showTypingIndicator: boolean;
  outputLineCount: number;
  liveAssistantCharCount: number;
  liveThinkingCharCount: number;
  scrollToBottomNextOutputRef: MutableRefObject<boolean>;
}) {
  const chatRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);

  const scrollChatToBottom = useCallback(() => {
    if (!chatRef.current) return;
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ block: "end" });
      return;
    }
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, []);

  const setPinned = useCallback((nextPinned: boolean) => {
    if (pinnedRef.current === nextPinned) return;
    pinnedRef.current = nextPinned;
    setIsPinned(nextPinned);
  }, []);

  const updatePinnedFromScroll = useCallback(() => {
    const el = chatRef.current;
    if (!el) return;
    setPinned(
      isNearBottom(
        {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        },
        48
      )
    );
  }, [setPinned]);

  const scheduleScrollToBottom = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollChatToBottom();
    });
  }, [scrollChatToBottom]);

  useEffect(() => {
    updatePinnedFromScroll();
  }, [updatePinnedFromScroll]);

  const showJumpToLatest =
    !isPinned && (outputLineCount > 0 || liveAssistantCharCount > 0 || liveThinkingCharCount > 0);

  useEffect(() => {
    const shouldForceScroll = scrollToBottomNextOutputRef.current;
    if (shouldForceScroll) {
      scrollToBottomNextOutputRef.current = false;
      scheduleScrollToBottom();
      return;
    }

    if (pinnedRef.current) {
      scheduleScrollToBottom();
      return;
    }
  }, [
    liveAssistantCharCount,
    liveThinkingCharCount,
    outputLineCount,
    scheduleScrollToBottom,
    scrollToBottomNextOutputRef,
  ]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative flex-1 overflow-hidden rounded-md border border-border/80 bg-card/75">
      <div
        ref={chatRef}
        data-testid="agent-chat-scroll"
        className="h-full overflow-auto p-3 sm:p-4"
        onScroll={() => updatePinnedFromScroll()}
        onWheel={(event) => {
          event.stopPropagation();
        }}
        onWheelCapture={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex flex-col gap-3 text-xs text-foreground">
          {chatItems.length === 0 ? (
            <EmptyStatePanel title="No messages yet." compact className="p-3 text-xs" />
          ) : (
            <>
              <AgentChatFinalItems
                agentId={agentId}
                name={name}
                avatarSeed={avatarSeed}
                avatarUrl={avatarUrl}
                chatItems={chatItems}
                autoExpandThinking={autoExpandThinking}
                lastThinkingItemIndex={lastThinkingItemIndex}
              />
              {liveThinkingText ? (
                <details
                  className="rounded-md border border-border/70 bg-muted/55 text-[11px] text-muted-foreground"
                  open={status === "running" && autoExpandThinking}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.11em] [&::-webkit-details-marker]:hidden">
                    <AgentAvatar seed={avatarSeed} name={name} avatarUrl={avatarUrl} size={22} />
                    <span>Thinking</span>
                    {status === "running" ? (
                      <span className="typing-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : null}
                  </summary>
                  <div className="px-2 pb-2 text-foreground">
                    <div className="whitespace-pre-wrap break-words">{liveThinkingText}</div>
                  </div>
                </details>
              ) : null}
              {liveAssistantText ? (
                <div className="agent-markdown rounded-md border border-transparent px-0.5 opacity-85">
                  {liveAssistantText}
                </div>
              ) : null}
              {showTypingIndicator ? (
                <div
                  className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/55 px-2 py-1.5 text-[11px] text-muted-foreground"
                  role="status"
                  aria-live="polite"
                  data-testid="agent-typing-indicator"
                >
                  <AgentAvatar seed={avatarSeed} name={name} avatarUrl={avatarUrl} size={22} />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.11em]">
                    Thinking
                  </span>
                  <span className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              ) : null}
              <div ref={chatBottomRef} />
            </>
          )}
        </div>
      </div>

      {showJumpToLatest ? (
        <button
          type="button"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border/80 bg-card/95 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground shadow-sm transition hover:bg-muted/70"
          onClick={() => {
            setPinned(true);
            scrollChatToBottom();
          }}
          aria-label="Jump to latest"
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
});

const AgentChatComposer = memo(function AgentChatComposer({
  value,
  onChange,
  onKeyDown,
  onSend,
  onStop,
  canSend,
  stopBusy,
  running,
  sendDisabled,
  inputRef,
  attachedImages = [],
  onImageSelect,
  onRemoveImage,
  attachedPDFs = [],
  onRemovePDF,
  fileInputRef,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
  canSend: boolean;
  stopBusy: boolean;
  running: boolean;
  sendDisabled: boolean;
  inputRef: (el: HTMLTextAreaElement | HTMLInputElement | null) => void;
  attachedImages?: string[];
  onImageSelect?: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage?: (index: number) => void;
  attachedPDFs?: Array<{ name: string; content: string }>;
  onRemovePDF?: (index: number) => void;
  fileInputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {attachedPDFs && attachedPDFs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachedPDFs.map((pdf, index) => (
            <div
              key={index}
              className="relative group inline-flex items-center gap-2 rounded-md bg-primary/15 border border-primary/30 px-3 py-2"
            >
              <span className="text-xs font-semibold text-foreground">[Extracted PDF: {pdf.name}]</span>
              <button
                type="button"
                onClick={() => onRemovePDF?.(index)}
                className="text-xs font-bold text-muted-foreground hover:text-foreground transition"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {attachedImages && attachedImages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachedImages.map((imageData, index) => (
            <div key={index} className="relative group">
              <img
                src={imageData}
                alt="Attached"
                className="max-w-[100px] max-h-[100px] rounded-md border border-border/50 object-cover"
              />
              <button
                type="button"
                onClick={() => onRemoveImage?.(index)}
                className="absolute -top-2 -right-2 rounded-full bg-destructive p-1 opacity-0 group-hover:opacity-100 transition"
              >
                <span className="text-destructive-foreground text-xs">✕</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 min-h-0">
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          className="flex-1 resize-none rounded-md border border-border/80 bg-card/75 px-3 py-2 text-[11px] text-foreground outline-none transition focus:border-ring max-h-48 overflow-y-auto"
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="type a message"
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          onChange={onImageSelect}
          className="hidden"
          data-testid="image-file-input"
        />
        <button
          type="button"
          onClick={() => fileInputRef?.current?.click()}
          className="rounded-md border border-border/80 bg-card/70 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground shadow-sm transition hover:bg-muted/70"
          title="Attach image"
        >
          📎
        </button>
        {running ? (
          <button
            className="rounded-md border border-border/80 bg-card/70 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground shadow-sm transition hover:bg-muted/70 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            type="button"
            onClick={onStop}
            disabled={!canSend || stopBusy}
          >
            {stopBusy ? "Stopping" : "Stop"}
          </button>
        ) : null}
        <button
          className="rounded-md border border-transparent bg-primary px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
        >
          Send
        </button>
      </div>
    </div>
  );
});

export const AgentChatPanel = ({
  agent,
  isSelected,
  canSend,
  models,
  stopBusy,
  onOpenSettings,
  onModelChange,
  onThinkingChange,
  onDraftChange,
  onSend,
  onStopRun,
  onAvatarShuffle,
}: AgentChatPanelProps) => {
  const [draftValue, setDraftValue] = useState(agent.draft);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedPDFs, setAttachedPDFs] = useState<Array<{ name: string; content: string }>>([]);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null!);
  const scrollToBottomNextOutputRef = useRef(false);
  const plainDraftRef = useRef(agent.draft);
  const pendingResizeFrameRef = useRef<number | null>(null);

  const resizeDraft = useCallback(() => {
    const el = draftRef.current;
    if (!el) return;
    
    // Reset to auto to measure actual scroll height
    el.style.height = "auto";
    
    // If there's no text, keep it at minimum height (1 row)
    const hasText = el.value.trim().length > 0;
    if (!hasText) {
      el.style.height = "auto"; // Will use rows={1} as minimum
    } else {
      // Expand to fit content, but cap at max-height
      const maxHeight = 192; // 12rem = 192px (matching max-h-48)
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }
    
    el.style.overflowY = el.scrollHeight > el.clientHeight ? "auto" : "hidden";
  }, []);

  const handleDraftRef = useCallback((el: HTMLTextAreaElement | HTMLInputElement | null) => {
    draftRef.current = el instanceof HTMLTextAreaElement ? el : null;
  }, []);

  useEffect(() => {
    if (agent.draft === plainDraftRef.current) return;
    plainDraftRef.current = agent.draft;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftValue(agent.draft);
  }, [agent.draft]);

  useEffect(() => {
    if (pendingResizeFrameRef.current !== null) {
      cancelAnimationFrame(pendingResizeFrameRef.current);
    }
    pendingResizeFrameRef.current = requestAnimationFrame(() => {
      pendingResizeFrameRef.current = null;
      resizeDraft();
    });
    return () => {
      if (pendingResizeFrameRef.current !== null) {
        cancelAnimationFrame(pendingResizeFrameRef.current);
        pendingResizeFrameRef.current = null;
      }
    };
  }, [resizeDraft, agent.draft]);

  const handleSend = useCallback(
    (message: string) => {
      if (!canSend || agent.status === "running") return;
      const trimmed = message.trim();
      if (!trimmed && attachedImages.length === 0 && attachedPDFs.length === 0) return;
      scrollToBottomNextOutputRef.current = true;
      
      let finalMessage = trimmed;
      
      // Append image URLs to message
      if (attachedImages.length > 0) {
        finalMessage = `${finalMessage}\n\n${attachedImages.join('\n')}`.trim();
      }
      
      // Append PDF content to message
      if (attachedPDFs.length > 0) {
        const pdfContent = attachedPDFs.map(pdf => `[PDF: ${pdf.name}]\n${pdf.content}`).join('\n\n');
        finalMessage = `${finalMessage}\n\n${pdfContent}`.trim();
      }
      
      onSend(finalMessage);
      setAttachedImages([]);
      setAttachedPDFs([]);
    },
    [agent.status, canSend, onSend, attachedImages, attachedPDFs]
  );

  const handleImageSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        // Handle image files
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          setAttachedImages((prev) => [...prev, dataUrl]);
        };
        reader.readAsDataURL(file);
      } else if (file.type === "application/pdf") {
        // Handle PDF files
        const fileName = file.name;
        const reader = new FileReader();
        reader.onload = async (event) => {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          try {
            // Dynamically import pdfjs only when needed (client-side only)
            const pdfjs = await import("pdfjs-dist");
            pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
            
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            let pdfText = "";

            for (let i = 0; i < pdf.numPages; i++) {
              const page = await pdf.getPage(i + 1);
              const textContent = await page.getTextContent();
              const text = textContent.items.map((item: any) => item.str).join(" ");
              pdfText += text + "\n";
            }

            // Add extracted PDF to state (not to draft)
            setAttachedPDFs((prev) => [...prev, { name: fileName, content: pdfText }]);
          } catch (error) {
            console.error("Error parsing PDF:", error);
          }
        };
        reader.readAsArrayBuffer(file);
      }
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleRemovePDF = useCallback((index: number) => {
    setAttachedPDFs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const statusColor =
    agent.status === "running"
      ? "border border-primary/30 bg-primary/15 text-foreground"
      : agent.status === "error"
        ? "border border-destructive/35 bg-destructive/12 text-destructive"
        : "border border-border/70 bg-muted text-muted-foreground";
  const statusLabel =
    agent.status === "running"
      ? "Running"
      : agent.status === "error"
        ? "Error"
        : "Idle";

  const chatItems = useMemo(
    () =>
      buildFinalAgentChatItems({
        outputLines: agent.outputLines,
        showThinkingTraces: agent.showThinkingTraces,
        toolCallingEnabled: agent.toolCallingEnabled,
      }),
    [agent.outputLines, agent.showThinkingTraces, agent.toolCallingEnabled]
  );
  const liveAssistantText = agent.streamText ? normalizeAssistantDisplayText(agent.streamText) : "";
  const liveThinkingText =
    agent.showThinkingTraces && agent.thinkingTrace ? agent.thinkingTrace.trim() : "";
  const hasLiveAssistantText = Boolean(liveAssistantText.trim());
  const hasVisibleLiveThinking = Boolean(liveThinkingText.trim());
  const latestUserOutputIndex = useMemo(() => {
    let latestUserIndex = -1;
    for (let index = agent.outputLines.length - 1; index >= 0; index -= 1) {
      const line = agent.outputLines[index]?.trim();
      if (!line) continue;
      if (line.startsWith(">")) {
        latestUserIndex = index;
        break;
      }
    }
    return latestUserIndex;
  }, [agent.outputLines]);
  const hasSavedThinkingSinceLatestUser = useMemo(() => {
    if (!agent.showThinkingTraces || latestUserOutputIndex < 0) return false;
    for (
      let index = latestUserOutputIndex + 1;
      index < agent.outputLines.length;
      index += 1
    ) {
      if (isTraceMarkdown(agent.outputLines[index] ?? "")) {
        return true;
      }
    }
    return false;
  }, [agent.outputLines, agent.showThinkingTraces, latestUserOutputIndex]);
  const hasSavedAssistantSinceLatestUser = useMemo(() => {
    if (latestUserOutputIndex < 0) return false;
    for (
      let index = latestUserOutputIndex + 1;
      index < agent.outputLines.length;
      index += 1
    ) {
      const line = agent.outputLines[index]?.trim() ?? "";
      if (!line) continue;
      if (line.startsWith(">")) continue;
      if (isTraceMarkdown(line)) continue;
      if (isToolMarkdown(line)) continue;
      return true;
    }
    return false;
  }, [agent.outputLines, latestUserOutputIndex]);
  const lastThinkingItemIndex = useMemo(() => {
    for (let index = chatItems.length - 1; index >= 0; index -= 1) {
      if (chatItems[index]?.kind === "thinking") {
        return index;
      }
    }
    return -1;
  }, [chatItems]);
  const autoExpandThinking =
    agent.status === "running" &&
    !hasSavedAssistantSinceLatestUser &&
    (lastThinkingItemIndex >= 0 || hasVisibleLiveThinking);
  const showTypingIndicator =
    agent.status === "running" &&
    !hasLiveAssistantText &&
    !hasVisibleLiveThinking &&
    !hasSavedThinkingSinceLatestUser;

  const modelOptions = useMemo(
    () =>
      models.map((entry) => ({
        value: `${entry.provider}/${entry.id}`,
        label:
          entry.name === `${entry.provider}/${entry.id}`
            ? entry.name
            : `${entry.name} (${entry.provider}/${entry.id})`,
        reasoning: entry.reasoning,
      })),
    [models]
  );
  const modelValue = agent.model ?? "";
  const modelOptionsWithFallback =
    modelValue && !modelOptions.some((option) => option.value === modelValue)
      ? [{ value: modelValue, label: modelValue, reasoning: undefined }, ...modelOptions]
      : modelOptions;
  const selectedModel = modelOptionsWithFallback.find((option) => option.value === modelValue);
  const allowThinking = selectedModel?.reasoning !== false;

  const avatarSeed = agent.avatarSeed ?? agent.agentId;
  const running = agent.status === "running";
  const sendDisabled = !canSend || running || !draftValue.trim();

  const handleComposerChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      plainDraftRef.current = value;
      setDraftValue(value);
      onDraftChange(value);
      if (pendingResizeFrameRef.current !== null) {
        cancelAnimationFrame(pendingResizeFrameRef.current);
      }
      pendingResizeFrameRef.current = requestAnimationFrame(() => {
        pendingResizeFrameRef.current = null;
        resizeDraft();
      });
    },
    [onDraftChange, resizeDraft]
  );

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      handleSend(draftValue);
    },
    [draftValue, handleSend]
  );

  const handleComposerSend = useCallback(() => {
    handleSend(draftValue);
  }, [draftValue, handleSend]);

  return (
    <div data-agent-panel className="group fade-up relative flex h-full w-full flex-col">
      <div className="px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="group/avatar relative">
              <AgentAvatar
                seed={avatarSeed}
                name={agent.name}
                avatarUrl={agent.avatarUrl ?? null}
                size={96}
                isSelected={isSelected}
              />
              <button
                className="nodrag pointer-events-none absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-card/90 text-muted-foreground opacity-0 shadow-sm transition group-focus-within/avatar:pointer-events-auto group-focus-within/avatar:opacity-100 group-hover/avatar:pointer-events-auto group-hover/avatar:opacity-100 hover:border-border hover:bg-muted/65"
                type="button"
                aria-label="Shuffle avatar"
                data-testid="agent-avatar-shuffle"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onAvatarShuffle();
                }}
              >
                <Shuffle className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.16em] text-foreground sm:text-sm">
                  {agent.name}
                </div>
                <span aria-hidden className="shrink-0 text-[11px] text-muted-foreground/80">
                  •
                </span>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] ${statusColor}`}
                >
                  {statusLabel}
                </span>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_128px]">
                <label className="flex min-w-0 flex-col gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>Model</span>
                  <select
                    className="h-8 w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-border bg-card/75 px-2 text-[11px] font-semibold text-foreground"
                    aria-label="Model"
                    value={modelValue}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      onModelChange(value ? value : null);
                    }}
                  >
                    {modelOptionsWithFallback.length === 0 ? (
                      <option value="">No models found</option>
                    ) : null}
                    {modelOptionsWithFallback.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {allowThinking ? (
                  <label className="flex flex-col gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span>Thinking</span>
                    <select
                      className="h-8 rounded-md border border-border bg-card/75 px-2 text-[11px] font-semibold text-foreground"
                      aria-label="Thinking"
                      value={agent.thinkingLevel ?? ""}
                      onChange={(event) => {
                        const value = event.target.value.trim();
                        onThinkingChange(value ? value : null);
                      }}
                    >
                      <option value="">Default</option>
                      <option value="off">Off</option>
                      <option value="minimal">Minimal</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="xhigh">XHigh</option>
                    </select>
                  </label>
                ) : (
                  <div />
                )}
              </div>
            </div>
          </div>

          <button
            className="nodrag mt-0.5 flex h-9 w-9 items-center justify-center rounded-md border border-border/80 bg-card/60 text-muted-foreground transition hover:border-border hover:bg-muted/65"
            type="button"
            data-testid="agent-settings-toggle"
            aria-label="Open agent settings"
            title="Agent settings"
            onClick={onOpenSettings}
          >
            <Cog className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 sm:px-4 sm:pb-4">
        <AgentChatTranscript
          agentId={agent.agentId}
          name={agent.name}
          avatarSeed={avatarSeed}
          avatarUrl={agent.avatarUrl ?? null}
          status={agent.status}
          chatItems={chatItems}
          autoExpandThinking={autoExpandThinking}
          lastThinkingItemIndex={lastThinkingItemIndex}
          liveThinkingText={liveThinkingText}
          liveAssistantText={liveAssistantText}
          showTypingIndicator={showTypingIndicator}
          outputLineCount={agent.outputLines.length}
          liveAssistantCharCount={agent.streamText?.length ?? 0}
          liveThinkingCharCount={agent.thinkingTrace?.length ?? 0}
          scrollToBottomNextOutputRef={scrollToBottomNextOutputRef}
        />

        <AgentChatComposer
          value={draftValue}
          inputRef={handleDraftRef}
          onChange={handleComposerChange}
          onKeyDown={handleComposerKeyDown}
          onSend={handleComposerSend}
          onStop={onStopRun}
          canSend={canSend}
          stopBusy={stopBusy}
          running={running}
          sendDisabled={sendDisabled}
          attachedImages={attachedImages}
          onImageSelect={handleImageSelect}
          onRemoveImage={handleRemoveImage}
          attachedPDFs={attachedPDFs}
          onRemovePDF={handleRemovePDF}
          fileInputRef={fileInputRef}
        />
      </div>
    </div>
  );
};
