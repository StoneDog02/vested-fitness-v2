import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getChatUserFromRequest } from "~/lib/chat-auth.server";
import { fetchGifs } from "~/lib/giphy.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? undefined;
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  try {
    const { gifs, configured } = await fetchGifs({ query, offset });

    if (!configured) {
      return json({
        gifs: [],
        configured: false,
        error: "GIF search is not configured. Add GIPHY_API_KEY to your environment.",
      });
    }

    return json({ gifs, configured: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load GIFs";
    return json({ error: message, gifs: [], configured: true }, { status: 502 });
  }
}
