import type { MetaFunction } from "@remix-run/node";
import Button from "~/components/ui/Button";
import ClientInviteModal from "~/components/coach/ClientInviteModal";
import { useState } from "react";
import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { LoaderFunction } from "@remix-run/node";
import type { Database } from "~/lib/supabase";
import { useLoaderData } from "@remix-run/react";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "Clients | Vested Fitness" },
    { name: "description", content: "View and manage your clients" },
  ];
};

export const loader: LoaderFunction = async ({ request }) => {
  // Debug: log Supabase config
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
  console.log(
    "SUPABASE_SERVICE_KEY:",
    process.env.SUPABASE_SERVICE_KEY?.slice(0, 6),
    "...",
    process.env.SUPABASE_SERVICE_KEY?.slice(-6)
  );

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

  // Fetch all clients for this coach
  let clients: {
    id: string;
    name: string;
    email?: string;
    goal?: string;
    starting_weight?: number;
    current_weight?: number;
    workout_split?: string;
    role?: string;
    coach_id?: string;
    slug?: string;
  }[] = [];
  if (coachId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data, error } = await supabase
      .from("users")
      .select(
        "id, name, email, goal, starting_weight, current_weight, workout_split, role, coach_id, slug"
      )
      .eq("coach_id", coachId)
      .eq("role", "client");
    if (error) console.log("[LOADER] Supabase error:", error);
    if (data) clients = data;
    console.log("[LOADER] Filtered client users from Supabase:", clients);
  }

  return json({ coachId, clients });
};

export default function ClientsIndex() {
  const { coachId, clients } = useLoaderData<{
    coachId: string;
    clients: {
      id: string;
      name: string;
      email?: string;
      goal?: string;
      starting_weight?: number;
      current_weight?: number;
      workout_split?: string;
      role?: string;
      coach_id?: string;
      slug?: string;
    }[];
  }>();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredClients = clients.filter(
    (client: {
      name: string;
      goal?: string;
      starting_weight?: number;
      current_weight?: number;
      workout_split?: string;
      current_macros?: { protein: number; carbs: number; fat: number };
      supplement_count?: number;
    }) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      (client.goal || "").toLowerCase().includes(search.toLowerCase()) ||
      (client.workout_split || "").toLowerCase().includes(search.toLowerCase())
  );

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
            className="block w-full pl-10 pr-3 py-2 border border-gray-light dark:border-davyGray rounded-md leading-5 bg-white dark:bg-night placeholder-gray dark:placeholder-gray-light focus:outline-none focus:ring-primary focus:border-primary sm:text-sm dark:text-alabaster"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredClients.map(
          (client: {
            id: string;
            name: string;
            email?: string;
            goal?: string;
            starting_weight?: number;
            current_weight?: number;
            workout_split?: string;
            role?: string;
            coach_id?: string;
            slug?: string;
          }) => (
            <Link
              key={client.id}
              to={`/dashboard/clients/${client.slug || client.id}`}
              className="block p-4 border rounded bg-white dark:bg-night shadow hover:shadow-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="font-extrabold text-2xl mb-2">
                {client.name || "Unnamed"}
              </div>
              <div className="text-xs text-gray-500 mb-1">
                {client.email || ""}
              </div>
              <div className="grid grid-cols-5 gap-4 text-xs mb-1 mt-3 pt-4">
                <div className="font-semibold text-left text-green-500">
                  Goal
                </div>
                <div className="font-semibold text-left">Workout Split</div>
                <div className="font-semibold text-left">Macros</div>
                <div className="font-semibold text-left">Supplements</div>
                <div className="font-semibold text-left">Weight</div>
              </div>
              <div className="grid grid-cols-5 gap-4 text-xs">
                <div className="text-left text-green-500">
                  {client.goal || "N/A"}
                </div>
                <div className="text-left">{client.workout_split || "N/A"}</div>
                <div className="flex flex-col items-left">
                  <span>Protein: N/A</span>
                  <span>Carbs: N/A</span>
                  <span>Fats: N/A</span>
                </div>
                <div className="text-left">N/A</div>
                <div className="text-left">
                  {client.starting_weight != null &&
                  client.current_weight != null
                    ? `${client.starting_weight} → ${client.current_weight}`
                    : "N/A"}
                </div>
              </div>
            </Link>
          )
        )}
      </div>

      <ClientInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        coachId={coachId}
      />
    </div>
  );
}
