import type { MetaFunction , LoaderFunction } from "@remix-run/node";
import Button from "~/components/ui/Button";
import Card from "~/components/ui/Card";
import ClientInviteModal from "~/components/coach/ClientInviteModal";
import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { Database } from "~/lib/supabase";
import { useLoaderData, useSearchParams, useNavigate, useFetcher , Link } from "@remix-run/react";
import ClientProfile from "~/components/coach/ClientProfile";
import { calculateMacros } from "~/lib/utils";
import { URL } from "url";
import { useUser } from "~/context/UserContext";

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

export const meta: MetaFunction = () => {
  return [
    { title: "Clients | Kava Training" },
    { name: "description", content: "View and manage your clients" },
  ];
};

// In-memory cache for coach's clients (expires after 30s)
const clientsCache: Record<string, { data: any; expires: number }> = {};

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

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
  let coachId = null;
  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      /* ignore */
    }
  }
  if (authId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: user } = await supabase
      .from("users")
      .select("id, role, coach_id")
      .eq("auth_id", authId)
      .single();
    if (user) {
      coachId = user.role === "coach" ? user.id : user.coach_id;
    }
  }

  // Only cache the first page (optional, can expand later)
  if (
    coachId &&
    page === 1 &&
    clientsCache[coachId] &&
    clientsCache[coachId].expires > Date.now()
  ) {
    return json(clientsCache[coachId].data);
  }

  let clients: {
    id: string;
    name: string;
    email?: string;
    status?: string;
    slug?: string;
  }[] = [];
  let hasMore = false;
  let total = 0;
  if (coachId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    // Fetch paginated clients for this coach (summary only)
    const { data: clientRows, count, error } = await supabase
      .from("users")
      .select("id, name, email, status, slug", { count: "exact" })
      .eq("coach_id", coachId)
      .eq("role", "client")
      .neq("status", "inactive")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) console.log("[LOADER] Supabase error:", error);
    clients = clientRows || [];
    total = count || 0;
    hasMore = offset + clients.length < total;
  }
  const result = { clients, hasMore, page, pageSize, total };
  if (coachId && page === 1) {
    clientsCache[coachId] = { data: result, expires: Date.now() + 30_000 };
  }
  return json(result);
};

export default function ClientsIndex() {
  const initialData = useLoaderData<{
    clients: { id: string; name: string; email?: string; status?: string; slug?: string }[];
    hasMore: boolean;
    page: number;
    pageSize: number;
    total: number;
  }>();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState(initialData.clients);
  const [page, setPage] = useState(initialData.page);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetcher = useFetcher();
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

  // When fetcher loads more clients, append them
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const data = fetcher.data as {
        clients: { id: string; name: string; email?: string; status?: string; slug?: string }[];
        hasMore: boolean;
        page: number;
      };
      setClients((prev) => [...prev, ...(data.clients || [])]);
      setPage(data.page);
      setHasMore(data.hasMore);
      setLoadingMore(false);
    }
  }, [fetcher.data, fetcher.state]);

  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(search.toLowerCase()) ||
    (client.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleLoadMore = () => {
    setLoadingMore(true);
    fetcher.load(`/dashboard/clients?page=${page + 1}`);
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
      {hasMore && (
        <div className="flex justify-center mt-8">
          <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore || fetcher.state !== "idle"}>
            {loadingMore || fetcher.state !== "idle" ? "Loading..." : "Load More"}
          </Button>
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
