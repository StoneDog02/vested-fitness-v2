import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

type ReactivateResponse = {
  success: boolean;
  message?: string;
  instructions?: string;
  tempPassword?: string;
  emailError?: string;
  resetLink?: string;
  error?: string;
};

type ReactivateClientModalProps = {
  isOpen: boolean;
  onClose: () => void;
  client: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export default function ReactivateClientModal({
  isOpen,
  onClose,
  client,
}: ReactivateClientModalProps) {
  const [email, setEmail] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const fetcher = useFetcher();

  // Type guard for response data
  const getResponseData = (): ReactivateResponse | null => {
    if (fetcher.data && typeof fetcher.data === 'object') {
      return fetcher.data as ReactivateResponse;
    }
    return null;
  };

  const responseData = getResponseData();
  const isLoading = fetcher.state === "submitting";
  const isSuccess = responseData?.success || false;
  const error = responseData?.error || null;
  
  // Check if we have sensitive info that needs manual review
  const hasTempPassword = !!responseData?.tempPassword;
  const hasResetLink = !!responseData?.resetLink;
  const hasEmailError = !!responseData?.emailError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;

    fetcher.submit(
      {
        clientId: client.id,
        email: email,
      },
      {
        method: "POST",
        action: "/api/reactivate-client",
      }
    );
  };

  const handleClose = () => {
    setEmail("");
    setShowSuccess(false);
    onClose();
  };

  // Show success state
  if (isSuccess && !showSuccess) {
    setShowSuccess(true);
    
    // If there's sensitive info to review, don't auto-close
    if (!hasTempPassword && !hasResetLink && !hasEmailError) {
      setTimeout(() => {
        handleClose();
        // Reload the page to show updated client list
        window.location.reload();
      }, 3000);
    }
  }

  if (!client) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Reactivate Client">
      <div className="space-y-4">
        {showSuccess ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Client Reactivated Successfully!
            </h3>
            <p className="text-gray-600 mb-4">
              {responseData?.message || ''}
            </p>
            
            {/* Instructions for client sign-in */}
            {responseData?.instructions && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                <h4 className="font-semibold text-blue-900 mb-2">📧 Client Sign-in Instructions:</h4>
                <p className="text-sm text-blue-800">
                  {responseData.instructions}
                </p>
              </div>
            )}

            {/* Show temporary password if email failed */}
            {responseData?.tempPassword && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <h4 className="font-semibold text-yellow-900 mb-2">🔑 Temporary Password:</h4>
                <div className="bg-white p-2 rounded border border-yellow-300 font-mono text-sm">
                  {responseData.tempPassword}
                </div>
                <p className="text-xs text-yellow-700 mt-2">
                  <strong>⚠️ Share this with the client securely.</strong> They should change it immediately after signing in.
                </p>
              </div>
            )}

            {/* Show email error if any */}
            {responseData?.emailError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <h4 className="font-semibold text-red-900 mb-1">⚠️ Email Delivery Issue:</h4>
                <p className="text-sm text-red-800">{responseData.emailError}</p>
              </div>
            )}

            {/* Show reset link for debugging */}
            {responseData?.resetLink && (
              <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-md">
                <h4 className="font-semibold text-purple-900 mb-1">🔗 Debug - Reset Link Generated:</h4>
                <p className="text-xs text-purple-700 break-all">{responseData.resetLink}</p>
                <p className="text-xs text-purple-600 mt-1">If email doesn't arrive, client can use this link directly.</p>
              </div>
            )}

            {/* General sign-in help */}
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <h4 className="font-semibold text-gray-900 mb-1">💡 If client has trouble signing in:</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Have them use "Forgot Password?" on the sign-in page</li>
                <li>• Make sure they're using email: {client?.email}</li>
                <li>• Check spam/junk folder for password reset email</li>
                <li>• Try waiting 5-10 minutes for email delivery</li>
              </ul>
            </div>

            {/* Manual close button when there's important info */}
            {(hasTempPassword || hasResetLink || hasEmailError) && (
              <div className="mt-6 text-center">
                <Button
                  onClick={() => {
                    handleClose();
                    window.location.reload();
                  }}
                  variant="primary"
                >
                  Close & Refresh
                </Button>
                <p className="text-xs text-gray-500 mt-2">
                  Make sure to save any passwords or links above before closing
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-gray-700 mb-4">
                Reactivating <strong>{client.name}</strong> will:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 mb-4">
                <li>Restore access to their account</li>
                <li>Preserve all historical data (meal plans, workouts, progress)</li>
                <li>Create a new login for the client</li>
                <li>Send them a password reset email</li>
              </ul>
              
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  <strong>Security Check:</strong> Please confirm the client's email address to proceed.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Client's Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter client's email to confirm"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Expected: {client.email}
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleClose}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isLoading || !email}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? "Reactivating..." : "Reactivate Client"}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
} 