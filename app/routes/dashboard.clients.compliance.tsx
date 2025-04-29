import Card from "~/components/ui/Card";
import { Link } from "@remix-run/react";

// Mock active clients data (reuse from Active Clients page)
const activeClients = [
  { id: 1, name: "Sarah Johnson", compliance: 85 },
  { id: 2, name: "Mike Smith", compliance: 92 },
  { id: 4, name: "John Wilson", compliance: 95 },
];

export default function ComplianceClients() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Client Compliance</h1>
      <Card className="p-6">
        <div className="space-y-4">
          {activeClients.map((client) => (
            <div key={client.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{client.name}</p>
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
