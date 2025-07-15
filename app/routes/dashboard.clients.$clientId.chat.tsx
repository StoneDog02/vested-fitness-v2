import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import { useState } from "react";
import { ChatBox } from "~/components/ui/ChatBox";
import { useParams, useLoaderData, useMatches } from "@remix-run/react";

interface Message {
  id: string;
  sender: "coach" | "client";
  content: string;
  timestamp: string;
}

export const meta: MetaFunction = () => {
  return [
    { title: "Client Chat | Kava Training" },
    { name: "description", content: "Chat with your client" },
  ];
};

export default function ClientChat() {
  // Move all hooks to the top level
  const params = useParams();
  const [newMessage, setNewMessage] = useState("");
  const matches = useMatches();
  // Find the parent route with client loader data
  const parentData = matches.find((m) => m.data && typeof m.data === 'object' && m.data !== null && 'client' in m.data) ?.data as { client: { id: string; name?: string } | null };

  // Defensive: handle missing client
  if (!parentData?.client) {
    return (
      <div className="p-6 text-center text-red-600">
        Client not found or unavailable.
      </div>
    );
  }

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const message: Message = {
      id: Date.now().toString(), // Use timestamp as a temporary id if needed
      sender: "coach",
      content: newMessage,
      timestamp: new Date().toISOString(),
    };

    // setMessages([...messages, message]); // This line is removed as per the new_code
    setNewMessage("");
  };

  return (
    <ClientDetailLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
            Chat with {parentData.client.name || "Client"}
          </h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left side - Chat Messages */}
          <div>
            <ChatBox clientId={parentData.client.id} />
          </div>
          {/* Right side - Client Info */}
          <div className="space-y-6">
            {/* Client Info */}
            <Card title="Client Information">
              <div className="space-y-2">
                <p className="text-sm text-gray-dark dark:text-gray-light">
                  <span className="font-medium">Name:</span> {parentData.client.name || "Unknown"}
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
