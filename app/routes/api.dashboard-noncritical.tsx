import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { LoaderFunction } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { Database } from "~/lib/supabase";

export const loader: LoaderFunction = async ({ request }) => {
  // Get user from auth cookie
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
      accessToken = undefined;
    }
  }

  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      authId = undefined;
    }
  }

  if (!authId) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Fetch user to determine role
  const { data: user } = await supabase
    .from("users")
    .select("id, role, coach_id, starting_weight, current_weight")
    .eq("auth_id", authId)
    .single();

  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  let recentActivity: Array<{ id: string; clientName: string; action: string; time: string }> = [];
  let recentClients: Array<{ 
    id: string; 
    name: string; 
    updated_at: string; 
    created_at: string; 
    role: string; 
    status: string;
    activeMealPlan?: any;
    activeWorkoutPlan?: any;
    supplements?: any[];
  }> = [];
  let weightChange = 0;
  const complianceCalendars = {};

  if (user.role === "client") {
    // Weight change
    const { data: weightLogs } = await supabase
      .from("weight_logs")
      .select("weight, logged_at")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: true });
    if (weightLogs && weightLogs.length > 0) {
      const firstWeight = weightLogs[0].weight;
      const lastWeight = weightLogs[weightLogs.length - 1].weight;
      weightChange = lastWeight - firstWeight;
    } else if (user.starting_weight && user.current_weight) {
      weightChange = user.current_weight - user.starting_weight;
    }
    // TODO: Add compliance calendar data for client if needed
  } else if (user.role === "coach") {
    // Fetch all clients
    const { data: clients } = await supabase
      .from("users")
      .select("id, name, updated_at, created_at, role, status")
      .eq("coach_id", user.id)
      .eq("role", "client");
    
    // Recent Clients: last 30 days
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const recentClientsBasic = (clients ?? [])
      .filter((c) => new Date(c.created_at) >= monthAgo)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    // Fetch setup data for ALL clients (to avoid empty array issues)
    const allClientIds = (clients ?? []).map(c => c.id);
    
    if (allClientIds.length > 0) {
      // Fetch active meal plans, workout plans, and supplements for all clients
      const [mealPlansResult, workoutPlansResult, supplementsResult] = await Promise.all([
        supabase
          .from("meal_plans")
          .select("id, user_id, title, is_active, activated_at")
          .in("user_id", allClientIds)
          .eq("is_active", true)
          .eq("is_template", false),
        supabase
          .from("workout_plans")
          .select("id, user_id, title, is_active, activated_at")
          .in("user_id", allClientIds)
          .eq("is_active", true),
        supabase
          .from("supplements")
          .select("id, user_id, name")
          .in("user_id", allClientIds)
      ]);
      
      // Group plans and supplements by user
      const mealPlansByUser: Record<string, any> = {};
      (mealPlansResult.data ?? []).forEach((plan: any) => {
        mealPlansByUser[plan.user_id] = plan;
      });
      
      const workoutPlansByUser: Record<string, any> = {};
      (workoutPlansResult.data ?? []).forEach((plan: any) => {
        workoutPlansByUser[plan.user_id] = plan;
      });
      
      const supplementsByUser: Record<string, any[]> = {};
      (supplementsResult.data ?? []).forEach((supp: any) => {
        if (!supplementsByUser[supp.user_id]) supplementsByUser[supp.user_id] = [];
        supplementsByUser[supp.user_id].push(supp);
      });
      
      // Build enhanced clients with setup data for ALL clients
      const allClientsWithSetup = (clients ?? []).map(client => ({
        ...client,
        activeMealPlan: mealPlansByUser[client.id] || null,
        activeWorkoutPlan: workoutPlansByUser[client.id] || null,
        supplements: supplementsByUser[client.id] || []
      }));
      
      // Filter to only recent clients for the return value
      recentClients = allClientsWithSetup
        .filter((c) => new Date(c.created_at) >= monthAgo)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    
    // Recent Activity: today only (last 24 hours for more relevant activity)
    const now = new Date();
    const todayDateString = now.toISOString().slice(0, 10); // YYYY-MM-DD format
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowDateString = tomorrow.toISOString().slice(0, 10);
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    let workoutsToday = null;
    let mealsLogged = null;
    let suppsLogged = null;
    let formsCompleted = null;
    let newClientRegistrations = null;
    if (recentClients && recentClients.length > 0) {
      const clientIds = recentClients.map((c) => c.id);
      const { data: workouts } = await supabase
        .from("workout_completions")
        .select("id, user_id, completed_at, created_at")
        .in("user_id", clientIds)
        .gte("created_at", sixHoursAgo.toISOString());
      const { data: meals } = await supabase
        .from("meal_completions")
        .select("id, user_id, completed_at")
        .in("user_id", clientIds)
        .gte("completed_at", `${todayDateString}T00:00:00.000Z`)
        .lt("completed_at", `${tomorrowDateString}T00:00:00.000Z`);
      const { data: supplements } = await supabase
        .from("supplement_completions")
        .select("id, user_id, completed_at")
        .in("user_id", clientIds)
        .gte("completed_at", `${todayDateString}T00:00:00.000Z`)
        .lt("completed_at", `${tomorrowDateString}T00:00:00.000Z`);
      const { data: forms } = await supabase
        .from("check_in_form_instances")
        .select(`
          id,
          client_id,
          completed_at,
          check_in_forms!inner (
            title
          )
        `)
        .in("client_id", clientIds)
        .eq("status", "completed")
        .gte("completed_at", `${todayDateString}T00:00:00.000Z`)
        .lt("completed_at", `${tomorrowDateString}T00:00:00.000Z`);
      
      // Get new client registrations from today
      const { data: newClients } = await supabase
        .from("users")
        .select("id, name, created_at")
        .in("id", clientIds)
        .eq("role", "client")
        .gte("created_at", `${todayDateString}T00:00:00.000Z`)
        .lt("created_at", `${tomorrowDateString}T00:00:00.000Z`);
      
      workoutsToday = workouts;
      mealsLogged = meals;
      suppsLogged = supplements;
      formsCompleted = forms;
      newClientRegistrations = newClients;
    }
    // Group activities by client and type
    const activityGroups: { [key: string]: { clientName: string; action: string; count: number; latestTime: string; id: string } } = {};
    if (workoutsToday) {
      for (const w of workoutsToday) {
        const client = recentClients ? recentClients.find((c: any) => c.id === w.user_id) : null;
        const clientName = client ? client.name : "Unknown";
        const key = `${w.user_id}-workout`;
        if (!activityGroups[key]) {
          activityGroups[key] = {
            clientName,
            action: "Completed workout",
            count: 0,
            latestTime: w.created_at || w.completed_at,
            id: w.id,
          };
        }
        activityGroups[key].count++;
        const currentTime = w.created_at || w.completed_at;
        if (new Date(currentTime) > new Date(activityGroups[key].latestTime)) {
          activityGroups[key].latestTime = currentTime;
        }
      }
    }
    if (mealsLogged) {
      for (const m of mealsLogged) {
        const client = recentClients ? recentClients.find((c: any) => c.id === m.user_id) : null;
        const clientName = client ? client.name : "Unknown";
        const key = `${m.user_id}-meal`;
        if (!activityGroups[key]) {
          activityGroups[key] = {
            clientName,
            action: "Completed meals",
            count: 0,
            latestTime: m.completed_at,
            id: m.id,
          };
        }
        activityGroups[key].count++;
        if (new Date(m.completed_at) > new Date(activityGroups[key].latestTime)) {
          activityGroups[key].latestTime = m.completed_at;
        }
      }
    }
    if (suppsLogged) {
      for (const s of suppsLogged) {
        const client = recentClients ? recentClients.find((c: any) => c.id === s.user_id) : null;
        const clientName = client ? client.name : "Unknown";
        const key = `${s.user_id}-supplement`;
        if (!activityGroups[key]) {
          activityGroups[key] = {
            clientName,
            action: "Completed supplements",
            count: 0,
            latestTime: s.completed_at,
            id: s.id,
          };
        }
        activityGroups[key].count++;
        if (new Date(s.completed_at) > new Date(activityGroups[key].latestTime)) {
          activityGroups[key].latestTime = s.completed_at;
        }
      }
    }
    if (formsCompleted) {
      for (const f of formsCompleted) {
        const client = recentClients ? recentClients.find((c: any) => c.id === f.client_id) : null;
        const clientName = client ? client.name : "Unknown";
        const formTitle = (f.check_in_forms as any)?.title || 'Check-in Form';
        const key = `${f.client_id}-form-${f.id}`;
        activityGroups[key] = {
          clientName,
          action: `Completed form "${formTitle}"`,
          count: 1,
          latestTime: f.completed_at,
          id: f.id,
        };
      }
    }
    if (newClientRegistrations) {
      for (const client of newClientRegistrations) {
        const key = `${client.id}-registration`;
        activityGroups[key] = {
          clientName: client.name,
          action: "Registered as new client",
          count: 1,
          latestTime: client.created_at,
          id: client.id,
        };
      }
    }
    recentActivity = Object.values(activityGroups).map((group) => {
      let actionText = group.action;
      if (group.count > 1) {
        actionText = `${group.action} (${group.count})`;
      }
      return {
        id: group.id,
        clientName: group.clientName,
        action: actionText,
        time: group.latestTime,
      };
    });
    recentActivity.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    // TODO: Add compliance calendar data for coach if needed
  }

  return json({
    recentActivity,
    recentClients,
    weightChange,
    complianceCalendars,
  });
}; 