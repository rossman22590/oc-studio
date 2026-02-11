type ThoughtBubbleProps = {
  agentName: string;
  message: string;
  onOpenChat: () => void;
};

export const ThoughtBubble = ({ agentName, message, onOpenChat }: ThoughtBubbleProps) => {
  // Truncate long messages
  const truncateMessage = (msg: string, maxLength = 120) => {
    if (msg.length <= maxLength) return msg;
    return msg.substring(0, maxLength) + "...";
  };

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 max-w-md animate-fade-in">
      <button
        onClick={onOpenChat}
        className="glass-panel px-6 py-4 cursor-pointer transition-all hover:scale-105 hover:border-primary group"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="font-semibold text-sm uppercase tracking-wider text-primary">
              {agentName}
            </span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            {truncateMessage(message)}
          </p>
          <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            Click to open full conversation →
          </span>
        </div>

        {/* Speech bubble pointer */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[12px] border-t-[var(--panel-border)]" />
        <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[10px] border-t-[var(--panel)]" />
      </button>
    </div>
  );
};
