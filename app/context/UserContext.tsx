import { createContext, useContext } from "react";

export interface UserContextType {
  id: string;
  role: "coach" | "client";
  chat_bubble_color?: string;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
} 