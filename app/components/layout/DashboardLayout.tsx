import React from "react";
import { Link, useLocation } from "@remix-run/react";
import { UserRole } from "~/lib/supabase";
import ThemeToggle from "../ui/ThemeToggle";

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: UserRole;
}

export default function DashboardLayout({
  children,
  userRole,
}: DashboardLayoutProps) {
  const location = useLocation();

  const isActive = (path: string) => {
    // For dashboard path, only match exact
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    // For other paths match exact or subpaths
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  const coachNavItems = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Clients", path: "/dashboard/clients" },
  ];

  const clientNavItems = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Coach Access", path: "/dashboard/coach-access" },
    { name: "Meals", path: "/dashboard/meals" },
    { name: "Workouts", path: "/dashboard/workouts" },
    { name: "Supplements", path: "/dashboard/supplements" },
    { name: "Chat", path: "/dashboard/chat" },
    { name: "Settings", path: "/dashboard/settings" },
  ];

  const navItems = userRole === "coach" ? coachNavItems : clientNavItems;

  return (
    <div className="min-h-screen bg-alabaster dark:bg-davyGray transition-colors duration-200">
      <header className="bg-white dark:bg-night border-b border-gray-light dark:border-secondary shadow-sm transition-colors duration-200">
        <div className="px-4 py-3 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <Link
                to="/dashboard"
                className="text-xl font-bold text-primary whitespace-nowrap hover:text-primary/90 transition-colors"
              >
                Vested Fitness
              </Link>
              <nav>
                <div className="flex space-x-4 overflow-x-auto">
                  {navItems.map((item) => (
                    <Link
                      key={item.name}
                      to={item.path}
                      className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-200 border-b-2 ${
                        isActive(item.path)
                          ? "text-primary border-primary dark:text-primary dark:border-primary"
                          : "border-transparent text-secondary dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:text-primary dark:hover:border-primary/50"
                      }`}
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle label={false} />
              <div className="relative">
                <button className="flex items-center gap-2 text-sm rounded-full focus:outline-none">
                  <span className="sr-only">Open user menu</span>
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white">
                    {/* Profile initial or image will go here */}U
                  </div>
                  <span className="text-secondary dark:text-white transition-colors duration-200">
                    Profile
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="px-4 py-6 mx-auto max-w-7xl sm:px-6 lg:px-8 transition-colors duration-200">
        {children}
      </main>
    </div>
  );
}
