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
              <div className="h-[600px] overflow-y-auto space-y-4">
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
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.sender === "coach"
                          ? "bg-primary text-white"
                          : "bg-gray-light dark:bg-davyGray text-secondary dark:text-alabaster"
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
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right side - Client Info & Notes */}
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

            {/* Quick Notes */}
            <Card title="Quick Notes">
              <form onSubmit={handleSendMessage} className="space-y-4">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="w-full h-32 p-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
                />
                <div className="flex justify-end">
                  <Button type="submit" variant="primary">
                    Send Message
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </ClientDetailLayout>
  );
}
