import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Button from "~/components/ui/Button";
import { useUser } from "~/context/UserContext";
import { useChatRealtime } from "~/hooks/useChatRealtime";
import type { ChatMessage, ChatPollData, Conversation } from "~/lib/chat.types";
import { isMessageFromCurrentUser, buildOptimisticChatMessage } from "~/lib/chat.types";
import MessageBubble from "./MessageBubble";
import GifPicker, { type GifSelection } from "./GifPicker";
import ChatAttachmentMenu, { type AttachmentAction } from "./ChatAttachmentMenu";
import CreatePollModal from "./CreatePollModal";
import GroupMembersModal, { type GroupMember } from "./GroupMembersModal";
import NewMessagesDivider from "./NewMessagesDivider";

interface RealtimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
}

interface MessageThreadProps {
  conversation: Conversation | null;
  realtimeConfig: RealtimeConfig | null;
  coachId?: string;
  onConversationUpdate?: () => void;
}

type ReactionMap = Record<
  string,
  { reaction: string; count: number; user_ids: string[]; users?: string[] }[]
>;

type PollMap = Record<string, ChatPollData>;

export default function MessageThread({
  conversation,
  realtimeConfig,
  coachId,
  onConversationUpdate,
}: MessageThreadProps) {
  const { role: currentUserRole, chat_bubble_color, id: currentUserId } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [polls, setPolls] = useState<PollMap>({});
  const [uploading, setUploading] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [createPollOpen, setCreatePollOpen] = useState(false);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [pollVotingMessageId, setPollVotingMessageId] = useState<string | null>(null);
  const [readBoundaryAt, setReadBoundaryAt] = useState<string | null>(null);
  const [groupMembersOpen, setGroupMembersOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const readBoundaryDismissedRef = useRef(false);
  const isPrependingRef = useRef(false);
  const prependScrollHeightRef = useRef(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clientId = conversation?.type === "dm" ? conversation.client_id : undefined;
  const groupId = conversation?.type === "group" ? conversation.group_id : undefined;

  const fetchReactions = useCallback(async (msgs: ChatMessage[]) => {
    if (msgs.length === 0) return;
    const ids = msgs.map((m) => m.id).join(",");
    try {
      const res = await fetch(`/api/chat-reactions?messageIds=${ids}`);
      const data = await res.json();
      if (res.ok) setReactions(data.reactions ?? {});
    } catch {
      // ignore
    }
  }, []);

  const fetchPolls = useCallback(async (msgs: ChatMessage[]) => {
    const pollMessageIds = msgs.filter((m) => m.message_type === "poll").map((m) => m.id);
    if (pollMessageIds.length === 0) return;
    try {
      const res = await fetch(`/api/chat-polls?messageIds=${pollMessageIds.join(",")}`);
      const data = await res.json();
      if (res.ok) {
        setPolls((prev) => ({ ...prev, ...(data.polls ?? {}) }));
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchReadBoundary = useCallback(async () => {
    if (!conversation) return null;
    try {
      const params = new URLSearchParams();
      if (conversation.type === "group" && conversation.group_id) {
        params.set("groupId", conversation.group_id);
      } else if (conversation.client_id) {
        params.set("clientId", conversation.client_id);
      } else {
        return null;
      }

      const res = await fetch(`/api/chat-last-seen?${params}`);
      const data = await res.json();
      if (res.ok) {
        return (data.last_seen_at as string | null) ?? null;
      }
    } catch {
      // ignore
    }
    return null;
  }, [conversation]);

  const dismissNewMessagesLine = useCallback(() => {
    if (readBoundaryDismissedRef.current) return;
    readBoundaryDismissedRef.current = true;
    setReadBoundaryAt(null);
  }, []);

  const openGroupMembersModal = useCallback(async () => {
    if (!conversation?.group_id) return;
    setGroupMembersOpen(true);
    setGroupMembersLoading(true);
    try {
      const res = await fetch(`/api/chat-groups?groupId=${conversation.group_id}`);
      const data = await res.json();
      if (res.ok) {
        setGroupMembers(data.group?.members ?? []);
      }
    } catch {
      // ignore
    } finally {
      setGroupMembersLoading(false);
    }
  }, [conversation?.group_id]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const fetchMessages = useCallback(
    async (before?: string | null, prepend = false) => {
      if (!conversation) return;
      setLoading(!prepend);
      try {
        const params = new URLSearchParams();
        if (conversation.type === "dm" && conversation.client_id) {
          params.set("clientId", conversation.client_id);
        } else if (conversation.group_id) {
          params.set("groupId", conversation.group_id);
        }
        if (before) params.set("before", before);

        const res = await fetch(`/api/chat-messages?${params}`);
        const data = await res.json();
        if (res.ok) {
          const msgs = data.messages as ChatMessage[];
          if (prepend) {
            const el = messagesContainerRef.current;
            if (el) {
              isPrependingRef.current = true;
              prependScrollHeightRef.current = el.scrollHeight;
            }
          }
          setHasMore(data.hasMore);
          setNextBefore(data.nextBefore);
          setMessages((prev) => (prepend ? [...msgs, ...prev] : msgs));
          await fetchReactions(msgs);
          await fetchPolls(msgs);
          if (!prepend) {
            requestAnimationFrame(() => scrollToBottom("auto"));
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [conversation, fetchReactions, fetchPolls, scrollToBottom]
  );

  useEffect(() => {
    setGroupMembersOpen(false);
    setGroupMembers([]);
  }, [conversation?.id]);

  useEffect(() => {
    if (!conversation) {
      setMessages([]);
      setPolls({});
      setReadBoundaryAt(null);
      readBoundaryDismissedRef.current = false;
      return;
    }

    let cancelled = false;

    const loadConversation = async () => {
      setReplyTo(null);
      setPolls({});
      setReadBoundaryAt(null);
      readBoundaryDismissedRef.current = false;

      const boundary = await fetchReadBoundary();
      if (cancelled) return;
      setReadBoundaryAt(boundary);

      await fetchMessages();
      if (cancelled) return;

      markSeen();
    };

    loadConversation();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  const markSeen = async () => {
    if (!conversation) return;
    const body =
      conversation.type === "group"
        ? { groupId: conversation.group_id }
        : { clientId: conversation.client_id };
    await fetch("/api/chat-last-seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onConversationUpdate?.();
  };

  const handleNewMessage = useCallback(
    (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const isOwn = isMessageFromCurrentUser(msg, currentUserId ?? "");
        const next = isOwn ? prev.filter((m) => !m.id.startsWith("temp-")) : prev;
        return [...next, msg];
      });
      if (msg.message_type === "poll") {
        fetchPolls([msg]);
      }
      setTimeout(() => {
        scrollToBottom("smooth");
      }, 50);
      markSeen();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversation?.id, fetchPolls, currentUserId, scrollToBottom]
  );

  useLayoutEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || messages.length === 0) return;

    if (isPrependingRef.current) {
      el.scrollTop = el.scrollHeight - prependScrollHeightRef.current;
      isPrependingRef.current = false;
      prependScrollHeightRef.current = 0;
      return;
    }

    scrollToBottom("auto");
  }, [messages, scrollToBottom]);

  useChatRealtime({
    config: realtimeConfig,
    groupId,
    clientId,
    coachId,
    onNewMessage: handleNewMessage,
    onReactionChange: () => fetchReactions(messages),
    onPollChange: () => fetchPolls(messages),
    enabled: !!conversation && !!realtimeConfig,
  });

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!conversation || (!input.trim() && !uploading)) return;
    if (!input.trim()) return;

    setSending(true);
    const content = input.trim();
    const replyToId = replyTo?.id ?? null;
    const optimisticId = `temp-${Date.now()}`;
    const optimistic = buildOptimisticChatMessage(
      {
        id: optimisticId,
        coach_id: coachId ?? "",
        client_id: clientId ?? null,
        group_id: groupId ?? null,
        content,
        timestamp: new Date().toISOString(),
        reply_to_id: replyToId,
        sender_name: "You",
      },
      currentUserId ?? "",
      currentUserRole,
      coachId
    );
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setReplyTo(null);

    try {
      const body: Record<string, string | null> = {
        content,
        replyToId,
      };
      if (groupId) body.groupId = groupId;
      else if (clientId) body.clientId = clientId;

      const res = await fetch("/api/chat-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...data.message, sender_name: "You" } : m))
        );
        onConversationUpdate?.();
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (messageId: string, reaction: string) => {
    await fetch("/api/chat-reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, reaction }),
    });
    fetchReactions(messages);
  };

  const handlePollVote = async (messageId: string, optionId: string) => {
    setPollVotingMessageId(messageId);
    try {
      const res = await fetch("/api/chat-poll-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, optionId }),
      });
      const data = await res.json();
      if (res.ok && data.poll) {
        setPolls((prev) => ({ ...prev, [messageId]: data.poll }));
      }
    } finally {
      setPollVotingMessageId(null);
    }
  };

  const handleCreatePoll = async (question: string, options: string[]) => {
    if (!conversation) return;
    setCreatingPoll(true);
    try {
      const body: Record<string, unknown> = {
        question,
        options,
        replyToId: replyTo?.id ?? null,
      };
      if (groupId) body.groupId = groupId;
      else if (clientId) body.clientId = clientId;

      const res = await fetch("/api/chat-polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatePollOpen(false);
        setReplyTo(null);
        if (data.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
        if (data.poll) {
          setPolls((prev) => ({ ...prev, [data.poll.message_id]: data.poll }));
        }
        onConversationUpdate?.();
      }
    } finally {
      setCreatingPoll(false);
    }
  };

  const handleAttachmentSelect = (action: AttachmentAction) => {
    if (action === "picture") {
      fileInputRef.current?.click();
    } else if (action === "gif") {
      setGifPickerOpen(true);
    } else if (action === "poll") {
      setCreatePollOpen(true);
    }
  };

  const handleGifSelect = async (gif: GifSelection) => {
    if (!conversation) return;

    setSending(true);
    const replyToId = replyTo?.id ?? null;
    const optimisticId = `temp-${Date.now()}`;
    const optimistic = buildOptimisticChatMessage(
      {
        id: optimisticId,
        coach_id: coachId ?? "",
        client_id: clientId ?? null,
        group_id: groupId ?? null,
        content: "",
        timestamp: new Date().toISOString(),
        reply_to_id: replyToId,
        message_type: "gif",
        attachment_url: gif.url,
        attachment_metadata: { source: "giphy", giphy_id: gif.id, title: gif.title },
        sender_name: "You",
      },
      currentUserId ?? "",
      currentUserRole,
      coachId
    );
    setMessages((prev) => [...prev, optimistic]);
    setReplyTo(null);

    try {
      const body: Record<string, unknown> = {
        content: "",
        messageType: "gif",
        attachmentUrl: gif.url,
        attachmentMetadata: { source: "giphy", giphy_id: gif.id, title: gif.title },
        replyToId,
      };
      if (groupId) body.groupId = groupId;
      else if (clientId) body.clientId = clientId;

      const res = await fetch("/api/chat-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...data.message, sender_name: "You" } : m))
        );
        onConversationUpdate?.();
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!conversation) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/chat-upload-media", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) return;

      const body: Record<string, string> = {
        content: "",
        messageType: uploadData.messageType,
        attachmentUrl: uploadData.url,
      };
      if (groupId) body.groupId = groupId;
      else if (clientId) body.clientId = clientId;
      if (replyTo) body.replyToId = replyTo.id;

      const res = await fetch("/api/chat-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setReplyTo(null);
        onConversationUpdate?.();
      }
    } finally {
      setUploading(false);
    }
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (el && el.scrollTop === 0 && hasMore && nextBefore) {
      fetchMessages(nextBefore, true);
    }
  };

  const replyMap = new Map<string, ChatMessage>();
  for (const m of messages) replyMap.set(m.id, m);

  const newMessagesFromIndex = useMemo(() => {
    if (!readBoundaryAt || messages.length === 0 || !currentUserId) return -1;

    const boundaryMs = new Date(readBoundaryAt).getTime();
    if (Number.isNaN(boundaryMs)) return -1;

    return messages.findIndex(
      (msg) =>
        new Date(msg.timestamp).getTime() > boundaryMs &&
        !isMessageFromCurrentUser(msg, currentUserId)
    );
  }, [messages, readBoundaryAt, currentUserId]);

  if (!conversation) {
    return (
      <div className="flex flex-1 min-h-0 min-w-0 items-center justify-center bg-white dark:bg-gray-800">
        <p className="text-gray-500">Select a conversation to start messaging</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 h-full bg-white dark:bg-gray-800">
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-secondary dark:text-alabaster">
        {conversation.name}
        {conversation.type === "group" && conversation.member_count != null && (
          <button
            type="button"
            onClick={() => void openGroupMembersModal()}
            className="text-sm font-normal text-gray-500 hover:text-primary ml-2 transition-colors"
            aria-label={`View ${conversation.member_count} group members`}
          >
            {conversation.member_count}{" "}
            {conversation.member_count === 1 ? "member" : "members"}
          </button>
        )}
      </div>

      <div
        className="flex flex-col flex-1 min-h-0"
        onPointerDownCapture={dismissNewMessagesLine}
        onFocusCapture={dismissNewMessagesLine}
        onWheelCapture={dismissNewMessagesLine}
        onTouchStartCapture={dismissNewMessagesLine}
      >
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto p-4"
        data-chat-scroll
        onScroll={handleScroll}
      >
        {loading && messages.length === 0 ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-gray-500 text-center">No messages yet. Say hello!</p>
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end gap-3 overflow-visible">
            {messages.map((msg, index) => {
              const isMine = isMessageFromCurrentUser(msg, currentUserId ?? "");
              const replyPreview = msg.reply_to_id ? replyMap.get(msg.reply_to_id) : null;

              return (
                <React.Fragment key={msg.id}>
                  {index === newMessagesFromIndex && <NewMessagesDivider />}
                  <MessageBubble
                    message={msg}
                    isMine={isMine}
                    bubbleColor={chat_bubble_color}
                    showSenderName={conversation.type === "group" && !isMine}
                    reactions={reactions[msg.id]}
                    currentUserId={currentUserId ?? ""}
                    onReply={setReplyTo}
                    onReact={handleReact}
                    replyPreview={replyPreview ?? undefined}
                    poll={polls[msg.id]}
                    onPollVote={handlePollVote}
                    pollVoting={pollVotingMessageId === msg.id}
                  />
                </React.Fragment>
              );
            })}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {replyTo && (
        <div className="flex-shrink-0 px-4 py-2.5 bg-gray-50 dark:bg-gray-900/80 flex items-start gap-3 border-t border-gray-200 dark:border-gray-600">
          <div className="flex-1 min-w-0 border-l-[3px] border-primary pl-3">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              Replying to{" "}
              {replyTo.sender_name || (replyTo.sender === "coach" ? "Coach" : "Client")}
            </div>
            <div className="text-sm text-gray-800 dark:text-gray-100 truncate mt-0.5">
              {replyTo.message_type === "gif"
                ? "GIF"
                : replyTo.message_type === "image"
                  ? "Photo"
                  : replyTo.message_type === "poll"
                    ? replyTo.content || "Poll"
                    : replyTo.content}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="text-gray-400 hover:text-red-500 flex-shrink-0 p-1"
            aria-label="Cancel reply"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSend} className="flex-shrink-0 flex gap-2 p-4 border-t border-gray-200 dark:border-gray-700 items-center bg-white dark:bg-gray-800">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f);
            e.target.value = "";
          }}
        />
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setAttachmentMenuOpen((open) => !open)}
            disabled={uploading || sending}
            className="p-2 text-gray-500 hover:text-primary rounded-lg disabled:opacity-50"
            title="Attach"
            aria-expanded={attachmentMenuOpen}
            aria-haspopup="menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>
          <ChatAttachmentMenu
            isOpen={attachmentMenuOpen}
            onClose={() => setAttachmentMenuOpen(false)}
            onSelect={handleAttachmentSelect}
          />
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={sending}
          className="flex-1 border rounded-lg px-3 py-2 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <Button type="submit" disabled={sending || !input.trim()}>
          {sending ? "..." : "Send"}
        </Button>
      </form>
      </div>

      <GifPicker
        isOpen={gifPickerOpen}
        onClose={() => setGifPickerOpen(false)}
        onSelect={handleGifSelect}
      />

      <CreatePollModal
        isOpen={createPollOpen}
        onClose={() => setCreatePollOpen(false)}
        onSubmit={handleCreatePoll}
        submitting={creatingPoll}
      />

      <GroupMembersModal
        isOpen={groupMembersOpen}
        onClose={() => setGroupMembersOpen(false)}
        groupName={conversation.name}
        members={groupMembers}
        currentUserId={currentUserId ?? undefined}
        loading={groupMembersLoading}
      />
    </div>
  );
}
