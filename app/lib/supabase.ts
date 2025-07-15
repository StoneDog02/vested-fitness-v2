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
  goal?: string;
  font_size?: string;
  email_notifications?: boolean;
  app_notifications?: boolean;
  weekly_summary?: boolean;
  status?: string;
  inactive_since?: string;
}

// Define the database schema
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_id: string;
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
          updated_at: string;
          goal?: string;
          font_size?: string;
          email_notifications?: boolean;
          app_notifications?: boolean;
          weekly_summary?: boolean;
          status?: string;
          inactive_since?: string;
        };
        Insert: {
          id?: string;
          auth_id: string;
          email: string;
          name: string;
          role: UserRole;
          coach_id?: string;
          starting_weight?: number;
          current_weight?: number;
          workout_split?: string;
          avatar_url?: string;
          created_at?: string;
          created_by?: string;
          last_login?: string;
          updated_at?: string;
          goal?: string;
          font_size?: string;
          email_notifications?: boolean;
          app_notifications?: boolean;
          weekly_summary?: boolean;
          status?: string;
          inactive_since?: string;
        };
        Update: {
          id?: string;
          auth_id?: string;
          email?: string;
          name?: string;
          role?: UserRole;
          coach_id?: string;
          starting_weight?: number;
          current_weight?: number;
          workout_split?: string;
          avatar_url?: string;
          created_at?: string;
          created_by?: string;
          last_login?: string;
          updated_at?: string;
          goal?: string;
          font_size?: string;
          email_notifications?: boolean;
          app_notifications?: boolean;
          weekly_summary?: boolean;
          status?: string;
          inactive_since?: string;
        };
      };
      coach_updates: {
        Row: {
          id: string;
          coach_id: string;
          client_id: string;
          message: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          coach_id: string;
          client_id: string;
          message: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          coach_id?: string;
          client_id?: string;
          message?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

// Replace mock resetPassword with real implementation
import { createClient } from "@supabase/supabase-js";

export const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
};
