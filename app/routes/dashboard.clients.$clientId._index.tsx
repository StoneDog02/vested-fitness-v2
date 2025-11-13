import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import ClientProfile from "~/components/coach/ClientProfile";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import AddMessageModal from "~/components/coach/AddMessageModal";
import AddCheckInModal from "~/components/coach/AddCheckInModal";
import CheckInHistoryModal from "~/components/coach/CheckInHistoryModal";
import UpdateHistoryModal from "~/components/coach/UpdateHistoryModal";
import MediaPlayerModal from "~/components/ui/MediaPlayerModal";
import ProgressPhotosModal from "~/components/coach/ProgressPhotosModal";
import CreateCheckInFormModal, { FormTemplate } from "~/components/coach/CreateCheckInFormModal";
import SendCheckInFormModal from "~/components/coach/SendCheckInFormModal";
import CheckInFormResponseViewer from "~/components/coach/CheckInFormResponseViewer";
import CheckInFormHistoryModal from "~/components/coach/CheckInFormHistoryModal";
import ViewCheckInFormsModal from "~/components/coach/ViewCheckInFormsModal";
import Tooltip from "~/components/ui/Tooltip";
import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { Resend } from "resend";
import { useToast } from "~/context/ToastContext";

// Create a Resend instance
const resend = new Resend(process.env.RESEND_API_KEY);
import LineChart from "~/components/ui/LineChart";
import { calculateMacros } from "~/lib/utils";
import { ResponsiveContainer } from "recharts";
import dayjs from "dayjs";
import { getCurrentTimestampISO } from "~/lib/timezone";

export const meta: MetaFunction = () => {
  return [
    { title: "Client Details | Kava Training" },
    { name: "description", content: "View and manage client details" },
  ];
};

interface Food {
  id: number;
  name: string;
  portion?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Meal {
  id: number;
  name: string;
  time?: string;
  sequence_order?: number;
  foods: Food[];
}

interface MealPlan {
  id: string;
  title: string;
  is_active: boolean;
  meals: Meal[];
}

interface WorkoutPlan {
  id: string;
  title: string;
  is_active: boolean;
}

interface Supplement {
  id: string;
  name: string;
}

interface MinimalClient {
  id: string;
  name: string;
  email?: string;
  goal?: string;
  starting_weight?: number;
  current_weight?: number;
  workout_split?: string;
  role?: string;
  coach_id?: string;
  slug?: string;
}

interface Update {
  id: string;
  coach_id: string;
  client_id: string;
  message: string;
  created_at: string;
  updated_at: string;
}

interface CheckIn {
  id: string;
  notes: string;
  created_at: string;
  video_url?: string;
  audio_url?: string;
  recording_type?: 'video' | 'audio' | 'text' | 'video_audio';
  recording_duration?: number;
  recording_thumbnail_url?: string;
  transcript?: string;
}

interface WeightLog {
  id: string;
  weight: number;
  logged_at: string;
}

interface CheckInNote {
  id: string;
  date: string;
  notes: string;
  video_url?: string;
  audio_url?: string;
  recording_type?: 'video' | 'audio' | 'text' | 'video_audio';
  recording_duration?: number;
  recording_thumbnail_url?: string;
  transcript?: string;
}

interface LoaderData {
  client: MinimalClient;
  updates: Update[];
  allUpdates: Update[];
  checkIns: CheckIn[];
  mealPlans: MealPlan[];
  supplements: Supplement[];
  weightLogs?: WeightLog[];
  activeMealPlan?: MealPlan | null;
  activeWorkoutPlan?: WorkoutPlan | null;
  checkInsPage: number;
  checkInsPageSize: number;
  checkInsTotal: number;
  checkInsHasMore: boolean;
  completedForms: any[];
}

// In-memory cache for client details (expires after 30s)
const clientDetailCache: Record<string, { data: any; expires: number }> = {};

export const loader: import("@remix-run/node").LoaderFunction = async ({
  params,
  request,
}) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const clientIdParam = params.clientId;

  // Debug logging
  

  // Parse pagination params for check-ins
  const url = new URL(request.url);
  const checkInsPage = parseInt(url.searchParams.get("checkInsPage") || "1", 10);
  const checkInsPageSize = parseInt(url.searchParams.get("checkInsPageSize") || "10", 10);
  const checkInsOffset = (checkInsPage - 1) * checkInsPageSize;

  // Check cache (per client)
  if (clientIdParam && clientDetailCache[clientIdParam] && clientDetailCache[clientIdParam].expires > Date.now()) {
    return json(clientDetailCache[clientIdParam].data);
  }

  // Try to find client by slug first
  let { data: client, error } = await supabase
    .from("users")
    .select(
      "id, name, email, goal, starting_weight, current_weight, workout_split, role, coach_id, slug, created_at"
    )
    .eq("slug", clientIdParam)
    .single();

  

  if (client) {
    client.id = String(client.id);
    client.slug = client.slug ? String(client.slug) : "";
    client.name = client.name ? String(client.name) : "";
    client.email = client.email ? String(client.email) : "";
    client.goal = client.goal ? String(client.goal) : "";
    client.workout_split = client.workout_split || "";
    client.role = client.role ? String(client.role) : "client";
    client.coach_id = client.coach_id ? String(client.coach_id) : "";
  }

  // If not found by slug, try by id
  if (error || !client) {
    const { data: clientById, error: errorById } = await supabase
      .from("users")
      .select(
        "id, name, email, goal, starting_weight, current_weight, workout_split, role, coach_id, slug, created_at"
      )
      .eq("id", clientIdParam)
      .single();
    console.log("[DEBUG] client by id:", clientById, errorById);
    if (clientById) {
      clientById.id = String(clientById.id);
      clientById.slug = clientById.slug ? String(clientById.slug) : "";
      clientById.name = clientById.name ? String(clientById.name) : "";
      clientById.email = clientById.email ? String(clientById.email) : "";
      clientById.goal = clientById.goal ? String(clientById.goal) : "";
      clientById.workout_split = clientById.workout_split || "";
      clientById.role = clientById.role ? String(clientById.role) : "client";
      clientById.coach_id = clientById.coach_id
        ? String(clientById.coach_id)
        : "";
    }
    client = clientById;
    error = errorById;
  }

  

  if (error || !client) {
    const fallbackClient = {
      id: clientIdParam || "",
      name: "Unknown Client",
      email: "",
      goal: "",
      starting_weight: 0,
      current_weight: 0,
      workout_split: "",
      role: "client",
      coach_id: "",
      slug: "",
    };
    return json({
      client: fallbackClient,
      updates: [],
      allUpdates: [],
      checkIns: [],
      mealPlans: [],
      supplements: [],
      checkInsPage: 1,
      checkInsPageSize: 10,
      checkInsTotal: 0,
      checkInsHasMore: false,
    });
  }

  // Fetch all data in parallel
  const [
    updatesRaw,
    allUpdatesRaw,
    checkInsRaw,
    mealPlansRaw,
    workoutPlansRaw,
    supplementsRaw,
    weightLogsRaw,
    completedFormsRaw
  ] = await Promise.all([
    // Updates from last 7 days
    supabase
      .from("coach_updates")
      .select("id, coach_id, client_id, message, created_at, updated_at")
      .eq("client_id", client.id)
      .gte("created_at", dayjs().subtract(7, 'day').toISOString())
      .order("created_at", { ascending: false }),
    // All updates
    supabase
      .from("coach_updates")
      .select("id, coach_id, client_id, message, created_at, updated_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    // Paginated check-ins
    supabase
      .from("check_ins")
      .select("id, notes, created_at, video_url, audio_url, recording_type, recording_duration, recording_thumbnail_url, transcript", { count: "exact" })
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .range(checkInsOffset, checkInsOffset + checkInsPageSize - 1),
    // Meal plans
    supabase
      .from("meal_plans")
      .select("id, title, description, is_active, created_at")
      .eq("user_id", client.id)
      .order("created_at", { ascending: false }),
    // Workout plans
    supabase
      .from("workout_plans")
      .select("id, title, is_active")
      .eq("user_id", client.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    // Supplements
    supabase
      .from("supplements")
      .select("id, name, user_id")
      .eq("user_id", client.id)
      .order("created_at", { ascending: false }),
    // Weight logs
    supabase
      .from("weight_logs")
      .select("id, weight, logged_at")
      .eq("user_id", client.id)
      .order("logged_at", { ascending: true }),
    // Completed check-in forms
    supabase
      .from("check_in_form_instances")
      .select(`
        id,
        form_id,
        client_id,
        sent_at,
        completed_at,
        status,
        expires_at
      `)
      .eq("client_id", client.id)
      .in("status", ["completed", "expired"])
      .order("sent_at", { ascending: false }),

  ]);

  // Batch fetch all meals for all meal plans
  let mealPlans: any[] = [];
  let activeMealPlan = null;
  if (mealPlansRaw?.data && mealPlansRaw.data.length > 0) {
    const mealPlanIds = mealPlansRaw.data.map((plan: any) => plan.id);
    const { data: mealsRaw } = await supabase
      .from("meals")
      .select("id, name, time, sequence_order, meal_plan_id")
      .in("meal_plan_id", mealPlanIds);
    const mealIds = (mealsRaw || []).map((meal: any) => meal.id);
    const { data: foodsRaw } = await supabase
      .from("foods")
      .select("id, name, portion, calories, protein, carbs, fat, meal_id")
      .in("meal_id", mealIds);
    // Group foods by meal
    const foodsByMeal: Record<number, Food[]> = {};
    (foodsRaw || []).forEach((food: any) => {
      if (!foodsByMeal[food.meal_id]) foodsByMeal[food.meal_id] = [];
      foodsByMeal[food.meal_id].push(food);
    });
    // Group meals by meal plan
    const mealsByPlan: Record<string, Meal[]> = {};
    (mealsRaw || []).forEach((meal: any) => {
      if (!mealsByPlan[meal.meal_plan_id]) mealsByPlan[meal.meal_plan_id] = [];
      mealsByPlan[meal.meal_plan_id].push({ ...meal, foods: foodsByMeal[meal.id] || [] });
    });
    // Attach meals to meal plans
    mealPlans = mealPlansRaw.data.map((plan: any) => ({
      ...plan,
      meals: mealsByPlan[plan.id] || []
    }));
    activeMealPlan = mealPlans.find((p: any) => p.is_active) || null;
  }

  const activeWorkoutPlan =
    workoutPlansRaw?.data && workoutPlansRaw.data.length > 0 ? workoutPlansRaw.data[0] : null;
  const supplements = supplementsRaw?.data || [];
  const weightLogs = weightLogsRaw?.data || [];

  // Process completed check-in forms
  let completedForms: any[] = [];
  if (completedFormsRaw?.data && completedFormsRaw.data.length > 0) {
    // Fetch complete form data with responses and questions
    completedForms = await Promise.all(
      completedFormsRaw.data.map(async (instance: any) => {
        // Fetch form data
        const { data: formData } = await supabase
          .from("check_in_forms")
          .select("id, title, description")
          .eq("id", instance.form_id)
          .single();

        // Fetch responses for this instance
        const { data: responses } = await supabase
          .from("check_in_form_responses")
          .select(`
            id,
            question_id,
            response_text,
            response_number,
            response_options
          `)
          .eq("instance_id", instance.id);

        // Fetch questions for the responses
        let responsesWithQuestions: any[] = [];
        if (responses && responses.length > 0) {
          responsesWithQuestions = await Promise.all(
            responses.map(async (response: any) => {
              const { data: questionData } = await supabase
                .from("check_in_form_questions")
                .select("id, question_text, question_type")
                .eq("id", response.question_id)
                .single();

              return {
                id: response.id,
                question_id: response.question_id,
                response_text: response.response_text,
                response_number: response.response_number,
                response_options: response.response_options,
                question: questionData ? {
                  question_text: questionData.question_text,
                  question_type: questionData.question_type,
                } : {
                  question_text: 'Unknown Question',
                  question_type: 'text',
                },
              };
            })
          );
        }

        return {
          id: instance.id,
          form_id: instance.form_id,
          client_id: instance.client_id,
          sent_at: instance.sent_at,
          completed_at: instance.completed_at,
          status: instance.status,
          expires_at: instance.expires_at,
          form: {
            title: formData?.title || 'Untitled Form',
            description: formData?.description,
          },
          client: {
            name: client.name || 'Unknown Client',
          },
          responses: responsesWithQuestions,
        };
      })
    );
  }

  // For check-ins, add pagination info
  const checkIns = checkInsRaw?.data || [];
  const checkInsTotal = checkInsRaw?.count || 0;
  const checkInsHasMore = checkInsOffset + checkIns.length < checkInsTotal;

  const result = {
    client,
    updates: updatesRaw?.data || [],
    allUpdates: allUpdatesRaw?.data || [],
    checkIns,
    checkInsPage,
    checkInsPageSize,
    checkInsTotal,
    checkInsHasMore,
    mealPlans: mealPlans || [],
    supplements,
    weightLogs,
    activeMealPlan,
    activeWorkoutPlan,
    completedForms,
  };
  // Cache result
  if (clientIdParam) {
    clientDetailCache[clientIdParam] = { data: result, expires: Date.now() + 30_000 };
  }
  return json(result);
};

export const action: import("@remix-run/node").ActionFunction = async ({ request, params }) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  const message = formData.get("message")?.toString();
  const notes = formData.get("notes")?.toString();
  const id = formData.get("id")?.toString();

  // Find client by slug or id
  let { data: client, error } = await supabase
    .from("users")
    .select("id, coach_id")
    .eq("slug", params.clientId)
    .single();
  if (!client || error) {
    const { data: clientById } = await supabase
      .from("users")
      .select("id, coach_id")
      .eq("id", params.clientId)
      .single();
    client = clientById;
  }
  if (!client) {
    return json({ error: "Client not found" }, { status: 404 });
  }
  const coach_id = client.coach_id;

  // CRUD for coach_updates
  if (intent === "addUpdate" && message) {
    // Get client's information including email notification preference and coach information
    const { data: clientData } = await supabase
      .from("users")
      .select("id, name, email, email_notifications")
      .eq("id", client.id)
      .single();

    const { data: coachData } = await supabase
      .from("users")
      .select("id, name")
      .eq("id", coach_id)
      .single();

    const { data, error } = await supabase
      .from("coach_updates")
      .insert({ coach_id, client_id: client.id, message })
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to add update" }, { status: 500 });
    }

    // Send email notification if client has email notifications enabled
    if (clientData?.email_notifications && clientData.email && coachData?.name) {
      try {
        await resend.emails.send({
          from: "Kava Training <noreply@kavatraining.com>",
          to: clientData.email,
          subject: `New update from your coach ${coachData.name}!`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                <h1 style="margin: 0; font-size: 24px; font-weight: bold;">New Update from Your Coach!</h1>
              </div>
              
              <div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
                <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px;">Hi ${clientData.name},</p>
                
                <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">
                  Your coach <strong>${coachData.name}</strong> has sent you a new update!
                </p>
                
                <div style="background: #f3f4f6; border-left: 4px solid #6366f1; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #374151; font-style: italic;">"${message}"</p>
                </div>
                
                <p style="margin: 20px 0; color: #374151; font-size: 16px;">
                  Log in to your Kava Training dashboard to see this update and respond to your coach.
                </p>
                
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:3000'}/dashboard" 
                     style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                    View Update
                  </a>
                </div>
                
                <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px; text-align: center;">
                  <p style="margin: 0; color: #6b7280; font-size: 14px;">
                    Keep crushing your fitness goals! 💪
                  </p>
                  <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">
                    You can manage your notification preferences in your dashboard settings.
                  </p>
                </div>
              </div>
            </div>
          `,
        });
      } catch (emailError) {
        // Log the email error but don't fail the request
        console.error("Failed to send email notification:", emailError);
        // The coach update was still created successfully
      }
    }

    return json({ update: data });
  }
  if (intent === "editUpdate" && id && message) {
    const { data, error } = await supabase
      .from("coach_updates")
      .update({ message, updated_at: getCurrentTimestampISO() })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to update message" }, { status: 500 });
    }
    return json({ update: data });
  }
  if (intent === "deleteUpdate" && id) {
    const { data, error } = await supabase
      .from("coach_updates")
      .delete()
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to delete update" }, { status: 500 });
    }
    return json({ deletedUpdate: data });
  }

  // CRUD for check_ins
  if (intent === "addCheckIn" && notes) {
    const { data, error } = await supabase
      .from("check_ins")
      .insert({ client_id: client.id, coach_id, notes })
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to add check-in" }, { status: 500 });
    }

    // Create an automatic coach update notification for text check-ins
    const { error: updateError } = await supabase
      .from("coach_updates")
      .insert({
        coach_id: coach_id,
        client_id: client.id,
        message: '💬 Check-in message received from coach!',
      });

    if (updateError) {
      console.error('Error creating automatic update notification:', updateError);
      // Don't fail the whole request if the notification fails
    }

    return json({ checkIn: data });
  }
  if (intent === "editCheckIn" && id && notes) {
    const { data, error } = await supabase
      .from("check_ins")
      .update({ notes })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to update check-in" }, { status: 500 });
    }
    return json({ checkIn: data });
  }
  if (intent === "deleteCheckIn" && id) {
    const { data, error } = await supabase
      .from("check_ins")
      .delete()
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to delete check-in" }, { status: 500 });
    }
    return json({ deletedCheckIn: data });
  }

  return json({ error: "No valid data or intent provided" }, { status: 400 });
};

// Utility to get the start of the week (Sunday) for a given date using dayjs
function getWeekStart(dateStr: string) {
  return dayjs(dateStr).startOf('week').valueOf(); // dayjs uses Sunday as start of week by default
}

// Helper to format date as mm/dd/yyyy
function formatDateMMDDYYYY(dateStr: string) {
  const date = new Date(dateStr);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// Helper to format week range (Sunday - Saturday)
function formatWeekRange(weekStartTimestamp: number) {
  const start = dayjs(weekStartTimestamp);
  const end = start.add(6, 'day');
  return `${start.format('MM/DD')} - ${end.format('MM/DD/YYYY')}`;
}

// Helper to filter updates that are within the last 7 days
function filterUpdatesWithinSevenDays(updates: Update[]): Update[] {
  const sevenDaysAgo = dayjs().subtract(7, 'day');
  return updates.filter(update => dayjs(update.created_at).isAfter(sevenDaysAgo));
}

export default function ClientDetails() {
  const toast = useToast();
  const {
    client,
    updates: loaderUpdates,
    allUpdates: loaderAllUpdates,
    checkIns: loaderCheckIns,
    weightLogs = [],
    activeMealPlan,
    activeWorkoutPlan,
    supplements,
    checkInsPage,
    checkInsPageSize,
    checkInsTotal,
    checkInsHasMore,
    completedForms: loaderCompletedForms,
  } = useLoaderData<LoaderData>();
  const [showAddMessage, setShowAddMessage] = useState(false);
  const [showAddCheckIn, setShowAddCheckIn] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showUpdateHistory, setShowUpdateHistory] = useState(false);
  const [showMediaPlayer, setShowMediaPlayer] = useState(false);
  const [currentMedia, setCurrentMedia] = useState<{
    videoUrl?: string;
    audioUrl?: string;
    recordingType?: 'video' | 'audio' | 'text' | 'video_audio';
    title: string;
    transcript?: string;
  } | null>(null);
  const [showProgressPhotos, setShowProgressPhotos] = useState(false);
  const [showCreateCheckInForm, setShowCreateCheckInForm] = useState(false);
  const [showSendCheckInForm, setShowSendCheckInForm] = useState(false);
  const [showViewForms, setShowViewForms] = useState(false);
  const [showFormResponseViewer, setShowFormResponseViewer] = useState(false);
  const [currentFormResponse, setCurrentFormResponse] = useState<any>(null);
  const [showFormHistory, setShowFormHistory] = useState(false);
  const [completedForms, setCompletedForms] = useState<any[]>(loaderCompletedForms);
  const [editingForm, setEditingForm] = useState<FormTemplate | null>(null);
  const [formsRefreshToken, setFormsRefreshToken] = useState(0);
  const fetcher = useFetcher();

  // Local state for updates, checkIns, and supplements
  const [updates, setUpdates] = useState<Update[]>(loaderUpdates); // Already filtered on server
  const [allUpdates, setAllUpdates] = useState<Update[]>(loaderAllUpdates); // All updates for history
  const [checkIns, setCheckIns] = useState<CheckInNote[]>(
    ((loaderCheckIns as CheckIn[]) || []).map((c) => ({ 
      id: c.id, 
      date: c.created_at, 
      notes: c.notes,
      video_url: c.video_url,
      audio_url: c.audio_url,
      recording_type: c.recording_type,
      recording_duration: c.recording_duration,
      recording_thumbnail_url: c.recording_thumbnail_url,
      transcript: c.transcript
    }))
  );
  const [supplementsState, setSupplements] = useState<Supplement[]>(supplements);

  // Sort checkIns by date descending
  const sortedCheckIns = [...checkIns].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Anchor to current and previous week based on today's date
  const now = dayjs();
  const thisWeekStart = now.startOf('week').valueOf();
  const lastWeekStart = now.subtract(1, 'week').startOf('week').valueOf();

  // Filter check-ins to only include recent ones (within reasonable timeframe for processing)
  const recentWeekBoundary = now.subtract(2, 'week').startOf('week').valueOf();
  const recentCheckIns = sortedCheckIns.filter(checkIn => {
    const checkInTime = dayjs(checkIn.date).valueOf();
    return checkInTime >= recentWeekBoundary; // Only keep check-ins from the last 2+ weeks for "This/Last Week" consideration
  });

  // Group recent check-ins by week start (Sunday)
  const weekGroups: { [weekStart: number]: CheckInNote[] } = {};
  for (const checkIn of recentCheckIns) {
    const weekStart = getWeekStart(checkIn.date);
    if (!weekGroups[weekStart]) weekGroups[weekStart] = [];
    weekGroups[weekStart].push(checkIn);
  }
  const weekStarts = Object.keys(weekGroups)
    .map(Number)
    .sort((a, b) => b - a);

  // More explicit filtering - only show check-ins that are exactly in the current or previous week
  const thisWeekEnd = now.endOf('week').valueOf();
  const lastWeekEnd = now.subtract(1, 'week').endOf('week').valueOf();
  
  // Find check-ins that fall exactly within this week's date range
  const thisWeekCheckIns = sortedCheckIns.filter(checkIn => {
    const checkInTime = dayjs(checkIn.date).valueOf();
    return checkInTime >= thisWeekStart && checkInTime <= thisWeekEnd;
  });
  
  // Find check-ins that fall exactly within last week's date range
  const lastWeekCheckIns = sortedCheckIns.filter(checkIn => {
    const checkInTime = dayjs(checkIn.date).valueOf();
    return checkInTime >= lastWeekStart && checkInTime <= lastWeekEnd;
  });
  
  // For this week: prioritize check-ins with recordings, then most recent
  const thisWeekCheckIn = thisWeekCheckIns.length > 0 ? 
    (thisWeekCheckIns.find(ci => ci.video_url || ci.audio_url) || thisWeekCheckIns[0]) : null;
  
  // For last week: prioritize check-ins with recordings, then most recent
  // But only show them if we're within 1 day of the end of that week
  const lastWeekCheckIn = (() => {
    const oneDayAfterLastWeek = dayjs(lastWeekEnd).add(1, 'day').valueOf();
    
    // If current date is more than 1 day past the end of last week, move to history
    if (now.valueOf() > oneDayAfterLastWeek) {
      return null;
    }
    
    return lastWeekCheckIns.length > 0 ? 
      (lastWeekCheckIns.find(ci => ci.video_url || ci.audio_url) || lastWeekCheckIns[0]) : null;
  })();

  // New history state
  const [historyCheckIns, setHistoryCheckIns] = useState<CheckInNote[]>([]);
  const [historyPage, setHistoryPage] = useState(checkInsPage);
  const [historyHasMore, setHistoryHasMore] = useState(checkInsHasMore);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyFetcher = useFetcher();

  // When loader data changes (first load), set initial history state
  useEffect(() => {
    setHistoryCheckIns(
      ((loaderCheckIns as CheckIn[]) || []).map((c) => ({ id: c.id, date: c.created_at, notes: c.notes }))
    );
    setHistoryPage(checkInsPage);
    setHistoryHasMore(checkInsHasMore);
  }, [loaderCheckIns, checkInsPage, checkInsHasMore]);



  // When historyFetcher loads more, append to historyCheckIns
  useEffect(() => {
    if (historyFetcher.data && historyFetcher.state === "idle") {
      const data = historyFetcher.data as {
        checkIns: CheckIn[];
        checkInsPage: number;
        checkInsHasMore: boolean;
      };
      setHistoryCheckIns((prev) => [
        ...prev,
        ...(data.checkIns || []).map((c) => ({ id: c.id, date: c.created_at, notes: c.notes })),
      ]);
      setHistoryPage(data.checkInsPage || historyPage + 1);
      setHistoryHasMore(data.checkInsHasMore ?? false);
      setHistoryLoading(false);
    }
  }, [historyFetcher.data, historyFetcher.state]);

  const handleLoadMoreHistory = () => {
    setHistoryLoading(true);
    historyFetcher.load(
      `/dashboard/clients/${client.slug || client.id}?checkInsPage=${historyPage + 1}`
    );
  };

  // Periodically filter out updates older than 7 days from main display
  useEffect(() => {
    const interval = setInterval(() => {
      setUpdates((prev) => filterUpdatesWithinSevenDays(prev));
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Force re-render when we cross into a new week to ensure check-ins move properly
  const [currentWeekStart, setCurrentWeekStart] = useState(() => dayjs().startOf('week').valueOf());
  
  useEffect(() => {
    const interval = setInterval(() => {
      const newWeekStart = dayjs().startOf('week').valueOf();
      if (newWeekStart !== currentWeekStart) {
        setCurrentWeekStart(newWeekStart);
        // This will trigger a re-render and recalculate check-in positions
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [currentWeekStart]);

  // Add check-in handler (submits to API, then updates state)
  const handleAddCheckIn = (notes: string, recordingData?: { blob: Blob; duration: number; type: 'video' | 'audio' }) => {
    // If there's recording data, it will be handled by the modal's upload process
    // We just need to handle the text notes here
    if (notes.trim()) {
    fetcher.submit(
      { intent: "addCheckIn", notes },
      { method: "post" }
    );
    }
    setShowAddCheckIn(false);
  };

  // Add update handler (submits to API, then updates state)
  const handleAddUpdate = (message: string) => {
    fetcher.submit(
      { intent: "addUpdate", message },
      { method: "post" }
    );
    setShowAddMessage(false);
  };

  // Update local state after fetcher completes
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const data: any = fetcher.data;
      if (data.checkIn) {
        setCheckIns((prev) => [{ id: data.checkIn.id, date: data.checkIn.created_at, notes: data.checkIn.notes }, ...prev]);
      }
      if (data.update) {
        setUpdates((prev) => filterUpdatesWithinSevenDays([data.update, ...prev]));
        setAllUpdates((prev) => [data.update, ...prev]);
      }
      if (data.deletedUpdate) {
        setUpdates((prev) => prev.filter((u) => u.id !== data.deletedUpdate.id));
        setAllUpdates((prev) => prev.filter((u) => u.id !== data.deletedUpdate.id));
      }
      if (data.deletedCheckIn) {
        setCheckIns((prev) => prev.filter((c) => c.id !== data.deletedCheckIn.id));
      }
      // Handle supplements add/delete (assume data.supplement or data.deletedSupplement)
      if (data.supplement) {
        setSupplements((prev) => [data.supplement, ...prev]);
      }
      if (data.deletedSupplement) {
        setSupplements((prev) => prev.filter((s) => s.id !== data.deletedSupplement.id));
      }
    }
  }, [fetcher.state, fetcher.data]);

  // Weight chart data
  const hasWeightLogs = weightLogs && weightLogs.length > 0;
  const chartData = hasWeightLogs
    ? (weightLogs as WeightLog[]).map((w) => ({
        date: w.logged_at,
        weight: Number(w.weight),
      }))
    : [];
  const startWeight = hasWeightLogs
    ? chartData[0].weight
    : client.starting_weight ?? 0;
  const currentWeight = hasWeightLogs
    ? chartData[chartData.length - 1].weight
    : client.current_weight ?? 0;
  const totalChange = currentWeight - startWeight;

  // Prepare real data for ClientProfile
  const safeMeals = (activeMealPlan?.meals || []).map((meal) => ({
    ...meal,
    id: typeof meal.id === "number" ? meal.id : parseInt(meal.id) || 0,
    foods: (meal.foods || []).map((food) => ({
      ...food,
      id: typeof food.id === "number" ? food.id : parseInt(food.id) || 0,
    })),
  }));
  let macros = { protein: 0, carbs: 0, fat: 0 };
  if (safeMeals.length > 0) {
    macros = calculateMacros(safeMeals);
  }
  const workoutSplit =
    activeWorkoutPlan?.title || client.workout_split || "N/A";
  const supplementCount = supplementsState?.length || 0;

  // Edit handlers for updates
  const deleteUpdate = (id: string) => {
    fetcher.submit(
      { intent: "deleteUpdate", id },
      { method: "post" }
    );
  };

  // Edit handlers for check-ins
  const deleteCheckIn = (id: string) => {
    fetcher.submit(
      { intent: "deleteCheckIn", id },
      { method: "post" }
    );
  };

  // Check-in form handlers
  const handleSaveCheckInForm = async (formData: FormTemplate) => {
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("title", formData.title);
      formDataToSend.append("description", formData.description ?? "");
      formDataToSend.append(
        "questions",
        JSON.stringify(
          (formData.questions || []).map((question, index) => ({
            id: question.id,
            persistedId: question.persistedId ?? null,
            question_text: question.question_text,
            question_type: question.question_type,
            is_required: question.is_required,
            options: (question.options || []).filter((option) => option && option.trim().length > 0),
            order_index: index,
          }))
        )
      );

      const endpoint = formData.id
        ? `/api/update-check-in-form/${formData.id}`
        : "/api/create-check-in-form";

      const response = await fetch(endpoint, {
        method: "POST",
        body: formDataToSend,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save form");
      }

      if (formData.id) {
        toast.success(
          "Form Updated",
          `"${formData.title}" has been updated successfully.`
        );
      } else {
        toast.success(
          "Form Created Successfully",
          `"${formData.title}" has been saved and is ready to send to clients.`
        );
      }

      setEditingForm(null);
      setShowCreateCheckInForm(false);
      setFormsRefreshToken((prev) => prev + 1);
    } catch (error) {
      console.error("Error saving form:", error);
      toast.error(
        "Failed to Save Form",
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    }
  };

  const handleSendCheckInForm = async (formId: string, expiresInDays: number) => {
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("formId", formId);
      formDataToSend.append("clientId", client.id);
      formDataToSend.append("expiresInDays", expiresInDays.toString());

      // Add mobile-specific logging
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      console.log('Sending check-in form:', { 
        formId, 
        clientId: client.id, 
        expiresInDays, 
        isMobile,
        userAgent: navigator.userAgent 
      });

      // Mobile-friendly fetch with retry logic
      const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
        for (let i = 0; i < retries; i++) {
          try {
            const response = await fetch(url, {
              ...options,
              // Mobile-specific timeout
              signal: AbortSignal.timeout(isMobile ? 30000 : 10000),
            });
            return response;
          } catch (error) {
            if (i === retries - 1) throw error;
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
          }
        }
        throw new Error('Max retries exceeded');
      };

      const response = await fetchWithRetry('/api/send-check-in-form', {
        method: 'POST',
        body: formDataToSend,
        // Add mobile-specific headers (don't set Content-Type for FormData)
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Form submission failed:', { 
          status: response.status, 
          statusText: response.statusText, 
          errorData,
          isMobile 
        });
        throw new Error(errorData.error || 'Failed to send form');
      }

      const result = await response.json();
      
      // Show success toast
      toast.success(
        "Form Sent Successfully", 
        `Check-in form has been sent to ${client.name || 'client'} and will expire in ${expiresInDays} days.`
      );
      
      // Add the automatic update to the local state
      if (result.instance) {
        const newUpdate: Update = {
          id: `temp-${Date.now()}`,
          coach_id: client.coach_id || '',
          client_id: client.id,
          message: `${result.instance.form?.title || 'Form'} sent!`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        setUpdates((prev) => filterUpdatesWithinSevenDays([newUpdate, ...prev]));
        setAllUpdates((prev) => [newUpdate, ...prev]);
      }
      
      // Close the modal
      setShowSendCheckInForm(false);
      
    } catch (error) {
      console.error('Error sending form:', error);
      toast.error(
        "Failed to Send Form", 
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
    }
  };

  // Handler to view form response
  const handleViewFormResponse = (formInstance: any) => {
    setCurrentFormResponse(formInstance);
    setShowFormResponseViewer(true);
  };

  return (
    <ClientDetailLayout>
      <div className="h-full p-4 sm:p-6 overflow-y-auto">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <ClientProfile
                client={{
                  id: client.id,
                  name: client.name || "Unnamed",
                  startingWeight: startWeight,
                  currentWeight: currentWeight,
                  currentMacros: macros,
                  workoutSplit,
                  supplementCount,
                  goal: client.goal || "N/A",
                }}
                mealPlan={{ meals: safeMeals }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column with two stacked cards */}
          <div className="space-y-6">
            <Card title="Form Manager">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                Build, send, and manage the check-in forms you use with clients.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Tooltip content="Build a new check-in form template for future use." className="w-full block">
                  <button
                    onClick={() => {
                      setEditingForm(null);
                      setShowViewForms(false);
                      setShowCreateCheckInForm(true);
                    }}
                    className="group w-full rounded-xl border border-gray-light dark:border-davyGray bg-white dark:bg-night p-8 flex flex-col items-center justify-center gap-4 shadow-sm transition-all duration-200 hover:border-primary hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[140px]"
                  >
                    <span className="rounded-full bg-primary/10 p-4 text-primary transition-all duration-200 group-hover:bg-primary group-hover:text-white group-hover:scale-110">
                      <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M11 9V4a1 1 0 10-2 0v5H4a1 1 0 100 2h5v5a1 1 0 102 0v-5h5a1 1 0 100-2h-5z" />
                      </svg>
                    </span>
                    <span className="text-lg font-semibold text-secondary dark:text-alabaster">
                      Create Form
                    </span>
                  </button>
                </Tooltip>

                <Tooltip content="Send an existing form to this client with an expiration date." className="w-full block">
                  <button
                    onClick={() => {
                      setEditingForm(null);
                      setShowCreateCheckInForm(false);
                      setShowViewForms(false);
                      setShowSendCheckInForm(true);
                    }}
                    className="group w-full rounded-xl border border-gray-light dark:border-davyGray bg-white dark:bg-night p-8 flex flex-col items-center justify-center gap-4 shadow-sm transition-all duration-200 hover:border-primary hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[140px]"
                  >
                    <span className="rounded-full bg-primary/10 p-4 text-primary transition-all duration-200 group-hover:bg-primary group-hover:text-white group-hover:scale-110">
                      <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2.94 2.94a1.5 1.5 0 011.58-.33l12 4.5a1.5 1.5 0 010 2.78l-12 4.5A1.5 1.5 0 012 13.5v-3.086a1 1 0 01.293-.707L5 7.293a1 1 0 011.414 1.414L4.414 10H8a1 1 0 010 2H4.414l1.999 1.999A1 1 0 014.999 15h-.003a1 1 0 01-.706-.293L2.293 12.707A1 1 0 012 12v-9a1 1 0 01.94-.06z" />
                      </svg>
                    </span>
                    <span className="text-lg font-semibold text-secondary dark:text-alabaster">
                      Send Form
                    </span>
                  </button>
                </Tooltip>

                <Tooltip content="Review and edit the forms you've already created." className="w-full block">
                  <button
                    onClick={() => {
                      setEditingForm(null);
                      setShowCreateCheckInForm(false);
                      setShowSendCheckInForm(false);
                      setShowViewForms(true);
                    }}
                    className="group w-full rounded-xl border border-gray-light dark:border-davyGray bg-white dark:bg-night p-8 flex flex-col items-center justify-center gap-4 shadow-sm transition-all duration-200 hover:border-primary hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[140px]"
                  >
                    <span className="rounded-full bg-primary/10 p-4 text-primary transition-all duration-200 group-hover:bg-primary group-hover:text-white group-hover:scale-110">
                      <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zM7 9a1 1 0 012 0v3a1 1 0 11-2 0V9zm4-1a1 1 0 100 2h1a1 1 0 110 2h-1a1 1 0 100 2 1 1 0 100 2h1a3 3 0 000-6h-1V8a1 1 0 10-2 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <span className="text-lg font-semibold text-secondary dark:text-alabaster">
                      View Forms
                    </span>
                  </button>
                </Tooltip>
              </div>
            </Card>

            {/* Updates to Client */}
            <Card
              title={
                <div className="flex items-center justify-between w-full">
                  <span>Updates to Client</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowUpdateHistory(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      History
                    </button>
                    <button
                      onClick={() => setShowAddMessage(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      +Add Message
                    </button>
                  </div>
                </div>
              }
            >
              <div className="space-y-4">
                {updates.length === 0 ? (
                  <div className="text-gray-500 text-sm">No updates yet.</div>
                ) : (
                  updates.map((update) => (
                    <div
                      key={update.id}
                      className="border-b border-gray-light dark:border-davyGray pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
                          {new Date(update.created_at).toLocaleDateString()}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="text-xs text-red-500 hover:underline"
                            onClick={() => deleteUpdate(update.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="text-secondary dark:text-alabaster">
                        {update.message}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </Card>
            <UpdateHistoryModal
              isOpen={showUpdateHistory}
              onClose={() => setShowUpdateHistory(false)}
              updates={allUpdates}
              emptyMessage="No updates yet."
              onLoadMore={handleLoadMoreHistory}
              hasMore={historyHasMore}
            />

            {/* Check In Notes */}
            <Card
              title={
                <div className="flex items-center justify-between w-full">
                  <span>Check In Notes</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowHistory(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      History
                    </button>
                    <button
                      onClick={() => setShowAddCheckIn(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      +Add Check In
                    </button>
                  </div>
                </div>
              }
            >
              <div className="space-y-6">
                {/* Last Week Section */}
                <div>
                  <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                    Last Week ({formatWeekRange(lastWeekStart)})
                  </h4>
                  {lastWeekCheckIn ? (
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{formatDateMMDDYYYY(lastWeekCheckIn.date)}</span>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-gray-dark dark:text-gray-light mb-0">
                            {lastWeekCheckIn.notes.length > 50 
                              ? `${lastWeekCheckIn.notes.substring(0, 50)}...` 
                              : lastWeekCheckIn.notes}
                          </p>
                          {(lastWeekCheckIn.video_url || lastWeekCheckIn.audio_url) && (
                            <button
                              onClick={() => {
                                const videoUrl = lastWeekCheckIn.video_url;
                                const audioUrl = lastWeekCheckIn.audio_url;
                                const recordingType = lastWeekCheckIn.recording_type;
                                const transcript = lastWeekCheckIn.transcript;
                                if (videoUrl || audioUrl) {
                                  setCurrentMedia({
                                    videoUrl,
                                    audioUrl,
                                    recordingType,
                                    title: "Check In Recording",
                                    transcript
                                  });
                                  setShowMediaPlayer(true);
                                }
                              }}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary/80 transition-colors"
                              title="Play recording"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                              </svg>
                              Play
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        className="text-xs text-red-500 hover:underline ml-4"
                        onClick={() => deleteCheckIn(lastWeekCheckIn.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <div className="italic text-gray-400 text-sm">No Previous Check In Yet.</div>
                  )}
                </div>
                {/* This Week Section */}
                <div>
                  <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
                    This Week ({formatWeekRange(thisWeekStart)})
                  </h4>
                  {thisWeekCheckIn ? (
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{formatDateMMDDYYYY(thisWeekCheckIn.date)}</span>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-gray-dark dark:text-gray-light mb-0">
                            {thisWeekCheckIn.notes.length > 50 
                              ? `${thisWeekCheckIn.notes.substring(0, 50)}...` 
                              : thisWeekCheckIn.notes}
                          </p>
                          {(thisWeekCheckIn.video_url || thisWeekCheckIn.audio_url) && (
                            <button
                              onClick={() => {
                                const videoUrl = thisWeekCheckIn.video_url;
                                const audioUrl = thisWeekCheckIn.audio_url;
                                const recordingType = thisWeekCheckIn.recording_type;
                                const transcript = thisWeekCheckIn.transcript;
                                if (videoUrl || audioUrl) {
                                  setCurrentMedia({
                                    videoUrl,
                                    audioUrl,
                                    recordingType,
                                    title: "Check In Recording",
                                    transcript
                                  });
                                  setShowMediaPlayer(true);
                                }
                              }}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary/80 transition-colors"
                              title="Play recording"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                              </svg>
                              Play
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        className="text-xs text-red-500 hover:underline ml-4"
                        onClick={() => deleteCheckIn(thisWeekCheckIn.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <div className="italic text-gray-400 text-sm">Add This Week&apos;s Check In.</div>
                  )}
                </div>
              </div>
            </Card>

            {/* Completed Check-In Forms */}
            {(() => {
              // Filter to show only very recent forms (last 7 days)
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
              
              const recentForms = completedForms.filter(form => 
                new Date(form.completed_at) >= sevenDaysAgo
              );
              
              if (completedForms.length > 0) {
                return (
                  <Card title={
                    <div className="flex items-center justify-between w-full">
                      <span>Completed Check-In Forms</span>
                      <button
                        onClick={() => setShowFormHistory(true)}
                        className="text-sm text-primary hover:underline"
                      >
                        View History
                      </button>
                    </div>
                  }>
                    <div className="space-y-3">
                      {recentForms.length > 0 ? (
                        recentForms.map((form) => (
                          <div
                            key={form.id}
                            className="border border-gray-light dark:border-davyGray rounded-lg p-3 bg-green-50 dark:bg-green-900/20"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium text-secondary dark:text-alabaster">
                                  {form.form.title}
                                </h4>
                                {form.form.description && (
                                  <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                                    {form.form.description}
                                  </p>
                                )}
                                <div className="text-xs text-gray-dark dark:text-gray-light mt-2">
                                  Completed: {new Date(form.completed_at).toLocaleDateString()}
                                </div>
                              </div>
                              <button
                                onClick={() => handleViewFormResponse(form)}
                                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors text-sm font-medium"
                              >
                                View Responses
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                          <p>No recent completed forms</p>
                          <button
                            onClick={() => setShowFormHistory(true)}
                            className="text-sm text-primary hover:underline mt-2"
                          >
                            View all forms
                          </button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              }
              return null;
            })()}


          </div>

          {/* Weight Chart */}
          <div className="lg:col-span-2">
            <Card title={
              <div className="flex items-center justify-between w-full">
                <span>Weight Progress</span>
                <button
                  onClick={() => setShowProgressPhotos(true)}
                  className="text-sm text-primary hover:underline"
                >
                  View Progress Photos
                </button>
              </div>
            }>
              <div className="w-full" style={{ height: 350 }}>
                {hasWeightLogs ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} />
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-dark dark:text-gray-light mb-4">
                    No weight history yet.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>

        <AddMessageModal
          isOpen={showAddMessage}
          onClose={() => setShowAddMessage(false)}
          onSubmit={handleAddUpdate}
        />

        <AddCheckInModal
          isOpen={showAddCheckIn}
          onClose={() => setShowAddCheckIn(false)}
          onSubmit={handleAddCheckIn}
          lastWeekNotes={thisWeekCheckIn ? thisWeekCheckIn.notes : ""}
          clientId={client.id}
          completedForms={completedForms}
        />

        <CheckInHistoryModal
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          checkIns={historyCheckIns.map((c) => ({
            ...c,
            formattedDate: formatDateMMDDYYYY(c.date),
            weekRange: formatWeekRange(getWeekStart(c.date)),
          }))}
          onLoadMore={handleLoadMoreHistory}
          hasMore={historyHasMore}
          emptyMessage="No history yet."
        />

        {/* Media Player Modal */}
        {currentMedia && (
          <MediaPlayerModal
            isOpen={showMediaPlayer}
            onClose={() => {
              setShowMediaPlayer(false);
              setCurrentMedia(null);
            }}
            videoUrl={currentMedia.videoUrl}
            audioUrl={currentMedia.audioUrl}
            recordingType={currentMedia.recordingType}
            title={currentMedia.title}
            transcript={currentMedia.transcript}
          />
        )}

        {/* Progress Photos Modal */}
        <ProgressPhotosModal
          isOpen={showProgressPhotos}
          onClose={() => setShowProgressPhotos(false)}
          clientId={client.id}
          clientName={client.name}
          onPhotoDeleted={(photoId: string) => {
            // Photo deletion is handled within the modal
          }}
        />

        {/* Check-In Form Modals */}
        <CreateCheckInFormModal
          isOpen={showCreateCheckInForm}
          onClose={() => {
            setShowCreateCheckInForm(false);
            setEditingForm(null);
          }}
          onSubmit={handleSaveCheckInForm}
          initialForm={editingForm}
          mode={editingForm ? "edit" : "create"}
        />

        <SendCheckInFormModal
          isOpen={showSendCheckInForm}
          onClose={() => setShowSendCheckInForm(false)}
          clientId={client.id}
          clientName={client.name}
          onSubmit={handleSendCheckInForm}
        />

        <ViewCheckInFormsModal
          isOpen={showViewForms}
          onClose={() => setShowViewForms(false)}
          onEdit={(form) => {
            setEditingForm(form);
            setShowViewForms(false);
            setShowCreateCheckInForm(true);
          }}
          refreshToken={formsRefreshToken}
        />

        {/* Form Response Viewer Modal */}
        {currentFormResponse && (
          <CheckInFormResponseViewer
            isOpen={showFormResponseViewer}
            onClose={() => {
              setShowFormResponseViewer(false);
              setCurrentFormResponse(null);
            }}
            formInstance={currentFormResponse}
          />
        )}

        {/* Check-In Form History Modal */}
        <CheckInFormHistoryModal
          isOpen={showFormHistory}
          onClose={() => setShowFormHistory(false)}
          clientId={client.id}
          clientName={client.name}
        />

      </div>
    </ClientDetailLayout>
  );
}
