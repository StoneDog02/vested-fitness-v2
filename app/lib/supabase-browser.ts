import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  accessToken: string
): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });
  }

  browserClient.realtime.setAuth(accessToken);
  return browserClient;
}

export function resetSupabaseBrowserClient() {
  browserClient = null;
}
