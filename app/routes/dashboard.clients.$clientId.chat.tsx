import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import { useState } from "react";

interface Message {
  id: string;
  sender: "coach" | "client";
  content: string;
  timestamp: string;
}

const mockMessages: Message[] = [
  {
    id: "1",
    sender: "coach",
    content: "How are you feeling about your progress this week?",
    timestamp: "2024-03-15T10:30:00",
  },
  {
    id: "2",
    sender: "client",
    content:
      "Great! I've been following the meal plan and hitting my workouts consistently.",
    timestamp: "2024-03-15T10:35:00",
  },
];

export const meta: MetaFunction = () => {
  return [
    { title: "Client Chat | Vested Fitness" },
    { name: "description", content: "Chat with your client" },
  ];
};

export default function ClientChat() {
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [newMessage, setNewMessage] = useState("");

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const message: Message = {
      id: (messages.length + 1).toString(),
      sender: "coach",
      content: newMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages([...messages, message]);
    setNewMessage("");
  };

  return (
    <ClientDetailLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
            Chat with John Smith
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left side - Chat Messages */}
          <div>
            <Card title="Messages">
              <div className="flex flex-col h-[600px]">
                {/* Messages container */}
                <div className="flex-1 overflow-y-auto space-y-4 p-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.sender === "coach"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl p-3 shadow-sm ${
                          message.sender === "coach"
                            ? "bg-primary text-white rounded-tr-md"
                            : "bg-gray-light dark:bg-davyGray text-secondary dark:text-alabaster rounded-tl-md"
                        }`}
                      >
                        <p className="text-sm">{message.content}</p>
                        <span
                          className={`text-xs mt-1 block ${
                            message.sender === "coach"
                              ? "text-white/80"
                              : "text-gray-dark dark:text-gray-light"
                          }`}
                        >
                          {new Date(message.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Message input */}
                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center gap-2 border-t border-gray-light dark:border-davyGray p-3 bg-white dark:bg-night"
                  style={{
                    borderBottomLeftRadius: "0.75rem",
                    borderBottomRightRadius: "0.75rem",
                  }}
                >
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 border border-gray-light dark:border-davyGray rounded-lg py-2 px-3 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                  <Button type="submit" variant="primary">
                    Send
                  </Button>
                </form>
              </div>
            </Card>
          </div>

          {/* Right side - Client Info */}
          <div className="space-y-6">
            {/* Client Info */}
            <Card title="Client Information">
              <div className="space-y-2">
                <p className="text-sm text-gray-dark dark:text-gray-light">
                  <span className="font-medium">Name:</span> John Smith
                </p>
                <p className="text-sm text-gray-dark dark:text-gray-light">
                  <span className="font-medium">Program:</span> Muscle Gain
                </p>
                <p className="text-sm text-gray-dark dark:text-gray-light">
                  <span className="font-medium">Start Date:</span> Jan 15, 2024
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </ClientDetailLayout>
  );
}
