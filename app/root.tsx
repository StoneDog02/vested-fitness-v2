import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData
} from "@remix-run/react";
import { ThemeProvider } from "./context/ThemeContext";
import { MealCompletionProvider } from "./context/MealCompletionContext";
import { ToastProvider } from "./context/ToastContext";
import { UserContext } from "./context/UserContext";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { Database } from "~/lib/supabase";
import type { UserContextType } from "./context/UserContext";

import styles from "./tailwind.css?url";

// Initialize environment variables

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: styles },
  // Traditional favicon for broad compatibility
  { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
  { rel: "shortcut icon", type: "image/x-icon", href: "/favicon.ico" },
  // Modern favicon with size specification
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/KAVA-black.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/KAVA-black.png" },
  // Apple touch icon for iOS devices
  { rel: "apple-touch-icon", sizes: "180x180", href: "/KAVA-black.png" },
];

export async function loader({ request }: LoaderFunctionArgs) {
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
  let user = null;
  let role = null;
  let authId;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken);
      authId = decoded && typeof decoded === "object" && "sub" in decoded ? decoded.sub : undefined;
    } catch (e) {
      authId = undefined;
    }
  }
  if (authId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: userData } = await supabase
      .from("users")
      .select("id, name, email, role, avatar_url, font_size, access_status, stripe_customer_id, chat_bubble_color")
      .eq("auth_id", authId)
      .single();
    if (userData) {
      role = userData.role;
      user = userData;
    }
  }
  return json({ user: user ? { id: String(user.id), role: user.role as 'coach' | 'client', chat_bubble_color: user.chat_bubble_color } as UserContextType : undefined });
}

export default function App() {
  const { user } = useLoaderData<typeof loader>();
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" />
        <Meta />
        <Links />
      </head>
      <body className="transition-colors duration-200 text-secondary">
        <ThemeProvider>
          <MealCompletionProvider>
            <ToastProvider>
              <UserContext.Provider value={user as UserContextType | undefined}>
                <Outlet />
              </UserContext.Provider>
            </ToastProvider>
          </MealCompletionProvider>
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
