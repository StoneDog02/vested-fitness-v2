import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    if (!date && !(startDate && endDate)) {
      return json({ error: "Date parameter or startDate/endDate parameters are required" }, { status: 400 });
    }

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

    let completions;
    if (date) {
      // Get completions for a specific date
      const targetDate = new Date(date);
      const nextDay = new Date(targetDate);
      nextDay.setDate(targetDate.getDate() + 1);

      const { data: completionsData, error: completionsError } = await supabase
        .from("supplement_completions")
        .select(`
          id,
          supplement_id,
          completed_at,
          supplements (
            id,
            name,
            dosage,
            frequency,
            instructions
          )
        `)
        .eq("user_id", user.id)
        .gte("completed_at", targetDate.toISOString().split('T')[0])
        .lt("completed_at", nextDay.toISOString().split('T')[0])
        .order("completed_at", { ascending: false });

      if (completionsError) {
        return json({ error: completionsError.message }, { status: 500 });
      }

      completions = completionsData || [];
    } else {
      // Get completions for a date range
      const { data: completionsData, error: completionsError } = await supabase
        .from("supplement_completions")
        .select(`
          id,
          supplement_id,
          completed_at,
          supplements (
            id,
            name,
            dosage,
            frequency,
            instructions
          )
        `)
        .eq("user_id", user.id)
        .gte("completed_at", startDate!)
        .lte("completed_at", endDate!)
        .order("completed_at", { ascending: false });

      if (completionsError) {
        return json({ error: completionsError.message }, { status: 500 });
      }

      completions = completionsData || [];
    }

    return json({ completions });
  } catch (error) {
    console.error("Error fetching supplement completions:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}; 