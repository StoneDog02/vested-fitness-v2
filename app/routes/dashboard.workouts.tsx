import { useState, useEffect } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import NABadge from "~/components/ui/NABadge";
import WorkoutCard from "~/components/workout/WorkoutCard";
import { DailyWorkout, Exercise } from "~/types/workout";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import type { LoaderFunction } from "@remix-run/node";
import dayjs from "dayjs";
import { 
  getCurrentDate, 
  getCurrentDateISO, 
  getCurrentTimestampISO,
  getStartOfWeek,
  isToday,
  isFuture,
  USER_TIMEZONE 
} from "~/lib/timezone";

export const meta: MetaFunction = () => {
  return [
    { title: "Workouts | Kava Training" },
    { name: "description", content: "View and track your workout plans" },
  ];
};

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

  const currentDate = getCurrentDate();
  const currentDateStr = currentDate.format("YYYY-MM-DD");

  // Get user data
  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, email, avatar_url, created_at")
    .eq("auth_id", authId)
    .single();

  if (error || !user) {
    throw new Response("User not found", { status: 404 });
  }

  // Get ALL workout plans for this user (both active and recently deactivated)
  const { data: allPlans, error: plansError } = await supabase
    .from("workout_plans")
    .select("id, title, description, created_at, is_active, activated_at, deactivated_at")
    .eq("user_id", user.id)
    .eq("is_template", false)
    .order("activated_at", { ascending: false, nullsFirst: false });

  // Determine which plan to show to the client:
  // 1. Show active plans activated before today (normal case)
  // 2. Show plans deactivated today (they were active until today, should show until end of day)
  let activeWorkoutPlan = null;
  
  if (allPlans && allPlans.length > 0) {
    // First try to find an active plan activated before today (not on activation day)
    let planToShow = allPlans.find(plan => {
      if (!plan.is_active) {
        return false;
      }
      if (!plan.activated_at) {
        return true; // Legacy plans without activation date
      }
      const activatedDate = plan.activated_at.slice(0, 10);
      const shouldShow = activatedDate < currentDateStr;
      return shouldShow; // Only show plans activated before today (not on activation day)
    });
    
    // If no active plan found, look for plan deactivated today (was active until today)
    if (!planToShow) {
      planToShow = allPlans.find(plan => {
        if (!plan.deactivated_at) {
          return false;
        }
        const deactivatedDate = plan.deactivated_at.slice(0, 10);
        const shouldShow = deactivatedDate === currentDateStr;
        return shouldShow; // Deactivated today, so show until end of day
      });
    }
    
    if (planToShow) {
      // Get the full plan details with workout days
      const { data: workoutDaysRaw } = await supabase
        .from("workout_days")
        .select("id, day_of_week, is_rest, workout_name, workout_type")
        .eq("workout_plan_id", planToShow.id)
        .order("day_of_week");

      const workoutDays = await Promise.all(
        (workoutDaysRaw || []).map(async (day) => {
          if (day.is_rest) {
            return {
              dayOfWeek: day.day_of_week,
              isRest: true,
              exercises: [],
            };
          }

          const { data: exercisesRaw } = await supabase
            .from("workout_exercises")
            .select("exercise_name, exercise_description, sets_data, group_type, group_notes, sequence_order")
            .eq("workout_day_id", day.id)
            .order("sequence_order");

          const exercises = (exercisesRaw || []).map((exercise) => ({
            name: exercise.exercise_name,
            description: exercise.exercise_description || "",
            sets: exercise.sets_data || [],
            groupType: exercise.group_type,
            groupNotes: exercise.group_notes || "",
          }));

          return {
            dayOfWeek: day.day_of_week,
            isRest: false,
            workoutName: day.workout_name || "",
            workoutType: day.workout_type || "",
            exercises,
          };
        })
      );

      activeWorkoutPlan = {
        id: planToShow.id,
        name: planToShow.title,
        description: planToShow.description || "",
        days: workoutDays,
      };
    }
  }

  // Calculate compliance data for the current week
  const today = getCurrentDate();
  const startOfWeek = getStartOfWeek();
  const endOfWeek = startOfWeek.endOf("week");

  // Fetch workout completions for this week
  const { data: completions } = await supabase
    .from("workout_completions")
    .select("completed_at")
    .eq("user_id", user.id)
    .gte("completed_at", startOfWeek.format("YYYY-MM-DD"))
    .lt("completed_at", endOfWeek.add(1, "day").format("YYYY-MM-DD"));

  // Build compliance data for the week
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = startOfWeek.add(i, "day");
    const dayStr = day.format("YYYY-MM-DD");
    
    // Check if this day is before the user signed up
    if (user.created_at) {
      const signupDate = dayjs(user.created_at).tz(USER_TIMEZONE).startOf("day");
      if (day.isBefore(signupDate)) {
        // Return -1 to indicate N/A for days before signup
        complianceData.push(-1);
        continue;
      }
    }
    
    // Check if this is the activation day for any workout plan
    const activePlan = allPlans?.find(plan => {
      if (!plan.activated_at) return false;
      const activatedStr = plan.activated_at.slice(0, 10);
      return activatedStr === dayStr;
    });
    
    // Check if this is the first plan for this user (to handle immediate activation)
    const isFirstPlan = allPlans && activePlan && (
      allPlans.length === 1 || 
      allPlans.every(p => p.id === activePlan.id || p.activated_at === null) ||
      allPlans.every(p => p.id === activePlan.id || new Date(p.created_at) > new Date(activePlan.created_at))
    );
    
    // Check if plan was created today (for immediate activation)
    const isCreatedToday = activePlan && new Date(activePlan.created_at).toISOString().slice(0, 10) === dayStr;
    
    if (activePlan && (isFirstPlan || activePlan.activated_at?.slice(0, 10) === dayStr || isCreatedToday)) {
      // Return -1 to indicate N/A for activation/creation day
      complianceData.push(-1);
      continue;
    }
    
    const hasCompletion = (completions || []).some((c: any) => c.completed_at === dayStr);
    complianceData.push(hasCompletion ? 1 : 0);
  }

  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    },
    workoutPlan: activeWorkoutPlan,
    complianceData,
    todaysWorkout: null, // This will be calculated in the component
    todaysCompletedGroups: [], // This will be calculated in the component
  });
};

export default function Workouts() {
  const { user, todaysWorkout, complianceData: initialComplianceData, todaysCompletedGroups } = useLoaderData<{ 
    user: any;
    todaysWorkout: null | {
      id: string;
      name: string;
      groups: { id: string; type: string; exercises: Exercise[] }[];
      allExercises: Exercise[];
      uniqueTypes: string[];
      isRest: boolean;
    };
    complianceData: number[];
    todaysCompletedGroups: string[];
  }>();
  
  const [dayOffset, setDayOffset] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completedGroups, setCompletedGroups] = useState<Record<string, boolean>>({});
  const [complianceData, setComplianceData] = useState<number[]>(initialComplianceData);
  const [isWorkoutSubmitted, setIsWorkoutSubmitted] = useState(false);
  const [isActivationDay, setIsActivationDay] = useState(false);
  const [currentDayWorkout, setCurrentDayWorkout] = useState(todaysWorkout);
  const [isLoadingWorkout, setIsLoadingWorkout] = useState(false);
  const weekFetcher = useFetcher<{ workouts: Record<string, any>, completions: Record<string, string[]> }>();
  const submitFetcher = useFetcher();
  const complianceFetcher = useFetcher<{ complianceData: number[] }>();
  
  // Track current week and cached workout data
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return getStartOfWeek().toDate();
  });
  const [weekWorkouts, setWeekWorkouts] = useState<Record<string, any>>({});
  const [weekCompletions, setWeekCompletions] = useState<Record<string, string[]>>({});

  // Remove the API call since compliance data now comes from loader

  // Update compliance data when initial data changes
  useEffect(() => {
    setComplianceData(initialComplianceData);
  }, [initialComplianceData]);

  // Calculate the current date with offset
  const today = getCurrentDate();
  const currentDate = today.add(dayOffset, "day");
  const currentDateApi = currentDate.format("YYYY-MM-DD");

  // Check if today is activation day by looking at compliance data
  const isTodayActivationDay = initialComplianceData && initialComplianceData.length > 0 && initialComplianceData[today.day()] === -1;

  // Fetch completed workout groups for today from backend (for real-time updates)
  const fetchCompletedGroupsForToday = async () => {
    try {
      const res = await fetch(`/api/get-workout-completions?date=${currentDateApi}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.completedGroupIds) && data.completedGroupIds.length > 0) {
          const groupIds = data.completedGroupIds;
          const groupMap: Record<string, boolean> = {};
          let matchCount = 0;
          if (currentDayWorkout && currentDayWorkout.groups) {
            groupIds.forEach((groupId: string) => {
              if (currentDayWorkout.groups.some((g: any) => g.id === groupId)) {
                groupMap[groupId] = true;
                matchCount++;
              }
            });
          }
          setCompletedGroups(groupMap);
          setIsWorkoutSubmitted(matchCount > 0);
        }
      }
    } catch (e) {
      // Ignore errors, use cached data
    }
  };

  // Update completed groups and submission status when day changes or week data loads
  useEffect(() => {
    const today = getCurrentDate();
    const targetDate = today.add(dayOffset, "day");
    const dateStr = targetDate.format("YYYY-MM-DD");
    const workoutData = weekWorkouts[dateStr];
    const completionData = weekCompletions[dateStr] || [];

    if (workoutData !== undefined) {
      // Check if this is the activation day (plan was activated today)
      const isActivationDay = dayOffset === 0 && isTodayActivationDay;
      

      
      setCurrentDayWorkout(workoutData);
      // Store activation day status for UI
      if (isActivationDay) {
        setIsActivationDay(true);
        setIsWorkoutSubmitted(true); // This will disable interactions
      } else {
        setIsActivationDay(false);
      }
      if (completionData.length > 0) {
        const dayCompletedGroups: Record<string, boolean> = {};
        const matchingGroupsCount = completionData.filter((groupId: string) => {
          const groupExists = workoutData?.groups?.some((group: any) => group.id === groupId);
          if (groupExists) {
            dayCompletedGroups[groupId] = true;
          }
          return groupExists;
        }).length;
        setCompletedGroups(dayCompletedGroups);
        setIsWorkoutSubmitted(matchingGroupsCount > 0);
      } else {
        setCompletedGroups({});
        setIsWorkoutSubmitted(false);
        // For today, always re-fetch completions from backend when dayOffset changes to 0
        if (dayOffset === 0) {
          fetchCompletedGroupsForToday();
        }
      }
      setIsLoadingWorkout(false);
    } else {
      // Need to fetch this week's data
      const weekStart = targetDate.toDate();
      const dayOfWeek = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - dayOfWeek);
      weekStart.setHours(0, 0, 0, 0);
      

      
      if (weekStart.getTime() !== currentWeekStart.getTime()) {
        setCurrentWeekStart(weekStart);
        fetchWorkoutWeek(weekStart);
      }
    }
  }, [dayOffset, weekWorkouts, weekCompletions, currentWeekStart, currentDayWorkout]);

  // Function to fetch a week's worth of workout data
  const fetchWorkoutWeek = (weekStart: Date) => {
    setIsLoadingWorkout(true);
    const params = new URLSearchParams();
    params.set("weekStart", weekStart.toISOString());
    weekFetcher.load(`/api/get-workout-week?${params.toString()}`);
  };

  // Initialize week data on mount
  useEffect(() => {
    // Add today's workout to the week cache
    const today = getCurrentDate();
    const todayStr = today.format("YYYY-MM-DD");
    if (todaysWorkout) {
      setWeekWorkouts(prev => ({
        ...prev,
        [todayStr]: todaysWorkout
      }));
    }
    setWeekCompletions(prev => ({
      ...prev,
      [todayStr]: todaysCompletedGroups
    }));
    
    // Fetch the current week's data
    fetchWorkoutWeek(currentWeekStart);
  }, [todaysWorkout, todaysCompletedGroups]);

  // Handle week fetcher data updates
  useEffect(() => {
    if (weekFetcher.data?.workouts && weekFetcher.data?.completions) {

      setWeekWorkouts(prev => ({ ...prev, ...weekFetcher.data!.workouts }));
      setWeekCompletions(prev => ({ ...prev, ...weekFetcher.data!.completions }));
      setIsLoadingWorkout(false);
    }
  }, [weekFetcher.data]);

  // Get the formatted date display (UI only - no data fetching)
  const getDateDisplay = (offset: number) => {
    const today = getCurrentDate();
    const targetDate = today.add(offset, "day");
    const weekdayName = targetDate.format("dddd");
    const formattedDate = targetDate.format("MMMM D, YYYY");
    if (offset === 0) {
      return { title: "Today", subtitle: formattedDate, weekday: weekdayName };
    } else if (offset === 1) {
      return {
        title: "Tomorrow",
        subtitle: formattedDate,
        weekday: weekdayName,
      };
    } else if (offset === -1) {
      return {
        title: "Yesterday",
        subtitle: formattedDate,
        weekday: weekdayName,
      };
    } else {
      return {
        title: weekdayName,
        subtitle: formattedDate,
        weekday: weekdayName,
      };
    }
  };
  const dateDisplay = getDateDisplay(dayOffset);

  // Handle group completion toggle
  const toggleGroupCompletion = (groupId: string) => {
    // Prevent changes if workout is already submitted, not today's workout, or activation day
    if (isWorkoutSubmitted || dayOffset !== 0 || isActivationDay) return;
    
    setCompletedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Function to refresh compliance data
  const refreshComplianceData = async () => {
    try {
      const today = dayjs().tz("America/Denver").startOf("day");
      const startOfWeek = today.subtract(today.day(), "day");
      const endOfWeek = startOfWeek.add(6, "day");
      const response = await fetch(`/api/get-workout-completions?start=${startOfWeek.format("YYYY-MM-DD")}&end=${endOfWeek.format("YYYY-MM-DD")}`);
      if (response.ok) {
        const data = await response.json();
        const newComplianceData = [];
        for (let i = 0; i < 7; i++) {
          const day = startOfWeek.add(i, "day");
          const dayStr = day.format("YYYY-MM-DD");
          const hasCompletion = data.completions.some((c: any) => c.completed_at === dayStr);
          newComplianceData.push(hasCompletion ? 1 : 0);
        }
        setComplianceData(newComplianceData);
      }
    } catch (error) {
      console.error('Error refreshing compliance data:', error);
    }
  };

  // Handle workout submission - OPTIMISTIC UI with fetcher
  const handleSubmitWorkout = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const today = getCurrentDate();
    const dateStr = today.format("YYYY-MM-DD");
    const completedGroupIds = Object.entries(completedGroups)
      .filter(([_, completed]) => completed)
      .map(([groupId]) => groupId);

    // Optimistically update UI
    setShowSuccess(true);
    setIsWorkoutSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => setShowSuccess(false), 3000);

    // Optionally, update complianceData optimistically for today
    const todayIdx = (today.day() + 7 - currentWeekStart.getDay()) % 7;
    setComplianceData(prev => {
      const newData = [...prev];
      newData[todayIdx] = 1;
      return newData;
    });

    // Submit to backend using fetcher
    submitFetcher.submit(
      { completedGroups: completedGroupIds, completedAt: dateStr },
      { method: "POST", action: "/api/submit-workout-completion", encType: "application/json" }
    );
    setIsSubmitting(false);

    // Dispatch custom event to trigger dashboard revalidation
    window.dispatchEvent(new Event("workouts:completed"));
  };

  // Calculate daily progress
  const totalGroups = currentDayWorkout?.groups?.length || 0;
  const completedGroupCount = Object.values(completedGroups).filter(Boolean).length;
  const progressPercentage = totalGroups > 0 ? (completedGroupCount / totalGroups) * 100 : 100;

  // Compliance calendar helpers
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Bright color scaling from theme green to red with smooth transitions
  const getBarColor = (percent: number) => {
    const percentage = percent * 100; // Convert to percentage
    if (percentage >= 95) return "#00CC03"; // Theme green - perfect
    if (percentage >= 90) return "#00E804"; // Bright theme green - excellent
    if (percentage >= 85) return "#32E135"; // Theme light green - very good
    if (percentage >= 80) return "#65E668"; // Lighter green - good
    if (percentage >= 75) return "#98EB9B"; // Very light green - above average
    if (percentage >= 70) return "#B8F0BA"; // Pale green - decent
    if (percentage >= 65) return "#D4F5D6"; // Very pale green - okay
    if (percentage >= 60) return "#F0FAF0"; // Almost white green - needs improvement
    if (percentage >= 55) return "#FFF8DC"; // Cream - concerning
    if (percentage >= 50) return "#FFE135"; // Bright yellow - poor
    if (percentage >= 45) return "#FFD700"; // Gold - very poor
    if (percentage >= 40) return "#FFA500"; // Orange - critical
    if (percentage >= 35) return "#FF6347"; // Tomato - very critical
    if (percentage >= 30) return "#FF4500"; // Red orange - extremely poor
    if (percentage >= 25) return "#FF0000"; // Pure red - critical
    if (percentage >= 20) return "#DC143C"; // Crimson - very critical
    if (percentage >= 15) return "#B22222"; // Fire brick - extremely poor
    if (percentage >= 10) return "#8B0000"; // Dark red - needs immediate attention
    return "#660000"; // Very dark red - emergency
  };

  // Week navigation
  const startOfWeek = today.subtract(today.day(), "day");
  const endOfWeek = startOfWeek.add(6, "day");

  const formatDateShort = (date: Date) => {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const safeComplianceData = Array.isArray(complianceData) ? complianceData : [];

  return (
    <div className="p-4 sm:p-6">
      {/* Success Message */}
      {showSuccess && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 bg-primary text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-fade-in">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span>Workout Submitted Successfully</span>
        </div>
      )}

      <h1 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6">
        {dayOffset === 0 ? "Today's Workout" : 
         dayOffset === 1 ? "Tomorrow's Workout" : 
         dayOffset === -1 ? "Yesterday's Workout" : 
         `${dateDisplay.weekday}'s Workout`}
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="md:col-span-2">
          <Card className="mb-4 sm:mb-6">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <button
                onClick={() => setDayOffset(dayOffset - 1)}
                className="text-primary hover:text-primary-dark transition-colors duration-200 flex items-center gap-1"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Previous
              </button>
              <div className="text-center">
                <h2 className="text-xl font-semibold text-secondary dark:text-alabaster">
                  {dateDisplay.title}
                </h2>
                <div className="text-sm text-gray-dark dark:text-gray-light mt-1">
                  {dateDisplay.subtitle}
                </div>
                {dayOffset !== 0 && (
                  <button
                    onClick={() => setDayOffset(0)}
                    className="text-xs text-primary hover:text-primary-dark transition-colors duration-200 mt-1"
                  >
                    Go to today
                  </button>
                )}
              </div>
              <button
                onClick={() => setDayOffset(dayOffset + 1)}
                className="text-primary hover:text-primary-dark transition-colors duration-200 flex items-center gap-1"
              >
                Next
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>

            <div className="mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-secondary dark:text-alabaster mb-2">
                {isLoadingWorkout
                  ? "Loading..."
                  : currentDayWorkout
                    ? currentDayWorkout.isRest
                      ? "Rest Day"
                      : currentDayWorkout.name
                    : isActivationDay
                      ? "No Workouts"
                      : "No Workouts"}
              </h2>
            </div>
            <div className="space-y-4 sm:space-y-6">
              {isLoadingWorkout ? (
                <div className="flex items-center justify-center py-8">
                  <svg
                    className="animate-spin h-8 w-8 text-primary"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span className="ml-2 text-secondary dark:text-alabaster">Loading workout...</span>
                </div>
              ) : !currentDayWorkout || currentDayWorkout.isRest || !currentDayWorkout.groups ? (
                <p className="text-secondary dark:text-alabaster">
                  {currentDayWorkout?.isRest
                    ? "Rest day - take time to recover!"
                    : isActivationDay
                    ? "Workout plan activated today - workouts will take effect tomorrow."
                    : "No workout scheduled for this day."}
                </p>
              ) : (
                (Array.isArray(currentDayWorkout?.groups) ? currentDayWorkout.groups : []).map((group: any, idx: number) => (
                  <div
                    key={group.id}
                    className="bg-white dark:bg-secondary-light/5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow duration-200 p-4 sm:p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-secondary dark:text-alabaster">
                        {group.exercises?.map((ex: any) => ex.name).join(" + ")} - {group.type === "Super Set" || group.type === "SuperSet" ? "Super Set" : group.type === "Giant Set" || group.type === "GiantSet" ? "Giant Set" : "Single"}
                      </h3>
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`group-${group.id}`}
                          className={`text-sm select-none ${
                            isWorkoutSubmitted || dayOffset !== 0 || isActivationDay
                              ? "text-gray-500 dark:text-gray-400 cursor-not-allowed" 
                              : "text-gray-dark dark:text-gray-light cursor-pointer"
                          }`}
                        >
                          {dayOffset !== 0 
                            ? completedGroups[group.id] 
                              ? "Completed" 
                              : "Not completed"
                            : isActivationDay
                            ? "Activation Day"
                            : isWorkoutSubmitted && completedGroups[group.id] 
                            ? "Completed & Submitted" 
                            : completedGroups[group.id] 
                            ? "Completed" 
                            : "Mark as complete"}
                        </label>
                        <input
                          type="checkbox"
                          id={`group-${group.id}`}
                          checked={completedGroups[group.id] || false}
                          onChange={() => toggleGroupCompletion(group.id)}
                          disabled={isWorkoutSubmitted || dayOffset !== 0 || isActivationDay}
                          className={`w-5 h-5 rounded border-gray-light dark:border-davyGray text-primary focus:ring-primary ${
                            isWorkoutSubmitted || dayOffset !== 0 || isActivationDay
                              ? "cursor-not-allowed opacity-50" 
                              : "cursor-pointer"
                          }`}
                        />
                      </div>
                    </div>
                    <WorkoutCard
                      exercises={group.exercises || []}
                      type={group.type === "Super Set" || group.type === "SuperSet" ? "Super" : group.type === "Giant Set" || group.type === "GiantSet" ? "Giant" : "Single"}
                      dayOffset={0}
                    />
                  </div>
                ))
              )}
            </div>

            {/* Submit Button - Only show for today's workout */}
            {dayOffset === 0 && currentDayWorkout && !currentDayWorkout.isRest && (
              <div className="flex justify-end mt-6 pt-6 border-t border-gray-light dark:border-davyGray">
                <Button
                  variant="primary"
                  disabled={isSubmitting || isWorkoutSubmitted || isActivationDay}
                  onClick={handleSubmitWorkout}
                >
                  <span className="flex items-center gap-2">
                    {isSubmitting ? (
                      <>
                        <svg
                          className="animate-spin h-5 w-5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        <span>Submitting...</span>
                      </>
                    ) : isWorkoutSubmitted ? (
                      "Workout Submitted"
                    ) : (
                      "Submit Workout"
                    )}
                  </span>
                </Button>
              </div>
            )}

            {/* Activation Day Message */}
            {isActivationDay && dayOffset === 0 && (
              <div className="mt-6 pt-6 border-t border-gray-light dark:border-davyGray">
                <div className="text-center text-gray-600 dark:text-gray-400 text-sm">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-blue-600 dark:text-blue-400">Workout Plan Activated Today</span>
                  </div>
                  <p>Your workout plan is now active! You can view today's workout, but tracking will take effect tomorrow.</p>
                </div>
              </div>
            )}

            {/* Show error if present */}
            {submitError && (
              <div className="text-red-600 text-sm mt-2">{submitError}</div>
            )}

            {/* Show message for past/future days */}
            {dayOffset !== 0 && (
              <div className="mt-6 pt-6 border-t border-gray-light dark:border-davyGray">
                <div className="text-center text-gray-600 dark:text-gray-400 text-sm">
                  {dayOffset < 0 
                    ? "This is a past workout. Completion status is shown as recorded."
                    : "This is a future workout. You can only submit today's workout."
                  }
                </div>
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4 sm:space-y-6">
          {/* Daily Progress Summary */}
          <Card title="Daily Progress">
            <div className="mb-4 bg-gray-lightest dark:bg-secondary-light/20 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-secondary dark:text-alabaster">
                  Workout Progress
                </h3>
                <span className="text-sm text-gray-dark dark:text-gray-light">
                  {completedGroupCount} of {totalGroups} workouts completed
                </span>
              </div>
              <div className="w-full bg-gray-300 dark:bg-davyGray rounded-full h-3 mb-2">
                <div
                  className="bg-primary h-3 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${progressPercentage}%`,
                  }}
                ></div>
              </div>
              <div className="text-xs text-gray-dark dark:text-gray-light text-right">
                {Math.round(progressPercentage)}% complete
              </div>
            </div>
          </Card>

          {/* Workout Compliance Calendar */}
          <Card title="Workout Compliance">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-medium">This Week</span>
              <div className="text-xs text-gray-500">
                {formatDateShort(startOfWeek.toDate())} - {formatDateShort(endOfWeek.toDate())}
              </div>
            </div>
            <div className="space-y-3">
              {dayLabels.map((label, i) => {
                // Determine if this is today or future/past
                const today = dayjs().tz("America/Denver").startOf("day");
                const thisDate = startOfWeek.add(i, "day");
                const isToday = thisDate.isSame(today, "day");
                const isFuture = thisDate.isAfter(today, "day");
                
                // Check if there are workouts assigned for this day
                const dateStr = thisDate.format("YYYY-MM-DD");
                const dayWorkout = weekWorkouts[dateStr];
                const hasWorkoutsAssigned = dayWorkout && !dayWorkout.isRest && dayWorkout.groups && dayWorkout.groups.length > 0;
                
                // Determine status and display
                let status: string;
                let displayText: string;
                let showNABadge = false;
                let naReason = "";
                const percentage = Math.round((safeComplianceData[i] || 0) * 100);
                
                // Check if this day is before the user signed up
                const signupDate = user?.created_at ? dayjs(user.created_at).tz("America/Denver").startOf("day") : null;
                const isBeforeSignup = signupDate && thisDate.isBefore(signupDate, "day");
                
                if (isBeforeSignup) {
                  showNABadge = true;
                  naReason = "You weren't signed up yet!";
                  status = "na";
                  displayText = "";
                } else if (safeComplianceData[i] === -1) {
                  showNABadge = true;
                  naReason = "Workout plan added today - compliance starts tomorrow";
                  status = "na";
                  displayText = "";
                } else if (isFuture) {
                  status = "pending";
                  displayText = "Pending";
                } else if (isToday) {
                  if (safeComplianceData[i] > 0) {
                    status = "completed";
                    displayText = `${percentage}%`;
                  } else if (!hasWorkoutsAssigned) {
                    // No workouts assigned for today = 100% complete
                    status = "completed";
                    displayText = "100%";
                  } else {
                    status = "pending";
                    displayText = "Pending";
                  }
                } else {
                  // Past day
                  if (safeComplianceData[i] > 0) {
                    status = "completed";
                    displayText = `${percentage}%`;
                  } else if (!hasWorkoutsAssigned) {
                    // No workouts assigned for past day = 100% complete
                    status = "completed";
                    displayText = "100%";
                  } else {
                    // Past day with workouts assigned but not completed = 0%
                    status = "completed";
                    displayText = "0%";
                  }
                }
                
                return (
                  <div
                    key={label}
                    className="flex items-center justify-between py-2 border-b dark:border-davyGray last:border-0"
                  >
                    <div className="text-sm font-medium text-secondary dark:text-alabaster">
                      {thisDate.toDate().toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-3 h-3 rounded-full ${
                          isBeforeSignup || status === "na"
                            ? "bg-gray-light dark:bg-davyGray"
                            : status === "pending"
                            ? isToday
                              ? "bg-green-500"
                              : "bg-gray-light dark:bg-davyGray"
                            : displayText === "100%"
                            ? "bg-primary"
                            : percentage >= 80
                            ? "bg-primary"
                            : percentage > 0
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                      ></span>
                      {showNABadge ? (
                        <NABadge reason={naReason} />
                      ) : (
                        <span className={`text-sm ${
                          isToday && status === "pending"
                            ? 'bg-primary/10 dark:bg-primary/20 text-primary px-3 py-1 rounded-md border border-primary/20'
                            : 'text-gray-dark dark:text-gray-light'
                        }`}>
                          {displayText}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
