import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ReactivateClientModal from "~/components/coach/ReactivateClientModal";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunction } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import type { Database } from "~/lib/supabase";
import { Buffer } from "buffer";

type InactiveClient = {
  id: string;
  name: string;
  email: string;
  compliance: number;
  inactiveSince: string;
};

export const loader: LoaderFunction = async ({ request }) => {
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
  const inactiveClients: InactiveClient[] = [];
  if (authId) {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    // Get coach id
    const { data: user } = await supabase
      .from("users")
      .select("id, role, coach_id")
      .eq("auth_id", authId)
      .single();
    if (user) {
      coachId = user.role === "coach" ? user.id : user.coach_id;
    }
    if (coachId) {
      // Get all inactive clients for this coach
      const { data: clients } = await supabase
        .from("users")
        .select("id, name, email, created_at, updated_at, status, inactive_since")
        .eq("coach_id", coachId)
        .eq("role", "client")
        .eq("status", "inactive"); // Only get inactive clients
      if (clients) {
        for (const client of clients) {
          // Simple compliance calculation - just show 0% for inactive clients
          const compliance = 0;
          
          inactiveClients.push({
            id: client.id,
            name: client.name,
            email: client.email,
            compliance,
            inactiveSince: client.inactive_since || client.updated_at, // Use inactive_since if available
          });
        }
        // Sort by inactiveSince desc (most recently inactive first)
        inactiveClients.sort(
          (a, b) =>
            new Date(b.inactiveSince).getTime() - new Date(a.inactiveSince).getTime()
        );
      }
    }
  }
  return json({ inactiveClients });
};

export default function InactiveClients() {
  const { inactiveClients } = useLoaderData<typeof loader>();
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<InactiveClient | null>(null);
  const [isReactivateModalOpen, setIsReactivateModalOpen] = useState(false);
  
  const filteredClients = inactiveClients.filter((client: InactiveClient) =>
    client.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleReactivateClick = (client: InactiveClient) => {
    setSelectedClient(client);
    setIsReactivateModalOpen(true);
  };

  const handleCloseModal = () => {
    setSelectedClient(null);
    setIsReactivateModalOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Inactive Clients</h1>
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
      <Card className="p-6">
        <div className="space-y-4">
          {filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <svg
                className="w-10 h-10 mb-2"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <span className="text-gray-500 text-lg">
                No inactive clients found.
              </span>
            </div>
          ) : (
            filteredClients.map((client: InactiveClient) => (
              <div
                key={client.id}
                className="flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Inactive since{" "}
                    {new Date(client.inactiveSince).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-[60px] h-2 bg-red-500 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{ width: `${client.compliance}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">
                    {client.compliance}%
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleReactivateClick(client)}
                    className="ml-4 bg-green-600 hover:bg-green-700"
                  >
                    Reactivate
                  </Button>
                  <Link
                    to={`/dashboard/clients/${client.id}`}
                    className="ml-2 text-primary hover:underline text-sm"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <ReactivateClientModal
        isOpen={isReactivateModalOpen}
        onClose={handleCloseModal}
        client={selectedClient ? {
          id: selectedClient.id,
          name: selectedClient.name,
          email: selectedClient.email
        } : null}
      />
    </div>
  );
}
