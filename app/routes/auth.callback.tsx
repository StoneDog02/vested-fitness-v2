import { useEffect, useState } from "react";
import { useNavigate } from "@remix-run/react";

export default function AuthCallback() {
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (access_token && refresh_token) {
      // POST tokens to backend to set HTTP-only cookie
      fetch("/api/set-supabase-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token, refresh_token }),
        credentials: "include",
      })
        .then(async (res) => {
          if (res.ok) {
            setStatus("success");
            setTimeout(() => navigate("/dashboard"), 1500);
          } else {
            setStatus("error");
          }
        })
        .catch(() => setStatus("error"));
    } else {
      setStatus("error");
    }
  }, [navigate]);

  if (status === "verifying") {
    return <div className="min-h-screen flex items-center justify-center">Verifying...</div>;
  }
  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">
        Verification failed. Please try again or contact support.
      </div>
    );
  }
  // Success UI (your current checkmark, etc.)
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-white flex flex-col justify-center items-center py-12 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full flex flex-col items-center animate-fade-in">
        <div className="bg-green-100 rounded-full p-4 mb-6">
          <svg
            className="w-12 h-12 text-green-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-3xl font-extrabold text-secondary mb-2 text-center">
          Email Verified!
        </h2>
        <p className="text-gray-dark text-center mb-8">
          Your email has been verified.<br />
          Redirecting to your dashboard...
        </p>
      </div>
      <style>
        {`
          .animate-fade-in {
            animation: fadeIn 0.7s cubic-bezier(0.4,0,0.2,1);
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px);}
            to { opacity: 1; transform: none;}
          }
        `}
      </style>
    </div>
  );
}
