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
      check_in_forms: {
        Row: {
          id: string;
          coach_id: string;
          title: string;
          description?: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          coach_id: string;
          title: string;
          description?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          coach_id?: string;
          title?: string;
          description?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      check_in_form_questions: {
        Row: {
          id: string;
          form_id: string;
          question_text: string;
          question_type: 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox';
          is_required: boolean;
          options?: any;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          form_id: string;
          question_text: string;
          question_type: 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox';
          is_required?: boolean;
          options?: any;
          order_index: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          form_id?: string;
          question_text?: string;
          question_type?: 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox';
          is_required?: boolean;
          options?: any;
          order_index?: number;
          created_at?: string;
        };
      };
      check_in_form_instances: {
        Row: {
          id: string;
          form_id: string;
          client_id: string;
          coach_id: string;
          sent_at: string;
          completed_at?: string;
          status: 'sent' | 'completed' | 'expired';
          expires_at?: string;
        };
        Insert: {
          id?: string;
          form_id: string;
          client_id: string;
          coach_id: string;
          sent_at?: string;
          completed_at?: string;
          status?: 'sent' | 'completed' | 'expired';
          expires_at?: string;
        };
        Update: {
          id?: string;
          form_id?: string;
          client_id?: string;
          coach_id?: string;
          sent_at?: string;
          completed_at?: string;
          status?: 'sent' | 'completed' | 'expired';
          expires_at?: string;
        };
      };
      check_in_form_responses: {
        Row: {
          id: string;
          instance_id: string;
          question_id: string;
          response_text?: string;
          response_number?: number;
          response_options?: any;
          created_at: string;
        };
        Insert: {
          id?: string;
          instance_id: string;
          question_id: string;
          response_text?: string;
          response_number?: number;
          response_options?: any;
          created_at?: string;
        };
        Update: {
          id?: string;
          instance_id?: string;
          question_id?: string;
          response_text?: string;
          response_number?: number;
          response_options?: any;
          created_at?: string;
        };
      };
      supplements: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          dosage: string;
          frequency: string;
          instructions: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          dosage: string;
          frequency: string;
          instructions?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          dosage?: string;
          frequency?: string;
          instructions?: string;
          created_at?: string;
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
