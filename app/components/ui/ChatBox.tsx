// eslint-disable-next-line react/prop-types
import React, { useEffect, useRef, useState, useCallback } from "react";
import Button from "./Button";
import Card from "./Card";
import Tooltip from "./Tooltip";
import { useUser } from "~/context/UserContext";

interface Message {
  id: string;
  coach_id: string;
  client_id: string;
  sender: "coach" | "client";
  content: string;
  timestamp: string;
  avatar_url?: string;
  name?: string;
}

interface ChatBoxProps {
  className?: string;
  clientId: string;
}

const PAGE_SIZE = 10;
const POLL_INTERVAL = 3000;

// Simple Input component (replace with your own if needed)
const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={
      "border rounded px-3 py-2 focus:outline-none focus:ring w-full " +
      (props.className || "")
    }
  />
);

// Simple Spinner (replace with your own if needed)
const Spinner = () => (
  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-gray-400 mx-auto" />
);

export const ChatBox: React.FC<ChatBoxProps> = ({ clientId }) => {
  const { role: currentUserRole, chat_bubble_color } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch messages (paginated)
  const fetchMessages = useCallback(async (pageNum: number, prepend = false) => {
    try {
      const res = await fetch(`/api/chat-messages?clientId=${clientId}`);
      const data = await res.json();
      if (res.ok) {
        // Sort and slice for pagination
        const sorted = (data.messages as Message[]).sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const start = Math.max(0, sorted.length - (pageNum + 1) * PAGE_SIZE);
        const end = sorted.length - pageNum * PAGE_SIZE;
        const pageMessages = sorted.slice(start, end);
        setHasMore(start > 0);
        setMessages((prev) =>
          prepend ? [...pageMessages, ...prev] : pageMessages
        );
      } else {
        setError(data.error || "Failed to load messages");
      }
    } catch (e) {
      setError("Failed to load messages");
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  }, [clientId]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setPage(0);
    fetchMessages(0);
    // eslint-disable-next-line
  }, [clientId]);

  // Polling for new messages
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchMessages(0);
    }, POLL_INTERVAL);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Scroll to bottom function
  const scrollToBottom = () => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Load more messages (infinite scroll)
  const handleScroll = (e: React.UIEvent<HTMLDivElement, UIEvent>) => {
    const element = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = element;
    
    // Check if we're near the top to load more messages
    if (scrollTop === 0 && hasMore && !fetchingMore) {
      setFetchingMore(true);
      const nextPage = page + 1;
      setPage(nextPage);
      fetchMessages(nextPage, true);
    }
    
    // Show scroll to bottom button if user has scrolled up
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollToBottom(!isNearBottom);
  };

  // Send message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("clientId", clientId);
      formData.append("content", input);
      const res = await fetch("/api/chat-messages", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setInput("");
        fetchMessages(0); // Refresh messages
      } else {
        setError(data.error || "Failed to send message");
      }
    } catch (e) {
      setError("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  // Format timestamp
  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Fetch avatars for messages (if not present)
  useEffect(() => {
    const fetchAvatars = async () => {
      const missing = messages.filter((m) => !m.avatar_url);
      if (missing.length === 0) return;
      const userIds = Array.from(new Set(missing.map((m) => m.sender === "coach" ? m.coach_id : m.client_id)));
      const res = await fetch(`/api.get-avatars?userIds=${userIds.join(",")}`);
      const data = await res.json();
      if (res.ok && data.avatars) {
        setMessages((prev) =>
          prev.map((msg) => {
            const avatar = data.avatars[msg.sender === "coach" ? msg.coach_id : msg.client_id];
            return avatar ? { ...msg, avatar_url: avatar.url, name: avatar.name } : msg;
          })
        );
      }
    };
    fetchAvatars();
    // eslint-disable-next-line
  }, [messages]);

  // Utility: Check if a color is dark (returns true if text should be white)
  function isColorDark(hex: string | undefined): boolean {
    if (!hex) return false;
    // Remove # if present
    hex = hex.replace('#', '');
    // Expand short form (e.g. #abc)
    if (hex.length === 3) {
      hex = hex.split('').map(x => x + x).join('');
    }
    if (hex.length !== 6) return false;
    const r = parseInt(hex.substring(0,2), 16);
    const g = parseInt(hex.substring(2,4), 16);
    const b = parseInt(hex.substring(4,6), 16);
    // Perceived luminance formula
    const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
    return luminance < 0.6;
  }

  // Mark chat as seen when opened or clientId changes
  useEffect(() => {
    async function markChatAsSeen() {
      try {
        const formData = new FormData();
        formData.append("clientId", clientId);
        await fetch("/api/chat-last-seen", {
          method: "POST",
          body: formData,
        });
      } catch (e) {
        // Ignore errors for now
      }
    }
    markChatAsSeen();
    // eslint-disable-next-line
  }, [clientId]);

  return (
    <Card className="flex flex-col h-full max-h-[600px] w-full">
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 scroll-smooth relative" 
        onScroll={handleScroll} 
        style={{ minHeight: 300 }}
      >
        {loading ? (
          <div className="flex justify-center items-center h-full"><Spinner /></div>
        ) : error ? (
          <div className="text-red-500 text-center">{error}</div>
        ) : messages.length === 0 ? (
          <div className="text-gray-500 text-center">No messages yet.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg) => {
              // Align right if this message was sent by the current user
              const isMine = msg.sender === currentUserRole;
              return (
                <div key={msg.id} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                  {!isMine && msg.avatar_url && (
                    <Tooltip content={msg.name || "User"}>
                      <img src={msg.avatar_url} alt="avatar" className="w-8 h-8 rounded-full border" />
                    </Tooltip>
                  )}
                  <div
                    className="px-3 py-2 rounded-lg max-w-xs shadow text-sm"
                    style={{
                      background: isMine && chat_bubble_color ? chat_bubble_color : "#f3f4f6",
                      color: isMine && chat_bubble_color && isColorDark(chat_bubble_color) ? "#fff" : "#000",
                    }}
                  >
                    <div>{msg.content}</div>
                    <div
                      className="text-xs text-gray-400 text-right mt-1"
                      style={{
                        color: isMine && chat_bubble_color && isColorDark(chat_bubble_color)
                          ? "rgba(255,255,255,0.9)"
                          : "rgba(0,0,0,0.6)"
                      }}
                    >{formatTime(msg.timestamp)}</div>
                  </div>
                  {isMine && msg.avatar_url && (
                    <Tooltip content={msg.name || "You"}>
                      <img src={msg.avatar_url} alt="avatar" className="w-8 h-8 rounded-full border" />
                    </Tooltip>
                  )}
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
        )}
        {fetchingMore && (
          <div className="text-center text-xs text-gray-400 py-2 flex items-center justify-center gap-2">
            <Spinner />
            Loading more messages...
          </div>
        )}
        {hasMore && !fetchingMore && (
          <div className="text-center text-xs text-gray-400 py-2">
            Scroll up to load more messages
          </div>
        )}
        
        {/* Scroll to bottom button */}
        {showScrollToBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2 shadow-lg transition-all duration-200 z-10"
            title="Scroll to bottom"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
      </div>
      <form onSubmit={handleSend} className="flex gap-2 p-4 border-t">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={sending}
          className="flex-1"
        />
        <Button type="submit" disabled={sending || !input.trim()}>
          Send
        </Button>
      </form>
    </Card>
  );
}; 