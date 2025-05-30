import { Link } from "@remix-run/react";

export default function AuthCallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-white flex flex-col justify-center items-center py-12 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full flex flex-col items-center animate-fade-in">
        {/* Checkmark Icon */}
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
          Your email has been verified.
          <br />
          You can now log in to your account.
        </p>
        <Link
          to="/auth/login"
          className="w-full bg-primary hover:bg-primary-dark text-white py-3 rounded-lg font-semibold text-lg shadow transition-all duration-150 text-center"
        >
          Go to Login
        </Link>
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
