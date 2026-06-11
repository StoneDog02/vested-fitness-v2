import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import {
  createServiceClient,
  getChatUserFromRequest,
} from "~/lib/chat-auth.server";
import { fetchPollsForMessages } from "~/lib/chat-polls.server";

export async function action({ request }: ActionFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { messageId, optionId } = body as {
    messageId?: string;
    optionId?: string;
  };

  if (!messageId || !optionId) {
    return json({ error: "messageId and optionId are required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: poll } = await supabase
    .from("chat_polls")
    .select("id, message_id")
    .eq("message_id", messageId)
    .single();

  if (!poll) {
    return json({ error: "Poll not found" }, { status: 404 });
  }

  const { data: option } = await supabase
    .from("chat_poll_options")
    .select("id")
    .eq("id", optionId)
    .eq("poll_id", poll.id)
    .single();

  if (!option) {
    return json({ error: "Invalid poll option" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("chat_poll_votes")
    .select("id, option_id")
    .eq("poll_id", poll.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.option_id === optionId) {
      const polls = await fetchPollsForMessages(supabase, [messageId], user.id);
      return json({ poll: polls[messageId] ?? null });
    }

    const { error: updateError } = await supabase
      .from("chat_poll_votes")
      .update({ option_id: optionId })
      .eq("id", existing.id);

    if (updateError) {
      return json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabase.from("chat_poll_votes").insert({
      poll_id: poll.id,
      option_id: optionId,
      user_id: user.id,
    });

    if (insertError) {
      return json({ error: insertError.message }, { status: 500 });
    }
  }

  const polls = await fetchPollsForMessages(supabase, [messageId], user.id);
  return json({ poll: polls[messageId] ?? null });
}
