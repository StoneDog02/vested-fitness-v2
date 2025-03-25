import { useState, useRef, useEffect } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";

export const meta: MetaFunction = () => {
  return [
    { title: "Chat | Vested Fitness" },
    { name: "description", content: "Chat with your coach" },
  ];
};

// Mock coach data
const mockCoach = {
  id: "coach1",
  name: "Sarah Johnson",
  role: "Head Coach",
  avatar: null,
};

// Mock messages data
const mockMessages = [
  {
    id: "msg1",
    sender: "coach",
    text: "Hey! How's your week going? Any issues with the new workout plan?",
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
  },
  {
    id: "msg2",
    sender: "client",
    text: "Hi Sarah! It's been good. The new leg exercises are challenging but I'm managing. Had some soreness on Tuesday but it's better now.",
    timestamp: new Date(Date.now() - 86400000 * 2 + 3600000).toISOString(), // 2 days ago + 1 hour
  },
  {
    id: "msg3",
    sender: "coach",
    text: "That's normal! The first week is always the toughest as your body adapts. Keep up with your protein intake and stretching. How's the meal plan working for you?",
    timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  },
  {
    id: "msg4",
    sender: "client",
    text: "Meal plan is good. I'm finding it easier to prep everything on Sundays as you suggested. Question - can I swap the chicken on Thursday for fish?",
    timestamp: new Date(Date.now() - 86400000 + 1800000).toISOString(), // 1 day ago + 30 min
  },
  {
    id: "msg5",
    sender: "coach",
    text: "Absolutely! Fish is a great option. Just make sure it's similar in protein content - about 30g per serving. Salmon or tuna would be perfect!",
    timestamp: new Date(Date.now() - 43200000).toISOString(), // 12 hours ago
  },
  {
    id: "msg6",
    sender: "client",
    text: "Perfect, thanks! I'll go with salmon then. Looking forward to tomorrow's check-in!",
    timestamp: new Date(Date.now() - 21600000).toISOString(), // 6 hours ago
  },
];

export default function Chat() {
  const [messages, setMessages] = useState(mockMessages);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    // If today, show time only
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // If yesterday, show "Yesterday" and time
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    // Otherwise, show date and time
    return `${date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })}, ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const newMsg = {
      id: `msg${messages.length + 1}`,
      sender: "client" as const,
      text: newMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages([...messages, newMsg]);
    setNewMessage("");
  };

  useEffect(() => {
    // Scroll to bottom on initial load and when new messages are added
    messagesEndRef.current?.scrollIntoView();
  }, [messages]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-secondary">Chat with Coach</h1>
      </div>

      <Card>
        <div
          className="flex flex-col"
          style={{ height: "calc(100vh - 12rem)" }}
        >
          {/* Coach header */}
          <div className="flex items-center p-4 border-b border-gray-light">
            <div className="w-10 h-10 rounded-full bg-gray-light flex items-center justify-center text-gray-dark mr-3">
              {mockCoach.avatar ? (
                <img
                  src={mockCoach.avatar}
                  alt={mockCoach.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-lg">{mockCoach.name.charAt(0)}</span>
              )}
            </div>
            <div>
              <h2 className="font-medium text-secondary">{mockCoach.name}</h2>
              <p className="text-xs text-gray-dark">{mockCoach.role}</p>
            </div>
          </div>

          {/* Messages container */}
          <div className="flex-1 overflow-y-scroll" style={{ minHeight: 0 }}>
            <div className="p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.sender === "client" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg p-3 ${
                      msg.sender === "client"
                        ? "bg-primary text-white rounded-tr-none"
                        : "bg-gray-light text-secondary rounded-tl-none"
                    }`}
                  >
                    <p className="text-sm">{msg.text}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.sender === "client"
                          ? "text-primary-light"
                          : "text-gray-dark"
                      }`}
                    >
                      {formatTimestamp(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Message input */}
          <div className="border-t border-gray-light p-4">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 border border-gray-light rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary focus:border-primary"
              />
              <Button type="submit" variant="primary">
                Send
              </Button>
            </form>
          </div>
        </div>
      </Card>
    </div>
  );
}
