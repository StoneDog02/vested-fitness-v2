import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import {
  createServiceClient,
  getChatUserFromRequest,
  verifyCoachOwnsClient,
  verifyGroupAccess,
} from "~/lib/chat-auth.server";
import { fetchPollsForMessages } from "~/lib/chat-polls.server";

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
  const polls = await fetchPollsForMessages(supabase, ids, user.id);

  return json({ polls });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { clientId, groupId, question, options, replyToId } = body as {
    clientId?: string;
    groupId?: string;
    question?: string;
    options?: string[];
    replyToId?: string | null;
  };

  const trimmedQuestion = question?.trim();
  const trimmedOptions = (options ?? []).map((o) => o.trim()).filter(Boolean);

  if (!trimmedQuestion) {
    return json({ error: "Question is required" }, { status: 400 });
  }
  if (trimmedOptions.length < 2) {
    return json({ error: "At least 2 options are required" }, { status: 400 });
  }
  if (trimmedOptions.length > 12) {
    return json({ error: "Maximum 12 options allowed" }, { status: 400 });
  }
  if (!clientId && !groupId) {
    return json({ error: "clientId or groupId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  let insertRow: Record<string, unknown>;

  if (groupId) {
    const hasAccess = await verifyGroupAccess(user, groupId);
    if (!hasAccess) {
      return json({ error: "Access denied" }, { status: 403 });
    }

    const { data: group } = await supabase
      .from("chat_groups")
      .select("coach_id")
      .eq("id", groupId)
      .single();
    if (!group) {
      return json({ error: "Group not found" }, { status: 404 });
    }

    insertRow = {
      coach_id: group.coach_id,
      group_id: groupId,
      client_id: user.role === "client" ? user.id : null,
      sender: user.role,
      content: trimmedQuestion,
      reply_to_id: replyToId ?? null,
      message_type: "poll",
    };

    await supabase
      .from("chat_groups")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", groupId);
  } else {
    let coachId: string;
    let clientIdForInsert: string;

    if (user.role === "coach") {
      coachId = user.id;
      clientIdForInsert = clientId!;
      const owns = await verifyCoachOwnsClient(user.id, clientIdForInsert);
      if (!owns) {
        return json({ error: "Access denied" }, { status: 403 });
      }
    } else {
      coachId = user.coach_id!;
      clientIdForInsert = user.id;
    }

    insertRow = {
      coach_id: coachId,
      client_id: clientIdForInsert,
      group_id: null,
      sender: user.role,
      content: trimmedQuestion,
      reply_to_id: replyToId ?? null,
      message_type: "poll",
    };
  }

  const { data: message, error: msgError } = await supabase
    .from("chats")
    .insert(insertRow)
    .select()
    .single();

  if (msgError || !message) {
    return json({ error: msgError?.message ?? "Failed to create poll message" }, { status: 500 });
  }

  const { data: poll, error: pollError } = await supabase
    .from("chat_polls")
    .insert({ message_id: message.id, question: trimmedQuestion })
    .select()
    .single();

  if (pollError || !poll) {
    await supabase.from("chats").delete().eq("id", message.id);
    return json({ error: pollError?.message ?? "Failed to create poll" }, { status: 500 });
  }

  const optionRows = trimmedOptions.map((label, index) => ({
    poll_id: poll.id,
    label,
    position: index,
  }));

  const { error: optionsError } = await supabase.from("chat_poll_options").insert(optionRows);

  if (optionsError) {
    await supabase.from("chats").delete().eq("id", message.id);
    return json({ error: optionsError.message }, { status: 500 });
  }

  const polls = await fetchPollsForMessages(supabase, [message.id], user.id);

  return json({
    message: {
      ...message,
      sender_name: user.name,
      sender_avatar_url: user.avatar_url,
    },
    poll: polls[message.id] ?? null,
  });
}
