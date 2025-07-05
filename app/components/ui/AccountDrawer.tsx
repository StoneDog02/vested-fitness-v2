import { Link, useNavigate } from "@remix-run/react";
import Drawer from "./Drawer";
import CompactThemeToggle from "./CompactThemeToggle";

interface MenuItem {
  name: string;
  href?: string;
  icon: JSX.Element;
  onClick?: () => void;
}

interface MenuSection {
  section: string;
  items: MenuItem[];
}

interface AccountDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: "coach" | "client";
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
  } | null;
}

export default function AccountDrawer({
  isOpen,
  onClose,
  userRole,
  user,
}: AccountDrawerProps) {
  const navigate = useNavigate();
  
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

  const menuItems: MenuSection[] = [
    {
      section: "Settings",
      items: [
        {
          name: "Profile Settings",
          href: "/dashboard/settings",
          icon: (
            <svg
              className="w-5 h-5 mr-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          ),
        },
        {
          name: "Billing",
          href: "/dashboard/settings/payment",
          icon: (
            <svg
              className="w-5 h-5 mr-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          ),
        },
      ],
    },
    {
      section: "Support",
      items: [
        {
          name: "Help & Support",
          href: "/help",
          icon: (
            <svg
              className="w-5 h-5 mr-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
        },
      ],
    },
  ];

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Account">
      <div className="space-y-6">
        {/* User Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-2xl text-white">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="Profile"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span>{user ? getInitials(user.name) : "U"}</span>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-secondary dark:text-alabaster">
                {user ? user.name : "User Name"}
              </h3>
              <p className="text-sm text-muted-foreground capitalize">
                {userRole}
              </p>
            </div>
          </div>
          <CompactThemeToggle />
        </div>

        {/* Menu Items */}
        <div className="space-y-6">
          {menuItems.map((section) => (
            <div key={section.section}>
              <h4 className="text-xs uppercase tracking-wider text-gray-dark dark:text-gray-light font-medium mb-2 px-4">
                {section.section}
              </h4>
              <nav className="space-y-1">
                {section.items.map((item) =>
                  item.onClick ? (
                    <button
                      key={item.name}
                      onClick={item.onClick}
                      className="w-full flex items-center px-4 py-2 text-sm text-secondary dark:text-alabaster hover:bg-gray-lightest dark:hover:bg-secondary-light/5 rounded-lg transition-colors duration-200 hover:!text-primary"
                    >
                      {item.icon}
                      {item.name}
                    </button>
                  ) : (
                    <Link
                      key={item.name}
                      to={item.href!}
                      onClick={onClose}
                      className="flex items-center px-4 py-2 text-sm text-secondary dark:text-alabaster hover:bg-gray-lightest dark:hover:bg-secondary-light/5 rounded-lg transition-colors duration-200 hover:!text-primary"
                    >
                      {item.icon}
                      {item.name}
                    </Link>
                  )
                )}
              </nav>
            </div>
          ))}
        </div>

        {/* Sign Out Button */}
        <div className="pt-4 border-t border-gray-light dark:border-davyGray">
          <button
            className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-red-500 border border-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-colors duration-200"
            onClick={() => {
              onClose();
              navigate("/auth/logout");
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </Drawer>
  );
}
