import React, { useEffect, useMemo, useState } from "react";
import type { Conversation } from "~/lib/chat.types";

export type ChatCategory = "contacts" | "groups";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  onRefresh: () => void;
  onCategoryChange?: (category: ChatCategory) => void;
  isCoach?: boolean;
  onCreateGroup?: () => void;
  onMassMessage?: () => void;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onRefresh,
  onCategoryChange,
  isCoach,
  onCreateGroup,
  onMassMessage,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ChatCategory>("contacts");

  useEffect(() => {
    if (!selectedId) return;
    const selected = conversations.find((c) => c.id === selectedId);
    if (selected) {
      setCategory(selected.type === "group" ? "groups" : "contacts");
    }
  }, [selectedId, conversations]);

  const contacts = useMemo(
    () => conversations.filter((c) => c.type === "dm"),
    [conversations]
  );
  const groups = useMemo(
    () => conversations.filter((c) => c.type === "group"),
    [conversations]
  );

  const categoryConversations = category === "groups" ? groups : contacts;

  const filtered = categoryConversations.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const contactsUnread = contacts.reduce((sum, c) => sum + c.unread_count, 0);
  const groupsUnread = groups.reduce((sum, c) => sum + c.unread_count, 0);

  const handleCategoryChange = (next: ChatCategory) => {
    setCategory(next);
    onCategoryChange?.(next);
  };

  const tabs: { id: ChatCategory; label: string; unread: number }[] = [
    { id: "contacts", label: "Contacts", unread: contactsUnread },
    { id: "groups", label: "Groups", unread: groupsUnread },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 w-full sm:w-80 flex-shrink-0">
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-secondary dark:text-alabaster">Messages</h2>
          <button
            type="button"
            onClick={onRefresh}
            className="text-gray-500 hover:text-primary text-sm"
          >
            Refresh
          </button>
        </div>

        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-900/80 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleCategoryChange(tab.id)}
              className={`relative flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                category === tab.id
                  ? "bg-white dark:bg-gray-800 text-secondary dark:text-alabaster shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab.label}
              {tab.unread > 0 && (
                <span className="ml-1.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {tab.unread > 9 ? "9+" : tab.unread}
                </span>
              )}
            </button>
          ))}
        </div>

        <input
          type="search"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
        />
        {isCoach && category === "groups" && onCreateGroup && (
          <button
            type="button"
            onClick={onCreateGroup}
            className="w-full text-xs py-2 px-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20"
          >
            + New Group
          </button>
        )}
        {isCoach && category === "contacts" && onMassMessage && (
          <button
            type="button"
            onClick={onMassMessage}
            className="w-full text-xs py-2 px-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20"
          >
            Mass Message
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            {category === "groups"
              ? search
                ? "No groups match your search"
                : "No group chats yet"
              : search
                ? "No contacts match your search"
                : "No direct messages yet"}
          </p>
        ) : (
          filtered.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => onSelect(conv)}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left ${
                selectedId === conv.id ? "bg-primary/10 dark:bg-primary/20" : ""
              }`}
            >
              <div className="relative flex-shrink-0">
                {conv.avatar_url ? (
                  <img src={conv.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
                    {conv.type === "group" ? "👥" : conv.name.charAt(0)}
                  </div>
                )}
                {conv.unread_count > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {conv.unread_count > 9 ? "9+" : conv.unread_count}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium text-sm text-secondary dark:text-alabaster truncate">
                    {conv.name}
                  </span>
                  {conv.last_message_at && (
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
                      {new Date(conv.last_message_at).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {conv.last_message || "No messages yet"}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
