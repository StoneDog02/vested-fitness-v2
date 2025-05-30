import React, { useState } from "react";
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

export default function ClientInviteModal({
  isOpen,
  onClose,
  coachId,
}: ClientInviteModalProps) {
  const fetcher = useFetcher<InviteClientResponse>();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  console.log("ClientInviteModal coachId:", coachId);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite New Client"
      size="md"
    >
      <div className="space-y-6">
        <div style={{ color: "red" }}>DEBUG coachId: {coachId}</div>
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

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={isSubmitting || !email || !name || !coachId}
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
