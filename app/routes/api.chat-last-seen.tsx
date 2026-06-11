import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getCurrentTimestampISO } from "~/lib/timezone";
import {
  createServiceClient,
  getChatUserFromRequest,
  verifyCoachOwnsClient,
  verifyGroupAccess,
} from "~/lib/chat-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const groupId = url.searchParams.get("groupId") ?? undefined;

  if (!clientId && !groupId) {
    return json({ error: "clientId or groupId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (groupId) {
    const hasAccess = await verifyGroupAccess(user, groupId);
    if (!hasAccess) {
      return json({ error: "Access denied" }, { status: 403 });
    }

    const { data } = await supabase
      .from("chat_last_seen")
      .select("last_seen_at")
      .eq("user_id", user.id)
      .eq("group_id", groupId)
      .maybeSingle();

    return json({ last_seen_at: data?.last_seen_at ?? null });
  }

  let coachId: string;
  let clientIdForQuery: string;

  if (user.role === "coach") {
    coachId = user.id;
    clientIdForQuery = clientId!;
    const owns = await verifyCoachOwnsClient(user.id, clientIdForQuery);
    if (!owns) {
      return json({ error: "Access denied" }, { status: 403 });
    }
  } else {
    coachId = user.coach_id!;
    clientIdForQuery = user.id;
  }

  const { data } = await supabase
    .from("chat_last_seen")
    .select("last_seen_at")
    .eq("user_id", user.id)
    .eq("coach_id", coachId)
    .eq("client_id", clientIdForQuery)
    .is("group_id", null)
    .maybeSingle();

  return json({ last_seen_at: data?.last_seen_at ?? null });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let clientId: string | undefined;
  let groupId: string | undefined;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    clientId = body.clientId;
    groupId = body.groupId;
  } else {
    const formData = await request.formData();
    clientId = formData.get("clientId")?.toString();
    groupId = formData.get("groupId")?.toString();
  }

  if (!clientId && !groupId) {
    return json({ error: "clientId or groupId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const now = getCurrentTimestampISO();

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

    const { data: existing } = await supabase
      .from("chat_last_seen")
      .select("id")
      .eq("user_id", user.id)
      .eq("group_id", groupId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("chat_last_seen")
        .update({ last_seen_at: now })
        .eq("id", existing.id);
    } else {
      const { error: insertError } = await supabase.from("chat_last_seen").insert({
        user_id: user.id,
        coach_id: group.coach_id,
        client_id: null,
        group_id: groupId,
        last_seen_at: now,
      });
      if (insertError) {
        return json({ error: insertError.message }, { status: 500 });
      }
    }

    return json({ success: true, last_seen_at: now });
  }

  let coachId: string;
  let clientIdForQuery: string;

  if (user.role === "coach") {
    coachId = user.id;
    clientIdForQuery = clientId!;
    const owns = await verifyCoachOwnsClient(user.id, clientIdForQuery);
    if (!owns) {
      return json({ error: "Access denied" }, { status: 403 });
    }
  } else {
    coachId = user.coach_id!;
    clientIdForQuery = user.id;
  }

  const { data: existing } = await supabase
    .from("chat_last_seen")
    .select("id")
    .eq("user_id", user.id)
    .eq("coach_id", coachId)
    .eq("client_id", clientIdForQuery)
    .is("group_id", null)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("chat_last_seen")
      .update({ last_seen_at: now })
      .eq("id", existing.id);
    if (error) {
      return json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("chat_last_seen").insert({
      user_id: user.id,
      coach_id: coachId,
      client_id: clientIdForQuery,
      group_id: null,
      last_seen_at: now,
    });
    if (error) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  return json({ success: true, last_seen_at: now });
}
