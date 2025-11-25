import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { parse } from "cookie";
import { extractAuthFromCookie, validateAndRefreshToken } from "~/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import { getCurrentDate, USER_TIMEZONE } from "~/lib/timezone";

type Activity = {
  id: string;
  clientName: string;
  action: string;
  time: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const cookies = parse(request.headers.get("cookie") || "");
  const { accessToken, refreshToken } = extractAuthFromCookie(cookies);
  
  if (!accessToken) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  // Validate and potentially refresh the token
  const validation = await validateAndRefreshToken(accessToken, refreshToken);
  if (!validation.valid) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  let authId: string | undefined;
  try {
    const tokenToDecode = validation.newAccessToken || accessToken;
    const decoded = jwt.decode(tokenToDecode) as Record<string, unknown> | null;
    authId = decoded && typeof decoded === "object" && "sub" in decoded
      ? (decoded.sub as string)
      : undefined;
  } catch (e) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  if (!authId) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Get user to determine if they're a coach
  const { data: user } = await supabase
    .from("users")
    .select("id, role, coach_id")
    .eq("auth_id", authId)
    .single();

  if (!user) {
    return json({ error: "user not found" }, { status: 404 });
  }

  const coachId = user.role === "coach" ? user.id : user.coach_id;
  
  // If not a coach and no coach_id, return empty data
  if (!coachId) {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") || 1);
    return json({
      recentClients: [],
      recentActivity: [],
      weightChange: 0,
      hasMore: false,
      page,
    });
  }

  // Get all clients for this coach
  const { data: clients } = await supabase
    .from("users")
    .select("id, name")
    .eq("coach_id", coachId)
    .eq("role", "client");

  if (!clients || clients.length === 0) {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") || 1);
    return json({
      recentClients: [],
      recentActivity: [],
      weightChange: 0,
      hasMore: false,
      page,
    });
  }

  const clientIds = clients.map(c => c.id);
  const clientMap = new Map(clients.map(c => [c.id, c.name]));

  // Get today's date range in user timezone
  const today = getCurrentDate();
  const todayStart = today.startOf("day").toISOString();
  const todayEnd = today.endOf("day").toISOString();

  // Fetch all activities for today
  const [
    mealCompletionsRes,
    workoutCompletionsRes,
    supplementCompletionsRes,
    checkInFormsRes
  ] = await Promise.all([
    // Meal completions - group by user and date to show "completed meals for today"
    supabase
      .from("meal_completions")
      .select("user_id, completed_at")
      .in("user_id", clientIds)
      .gte("completed_at", todayStart)
      .lte("completed_at", todayEnd)
      .order("completed_at", { ascending: false }),
    // Workout completions - filter for actual workouts in JavaScript (non-empty completed_groups)
    supabase
      .from("workout_completions")
      .select("user_id, completed_at, completed_groups")
      .in("user_id", clientIds)
      .gte("completed_at", todayStart)
      .lte("completed_at", todayEnd)
      .order("completed_at", { ascending: false }),
    // Supplement completions - group by user and date
    supabase
      .from("supplement_completions")
      .select("user_id, completed_at")
      .in("user_id", clientIds)
      .gte("completed_at", todayStart)
      .lte("completed_at", todayEnd)
      .order("completed_at", { ascending: false }),
    // Check-in form completions
    supabase
      .from("check_in_form_instances")
      .select("client_id, completed_at")
      .in("client_id", clientIds)
      .eq("status", "completed")
      .gte("completed_at", todayStart)
      .lte("completed_at", todayEnd)
      .order("completed_at", { ascending: false })
  ]);

  const activities: Activity[] = [];

  // Process meal completions - show one activity per client per day (use most recent completion time)
  const mealCompletionsByClient = new Map<string, { time: string; count: number }>();
  (mealCompletionsRes.data || []).forEach((completion: any) => {
    const existing = mealCompletionsByClient.get(completion.user_id);
    if (!existing || new Date(completion.completed_at) > new Date(existing.time)) {
      mealCompletionsByClient.set(completion.user_id, {
        time: completion.completed_at,
        count: (existing?.count || 0) + 1
      });
    } else {
      existing.count++;
    }
  });

  mealCompletionsByClient.forEach((data, userId) => {
    const clientName = clientMap.get(userId);
    if (clientName) {
      activities.push({
        id: `meal-${userId}-${data.time}`,
        clientName,
        action: "completed meals",
        time: data.time
      });
    }
  });

  // Process workout completions
  (workoutCompletionsRes.data || []).forEach((completion: any) => {
    const clientName = clientMap.get(completion.user_id);
    if (clientName && completion.completed_groups && Array.isArray(completion.completed_groups) && completion.completed_groups.length > 0) {
      activities.push({
        id: `workout-${completion.user_id}-${completion.completed_at}`,
        clientName,
        action: "completed workout",
        time: completion.completed_at
      });
    }
  });

  // Process supplement completions - show one activity per client per day (use most recent completion time)
  const supplementCompletionsByClient = new Map<string, { time: string; count: number }>();
  (supplementCompletionsRes.data || []).forEach((completion: any) => {
    const existing = supplementCompletionsByClient.get(completion.user_id);
    if (!existing || new Date(completion.completed_at) > new Date(existing.time)) {
      supplementCompletionsByClient.set(completion.user_id, {
        time: completion.completed_at,
        count: (existing?.count || 0) + 1
      });
    } else {
      existing.count++;
    }
  });

  supplementCompletionsByClient.forEach((data, userId) => {
    const clientName = clientMap.get(userId);
    if (clientName) {
      activities.push({
        id: `supplement-${userId}-${data.time}`,
        clientName,
        action: "completed supplements",
        time: data.time
      });
    }
  });

  // Process check-in form completions
  (checkInFormsRes.data || []).forEach((form: any) => {
    const clientName = clientMap.get(form.client_id);
    if (clientName) {
      activities.push({
        id: `checkin-${form.client_id}-${form.completed_at}`,
        clientName,
        action: "submitted check-in form",
        time: form.completed_at
      });
    }
  });

  // Sort by time descending (most recent first)
  activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  // For now, we'll return all today's activities (can add pagination later if needed)
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = 20;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedActivities = activities.slice(startIndex, endIndex);
  const hasMore = activities.length > endIndex;

  // TODO: Implement recentClients and weightChange
  return json({
    recentClients: [],
    recentActivity: paginatedActivities,
    weightChange: 0,
    hasMore,
    page,
  });
}