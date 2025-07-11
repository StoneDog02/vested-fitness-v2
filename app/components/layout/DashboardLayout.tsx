import React, { useState } from "react";
import { Link, useLocation } from "@remix-run/react";
import { UserRole } from "~/lib/supabase";
import AccountDrawer from "../ui/AccountDrawer";
import MenuDrawer from "../ui/MenuDrawer";

interface NavItem {
  name: string;
  path: string;
  subItems?: NavItem[];
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  userRole: UserRole;
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
    font_size?: string;
    access_status?: string;
  } | null;
}

export default function DashboardLayout({
  children,
  userRole,
  user,
}: DashboardLayoutProps) {
  const location = useLocation();
  const [isAccountDrawerOpen, setIsAccountDrawerOpen] = useState(false);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);

  const isActive = (path: string) => {
    // For dashboard path, only match exact
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    // For client subitems, only match exact
    if (/^\/dashboard\/clients\/[\w-]+(\/\w+)?$/.test(path)) {
      return location.pathname === path;
    }
    // For other paths match exact or subpaths
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  const coachNavItems: NavItem[] = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Clients", path: "/dashboard/clients" },
  ];

  const clientNavItems: NavItem[] = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Coach Access", path: "/dashboard/coach-access" },
    { name: "Meals", path: "/dashboard/meals" },
    { name: "Workouts", path: "/dashboard/workouts" },
    { name: "Supplements", path: "/dashboard/supplements" },
  ];

  const navItems = userRole === "coach" ? coachNavItems : clientNavItems;

  // Add client sub-items when on a client's page
  const clientId = location.pathname.match(
    /\/dashboard\/clients\/([^/]+)/
  )?.[1];
  if (clientId && userRole === "coach") {
    const clientSubItems: NavItem[] = [
      { name: "Overview", path: `/dashboard/clients/${clientId}` },
      { name: "Meals", path: `/dashboard/clients/${clientId}/meals` },
      { name: "Workouts", path: `/dashboard/clients/${clientId}/workouts` },
      {
        name: "Supplements",
        path: `/dashboard/clients/${clientId}/supplements`,
      },
      { name: "Chat", path: `/dashboard/clients/${clientId}/chat` },
    ];

    // Find and update the Clients nav item
    const clientsNavItem = navItems.find(
      (item) => item.path === "/dashboard/clients"
    );
    if (clientsNavItem) {
      clientsNavItem.subItems = clientSubItems;
    }
  }

  // Helper function to get initials from full name (same as settings page)
  const getInitials = (fullName: string): string => {
    const nameParts = fullName.trim().split(' ');
    if (nameParts.length === 1) {
      return nameParts[0].charAt(0).toUpperCase();
    }
    // Get first letter of first name and first letter of last name
    const firstInitial = nameParts[0].charAt(0).toUpperCase();
    const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
    return firstInitial + lastInitial;
  };

  return (
    <div className="min-h-screen flex flex-col bg-alabaster dark:bg-davyGray transition-colors duration-200">
      <header className="sticky top-0 z-10 bg-white dark:bg-night border-b border-gray-light dark:border-secondary shadow-sm transition-colors duration-200">
        <div className="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            {/* Mobile Menu Button */}
            <button
              type="button"
              className="sm:hidden text-secondary dark:text-alabaster hover:text-primary dark:hover:text-primary"
              onClick={() => setIsMenuDrawerOpen(true)}
            >
              <span className="sr-only">Open menu</span>
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>

            {/* Logo and Navigation Container */}
            <div className="flex-1 flex items-end">
              {/* Logo */}
              <Link
                to="/dashboard"
                className="flex-shrink-0 flex items-center hover:opacity-90 transition-opacity"
              >
                <img
                  src="/KAVA-TRAIN.png"
                  alt="KAVA TRAINING"
                  className="h-48 sm:h-32 w-auto dark:invert"
                />
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden sm:flex overflow-x-auto ml-6">
                <div className="flex space-x-4 pb-3">
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

            <button
              onClick={() => setIsAccountDrawerOpen(true)}
              className="flex items-center gap-2 text-sm rounded-full focus:outline-none hover:opacity-80 transition-opacity"
            >
              <span className="sr-only">Open user menu</span>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt="Profile"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm">{user ? getInitials(user.name) : "U"}</span>
                )}
              </div>
              <span className="hidden sm:inline text-secondary dark:text-white transition-colors duration-200">
                Profile
              </span>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full">
        <div className="px-4 py-6 mx-auto max-w-7xl sm:px-6 lg:px-8 transition-colors duration-200">
          {children}
        </div>
      </main>

      <AccountDrawer
        isOpen={isAccountDrawerOpen}
        onClose={() => setIsAccountDrawerOpen(false)}
        userRole={userRole}
        user={user}
      />

      <MenuDrawer
        isOpen={isMenuDrawerOpen}
        onClose={() => setIsMenuDrawerOpen(false)}
        navItems={navItems}
        isActive={isActive}
      />
    </div>
  );
}
