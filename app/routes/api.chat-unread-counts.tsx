import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { createServiceClient, getChatUserFromRequest } from "~/lib/chat-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user || user.role !== "coach") {
    return json({ error: "User is not a coach" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const result: Record<string, number> = {};

  const { data: clients } = await supabase
    .from("users")
    .select("id")
    .eq("coach_id", user.id)
    .eq("role", "client");

  for (const client of clients ?? []) {
    const { data: lastSeenRow } = await supabase
      .from("chat_last_seen")
      .select("last_seen_at")
      .eq("user_id", user.id)
      .eq("coach_id", user.id)
      .eq("client_id", client.id)
      .is("group_id", null)
      .maybeSingle();

    let query = supabase
      .from("chats")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", user.id)
      .eq("client_id", client.id)
      .is("group_id", null)
      .eq("sender", "client");

    if (lastSeenRow?.last_seen_at) {
      query = query.gt("timestamp", lastSeenRow.last_seen_at);
    }

    const { count } = await query;
    result[client.id] = count ?? 0;
  }

  const { data: groups } = await supabase
    .from("chat_groups")
    .select("id")
    .eq("coach_id", user.id);

  const groupUnread: Record<string, number> = {};
  for (const group of groups ?? []) {
    const { data: lastSeenRow } = await supabase
      .from("chat_last_seen")
      .select("last_seen_at")
      .eq("user_id", user.id)
      .eq("group_id", group.id)
      .maybeSingle();

    let query = supabase
      .from("chats")
      .select("id", { count: "exact", head: true })
      .eq("group_id", group.id)
      .eq("sender", "client");

    if (lastSeenRow?.last_seen_at) {
      query = query.gt("timestamp", lastSeenRow.last_seen_at);
    }

    const { count } = await query;
    groupUnread[group.id] = count ?? 0;
  }

  return json({ unreadCounts: result, groupUnreadCounts: groupUnread });
}
