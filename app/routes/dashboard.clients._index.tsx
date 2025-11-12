import type { LoaderFunction, MetaFunction } from "@remix-run/node";
import Button from "~/components/ui/Button";
import ClientInviteModal from "~/components/coach/ClientInviteModal";
import { useEffect, useState } from "react";
import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import type { Database } from "~/lib/supabase";
import { extractAuthFromCookie } from "~/lib/supabase";
import { useFetcher, useLoaderData, Link } from "@remix-run/react";
import { useUser } from "~/context/UserContext";
import { useToast } from "~/context/ToastContext";

interface Supplement {
  id: string;
  name: string;
}

interface MealFood {
  id: string;
  name: string;
  portion?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Meal {
  id: string;
  name: string;
  time?: string;
  sequence_order?: number;
  foods: MealFood[];
}

interface MealPlan {
  id: string;
  title: string;
  is_active: boolean;
  meals: Meal[];
}

interface WorkoutPlan {
  id: string;
  title: string;
  is_active: boolean;
}

type ClientSummary = {
  id: string;
  name: string;
  email?: string;
  status?: string;
  slug?: string;
};

type ClientsLoaderResult = {
  clients: ClientSummary[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  total: number;
  error?: string;
};

export const meta: MetaFunction = () => {
  return [
    { title: "Clients | Kava Training" },
    { name: "description", content: "View and manage your clients" },
  ];
};

// In-memory cache for coach's clients (expires after 30s)
const clientsCache: Record<string, { data: ClientsLoaderResult; expires: number }> = {};

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  const cookies = parse(request.headers.get("cookie") || "");
  const { accessToken } = extractAuthFromCookie(cookies);

  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      if (decoded && typeof decoded === "object" && "sub" in decoded) {
        authId = decoded.sub as string;
      }
    } catch (error) {
      console.error("[LOADER] Failed to decode access token:", error);
    }
  }

  let coachId: string | null = null;
  let supabaseAdmin: ReturnType<typeof createClient<Database>> | null = null;

  if (authId) {
    supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    try {
      const { data: user, error: userError } = await supabaseAdmin
        .from("users")
        .select("id, role, coach_id")
        .eq("auth_id", authId)
        .single();

      if (userError) {
        console.error("[LOADER] Failed to resolve coach id:", userError);
      } else if (user) {
        coachId = user.role === "coach" ? user.id : user.coach_id;
      }
    } catch (error) {
      console.error("[LOADER] Unexpected error resolving coach id:", error);
    }
  }

  const cacheEntry = coachId ? clientsCache[coachId] : undefined;
  const cacheHit =
    cacheEntry && cacheEntry.expires > Date.now() ? cacheEntry.data : null;

  if (!coachId) {
    if (cacheHit) {
      return json({ ...cacheHit, error: "unauthorized" }, { status: 401 });
    }
    return json(
      {
        clients: [],
        hasMore: false,
        page,
        pageSize,
        total: 0,
        error: "unauthorized",
      },
      { status: 401 }
    );
  }

  if (cacheHit && page === 1) {
    return json(cacheHit);
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  try {
    const { data: clientRows, count, error } = await supabaseAdmin
      .from("users")
      .select("id, name, email, status, slug", { count: "exact" })
      .eq("coach_id", coachId)
      .eq("role", "client")
      .neq("status", "inactive")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw error;
    }

    const clients = clientRows ?? [];
    const total = count ?? 0;
    const hasMore = offset + clients.length < total;

    const result: ClientsLoaderResult = {
      clients,
      hasMore,
      page,
      pageSize,
      total,
    };

    if (page === 1) {
      clientsCache[coachId] = {
        data: result,
        expires: Date.now() + 30_000,
      };
    }

    return json(result);
  } catch (error) {
    console.error("[LOADER] Failed to fetch clients:", error);
    if (page === 1 && cacheHit) {
      return json({ ...cacheHit, error: "failed_to_load" }, { status: 500 });
    }
    return json(
      {
        clients: [],
        hasMore: false,
        page,
        pageSize,
        total: 0,
        error: "failed_to_load",
      },
      { status: 500 }
    );
  }
};

export default function ClientsIndex() {
  const initialData = useLoaderData<ClientsLoaderResult>();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState(initialData.clients);
  const [page, setPage] = useState(initialData.page);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetcher = useFetcher();
  const toast = useToast();
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<{ [clientId: string]: number }>({});
  const user = useUser();

  useEffect(() => {
    let ignore = false;
    async function fetchUnreadCounts() {
      try {
        const res = await fetch("/api/chat-unread-counts");
        const data = await res.json();
        if (!ignore) setUnreadCounts(data.unreadCounts || {});
      } catch {
        if (!ignore) setUnreadCounts({});
      }
    }
    fetchUnreadCounts();
    // Optionally poll every 10s for live updates
    const interval = setInterval(fetchUnreadCounts, 10000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!initialData.error) {
      setLoadMoreError(null);
      return;
    }

    if (initialData.error === "unauthorized") {
      toast.error("Session expired", "Please refresh and sign in again.");
      setLoadMoreError("We couldn't verify your access. Refresh the page to continue.");
    } else {
      toast.error("Couldn't load clients", "Please try again in a moment.");
      setLoadMoreError("We couldn't load clients right now. Please try again.");
    }
  }, [initialData.error, toast]);

  // When fetcher loads more clients, merge them into state and surface errors
  useEffect(() => {
    if (fetcher.state !== "idle") {
      return;
    }

    const data = fetcher.data as ClientsLoaderResult | undefined;

    if (!data) {
      if (loadingMore) {
        setLoadMoreError("Unable to load more clients. Please try again.");
        toast.error("Couldn't load clients", "Please try again.");
        setLoadingMore(false);
      }
      return;
    }

    if (typeof data.page === "number") {
      setPage(data.page);
    }
    if (typeof data.hasMore === "boolean") {
      setHasMore(data.hasMore);
    }

    if (data.error) {
      if (loadingMore) {
        setLoadMoreError("Unable to load more clients. Please try again.");
        toast.error("Couldn't load clients", "Please try again.");
      }
    } else {
      const newClients = data.clients ?? [];
      if (newClients.length > 0) {
        setClients((prev) => {
          const existingIds = new Set(prev.map((client) => client.id));
          const merged = [...prev];
          for (const client of newClients) {
            if (!existingIds.has(client.id)) {
              merged.push(client);
              existingIds.add(client.id);
            }
          }
          return merged;
        });
      }
      setLoadMoreError(null);
    }

    setLoadingMore(false);
  }, [fetcher.data, fetcher.state, loadingMore, toast]);

  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(search.toLowerCase()) ||
    (client.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleLoadMore = () => {
    if (loadingMore || fetcher.state !== "idle") {
      return;
    }
    setLoadMoreError(null);
    setLoadingMore(true);
    const nextPage = page + 1;
    fetcher.load(`/dashboard/clients?index&page=${nextPage}`);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
          Clients
        </h1>
        <Button variant="primary" onClick={() => setIsInviteModalOpen(true)}>
          Add New Client
        </Button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-5 w-5 text-gray dark:text-gray-light"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-gray-600 rounded-2xl leading-5 bg-white dark:bg-gray-800 placeholder-gray dark:placeholder-gray-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-soft transition-all duration-300 hover:shadow-medium focus:shadow-medium"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredClients.length === 0 && (
          <div className="text-gray-500 dark:text-gray-light">No clients found.</div>
        )}
        {filteredClients.map((client) => {
  
          return (
            <Link
              key={client.id}
              to={`/dashboard/clients/${client.slug || client.id}`}
              className="block"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div 
                className="rounded-2xl overflow-hidden transition-all duration-300 ease-out bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-700 shadow-medium border border-gray-200 dark:border-gray-600 card-hover p-4"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <div className="font-semibold text-lg text-secondary dark:text-alabaster">{client.name}</div>
                  {/* Notification pill for unread chat */}
                  {unreadCounts[client.id] > 0 && (
                    <span className="inline-block w-2 h-2 bg-red-500 rounded-full ml-1" title="Unread chat" />
                  )}
                </div>
                <div style={{ marginLeft: '16px', flexShrink: 0 }}>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${client.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}>
                    {client.status || "Unknown"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Load More Button */}
      {(hasMore || loadMoreError) && (
        <div className="flex flex-col items-center mt-8 space-y-2">
          {hasMore && (
            <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore || fetcher.state !== "idle"}>
              {loadingMore || fetcher.state !== "idle" ? "Loading..." : "Load More"}
            </Button>
          )}
          {loadMoreError && (
            <p className="text-sm text-red-500 dark:text-red-400 text-center">
              {loadMoreError}
            </p>
          )}
        </div>
      )}

      <ClientInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        coachId={user.id}
      />
    </div>
  );
}
