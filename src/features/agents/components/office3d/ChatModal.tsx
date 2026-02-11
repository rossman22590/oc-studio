import { useState, useRef, useEffect, useMemo } from "react";
import { X, Send } from "lucide-react";
import { useAgentStore } from "@/features/agents/state/store";
import {
  buildFinalAgentChatItems,
  normalizeAssistantDisplayText,
  type AgentChatItem,
} from "@/features/agents/components/chatItems";
import { VoiceDictationButton } from "@/components/VoiceDictationButton";

type ChatModalProps = {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onSendMessage?: (agentId: string, message: string) => void;
};

export const ChatModal = ({ agentId, agentName, onClose, onSendMessage }: ChatModalProps) => {
  const { state } = useAgentStore();
  const agent = state.agents.find((a) => a.agentId === agentId);
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Build chat items using the same logic as the main AgentChatPanel
  const chatItems: AgentChatItem[] = useMemo(() => {
    if (!agent) return [];
    return buildFinalAgentChatItems({
      outputLines: agent.outputLines,
      showThinkingTraces: agent.showThinkingTraces,
      toolCallingEnabled: agent.toolCallingEnabled,
    });
  }, [agent?.outputLines, agent?.showThinkingTraces, agent?.toolCallingEnabled]);

  // Live streaming text (not yet committed to outputLines)
  const liveAssistantText = agent?.streamText
    ? normalizeAssistantDisplayText(agent.streamText)
    : "";
  const liveThinkingText =
    agent?.showThinkingTraces && agent?.thinkingTrace
      ? agent.thinkingTrace.trim()
      : "";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatItems.length, liveAssistantText, liveThinkingText]);

  const handleSend = () => {
    if (!message.trim() || !onSendMessage) return;
    onSendMessage(agentId, message);
    setMessage("");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-2xl max-h-[80vh] flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${
                agent?.status === "running" ? "bg-primary animate-pulse" : "bg-muted"
              }`}
            />
            <h2 className="console-title text-xl">{agentName}</h2>
            {agent?.status === "running" && (
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Running...
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {chatItems.length === 0 && !liveAssistantText && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">No messages yet. Start a conversation!</p>
            </div>
          )}

          {chatItems.map((item, index) => {
            if (item.kind === "thinking") {
              return (
                <div key={index} className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg px-4 py-3 bg-accent/20 text-accent-foreground border border-accent/30">
                    <p className="text-xs uppercase tracking-wider font-semibold mb-2 opacity-70">
                      Thinking
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap font-mono">
                      {item.text}
                    </p>
                  </div>
                </div>
              );
            }

            if (item.kind === "tool") {
              return (
                <div key={index} className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg px-4 py-3 bg-muted/60 text-muted-foreground border border-border/50">
                    <p className="text-xs uppercase tracking-wider font-semibold mb-1 opacity-70">
                      Tool Call
                    </p>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap font-mono">
                      {item.text}
                    </p>
                  </div>
                </div>
              );
            }

            const isUser = item.kind === "user";
            return (
              <div
                key={index}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.text}</p>
                </div>
              </div>
            );
          })}

          {/* Live thinking trace (streaming) */}
          {liveThinkingText && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-4 py-3 bg-accent/20 text-accent-foreground border border-accent/30">
                <p className="text-xs uppercase tracking-wider font-semibold mb-2 opacity-70">
                  Thinking…
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap font-mono">
                  {liveThinkingText}
                </p>
              </div>
            </div>
          )}

          {/* Live assistant stream text */}
          {liveAssistantText && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-4 py-3 bg-muted text-foreground">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{liveAssistantText}</p>
              </div>
            </div>
          )}

          {/* Typing dots when running but no stream yet */}
          {agent?.status === "running" && !liveAssistantText && !liveThinkingText && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-3">
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border px-6 py-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              disabled={agent?.status === "running"}
            />
            <VoiceDictationButton
              onTranscript={(text) => setMessage((prev) => prev ? `${prev} ${text}` : text)}
              disabled={agent?.status === "running"}
            />
            <button
              onClick={handleSend}
              disabled={!message.trim() || agent?.status === "running"}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
