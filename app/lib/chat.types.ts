export type ChatSender = "coach" | "client";

export type ConversationType = "dm" | "group";

export interface ChatMessage {
  id: string;
  coach_id: string;
  client_id: string | null;
  group_id: string | null;
  sender: ChatSender;
  content: string;
  timestamp: string;
  reply_to_id?: string | null;
  message_type?: string;
  attachment_url?: string | null;
  attachment_metadata?: Record<string, unknown> | null;
  sender_name?: string;
  sender_avatar_url?: string;
  reply_to?: ChatMessage | null;
}

export interface PollVoter {
  user_id: string;
  name: string;
  avatar_url?: string | null;
}

export interface PollOptionData {
  id: string;
  label: string;
  position: number;
  vote_count: number;
  voters: PollVoter[];
}

export interface ChatPollData {
  poll_id: string;
  message_id: string;
  question: string;
  options: PollOptionData[];
  total_votes: number;
  user_vote_option_id: string | null;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string;
  avatar_url?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count: number;
  client_id?: string;
  group_id?: string;
  member_count?: number;
}

export interface ChatGroup {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  members?: { id: string; name: string; avatar_url?: string | null }[];
}

/** True when this message was sent by the signed-in user (works for DMs and groups). */
export function isMessageFromCurrentUser(
  message: ChatMessage,
  currentUserId: string
): boolean {
  if (!currentUserId) return false;
  if (message.sender === "coach") {
    return message.coach_id === currentUserId;
  }
  return message.client_id === currentUserId;
}

/** Build an optimistic message with correct sender ids for immediate right-side alignment. */
export function buildOptimisticChatMessage(
  fields: Omit<ChatMessage, "coach_id" | "client_id" | "sender">,
  currentUserId: string,
  currentUserRole: ChatSender,
  conversationCoachId?: string | null
): ChatMessage {
  if (currentUserRole === "coach") {
    return {
      ...fields,
      sender: "coach",
      coach_id: currentUserId,
      // DM: client_id is the other party; group: null
      client_id: fields.group_id ? null : fields.client_id,
    };
  }

  return {
    ...fields,
    sender: "client",
    coach_id: conversationCoachId ?? fields.coach_id,
    client_id: currentUserId,
  };
}
