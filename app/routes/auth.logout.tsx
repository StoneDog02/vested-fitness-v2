import { redirect, createCookie } from "@remix-run/node";

const supabaseSession = createCookie("sb-ckwcxmxbfffkknrnkdtk-auth-token", {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 0, // Expire immediately
});

export const loader = async () => {
  // Clear the cookie by setting it to an empty value and expiring it
  return redirect("/auth/login", {
    headers: {
      "Set-Cookie": await supabaseSession.serialize(""),
    },
  });
};

export default function Logout() {
  // This page will never be rendered because the loader always redirects
  return null;
}
