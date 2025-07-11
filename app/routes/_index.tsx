import { Link } from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Kava Training - Personalized Coaching Platform" },
    {
      name: "description",
      content:
        "Connect with your coach and reach your fitness goals with Kava Training.",
    },
  ];
};

export default function Index() {
  return (
    <div className="bg-gray-lightest">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <img
              src="/KAVA-TRAIN.png"
              alt="KAVA TRAINING"
              className="h-36 w-auto dark:invert"
            />
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/auth/login"
              className="text-secondary hover:text-primary"
            >
              Login
            </Link>
            <Link
              to="/auth/register"
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section - Coach Focused */}
        <section className="bg-white">
          <div className="max-w-7xl mx-auto py-20 px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl font-bold text-secondary mb-4">
              Grow Your Coaching Business with Kava Training
            </h1>
            <p className="text-xl text-gray-dark max-w-3xl mx-auto mb-8">
              Manage your clients, deliver personalized plans, and scale your
              impact—all in one modern platform built for coaches.
            </p>
            <div className="flex justify-center gap-4">
              <Link
                to="/auth/register?role=coach"
                className="bg-secondary hover:bg-secondary-dark text-white px-8 py-4 rounded-lg font-semibold text-xl border-2 border-secondary shadow-md transition-all duration-150"
              >
                Sign up as Coach
              </Link>
              <Link
                to="/auth/login"
                className="border border-primary text-primary hover:bg-primary hover:text-white px-8 py-4 rounded-lg font-semibold text-xl"
              >
                Login
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section - Coach Benefits */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-secondary text-center mb-12">
            Everything Coaches Need In One Place
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                {/* Meal Plan Icon */}
                <svg
                  className="w-6 h-6 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-secondary mb-2">
                Custom Meal & Workout Plans
              </h3>
              <p className="text-gray-dark">
                Easily create and deliver personalized meal and workout plans to
                each client.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                {/* Progress Tracking Icon */}
                <svg
                  className="w-6 h-6 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-secondary mb-2">
                Progress & Compliance Tracking
              </h3>
              <p className="text-gray-dark">
                Monitor client progress, check-ins, and compliance at a glance
                with powerful dashboards.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                {/* Communication Icon */}
                <svg
                  className="w-6 h-6 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-secondary mb-2">
                Direct Client Communication
              </h3>
              <p className="text-gray-dark">
                Chat directly with your clients for feedback, questions, and
                motivation—all in one place.
              </p>
            </div>
          </div>
        </section>

        {/* Client Info Section */}
        <section className="bg-gray-100 py-10 px-4 sm:px-6 lg:px-8 mt-12">
          <div className="max-w-2xl mx-auto text-center">
            <h3 className="text-2xl font-bold text-secondary mb-2">
              Are you a client invited by your coach?
            </h3>
            <p className="text-gray-dark mb-4">
              If you received an invitation email from your coach, just follow
              the link to set up your account. Your coach will handle everything
              else!
            </p>
            <div className="text-sm text-gray-500">
              No need to sign up here—your coach will send you a personalized
              invite link.
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-secondary text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-6 md:mb-0">
              <span className="text-xl font-bold">Kava Training</span>
              <p className="mt-2 text-gray">
                © 2024 Kava Training. All rights reserved.
              </p>
            </div>
            <div className="flex gap-6">
              <Link to="/auth/login" className="text-gray hover:text-white">
                Login
              </Link>
              <Link to="/auth/register" className="text-gray hover:text-white">
                Register
              </Link>
              <Link to="#" className="text-gray hover:text-white">
                Privacy Policy
              </Link>
              <Link to="#" className="text-gray hover:text-white">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
