import { useEffect, useRef, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "~/lib/supabase-browser";
import type { ChatMessage } from "~/lib/chat.types";

interface RealtimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
}

interface UseChatRealtimeOptions {
  config: RealtimeConfig | null;
  groupId?: string | null;
  clientId?: string | null;
  coachId?: string | null;
  onNewMessage: (message: ChatMessage) => void;
  onReactionChange?: () => void;
  onPollChange?: () => void;
  enabled?: boolean;
}

export function useChatRealtime({
  config,
  groupId,
  clientId,
  coachId,
  onNewMessage,
  onReactionChange,
  onPollChange,
  enabled = true,
}: UseChatRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onNewMessageRef = useRef(onNewMessage);
  const onReactionChangeRef = useRef(onReactionChange);
  const onPollChangeRef = useRef(onPollChange);

  onNewMessageRef.current = onNewMessage;
  onReactionChangeRef.current = onReactionChange;
  onPollChangeRef.current = onPollChange;

  const enrichMessage = useCallback(async (row: ChatMessage) => {
    const senderId = row.sender === "coach" ? row.coach_id : row.client_id;
    if (!senderId) return row;

    try {
      const res = await fetch(`/api/get-avatars?userIds=${senderId}`);
      const data = await res.json();
      if (res.ok && data.avatars?.[senderId]) {
        return {
          ...row,
          sender_name: data.avatars[senderId].name,
          sender_avatar_url: data.avatars[senderId].url ?? null,
        };
      }
    } catch {
      // ignore
    }
    return row;
  }, []);

  useEffect(() => {
    if (!enabled || !config || (!groupId && !clientId)) return;

    const client = getSupabaseBrowserClient(
      config.supabaseUrl,
      config.supabaseAnonKey,
      config.accessToken
    );

    const filter = groupId
      ? `group_id=eq.${groupId}`
      : `coach_id=eq.${coachId},client_id=eq.${clientId}`;

    const channel = client
      .channel(`chat-${groupId ?? clientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chats",
          filter,
        },
        async (payload) => {
          const row = payload.new as ChatMessage;
          const enriched = await enrichMessage(row);
          onNewMessageRef.current(enriched);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_message_reactions",
        },
        () => {
          onReactionChangeRef.current?.();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_poll_votes",
        },
        () => {
          onPollChangeRef.current?.();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [
    enabled,
    config?.accessToken,
    config?.supabaseUrl,
    config?.supabaseAnonKey,
    groupId,
    clientId,
    coachId,
    enrichMessage,
  ]);
}
