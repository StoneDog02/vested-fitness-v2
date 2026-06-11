import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { createServiceClient, getChatUserFromRequest } from "~/lib/chat-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const userIdsParam = url.searchParams.get("userIds");
  if (!userIdsParam) {
    return json({ error: "userIds is required" }, { status: 400 });
  }

  const userIds = userIdsParam.split(",").filter(Boolean);
  if (userIds.length === 0) {
    return json({ avatars: {} });
  }

  const supabase = createServiceClient();
  const { data: users, error } = await supabase
    .from("users")
    .select("id, name, avatar_url")
    .in("id", userIds);

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  const avatars: Record<string, { url: string | null; name: string }> = {};
  for (const u of users ?? []) {
    avatars[u.id] = { url: u.avatar_url ?? null, name: u.name };
  }

  return json({ avatars });
}
