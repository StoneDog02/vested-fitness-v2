import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import type { Conversation } from "~/lib/chat.types";
import {
  createServiceClient,
  getChatUserFromRequest,
} from "~/lib/chat-auth.server";

async function getUnreadDmCount(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  coachId: string,
  clientId: string,
  readerRole: "coach" | "client"
): Promise<number> {
  const { data: lastSeenRow } = await supabase
    .from("chat_last_seen")
    .select("last_seen_at")
    .eq("user_id", userId)
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .is("group_id", null)
    .maybeSingle();

  const otherSender = readerRole === "coach" ? "client" : "coach";
  let query = supabase
    .from("chats")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .is("group_id", null)
    .eq("sender", otherSender);

  if (lastSeenRow?.last_seen_at) {
    query = query.gt("timestamp", lastSeenRow.last_seen_at);
  }

  const { count } = await query;
  return count ?? 0;
}

async function getUnreadGroupCount(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  groupId: string,
  coachId: string
): Promise<number> {
  const { data: lastSeenRow } = await supabase
    .from("chat_last_seen")
    .select("last_seen_at")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .maybeSingle();

  let query;
  if (userId === coachId) {
    query = supabase
      .from("chats")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("sender", "client");
  } else {
    query = supabase
      .from("chats")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .or(`sender.eq.coach,and(sender.eq.client,client_id.neq.${userId})`);
  }

  if (lastSeenRow?.last_seen_at) {
    query = query.gt("timestamp", lastSeenRow.last_seen_at);
  }

  const { count } = await query;
  return count ?? 0;
}

async function getLatestMessage(
  supabase: ReturnType<typeof createServiceClient>,
  filter: { coachId: string; clientId?: string; groupId?: string }
): Promise<{ content: string; timestamp: string } | null> {
  let query = supabase
    .from("chats")
    .select("content, timestamp")
    .order("timestamp", { ascending: false })
    .limit(1);

  if (filter.groupId) {
    query = query.eq("group_id", filter.groupId);
  } else if (filter.clientId) {
    query = query
      .eq("coach_id", filter.coachId)
      .eq("client_id", filter.clientId)
      .is("group_id", null);
  } else {
    return null;
  }

  const { data } = await query.maybeSingle();
  return data;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const conversations: Conversation[] = [];

  if (user.role === "coach") {
    const { data: clients } = await supabase
      .from("users")
      .select("id, name, avatar_url")
      .eq("coach_id", user.id)
      .eq("role", "client")
      .order("name");

    for (const client of clients ?? []) {
      const latest = await getLatestMessage(supabase, {
        coachId: user.id,
        clientId: client.id,
      });
      const unread = await getUnreadDmCount(
        supabase,
        user.id,
        user.id,
        client.id,
        "coach"
      );
      conversations.push({
        id: `dm-${client.id}`,
        type: "dm",
        name: client.name,
        avatar_url: client.avatar_url,
        client_id: client.id,
        last_message: latest?.content ?? null,
        last_message_at: latest?.timestamp ?? null,
        unread_count: unread,
      });
    }

    const { data: groups } = await supabase
      .from("chat_groups")
      .select("id, name, description, created_at")
      .eq("coach_id", user.id)
      .order("updated_at", { ascending: false });

    for (const group of groups ?? []) {
      const { count: memberCount } = await supabase
        .from("chat_group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", group.id);

      const latest = await getLatestMessage(supabase, {
        coachId: user.id,
        groupId: group.id,
      });
      const unread = await getUnreadGroupCount(
        supabase,
        user.id,
        group.id,
        user.id
      );
      conversations.push({
        id: `group-${group.id}`,
        type: "group",
        name: group.name,
        group_id: group.id,
        member_count: (memberCount ?? 0) + 1,
        last_message: latest?.content ?? null,
        last_message_at: latest?.timestamp ?? null,
        unread_count: unread,
      });
    }
  } else {
    if (user.coach_id) {
      const { data: coach } = await supabase
        .from("users")
        .select("id, name, avatar_url")
        .eq("id", user.coach_id)
        .single();

      if (coach) {
        const latest = await getLatestMessage(supabase, {
          coachId: user.coach_id,
          clientId: user.id,
        });
        const unread = await getUnreadDmCount(
          supabase,
          user.id,
          user.coach_id,
          user.id,
          "client"
        );
        conversations.push({
          id: `dm-${user.coach_id}`,
          type: "dm",
          name: coach.name,
          avatar_url: coach.avatar_url,
          client_id: user.id,
          last_message: latest?.content ?? null,
          last_message_at: latest?.timestamp ?? null,
          unread_count: unread,
        });
      }
    }

    const { data: memberships } = await supabase
      .from("chat_group_members")
      .select("group_id, chat_groups(id, name, coach_id, updated_at)")
      .eq("client_id", user.id);

    for (const membership of memberships ?? []) {
      const groupRaw = membership.chat_groups;
      const group = (Array.isArray(groupRaw) ? groupRaw[0] : groupRaw) as {
        id: string;
        name: string;
        coach_id: string;
      } | null;
      if (!group) continue;

      const { count: memberCount } = await supabase
        .from("chat_group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", group.id);

      const latest = await getLatestMessage(supabase, {
        coachId: group.coach_id,
        groupId: group.id,
      });
      const unread = await getUnreadGroupCount(
        supabase,
        user.id,
        group.id,
        group.coach_id
      );
      conversations.push({
        id: `group-${group.id}`,
        type: "group",
        name: group.name,
        group_id: group.id,
        member_count: (memberCount ?? 0) + 1,
        last_message: latest?.content ?? null,
        last_message_at: latest?.timestamp ?? null,
        unread_count: unread,
      });
    }
  }

  conversations.sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  return json({ conversations, totalUnread });
}
