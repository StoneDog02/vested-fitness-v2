import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunctionArgs } from "@remix-run/node";
import type { Database } from "~/lib/supabase";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return json({ userId: null });

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("slug", slug)
    .single();
  return json({ userId: user?.id ?? null });
} 