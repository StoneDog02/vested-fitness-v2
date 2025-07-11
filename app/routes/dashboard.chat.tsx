import { useState, useRef, useEffect } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import { ChatBox } from "~/components/ui/ChatBox";
import { useParams } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "Chat | Kava Training" },
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

export default function Chat() {
  // TODO: Replace with actual clientId from user context or params
  const { clientId } = useParams();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-2xl mt-8">
        <div className="sticky top-0 z-10 bg-gray-100 pb-4">
          <h1 className="text-2xl font-bold text-secondary text-center">Chat with Coach</h1>
        </div>
        <Card className="bg-white rounded-lg shadow-lg p-0 min-h-[60vh] flex flex-col">
          <div className="flex flex-col flex-1">
            <ChatBox clientId={clientId || "CLIENT_ID_PLACEHOLDER"} />
          </div>
        </Card>
      </div>
    </div>
  );
}
