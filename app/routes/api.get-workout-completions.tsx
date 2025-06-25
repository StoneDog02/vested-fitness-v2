import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Get user from auth cookie
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
        authId = undefined;
      }
    }

    if (!authId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Get user ID from auth_id
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", authId)
      .single();

    if (!user) {
      return json({ error: "User not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") || user.id; // Allow querying other users (for coaches)
    const date = url.searchParams.get("date");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    if (date) {
      // Get completions for a specific date
      const { data: completions } = await supabase
        .from("workout_completions")
        .select("*")
        .eq("user_id", userId)
        .eq("completed_at", date);

      return json({ 
        hasCompletion: (completions || []).length > 0,
        completions: completions || []
      });
    } else if (start && end) {
      // Get completions for a date range
      const { data: completions } = await supabase
        .from("workout_completions")
        .select("*")
        .eq("user_id", userId)
        .gte("completed_at", start)
        .lte("completed_at", end);

      // Group by date
      const completionsByDate: Record<string, any[]> = {};
      (completions || []).forEach((completion) => {
        const dateKey = completion.completed_at;
        if (!completionsByDate[dateKey]) {
          completionsByDate[dateKey] = [];
        }
        completionsByDate[dateKey].push(completion);
      });

      return json({ completionsByDate });
    } else {
      return json({ error: "date or start/end parameters required" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in get workout completions API:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}; 