import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";
import { useUser } from "~/context/UserContext";
import ConversationList, { type ChatCategory } from "~/components/chat/ConversationList";
import MessageThread from "~/components/chat/MessageThread";
import CreateGroupModal from "~/components/chat/CreateGroupModal";
import MassMessageModal from "~/components/chat/MassMessageModal";
import type { Conversation } from "~/lib/chat.types";

export const meta: MetaFunction = () => [
  { title: "Messages | Kava Training" },
];

interface RealtimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
}

export default function MessagesPage() {
  const { role, id: userId, coach_id } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [realtimeConfig, setRealtimeConfig] = useState<RealtimeConfig | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showMassMessage, setShowMassMessage] = useState(false);

  const coachId = role === "coach" ? userId : coach_id;

  const selectConversation = useCallback(
    (conv: Conversation | null) => {
      setSelected(conv);
      const params = new URLSearchParams();
      if (conv?.type === "dm" && conv.client_id) {
        params.set("clientId", conv.client_id);
      } else if (conv?.group_id) {
        params.set("groupId", conv.group_id);
      }
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat-conversations");
      const data = await res.json();
      if (res.ok) {
        setConversations(data.conversations ?? []);
        return data.conversations as Conversation[];
      }
    } catch {
      // ignore
    }
    return [];
  }, []);

  useEffect(() => {
    loadConversations();
    fetch("/api/chat-realtime-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.supabaseUrl) setRealtimeConfig(data);
      })
      .catch(() => {});
  }, [loadConversations]);

  useEffect(() => {
    if (conversations.length === 0) return;

    const clientId = searchParams.get("clientId");
    const groupId = searchParams.get("groupId");

    if (clientId || groupId) {
      const match = conversations.find((c) => {
        if (clientId && c.type === "dm" && c.client_id === clientId) return true;
        if (groupId && c.type === "group" && c.group_id === groupId) return true;
        return false;
      });
      if (match) {
        setSelected(match);
        return;
      }
    }

    setSelected((prev) => {
      if (prev) return prev;
      return (
        conversations.find((c) => c.type === "dm") ??
        conversations.find((c) => c.type === "group") ??
        null
      );
    });
  }, [searchParams, conversations]);

  const handleSelect = (conv: Conversation) => {
    selectConversation(conv);
  };

  const handleCategoryChange = (category: ChatCategory) => {
    const pool = conversations.filter((c) =>
      category === "groups" ? c.type === "group" : c.type === "dm"
    );
    const stillVisible = selected && pool.some((c) => c.id === selected.id);
    if (!stillVisible) {
      selectConversation(pool[0] ?? null);
    }
  };

  const handleRefresh = async () => {
    const convs = await loadConversations();
    if (selected) {
      const updated = convs.find((c) => c.id === selected.id);
      if (updated) setSelected(updated);
    }
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex flex-1 min-h-0 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-soft">
        <ConversationList
          conversations={conversations}
          selectedId={selected?.id ?? null}
          onSelect={handleSelect}
          onCategoryChange={handleCategoryChange}
          onRefresh={handleRefresh}
          isCoach={role === "coach"}
          onCreateGroup={role === "coach" ? () => setShowCreateGroup(true) : undefined}
          onMassMessage={role === "coach" ? () => setShowMassMessage(true) : undefined}
        />
        <MessageThread
          conversation={selected}
          realtimeConfig={realtimeConfig}
          coachId={coachId ?? undefined}
          onConversationUpdate={handleRefresh}
        />
      </div>

      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onCreated={handleRefresh}
      />
      <MassMessageModal
        isOpen={showMassMessage}
        onClose={() => setShowMassMessage(false)}
        onSent={handleRefresh}
      />
    </div>
  );
}
