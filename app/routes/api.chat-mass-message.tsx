import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import {
  createServiceClient,
  getChatUserFromRequest,
  verifyCoachOwnsClient,
} from "~/lib/chat-auth.server";

export async function action({ request }: ActionFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user || user.role !== "coach") {
    return json({ error: "Only coaches can send mass messages" }, { status: 403 });
  }

  const body = await request.json();
  const { clientIds, content } = body as {
    clientIds?: string[];
    content?: string;
  };

  if (!clientIds?.length) {
    return json({ error: "clientIds is required" }, { status: 400 });
  }
  if (!content?.trim()) {
    return json({ error: "content is required" }, { status: 400 });
  }

  for (const clientId of clientIds) {
    const owns = await verifyCoachOwnsClient(user.id, clientId);
    if (!owns) {
      return json({ error: `Invalid client: ${clientId}` }, { status: 400 });
    }
  }

  const supabase = createServiceClient();
  const rows = clientIds.map((clientId) => ({
    coach_id: user.id,
    client_id: clientId,
    group_id: null,
    sender: "coach" as const,
    content: content.trim(),
  }));

  const { data: messages, error } = await supabase
    .from("chats")
    .insert(rows)
    .select();

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  return json({ messages, count: messages?.length ?? 0 });
}
