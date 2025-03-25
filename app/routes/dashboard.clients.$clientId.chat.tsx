import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import { useState } from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "Client Chat | Vested Fitness" },
    { name: "description", content: "Chat with your client" },
  ];
};

// Mock chat messages
const mockMessages = [
  {
    id: "1",
    sender: "coach",
    text: "Hi John, how's your progress with the new workout plan?",
    timestamp: "2024-04-10T14:30:00Z",
  },
  {
    id: "2",
    sender: "client",
    text: "It's going well! I'm feeling stronger already, especially in my bench press.",
    timestamp: "2024-04-10T14:35:00Z",
  },
  {
    id: "3",
    sender: "coach",
    text: "That's great to hear! Have you been having any issues with the meal plan?",
    timestamp: "2024-04-10T14:37:00Z",
  },
  {
    id: "4",
    sender: "client",
    text: "No issues, but I was wondering if I could substitute chicken for fish on some days?",
    timestamp: "2024-04-10T14:40:00Z",
  },
  {
    id: "5",
    sender: "coach",
    text: "Absolutely! Fish is a great protein source. Just make sure to adjust the portion sizes to hit your protein goals.",
    timestamp: "2024-04-10T14:42:00Z",
  },
  {
    id: "6",
    sender: "client",
    text: "Perfect, thanks for the quick response!",
    timestamp: "2024-04-10T14:45:00Z",
  },
];

export default function ClientChat() {
  const [newMessage, setNewMessage] = useState("");

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would send the message to the backend
    setNewMessage("");
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
          Chat with John Smith
        </h1>
      </div>

      <Card className="h-[600px] flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mockMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender === "coach" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs md:max-w-md rounded-lg px-4 py-2 ${
                  message.sender === "coach"
                    ? "bg-primary text-white"
                    : "bg-gray-light dark:bg-davyGray text-secondary dark:text-alabaster"
                }`}
              >
                <div className="text-sm">{message.text}</div>
                <div
                  className={`text-xs mt-1 ${
                    message.sender === "coach"
                      ? "text-white/70"
                      : "text-gray-dark dark:text-gray-light"
                  }`}
                >
                  {formatTimestamp(message.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-light dark:border-davyGray p-4">
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 border border-gray-light dark:border-davyGray rounded-lg px-4 py-2 focus:outline-none focus:ring-primary focus:border-primary dark:bg-night dark:text-alabaster dark:placeholder:text-gray-light"
            />
            <Button type="submit" disabled={!newMessage.trim()}>
              Send
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
