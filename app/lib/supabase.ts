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
          active_from: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          dosage: string;
          frequency: string;
          instructions?: string;
          created_at?: string;
          active_from?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          dosage?: string;
          frequency?: string;
          instructions?: string;
          created_at?: string;
          active_from?: string;
        };
      };
      workout_plans: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description?: string;
          is_active: boolean;
          is_template: boolean;
          template_id?: string;
          created_at: string;
          updated_at?: string;
          activated_at?: string;
          deactivated_at?: string;
          builder_mode: 'week' | 'day';
          workout_days_per_week: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string;
          is_active?: boolean;
          is_template?: boolean;
          template_id?: string;
          created_at?: string;
          updated_at?: string;
          activated_at?: string;
          deactivated_at?: string;
          builder_mode?: 'week' | 'day';
          workout_days_per_week?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string;
          is_active?: boolean;
          is_template?: boolean;
          template_id?: string;
          created_at?: string;
          updated_at?: string;
          activated_at?: string;
          deactivated_at?: string;
          builder_mode?: 'week' | 'day';
          workout_days_per_week?: number;
        };
      };
      workout_days: {
        Row: {
          id: string;
          workout_plan_id: string;
          day_of_week: string;
          is_rest: boolean;
          workout_name?: string;
          workout_type?: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_plan_id: string;
          day_of_week: string;
          is_rest: boolean;
          workout_name?: string;
          workout_type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_plan_id?: string;
          day_of_week?: string;
          is_rest?: boolean;
          workout_name?: string;
          workout_type?: string;
          created_at?: string;
        };
      };
      workout_exercises: {
        Row: {
          id: string;
          workout_day_id: string;
          group_type: string;
          sequence_order: number;
          exercise_name: string;
          exercise_description?: string;
          video_url?: string;
          sets_data: any;
          group_notes?: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_day_id: string;
          group_type: string;
          sequence_order: number;
          exercise_name: string;
          exercise_description?: string;
          video_url?: string;
          sets_data: any;
          group_notes?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_day_id?: string;
          group_type?: string;
          sequence_order?: number;
          exercise_name?: string;
          exercise_description?: string;
          video_url?: string;
          sets_data?: any;
          group_notes?: string;
          created_at?: string;
        };
      };
      workout_completions: {
        Row: {
          id: string;
          user_id: string;
          workout_day_id: string;
          completed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          workout_day_id: string;
          completed_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          workout_day_id?: string;
          completed_at?: string;
          created_at?: string;
        };
      };
    };
  };
}

// Replace mock resetPassword with real implementation
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

export const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
};

export const validateAndRefreshToken = async (accessToken: string, refreshToken: string) => {
  try {
    // Decode the access token to check expiration
    const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
    if (!decoded || typeof decoded !== "object") {
      return { valid: false, reason: "Invalid token structure" };
    }

    // Check if token is expired (with 5 minute buffer)
    if ("exp" in decoded && typeof decoded.exp === "number") {
      const exp = decoded.exp as number;
      const now = Math.floor(Date.now() / 1000);
      const buffer = 5 * 60; // 5 minutes
      
      if (now >= (exp - buffer)) {
        // Token is expired or will expire soon, try to refresh
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!
        );
        
        const { data, error } = await supabase.auth.refreshSession({
          refresh_token: refreshToken,
        });
        
        if (error || !data.session) {
          return { valid: false, reason: "Token refresh failed", error };
        }
        
        return { 
          valid: true, 
          newAccessToken: data.session.access_token,
          newRefreshToken: data.session.refresh_token
        };
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: "Token validation error", error };
  }
};

export const extractAuthFromCookie = (cookies: Record<string, string>) => {
  const supabaseAuthCookieKey = Object.keys(cookies).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
  );
  
  if (!supabaseAuthCookieKey) {
    return { accessToken: null, refreshToken: null };
  }
  
  try {
    const decoded = Buffer.from(
      cookies[supabaseAuthCookieKey],
      "base64"
    ).toString("utf-8");
    const [access, refresh] = JSON.parse(JSON.parse(decoded));
    return { accessToken: access, refreshToken: refresh };
  } catch (e) {
    console.error("Failed to extract auth from cookie:", e);
    return { accessToken: null, refreshToken: null };
  }
};
