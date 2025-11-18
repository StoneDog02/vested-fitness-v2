import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { Database } from "~/lib/supabase";

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const formId = params.formId;

  if (!formId) {
    return json({ error: "Form ID is required" }, { status: 400 });
  }

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
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: coachUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authId)
    .single();

  if (!coachUser || coachUser.role !== "coach") {
    return json({ error: "Only coaches can delete forms" }, { status: 403 });
  }

  try {
    const { data: existingForm, error: formFetchError } = await supabase
      .from("check_in_forms")
      .select("id, is_active")
      .eq("id", formId)
      .eq("coach_id", coachUser.id)
      .single();

    if (formFetchError || !existingForm || existingForm.is_active === false) {
      return json({ error: "Form not found or not accessible" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("check_in_forms")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formId)
      .eq("coach_id", coachUser.id)
      .eq("is_active", true);

    if (deleteError) {
      console.error("Error deleting form:", deleteError);
      return json({ error: "Failed to delete form" }, { status: 500 });
    }

    return json({ success: true });
  } catch (error) {
    console.error("Error deleting check-in form:", error);
    return json({ error: "Failed to delete form" }, { status: 500 });
  }
}


