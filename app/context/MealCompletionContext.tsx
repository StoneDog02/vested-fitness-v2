import { createContext, useContext, useState, useEffect } from "react";

interface MealCompletionContextType {
  checkedMeals: string[];
  setCheckedMeals: (meals: string[]) => void;
  addCheckedMeal: (mealKey: string) => void;
  removeCheckedMeal: (mealKey: string) => void;
  resetCheckedMeals: () => void;
  clearCorruptedData: () => void;
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
          // Validate that it's an array of strings
          if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
            setCheckedMealsState(parsed);
          } else {
            console.warn("Invalid meal completion data in localStorage, clearing...");
            localStorage.removeItem(STORAGE_KEY);
          }
        } catch (error) {
          console.warn("Failed to parse stored meal completion state:", error);
          localStorage.removeItem(STORAGE_KEY);
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
    setCheckedMealsState(prevMeals => {
      // Remove duplicates from the input
      const uniqueMeals = [...new Set(meals)];
      // Only update if the arrays are actually different
      if (prevMeals.length !== uniqueMeals.length || prevMeals.some((meal, index) => meal !== uniqueMeals[index])) {
        return uniqueMeals;
      }
      return prevMeals;
    });
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

  const clearCorruptedData = () => {
    console.log("Clearing potentially corrupted meal completion data...");
    setCheckedMealsState([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <MealCompletionContext.Provider value={{ 
      checkedMeals, 
      setCheckedMeals, 
      addCheckedMeal, 
      removeCheckedMeal, 
      resetCheckedMeals, 
      clearCorruptedData,
      isHydrated 
    }}>
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