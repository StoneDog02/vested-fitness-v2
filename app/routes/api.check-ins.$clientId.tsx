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
  const notes = formData.get("notes")?.toString();

  if (!notes) {
    return json({ error: "Notes are required" }, { status: 400 });
  }

  // Get the current user's ID
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  // Insert the check-in
  const { data, error } = await supabase
    .from("check_ins")
    .insert({
      client_id: params.clientId,
      notes,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating check-in:", error);
    return json({ error: "Failed to create check-in" }, { status: 500 });
  }

  return json({ checkIn: data });
}
