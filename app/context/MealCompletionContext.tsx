import { createContext, useContext, useState, useEffect } from "react";

interface MealCompletionContextType {
  checkedMeals: string[];
  setCheckedMeals: (meals: string[]) => void;
  addCheckedMeal: (mealKey: string) => void;
  removeCheckedMeal: (mealKey: string) => void;
  resetCheckedMeals: () => void;
  isHydrated: boolean;
}

const MealCompletionContext = createContext<MealCompletionContextType | undefined>(undefined);

const STORAGE_KEY = "meal-completion-state";

export function MealCompletionProvider({ children }: { children: React.ReactNode }) {
  const [checkedMeals, setCheckedMealsState] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setCheckedMealsState(parsed);
        } catch (error) {
          console.warn("Failed to parse stored meal completion state:", error);
        }
      }
      setIsHydrated(true);
    }
  }, []);

  // Save to localStorage whenever state changes (but only after hydration)
  useEffect(() => {
    if (isHydrated && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedMeals));
    }
  }, [checkedMeals, isHydrated]);

  const setCheckedMeals = (meals: string[]) => {
    setCheckedMealsState(meals);
  };

  const addCheckedMeal = (mealKey: string) => {
    setCheckedMealsState((prev) => prev.includes(mealKey) ? prev : [...prev, mealKey]);
  };

  const removeCheckedMeal = (mealKey: string) => {
    setCheckedMealsState((prev) => prev.filter((k) => k !== mealKey));
  };

  const resetCheckedMeals = () => {
    setCheckedMealsState([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <MealCompletionContext.Provider value={{ checkedMeals, setCheckedMeals, addCheckedMeal, removeCheckedMeal, resetCheckedMeals, isHydrated }}>
      {children}
    </MealCompletionContext.Provider>
  );
}

export function useMealCompletion() {
  const context = useContext(MealCompletionContext);
  if (context === undefined) {
    throw new Error("useMealCompletion must be used within a MealCompletionProvider");
  }
  return context;
} 