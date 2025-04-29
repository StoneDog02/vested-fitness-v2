import Card from "~/components/ui/Card";
import { Link } from "@remix-run/react";
import { useState } from "react";

// Mock active clients data
const activeClients = [
  {
    id: 1,
    name: "Sarah Johnson",
    lastActive: "2 hours ago",
    compliance: 85,
    activeSince: "2024-03-15",
  },
  {
    id: 2,
    name: "Mike Smith",
    lastActive: "1 day ago",
    compliance: 92,
    activeSince: "2024-02-10",
  },
  {
    id: 4,
    name: "John Wilson",
    lastActive: "5 hours ago",
    compliance: 95,
    activeSince: "2024-01-20",
  },
];

export default function ActiveClients() {
  const [search, setSearch] = useState("");
  const filteredClients = activeClients.filter((client) =>
    client.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Active Clients</h1>
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
          {filteredClients.map((client) => (
            <div key={client.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{client.name}</p>
                <p className="text-sm text-muted-foreground">
                  Last active {client.lastActive}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Active since{" "}
                  {new Date(client.activeSince).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-[60px] h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${client.compliance}%` }}
                  />
                </div>
                <span className="text-sm font-medium">
                  {client.compliance}%
                </span>
                <Link
                  to={`/dashboard/clients/${client.id}`}
                  className="ml-4 text-primary hover:underline text-sm"
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
