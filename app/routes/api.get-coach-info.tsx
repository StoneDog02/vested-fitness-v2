import { json } from "@remix-run/node";
import type { LoaderFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const coachId = url.searchParams.get("coachId");

  if (!coachId) {
    return json({ error: "Coach ID is required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  try {
    const { data: coach, error } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("id", coachId)
      .eq("role", "coach")
      .single();

    if (error || !coach) {
      return json({ error: "Coach not found" }, { status: 404 });
    }

    return json({
      coachName: coach.name || "Your Coach",
      coachEmail: coach.email
    });
  } catch (error) {
    console.error("Error fetching coach info:", error);
    return json({ error: "Failed to fetch coach information" }, { status: 500 });
  }
}; 