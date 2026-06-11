import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  createServiceClient,
  getChatUserFromRequest,
  verifyCoachOwnsClient,
} from "~/lib/chat-auth.server";

type GroupMemberRow = {
  id: string;
  name: string;
  avatar_url?: string | null;
  role: "coach" | "client";
};

async function fetchGroupMembers(
  supabase: ReturnType<typeof createServiceClient>,
  groupId: string,
  coachId: string
): Promise<GroupMemberRow[]> {
  const { data: coach } = await supabase
    .from("users")
    .select("id, name, avatar_url")
    .eq("id", coachId)
    .single();

  const { data: members } = await supabase
    .from("chat_group_members")
    .select("client_id, users(id, name, avatar_url)")
    .eq("group_id", groupId);

  const clientMembers = (members ?? [])
    .map((m) => {
      const uRaw = m.users;
      const u = (Array.isArray(uRaw) ? uRaw[0] : uRaw) as {
        id: string;
        name: string;
        avatar_url?: string | null;
      };
      return {
        id: u.id,
        name: u.name,
        avatar_url: u.avatar_url,
        role: "client" as const,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const result: GroupMemberRow[] = [];
  if (coach) {
    result.push({
      id: coach.id,
      name: coach.name,
      avatar_url: coach.avatar_url,
      role: "coach",
    });
  }
  result.push(...clientMembers);
  return result;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId");
  if (!groupId) {
    return json({ error: "groupId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (user.role === "coach") {
    const { data: group, error } = await supabase
      .from("chat_groups")
      .select("id, coach_id, name, description, created_at, updated_at")
      .eq("id", groupId)
      .eq("coach_id", user.id)
      .single();
    if (error || !group) {
      return json({ error: "Group not found" }, { status: 404 });
    }

    const members = await fetchGroupMembers(supabase, groupId, group.coach_id);

    return json({
      group: {
        ...group,
        members,
        member_count: members.length,
      },
    });
  }

  const { data: membership } = await supabase
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("client_id", user.id)
    .single();

  if (!membership) {
    return json({ error: "Group not found" }, { status: 404 });
  }

  const { data: group } = await supabase
    .from("chat_groups")
    .select("id, coach_id, name, description, created_at, updated_at")
    .eq("id", groupId)
    .single();

  if (!group) {
    return json({ error: "Group not found" }, { status: 404 });
  }

  const members = await fetchGroupMembers(supabase, groupId, group.coach_id);

  return json({
    group: {
      ...group,
      members,
      member_count: members.length,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user || user.role !== "coach") {
    return json({ error: "Only coaches can manage groups" }, { status: 403 });
  }

  const supabase = createServiceClient();

  if (request.method === "POST") {
    const body = await request.json();
    const { name, description, clientIds } = body as {
      name?: string;
      description?: string;
      clientIds?: string[];
    };

    if (!name?.trim()) {
      return json({ error: "name is required" }, { status: 400 });
    }
    if (!clientIds?.length) {
      return json({ error: "At least one client is required" }, { status: 400 });
    }

    for (const clientId of clientIds) {
      const owns = await verifyCoachOwnsClient(user.id, clientId);
      if (!owns) {
        return json({ error: `Invalid client: ${clientId}` }, { status: 400 });
      }
    }

    const { data: group, error: groupError } = await supabase
      .from("chat_groups")
      .insert({
        coach_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .select()
      .single();

    if (groupError || !group) {
      return json({ error: groupError?.message ?? "Failed to create group" }, { status: 500 });
    }

    const memberRows = clientIds.map((clientId) => ({
      group_id: group.id,
      client_id: clientId,
    }));

    const { error: membersError } = await supabase
      .from("chat_group_members")
      .insert(memberRows);

    if (membersError) {
      await supabase.from("chat_groups").delete().eq("id", group.id);
      return json({ error: membersError.message }, { status: 500 });
    }

    return json({ group });
  }

  if (request.method === "PATCH") {
    const body = await request.json();
    const { groupId, name, description, addClientIds, removeClientIds } = body as {
      groupId?: string;
      name?: string;
      description?: string;
      addClientIds?: string[];
      removeClientIds?: string[];
    };

    if (!groupId) {
      return json({ error: "groupId is required" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("chat_groups")
      .select("id")
      .eq("id", groupId)
      .eq("coach_id", user.id)
      .single();

    if (!existing) {
      return json({ error: "Group not found" }, { status: 404 });
    }

    if (name || description !== undefined) {
      await supabase
        .from("chat_groups")
        .update({
          ...(name ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description: description?.trim() || null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", groupId);
    }

    if (addClientIds?.length) {
      for (const clientId of addClientIds) {
        const owns = await verifyCoachOwnsClient(user.id, clientId);
        if (!owns) {
          return json({ error: `Invalid client: ${clientId}` }, { status: 400 });
        }
      }
      await supabase.from("chat_group_members").upsert(
        addClientIds.map((clientId) => ({ group_id: groupId, client_id: clientId })),
        { onConflict: "group_id,client_id", ignoreDuplicates: true }
      );
    }

    if (removeClientIds?.length) {
      await supabase
        .from("chat_group_members")
        .delete()
        .eq("group_id", groupId)
        .in("client_id", removeClientIds);
    }

    const { data: group } = await supabase
      .from("chat_groups")
      .select("*")
      .eq("id", groupId)
      .single();

    return json({ group });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const groupId = url.searchParams.get("groupId");
    if (!groupId) {
      return json({ error: "groupId is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("chat_groups")
      .delete()
      .eq("id", groupId)
      .eq("coach_id", user.id);

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
