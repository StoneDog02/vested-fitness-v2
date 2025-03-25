import { useTheme } from "~/context/ThemeContext";

interface ThemeToggleProps {
  label?: boolean;
}

export default function ThemeToggle({ label = true }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center">
      {label && (
        <div className="mr-3">
          <span className="text-sm font-medium">
            {isDark ? "Dark Mode" : "Light Mode"}
          </span>
        </div>
      )}
      <button
        onClick={toggleTheme}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
          isDark ? "bg-primary" : "bg-gray-light"
        }`}
        role="switch"
        aria-checked={isDark}
      >
        <span className="sr-only">Toggle dark mode</span>
        <span
          className={`${
            isDark ? "translate-x-6" : "translate-x-1"
          } inline-block h-4 w-4 transform rounded-full ${
            isDark ? "bg-night" : "bg-white"
          } transition-transform`}
        />
      </button>
    </div>
  );
}
