import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import {
  createServiceClient,
  getChatUserFromRequest,
  verifyCoachOwnsClient,
  verifyGroupAccess,
} from "~/lib/chat-auth.server";

const DEFAULT_LIMIT = 30;

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");
  const groupId = url.searchParams.get("groupId");
  const before = url.searchParams.get("before");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    100
  );

  if (!clientId && !groupId) {
    return json({ error: "clientId or groupId is required" }, { status: 400 });
  }
  if (clientId && groupId) {
    return json({ error: "Provide only one of clientId or groupId" }, { status: 400 });
  }

  const supabase = createServiceClient();
  let coachId: string;

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
    coachId = group.coach_id;
  } else {
    if (user.role === "coach") {
      coachId = user.id;
      const owns = await verifyCoachOwnsClient(user.id, clientId!);
      if (!owns) {
        return json({ error: "Access denied" }, { status: 403 });
      }
    } else {
      coachId = user.coach_id!;
      if (clientId !== user.id) {
        return json({ error: "Access denied" }, { status: 403 });
      }
    }
  }

  let query = supabase
    .from("chats")
    .select(
      "id, coach_id, client_id, group_id, sender, content, timestamp, reply_to_id, message_type, attachment_url, attachment_metadata"
    )
    .eq("coach_id", coachId)
    .order("timestamp", { ascending: false })
    .limit(limit + 1);

  if (groupId) {
    query = query.eq("group_id", groupId);
  } else {
    query = query.eq("client_id", clientId!).is("group_id", null);
  }

  if (before) {
    query = query.lt("timestamp", before);
  }

  const { data: rows, error } = await query;
  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  const hasMore = (rows?.length ?? 0) > limit;
  const messages = (rows ?? []).slice(0, limit).reverse();

  const userIds = new Set<string>();
  for (const msg of messages) {
    if (msg.sender === "coach") userIds.add(msg.coach_id);
    else if (msg.client_id) userIds.add(msg.client_id);
  }

  const { data: users } = await supabase
    .from("users")
    .select("id, name, avatar_url")
    .in("id", Array.from(userIds));

  const userMap = new Map(
    (users ?? []).map((u) => [u.id, { name: u.name, avatar_url: u.avatar_url }])
  );

  const enriched = messages.map((msg) => {
    const senderId = msg.sender === "coach" ? msg.coach_id : msg.client_id;
    const senderInfo = senderId ? userMap.get(senderId) : undefined;
    return {
      ...msg,
      sender_name: senderInfo?.name,
      sender_avatar_url: senderInfo?.avatar_url,
    };
  });

  return json({
    messages: enriched,
    hasMore,
    nextBefore: hasMore && messages.length > 0 ? messages[0].timestamp : null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let clientId: string | undefined;
  let groupId: string | undefined;
  let content: string | undefined;
  let replyToId: string | undefined;
  let messageType: string | undefined;
  let attachmentUrl: string | undefined;
  let attachmentMetadata: Record<string, unknown> | undefined;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    clientId = body.clientId;
    groupId = body.groupId;
    content = body.content;
    replyToId = body.replyToId;
    messageType = body.messageType;
    attachmentUrl = body.attachmentUrl;
    attachmentMetadata = body.attachmentMetadata;
  } else {
    const formData = await request.formData();
    clientId = formData.get("clientId")?.toString();
    groupId = formData.get("groupId")?.toString();
    content = formData.get("content")?.toString();
    replyToId = formData.get("replyToId")?.toString();
    messageType = formData.get("messageType")?.toString();
    attachmentUrl = formData.get("attachmentUrl")?.toString();
    const metadataRaw = formData.get("attachmentMetadata")?.toString();
    if (metadataRaw) {
      try {
        attachmentMetadata = JSON.parse(metadataRaw) as Record<string, unknown>;
      } catch {
        attachmentMetadata = undefined;
      }
    }
  }

  if (!content?.trim() && !attachmentUrl) {
    return json({ error: "content or attachment is required" }, { status: 400 });
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
      content: content?.trim() ?? "",
      reply_to_id: replyToId ?? null,
      message_type: messageType ?? "text",
      attachment_url: attachmentUrl ?? null,
      attachment_metadata: attachmentMetadata ?? null,
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
      content: content?.trim() ?? "",
      reply_to_id: replyToId ?? null,
      message_type: messageType ?? "text",
      attachment_url: attachmentUrl ?? null,
      attachment_metadata: attachmentMetadata ?? null,
    };
  }

  const { data, error } = await supabase
    .from("chats")
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  return json({ message: data });
}
