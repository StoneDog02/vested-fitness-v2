import { Link } from "@remix-run/react";
import Drawer from "./Drawer";
import Button from "./Button";
import { useTheme } from "~/context/ThemeContext";

interface AccountDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: "coach" | "client";
}

export default function AccountDrawer({
  isOpen,
  onClose,
  userRole,
}: AccountDrawerProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const menuItems = [
    {
      section: "Communication",
      items: [
        {
          name: "Chat",
          href: "/dashboard/chat",
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
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          ),
        },
      ],
    },
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
        {
          name: "Theme",
          icon: isDark ? (
            <svg
              className="w-5 h-5 mr-3"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 mr-3"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          ),
          onClick: toggleTheme,
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
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-2xl text-white">
            U
          </div>
          <div>
            <h3 className="text-lg font-semibold text-secondary dark:text-alabaster">
              User Name
            </h3>
            <p className="text-sm text-muted-foreground capitalize">
              {userRole}
            </p>
          </div>
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
                      className="w-full flex items-center px-4 py-2 text-sm text-secondary dark:text-alabaster hover:bg-gray-lightest dark:hover:bg-secondary-light/5 rounded-lg transition-colors duration-200"
                    >
                      {item.icon}
                      {item.name}
                    </button>
                  ) : (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={onClose}
                      className="flex items-center px-4 py-2 text-sm text-secondary dark:text-alabaster hover:bg-gray-lightest dark:hover:bg-secondary-light/5 rounded-lg transition-colors duration-200"
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
          <Button
            variant="outline"
            className="w-full justify-center text-red-500 border-red-500 hover:bg-red-50 dark:hover:bg-red-950"
            onClick={() => {
              // Handle sign out logic here
              onClose();
            }}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
