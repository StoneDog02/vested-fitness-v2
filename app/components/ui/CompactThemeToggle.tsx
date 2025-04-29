import { useTheme } from "~/context/ThemeContext";

interface CompactThemeToggleProps {
  className?: string;
}

export default function CompactThemeToggle({
  className = "",
}: CompactThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Sun icon */}
      <svg
        className="h-4 w-4 text-secondary dark:text-gray-300"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
          clipRule="evenodd"
        />
      </svg>

      {/* Toggle switch */}
      <button
        onClick={toggleTheme}
        className={`relative inline-flex h-5 w-9 items-center rounded-full ${
          isDark ? "bg-primary" : "bg-gray-light"
        } transition-colors duration-200 focus:outline-none`}
        role="switch"
        aria-checked={isDark}
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      >
        {/* Sliding circle */}
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ${
            isDark ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>

      {/* Moon icon */}
      <svg
        className="h-4 w-4 text-secondary dark:text-gray-300"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
      </svg>
    </div>
  );
}
