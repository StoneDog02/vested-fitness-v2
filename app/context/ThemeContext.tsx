import { createContext, useContext, useState, useEffect } from "react";

type ThemeMode = "light" | "dark";

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start with light theme to prevent hydration mismatch
  // Theme will be detected and applied after hydration
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [isHydrated, setIsHydrated] = useState(false);

  // Detect theme after hydration to prevent server/client mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme") as ThemeMode | null;
      setTheme(savedTheme || "light");
      setIsHydrated(true);
    }
  }, []);

  // Toggle between light and dark
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  // Update localStorage and document class when theme changes
  useEffect(() => {
    if (typeof window !== "undefined" && isHydrated) {
      localStorage.setItem("theme", theme);

      // Apply or remove dark mode class to document
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
        document.body.classList.add("bg-night", "text-alabaster");
        document.body.classList.remove("bg-white");
      } else {
        document.documentElement.classList.remove("dark");
        document.body.classList.remove("bg-night", "text-alabaster");
        document.body.classList.add("bg-white");
      }
    }
  }, [theme, isHydrated]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
