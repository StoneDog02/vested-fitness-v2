import React, { useCallback, useRef, useState } from "react";
import Tooltip from "~/components/ui/Tooltip";
import type { ChatMessage, ChatPollData } from "~/lib/chat.types";
import ReactionDetailsModal from "./ReactionDetailsModal";
import PollMessage from "./PollMessage";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const ACTION_BAR_HEIGHT = 36;
const HIDE_DELAY_MS = 120;

interface ReactionGroup {
  reaction: string;
  count: number;
  user_ids: string[];
  users?: string[];
}

interface MessageBubbleProps {
  message: ChatMessage;
  isMine: boolean;
  bubbleColor?: string;
  showSenderName?: boolean;
  reactions?: ReactionGroup[];
  currentUserId: string;
  onReply: (message: ChatMessage) => void;
  onReact: (messageId: string, reaction: string) => void;
  replyPreview?: ChatMessage | null;
  poll?: ChatPollData | null;
  onPollVote?: (messageId: string, optionId: string) => void;
  pollVoting?: boolean;
}

function isColorDark(hex: string | undefined): boolean {
  if (!hex) return false;
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((x) => x + x).join("");
  if (hex.length !== 6) return false;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.6;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getReplyQuotePreviewText(replyPreview: ChatMessage): string {
  if (replyPreview.message_type === "gif") return "GIF";
  if (replyPreview.message_type === "image") return "Photo";
  if (replyPreview.message_type === "poll") return replyPreview.content || "Poll";
  return replyPreview.content;
}

function getReplySenderLabel(replyPreview: ChatMessage): string {
  return (
    replyPreview.sender_name ||
    (replyPreview.sender === "coach" ? "Coach" : "Client")
  );
}

function getInitials(name?: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function SenderAvatar({
  name,
  avatarUrl,
}: {
  name?: string | null;
  avatarUrl?: string | null;
}) {
  const label = name?.trim() || "User";
  const initials = getInitials(name);

  return (
    <Tooltip content={label}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-600 object-cover flex-shrink-0"
        />
      ) : (
        <div
          className="w-8 h-8 rounded-full border border-primary/30 bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0"
          aria-hidden
        >
          {initials}
        </div>
      )}
    </Tooltip>
  );
}

function ReplyQuotePreview({
  preview,
  isMine,
}: {
  preview: ChatMessage;
  isMine: boolean;
}) {
  const text = getReplyQuotePreviewText(preview);
  const sender = getReplySenderLabel(preview);

  if (isMine) {
    return (
      <div className="mb-1.5 rounded-xl border-l-[3px] border-primary bg-primary/10 dark:bg-primary/15 px-2.5 py-1.5">
        <p className="text-[11px] font-semibold leading-tight text-gray-700 dark:text-gray-200 truncate">
          {sender}
        </p>
        <p className="text-[11px] leading-snug text-gray-600 dark:text-gray-400 line-clamp-2">
          {text}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-1.5 rounded-xl border-l-[3px] border-gray-400/70 dark:border-gray-500 bg-gray-200/90 dark:bg-gray-700/70 px-2.5 py-1.5">
      <p className="text-[11px] font-semibold leading-tight text-gray-700 dark:text-gray-200 truncate">
        {sender}
      </p>
      <p className="text-[11px] leading-snug text-gray-600 dark:text-gray-400 line-clamp-2">
        {text}
      </p>
    </div>
  );
}

export default function MessageBubble({
  message,
  isMine,
  bubbleColor,
  showSenderName,
  reactions = [],
  currentUserId,
  onReply,
  onReact,
  replyPreview,
  poll,
  onPollVote,
  pollVoting = false,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [actionsAbove, setActionsAbove] = useState(true);
  const [reactionDetails, setReactionDetails] = useState<ReactionGroup | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const openActions = useCallback(() => {
    clearHideTimer();
    const col = columnRef.current;
    if (col) {
      const scrollEl = col.closest("[data-chat-scroll]");
      if (scrollEl) {
        const scrollRect = scrollEl.getBoundingClientRect();
        const bubbleEl = col.querySelector("[data-message-bubble]");
        const bubbleRect = bubbleEl?.getBoundingClientRect() ?? col.getBoundingClientRect();
        const spaceAbove = bubbleRect.top - scrollRect.top;
        setActionsAbove(spaceAbove >= ACTION_BAR_HEIGHT);
      }
    }
    setShowActions(true);
  }, [clearHideTimer]);

  const closeActions = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setShowActions(false), HIDE_DELAY_MS);
  }, [clearHideTimer]);

  const bg = isMine && bubbleColor ? bubbleColor : "#f3f4f6";
  const onDarkBubble = isMine && !!bubbleColor && isColorDark(bubbleColor);
  const textColor = onDarkBubble ? "#fff" : "#374151";
  const mutedColor = onDarkBubble ? "rgba(255,255,255,0.7)" : "#6b7280";

  const pillPositionClasses = actionsAbove
    ? "bottom-full mb-0 translate-y-[50%] origin-bottom"
    : "top-full mt-0 -translate-y-[50%] origin-top";

  const pillVisibilityClasses = showActions
    ? "opacity-100 scale-100 pointer-events-auto"
    : "opacity-0 scale-[0.88] pointer-events-none";

  return (
    <div
      className={`flex items-end gap-2 group ${isMine ? "justify-end" : "justify-start"}`}
    >
      {!isMine && (
        <SenderAvatar
          name={message.sender_name}
          avatarUrl={message.sender_avatar_url}
        />
      )}

      <div ref={columnRef} className={`flex flex-col min-w-0 ${message.message_type === "poll" ? "max-w-sm" : "max-w-xs"}`}>
        {showSenderName && !isMine && message.sender_name && (
          <span className="text-xs text-gray-500 mb-0.5 ml-1">{message.sender_name}</span>
        )}

        {replyPreview && (
          <ReplyQuotePreview preview={replyPreview} isMine={isMine} />
        )}

        <div
          className="relative"
          onMouseEnter={openActions}
          onMouseLeave={closeActions}
        >
          <div
            className={`absolute z-20 flex gap-0.5 sm:gap-1 bg-white dark:bg-gray-700 rounded-full shadow-lg px-2 py-1 border border-gray-200 dark:border-gray-600 whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.34,1.25,0.64,1)] ${pillPositionClasses} ${pillVisibilityClasses} ${
              isMine ? "right-0" : "left-0"
            }`}
            aria-hidden={!showActions}
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="hover:scale-125 transition-transform duration-150 text-sm p-0.5"
                onClick={() => onReact(message.id, emoji)}
              >
                {emoji}
              </button>
            ))}
            <span className="w-px h-4 bg-gray-200 dark:bg-gray-500 self-center mx-0.5" />
            <button
              type="button"
              className="text-xs text-gray-500 dark:text-gray-300 hover:text-primary px-1.5 py-0.5"
              onClick={() => onReply(message)}
            >
              Reply
            </button>
          </div>

          <div
            data-message-bubble
            className={`relative z-10 rounded-2xl shadow text-sm ${
              message.message_type === "poll" ? "px-3.5 py-3" : "px-3 py-2"
            }`}
            style={{ background: bg, color: textColor }}
          >
            {message.message_type === "poll" && poll ? (
              <PollMessage
                poll={poll}
                onVote={(optionId) => onPollVote?.(message.id, optionId)}
                voting={pollVoting}
                mutedColor={mutedColor}
                textColor={textColor}
                surfaceColor={bg}
              />
            ) : message.message_type === "poll" ? (
              <div className="font-semibold text-sm animate-pulse" style={{ color: textColor }}>
                {message.content}
              </div>
            ) : message.message_type === "image" || message.message_type === "gif" ? (
              message.attachment_url ? (
                <img
                  src={message.attachment_url}
                  alt=""
                  className="max-w-full rounded-md max-h-64 object-contain"
                />
              ) : null
            ) : (
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
            )}

            <div className="text-xs text-right mt-1" style={{ color: mutedColor }}>
              {formatTime(message.timestamp)}
            </div>
          </div>
        </div>

        {reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
            {reactions.map((r) => (
              <button
                key={r.reaction}
                type="button"
                onClick={() => setReactionDetails(r)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors duration-150 cursor-pointer hover:bg-gray-200/80 dark:hover:bg-gray-600/80 ${
                  r.user_ids.includes(currentUserId)
                    ? "bg-primary/20 border-primary"
                    : "bg-gray-100 border-gray-200 dark:bg-gray-700 dark:border-gray-600"
                }`}
              >
                {r.reaction} {r.count}
              </button>
            ))}
          </div>
        )}

        <ReactionDetailsModal
          isOpen={!!reactionDetails}
          onClose={() => setReactionDetails(null)}
          reaction={reactionDetails?.reaction ?? ""}
          userNames={reactionDetails?.users ?? []}
        />
      </div>
    </div>
  );
}
