import React, { useState, useEffect } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import { useFetcher } from "@remix-run/react";

interface ClientInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  coachId?: string | null;
}

// Define the shape of the response data
interface InviteClientResponse {
  success?: boolean;
  email?: string;
  error?: string;
}

// Define the shape of a plan from the API
interface Plan {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  interval?: string | null;
}

export default function ClientInviteModal({
  isOpen,
  onClose,
  coachId,
}: ClientInviteModalProps) {
  const fetcher = useFetcher<InviteClientResponse>();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [plansLoading, setPlansLoading] = useState(false);

  // Fetch plans from the API when modal opens
  useEffect(() => {
    if (isOpen) {
      setPlansLoading(true);
      fetch("/api/get-stripe-plans")
        .then((res) => res.json())
        .then((data) => {
          setPlans(data.plans || []);
          if (data.plans && data.plans.length > 0) {
            setSelectedPlanId(data.plans[0].id);
          }
        })
        .finally(() => setPlansLoading(false));
    }
  }, [isOpen]);

  // Close modal and reload route on successful invite
  React.useEffect(() => {
    if (fetcher.data?.success) {
      setTimeout(() => {
        setEmail("");
        setName("");
        onClose();
        // Reload the route to refresh loader data
        window.location.reload();
      }, 1500);
    }
  }, [fetcher.data?.success, onClose]);

  const isSubmitting = fetcher.state !== "idle";

  // Helper to format price
  function formatPrice(amount: number | null, currency: string, interval?: string | null) {
    if (amount == null) return "";
    const price = (amount / 100).toLocaleString(undefined, { style: "currency", currency });
    return interval ? `${price} / ${interval}` : price;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite New Client"
      size="md"
    >
      <div className="space-y-6">
        {fetcher.data?.success ? (
          <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-4 rounded-lg mb-4">
            Invitation sent successfully to {fetcher.data.email}!
          </div>
        ) : fetcher.data?.error ? (
          <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-lg mb-4">
            {fetcher.data.error}
          </div>
        ) : null}

        <fetcher.Form method="post" action="/api/invite-client">
          {coachId && (
            <input type="hidden" name="coach_id" value={coachId} required />
          )}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Client Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                placeholder="John Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                placeholder="client@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-dark dark:text-gray-light mt-1">
                We&apos;ll send a special signup link to this email address
              </p>
            </div>

            {/* Plan selection (dynamic, enabled for coach) */}
            <div>
              <label htmlFor="plan_price_id" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
                Subscription Plan
              </label>
              <select
                id="plan_price_id"
                name="plan_price_id"
                value={selectedPlanId}
                onChange={e => setSelectedPlanId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
                disabled={plansLoading || isSubmitting}
                required
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
              {/* Show price for selected plan below the dropdown */}
              {selectedPlanId && plans.length > 0 && (
                <div className="mt-1 text-xs text-secondary dark:text-alabaster opacity-60">
                  {formatPrice(
                    plans.find(p => p.id === selectedPlanId)?.amount ?? null,
                    plans.find(p => p.id === selectedPlanId)?.currency ?? "usd",
                    plans.find(p => p.id === selectedPlanId)?.interval
                  )}
                </div>
              )}
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={isSubmitting || !email || !name || !coachId || !selectedPlanId}
              >
                {isSubmitting ? "Sending..." : "Send Invitation"}
              </Button>
            </div>
          </div>
        </fetcher.Form>
      </div>
    </Modal>
  );
}
