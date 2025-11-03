import { json, createCookie } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseCookieName } from "~/lib/supabase";

export const action = async ({ request }: { request: Request }) => {
  try {
    const { access_token, refresh_token } = await request.json();
    if (!access_token || !refresh_token) {
      return json({ error: "Missing tokens" }, { status: 400 });
    }

    // Set the HTTP-only cookie for the session (same as in auth.login.tsx)
    const cookieName = getSupabaseCookieName();
    const supabaseSession = createCookie(cookieName, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    const setCookie = await supabaseSession.serialize(
      JSON.stringify([access_token, refresh_token])
    );
    return new Response(null, {
      status: 200,
      headers: { "Set-Cookie": setCookie },
    });
  } catch (e) {
    return json({ error: "Invalid request" }, { status: 400 });
  }
}; 