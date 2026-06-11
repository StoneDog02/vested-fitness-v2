import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import {
  createServiceClient,
  getChatUserFromRequest,
} from "~/lib/chat-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const messageIds = url.searchParams.get("messageIds");
  if (!messageIds) {
    return json({ error: "messageIds is required" }, { status: 400 });
  }

  const ids = messageIds.split(",").filter(Boolean);
  const supabase = createServiceClient();

  const { data: reactions, error } = await supabase
    .from("chat_message_reactions")
    .select("id, message_id, user_id, reaction, created_at, users(name)")
    .in("message_id", ids);

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  const grouped: Record<
    string,
    { reaction: string; count: number; user_ids: string[]; users: string[] }[]
  > = {};

  for (const r of reactions ?? []) {
    const uRaw = r.users;
    const u = (Array.isArray(uRaw) ? uRaw[0] : uRaw) as { name: string } | null;
    if (!grouped[r.message_id]) grouped[r.message_id] = [];

    let entry = grouped[r.message_id].find((e) => e.reaction === r.reaction);
    if (!entry) {
      entry = { reaction: r.reaction, count: 0, user_ids: [], users: [] };
      grouped[r.message_id].push(entry);
    }
    entry.count++;
    entry.user_ids.push(r.user_id);
    entry.users.push(u?.name?.trim() || "Unknown user");
  }

  return json({ reactions: grouped });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { messageId, reaction } = body as {
    messageId?: string;
    reaction?: string;
  };

  if (!messageId || !reaction) {
    return json({ error: "messageId and reaction are required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("chat_message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("reaction", reaction)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("chat_message_reactions")
      .delete()
      .eq("id", existing.id);
    if (error) {
      return json({ error: error.message }, { status: 500 });
    }
    return json({ toggled: "removed" });
  }

  const { data, error } = await supabase
    .from("chat_message_reactions")
    .insert({
      message_id: messageId,
      user_id: user.id,
      reaction,
    })
    .select()
    .single();

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  return json({ toggled: "added", reaction: data });
}
