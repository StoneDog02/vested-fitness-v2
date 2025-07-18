import { json, type ActionFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { getCurrentTimestampISO } from "~/lib/timezone";

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const password = formData.get("password") as string;

    if (!password) {
      return json({ error: "Password is required" }, { status: 400 });
    }

    // Get the user's auth token from cookies
    const cookies = parse(request.headers.get("cookie") || "");
    const supabaseAuthCookieKey = Object.keys(cookies).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
    );

    let accessToken;
    if (supabaseAuthCookieKey) {
      try {
        const decoded = Buffer.from(
          cookies[supabaseAuthCookieKey],
          "base64"
        ).toString("utf-8");
        const [access] = JSON.parse(JSON.parse(decoded));
        accessToken = access;
      } catch (e) {
        return json({ error: "Authentication required" }, { status: 401 });
      }
    }

    if (!accessToken) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    // Decode the JWT to get the user's auth ID
    let authId: string;
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : "";
      if (!authId) {
        return json({ error: "Invalid authentication" }, { status: 401 });
      }
    } catch (e) {
      return json({ error: "Invalid authentication" }, { status: 401 });
    }

    // Create admin client for user operations
    const supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Get user data first
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, email, stripe_customer_id")
      .eq("auth_id", authId)
      .single();

    if (userError || !user) {
      return json({ error: "User not found" }, { status: 404 });
    }

    // ENFORCE 4-MONTH COMMITMENT: Block deletion if <4 paid subscription payments
    if (user.stripe_customer_id) {
      try {
        const stripeModule = await import("~/utils/stripe.server");
        const invoices = await stripeModule.getBillingHistory(user.stripe_customer_id);
        // Only count paid, non-prorated, non-setup subscription cycle invoices
        const paidInvoices = invoices.filter((inv: any) =>
          inv.status === "paid" &&
          inv.billing_reason === "subscription_cycle"
        );
        if (paidInvoices.length < 4) {
          return json({ error: `You must complete at least 4 monthly payments before you can delete your account. You have completed ${paidInvoices.length} of 4 required payments.` }, { status: 403 });
        }
      } catch (err) {
        return json({ error: "Failed to check payment commitment. Please try again later." }, { status: 500 });
      }
    }

    // Verify password by attempting to sign in with it
    const supabaseClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    const { error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: user.email,
      password: password,
    });

    if (signInError) {
      return json({ error: "Invalid password" }, { status: 400 });
    }

    // Before deleting the user, we need to clean up related data
    // This is important because some foreign key constraints might prevent deletion

    try {
      // Delete user's data in proper order (reverse dependency order)
      await Promise.all([
        // Delete completions first
        supabaseAdmin.from("workout_completions").delete().eq("user_id", user.id),
        supabaseAdmin.from("meal_completions").delete().eq("user_id", user.id),
        supabaseAdmin.from("supplement_completions").delete().eq("user_id", user.id),
        supabaseAdmin.from("weight_logs").delete().eq("user_id", user.id),
        supabaseAdmin.from("coach_updates").delete().eq("client_id", user.id),
      ]);

      // Delete plans and their dependent data
      const { data: mealPlans } = await supabaseAdmin
        .from("meal_plans")
        .select("id")
        .eq("user_id", user.id);

      const { data: workoutPlans } = await supabaseAdmin
        .from("workout_plans")
        .select("id")
        .eq("user_id", user.id);

      if (mealPlans && mealPlans.length > 0) {
        const mealPlanIds = mealPlans.map(p => p.id);
        
        // Delete meals and their foods
        const { data: meals } = await supabaseAdmin
          .from("meals")
          .select("id")
          .in("meal_plan_id", mealPlanIds);

        if (meals && meals.length > 0) {
          const mealIds = meals.map(m => m.id);
          await supabaseAdmin.from("foods").delete().in("meal_id", mealIds);
          await supabaseAdmin.from("meals").delete().in("id", mealIds);
        }

        await supabaseAdmin.from("meal_plans").delete().in("id", mealPlanIds);
      }

      if (workoutPlans && workoutPlans.length > 0) {
        const workoutPlanIds = workoutPlans.map(p => p.id);
        
        // Delete workout days and their exercises
        const { data: workoutDays } = await supabaseAdmin
          .from("workout_days")
          .select("id")
          .in("workout_plan_id", workoutPlanIds);

        if (workoutDays && workoutDays.length > 0) {
          const workoutDayIds = workoutDays.map(d => d.id);
          await supabaseAdmin.from("workout_exercises").delete().in("workout_day_id", workoutDayIds);
          await supabaseAdmin.from("workout_days").delete().in("id", workoutDayIds);
        }

        await supabaseAdmin.from("workout_plans").delete().in("id", workoutPlanIds);
      }

      // Delete supplements
      await supabaseAdmin.from("supplements").delete().eq("user_id", user.id);

      // Instead of deleting, mark user as inactive
      const { error: statusUpdateError } = await supabaseAdmin
        .from("users")
        .update({ 
          status: 'inactive',
          inactive_since: getCurrentTimestampISO()
        })
        .eq("id", user.id);

      if (statusUpdateError) {
        console.error("Error updating user status to inactive:", statusUpdateError);
        throw new Error("Failed to mark user as inactive");
      }

      // Delete from auth.users so they can't sign in, but keep user data
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(authId);

      if (deleteError) {
        console.error("Error deleting auth user:", deleteError);
        // This is less critical since user is marked as inactive
      }

      return json({ success: true });

    } catch (cleanupError) {
      console.error("Error during data cleanup:", cleanupError);
      return json({ error: "Failed to delete account data" }, { status: 500 });
    }

  } catch (error) {
    console.error("Account deletion error:", error);
    return json({ error: "Failed to delete account" }, { status: 500 });
  }
}; 