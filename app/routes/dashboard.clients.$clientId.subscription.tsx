import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import { useMatches, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import Button from "~/components/ui/Button";
import CreateSubscriptionModal from "~/components/coach/CreateSubscriptionModal";

export const meta: MetaFunction = () => {
  return [
    { title: "Client Subscription | Kava Training" },
    { name: "description", content: "Manage client subscription" },
  ];
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const clientId = params.clientId;
  if (!clientId) {
    return json({ error: "Missing clientId" }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const origin = url.origin;
    const response = await fetch(`${origin}/api/client-subscription-info?clientId=${clientId}`, {
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    });

    // Try to parse response even if not ok - might have useful error data
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      // If we can't parse the response, return fallback data
      console.error("Error parsing subscription info response:", parseError);
      return json({ subscription: null, paymentMethods: [], client: null });
    }

    // If response is ok, return the data
    if (response.ok) {
      return json(data);
    }

    // If response is not ok but we have data, check if it's a 404 or similar
    // For 404, we can still return the data structure with null values
    if (response.status === 404 || response.status === 403) {
      // These are expected errors - return fallback data
      return json({ subscription: null, paymentMethods: [], client: null });
    }

    // For other errors, log and return fallback data
    console.error("Error fetching subscription info:", data.error || `HTTP ${response.status}`);
    return json({ subscription: null, paymentMethods: [], client: null });
  } catch (error) {
    console.error("Error fetching subscription info:", error);
    return json({ subscription: null, paymentMethods: [], client: null });
  }
};

export default function ClientSubscription() {
  const matches = useMatches();
  const loaderData = useLoaderData<typeof loader>();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Find the parent route with client loader data for avatar/name
  const parentData = matches.find(
    (m) => m.data && typeof m.data === "object" && m.data !== null && "client" in m.data
  )?.data as {
    client: { id: string; name?: string; email?: string; created_at?: string } | null;
  };

  // Defensive: handle missing client
  if (!parentData?.client) {
    return (
      <ClientDetailLayout>
        <div className="p-6 text-center text-red-600">
          Client not found or unavailable.
        </div>
      </ClientDetailLayout>
    );
  }

  const client = parentData.client;
  const subscription = loaderData.subscription;
  const paymentMethods = loaderData.paymentMethods || [];
  const hasPaymentMethod = paymentMethods.length > 0;

  // Get initials for avatar
  const getInitials = (name: string): string => {
    const parts = name.trim().split(" ");
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  return (
    <ClientDetailLayout>
      <div className="p-6">
        {/* Header with avatar */}
        <div className="mb-6 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-lg">
            {getInitials(client.name || "C")}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
              Subscription for {client.name || "Client"}
            </h1>
            <p className="text-sm text-gray-dark dark:text-gray-light">
              {client.email}
            </p>
          </div>
        </div>

        {/* No Active Subscription State */}
        {!subscription && (
          <div className="bg-white dark:bg-night rounded-lg shadow-sm border border-gray-light dark:border-davyGray p-12 flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-davyGray flex items-center justify-center mb-6">
              <span className="text-4xl font-bold text-gray-400 dark:text-gray-500">$</span>
            </div>
            <h2 className="text-2xl font-bold text-secondary dark:text-alabaster mb-4">
              No Active Subscription
            </h2>
            <p className="text-gray-dark dark:text-gray-light mb-8 max-w-md">
              {client.name || "This client"} has completed their profile setup but doesn't have an active subscription yet.
            </p>
            <Button
              variant="primary"
              onClick={() => setIsCreateModalOpen(true)}
            >
              Create Subscription
            </Button>
          </div>
        )}

        {/* Active Subscription State - TODO: implement later */}
        {subscription && (
          <div className="bg-white dark:bg-night rounded-lg shadow-sm border border-gray-light dark:border-davyGray p-6">
            <p className="text-sm text-gray-dark dark:text-gray-light">
              Active subscription details will be shown here.
            </p>
          </div>
        )}

        <CreateSubscriptionModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          clientId={client.id}
          clientName={client.name || "Client"}
          clientEmail={client.email || ""}
          hasPaymentMethod={hasPaymentMethod}
        />
      </div>
    </ClientDetailLayout>
  );
}

