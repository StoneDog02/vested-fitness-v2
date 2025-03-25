// Define types for our user roles
export type UserRole = "coach" | "client";

// Define user type based on our database schema
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  coach_id?: string;
  starting_weight?: number;
  current_weight?: number;
  workout_split?: string;
  avatar_url?: string;
  created_at: string;
  created_by?: string;
  last_login?: string;
  auth_id: string;
}

// Mock user data for testing
export const mockUsers: User[] = [
  {
    id: "1",
    email: "coach@example.com",
    name: "Test Coach",
    role: "coach",
    created_at: new Date().toISOString(),
    auth_id: "coach-auth-id",
  },
  {
    id: "2",
    email: "client@example.com",
    name: "Test Client",
    role: "client",
    coach_id: "1",
    starting_weight: 180,
    current_weight: 175,
    workout_split: "4 day split",
    created_at: new Date().toISOString(),
    auth_id: "client-auth-id",
  },
];

// Helper function to get a mock user
export const getMockUser = (role: UserRole = "coach"): User => {
  return mockUsers.find((user) => user.role === role) || mockUsers[0];
};

// Mock function to switch roles for testing
export const switchRole = (currentRole: UserRole): UserRole => {
  return currentRole === "coach" ? "client" : "coach";
};
