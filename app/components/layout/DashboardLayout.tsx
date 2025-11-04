import React, { useState, useEffect } from "react";
import { Link, useLocation } from "@remix-run/react";
import { UserRole } from "~/lib/supabase";
import AccountDrawer from "~/components/ui/AccountDrawer";
import MenuDrawer from "~/components/ui/MenuDrawer";
import AnimatedBackground from "~/components/ui/AnimatedBackground";

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
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isAccountDrawerOpen, setIsAccountDrawerOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);
  const location = useLocation();

  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let ignore = false;
    async function fetchUnread() {
      if (userRole !== "client" || !user?.id) return;
      try {
        const response = await fetch("/api/chat-unread-count");
        if (!ignore && response.ok) {
          const data = await response.json();
          setChatUnread(data.unreadCount > 0);
        }
      } catch (error) {
        console.error("Failed to fetch unread count:", error);
      }
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 10000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [userRole, user?.id]);

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    if (/^\/dashboard\/clients\/[\w-]+(\/\w+)?$/.test(path)) {
      return location.pathname === path;
    }
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  // Check if we're on a client detail page to show sub-navigation
  const isOnClientDetailPage = /^\/dashboard\/clients\/[\w-]+(\/\w+)?$/.test(location.pathname);
  const currentClientId = location.pathname.match(/^\/dashboard\/clients\/([\w-]+)/)?.[1];

  const coachNavItems: NavItem[] = [
    { name: "Dashboard", path: "/dashboard" },
    { 
      name: "Clients", 
      path: "/dashboard/clients",
      subItems: isOnClientDetailPage && currentClientId ? [
        { name: "Overview", path: `/dashboard/clients/${currentClientId}` },
        { name: "Meals", path: `/dashboard/clients/${currentClientId}/meals` },
        { name: "Workouts", path: `/dashboard/clients/${currentClientId}/workouts` },
        { name: "Supplements", path: `/dashboard/clients/${currentClientId}/supplements` },
        { name: "Subscription", path: `/dashboard/clients/${currentClientId}/subscription` },
        { name: "Chat", path: `/dashboard/clients/${currentClientId}/chat` },
      ] : undefined
    },
  ];

  const clientNavItems: NavItem[] = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Coach Access", path: "/dashboard/coach-access" },
    { name: "Meals", path: "/dashboard/meals" },
    { name: "Workouts", path: "/dashboard/workouts" },
    { name: "Supplements", path: "/dashboard/supplements" },
    { name: "Chat", path: "/dashboard/chat" },
  ];

  const navItems = userRole === "coach" ? coachNavItems : clientNavItems;

  const getInitials = (fullName: string): string => {
    const nameParts = fullName.trim().split(" ");
    if (nameParts.length === 1) {
      return nameParts[0].charAt(0).toUpperCase();
    }
    const firstInitial = nameParts[0].charAt(0).toUpperCase();
    const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
    return firstInitial + lastInitial;
  };

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300">
      {/* Animated Background with Waves */}
      <AnimatedBackground />
      
      <header className="z-10 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shadow-soft backdrop-blur-md relative">
        <div className="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-4">
            <button
              type="button"
              className="sm:hidden text-secondary dark:text-alabaster hover:text-primary dark:hover:text-primary transition-all duration-200 hover:scale-110"
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

            <div className="flex-1 flex items-end">
              <Link
                to="/dashboard"
                className="flex-shrink-0 flex items-center hover:opacity-90 transition-all duration-300 hover:scale-105"
              >
                <img
                  src="/KAVA-TRAIN.png"
                  alt="KAVA TRAINING"
                  className="h-48 sm:h-32 w-auto dark:invert drop-shadow-sm"
                />
              </Link>

              <nav className="hidden sm:flex overflow-x-auto ml-8">
                <div className="flex space-x-1 pb-3">
                  {navItems.map((item) => (
                    <Link
                      key={item.name}
                      to={item.path}
                      className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-all duration-300 rounded-xl relative group ${
                        isActive(item.path)
                          ? "text-primary bg-primary/10 dark:bg-primary/20 shadow-soft"
                          : "text-secondary dark:text-alabaster hover:text-primary hover:bg-primary/5 dark:hover:bg-primary/10"
                      }`}
                    >
                      <span className="relative flex items-center gap-2">
                        {item.name}
                        {userRole === "client" && item.name === "Chat" && chatUnread && (
                          <span className="absolute -top-1 -right-2 inline-block w-3 h-3 bg-gradient-to-r from-error-500 to-error-600 rounded-full animate-pulse-soft shadow-glow" />
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              </nav>
            </div>

            <button
              onClick={() => setIsAccountDrawerOpen(true)}
              className="flex items-center gap-3 text-sm rounded-2xl p-2 focus:outline-none hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-105 group"
            >
              <span className="sr-only">Open user menu</span>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white shadow-soft group-hover:shadow-glow transition-all duration-200">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt="Profile"
                    className="w-full h-full rounded-xl object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold">{user ? getInitials(user.name) : "U"}</span>
                )}
              </div>
              <span className="hidden sm:inline text-secondary dark:text-white transition-colors duration-200 font-medium">
                Profile
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full relative">
        <div className="px-4 py-8 mx-auto max-w-7xl sm:px-6 lg:px-8 transition-colors duration-300 relative z-10">
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
