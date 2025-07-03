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

  let recentActivity: any[] = [];
  let recentClients: any[] = [];
  let weightChange = 0;
  let complianceCalendars = {};

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
    recentClients = (clients ?? [])
      .filter((c) => new Date(c.created_at) >= monthAgo)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
    if (clients && clients.length > 0) {
      const clientIds = clients.map((c) => c.id);
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
      workoutsToday = workouts;
      mealsLogged = meals;
      suppsLogged = supplements;
    }
    // Group activities by client and type
    const activityGroups: { [key: string]: any } = {};
    if (workoutsToday) {
      for (const w of workoutsToday) {
        const client = clients ? clients.find((c: any) => c.id === w.user_id) : null;
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
        const client = clients ? clients.find((c: any) => c.id === m.user_id) : null;
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
        const client = clients ? clients.find((c: any) => c.id === s.user_id) : null;
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
    recentActivity = Object.values(activityGroups).map((group: any) => {
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