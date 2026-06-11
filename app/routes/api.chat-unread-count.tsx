import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { createServiceClient, getChatUserFromRequest } from "~/lib/chat-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServiceClient();

  if (user.role === "client" && user.coach_id) {
    const { data: lastSeenRow } = await supabase
      .from("chat_last_seen")
      .select("last_seen_at")
      .eq("user_id", user.id)
      .eq("coach_id", user.coach_id)
      .eq("client_id", user.id)
      .is("group_id", null)
      .maybeSingle();

    let query = supabase
      .from("chats")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", user.coach_id)
      .eq("client_id", user.id)
      .is("group_id", null)
      .eq("sender", "coach");

    if (lastSeenRow?.last_seen_at) {
      query = query.gt("timestamp", lastSeenRow.last_seen_at);
    }

    const { count: dmUnread } = await query;

    const { data: memberships } = await supabase
      .from("chat_group_members")
      .select("group_id")
      .eq("client_id", user.id);

    let groupUnread = 0;
    for (const m of memberships ?? []) {
      const { data: lastSeen } = await supabase
        .from("chat_last_seen")
        .select("last_seen_at")
        .eq("user_id", user.id)
        .eq("group_id", m.group_id)
        .maybeSingle();

      let gq = supabase
        .from("chats")
        .select("id", { count: "exact", head: true })
        .eq("group_id", m.group_id)
        .or(`sender.eq.coach,and(sender.eq.client,client_id.neq.${user.id})`);

      if (lastSeen?.last_seen_at) {
        gq = gq.gt("timestamp", lastSeen.last_seen_at);
      }
      const { count } = await gq;
      groupUnread += count ?? 0;
    }

    return json({ unreadCount: (dmUnread ?? 0) + groupUnread });
  }

  if (user.role === "coach") {
    const res = await fetch(new URL("/api/chat-conversations", request.url), {
      headers: request.headers,
    });
    if (res.ok) {
      const data = await res.json();
      return json({ unreadCount: data.totalUnread ?? 0 });
    }
  }

  return json({ unreadCount: 0 });
}
