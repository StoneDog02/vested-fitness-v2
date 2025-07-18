import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { getCurrentTimestampISO } from "~/lib/timezone";

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const exerciseId = url.searchParams.get("exerciseId");
  if (!exerciseId) return json({ error: "Missing exerciseId" }, { status: 400 });

  // Get user from cookie
  const cookie = request.headers.get("cookie") || "";
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("workouts_personal_bests")
    .select("weight")
    .eq("user_id", user.id)
    .eq("exercise_id", exerciseId)
    .single();
  if (error && error.code !== "PGRST116") return json({ error: error.message }, { status: 500 });
  return json({ weight: data?.weight || null });
};

export const action = async ({ request }: { request: Request }) => {
  const body = await request.json();
  const { exerciseId, weight } = body;
  if (!exerciseId || typeof weight !== "number") return json({ error: "Missing exerciseId or weight" }, { status: 400 });

  // Get user from cookie
  const cookie = request.headers.get("cookie") || "";
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Not authenticated" }, { status: 401 });

  // Upsert PB
  const { error } = await supabase
    .from("workouts_personal_bests")
    .upsert({ user_id: user.id, exercise_id: exerciseId, weight, date_achieved: getCurrentTimestampISO(), updated_at: getCurrentTimestampISO() }, { onConflict: "user_id,exercise_id" });
  if (error) return json({ error: error.message }, { status: 500 });
  return json({ success: true });
}; 