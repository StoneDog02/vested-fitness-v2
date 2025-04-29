import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";

export async function action({ request, params }: ActionFunctionArgs) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const formData = await request.formData();
  const message = formData.get("message")?.toString();

  if (!message) {
    return json({ error: "Message is required" }, { status: 400 });
  }

  // Get the current user's ID
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get the coach's user record
  const { data: coachUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!coachUser) {
    return json({ error: "Coach not found" }, { status: 404 });
  }

  // Insert the update
  const { data, error } = await supabase
    .from("coach_updates")
    .insert({
      coach_id: coachUser.id,
      client_id: params.clientId,
      message,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating update:", error);
    return json({ error: "Failed to create update" }, { status: 500 });
  }

  return json({ update: data });
}
