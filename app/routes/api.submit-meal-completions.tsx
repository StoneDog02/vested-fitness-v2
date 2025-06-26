import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const action = async ({ request }: { request: Request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  // Get user from cookie
  const cookies = parse(request.headers.get("cookie") || "");
  const supabaseAuthCookieKey = Object.keys(cookies).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
  );
  let accessToken;
  if (supabaseAuthCookieKey) {
    try {
      const decoded = Buffer.from(
        cookies[supabaseAuthCookieKey],
        "base64"
      ).toString("utf-8");
      const [access] = JSON.parse(JSON.parse(decoded));
      accessToken = access;
    } catch (e) {
      accessToken = undefined;
    }
  }
  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      /* ignore */
    }
  }
  if (!authId) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }
  // Get user row
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", authId)
    .single();
  if (!user) {
    return json({ error: "User not found" }, { status: 404 });
  }
  // Parse body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { completedMealIds, date } = body;
  if (!Array.isArray(completedMealIds) || !date) {
    return json({ error: "Missing completedMealIds or date" }, { status: 400 });
  }
  // Log the submission attempt
  console.log(`📝 Meal submission attempt:`, {
    userId: user.id,
    date,
    completedMealIds,
    timestamp: new Date().toISOString()
  });

  // Insert meal completions (avoid duplicates)
  let insertCount = 0;
  let skipCount = 0;
  
  for (const mealId of completedMealIds) {
    try {
      // Check if already exists (by date, not exact timestamp)
      const { data: existing, error: selectError } = await supabase
        .from("meal_completions")
        .select("id")
        .eq("user_id", user.id)
        .eq("meal_id", mealId)
        .gte("completed_at", `${date}T00:00:00.000Z`)
        .lt("completed_at", `${date}T23:59:59.999Z`)
        .single();
        
      if (selectError && selectError.code !== 'PGRST116') {
        // PGRST116 is "not found" which is expected, other errors are problems
        console.error('Error checking existing completion:', selectError);
        return json({ error: `Database query error: ${selectError.message}` }, { status: 500 });
      }
      
      if (!existing) {
        const { error: insertError } = await supabase.from("meal_completions").insert({
          user_id: user.id,
          meal_id: mealId,
          completed_at: new Date().toISOString(), // Use current timestamp instead of just date
        });
        
        if (insertError) {
          console.error('Error inserting meal completion:', {
            userId: user.id,
            mealId,
            date,
            error: insertError
          });
          return json({ error: `Insert failed: ${insertError.message}` }, { status: 500 });
        }
        
        insertCount++;
        console.log(`✅ Inserted meal completion: user=${user.id}, meal=${mealId}, date=${date}`);
      } else {
        skipCount++;
        console.log(`⏭️ Skipped duplicate: user=${user.id}, meal=${mealId}, date=${date}`);
      }
    } catch (error) {
      console.error('Unexpected error during meal completion submission:', error);
      return json({ error: 'Unexpected database error' }, { status: 500 });
    }
  }
  
  console.log(`✅ Meal submission completed: ${insertCount} inserted, ${skipCount} skipped`);
  return json({ success: true, inserted: insertCount, skipped: skipCount });
};

export const loader = async () => json({ error: "Not found" }, { status: 404 }); 