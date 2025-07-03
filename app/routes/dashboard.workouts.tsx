import { useState, useEffect } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
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
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
dayjs.extend(utc);
dayjs.extend(timezone);

export const meta: MetaFunction = () => {
  return [
    { title: "Workouts | Vested Fitness" },
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

  // TODO: In the future, use user-specific timezone from profile if available
  const userTz = "America/Denver"; // Northern Utah timezone
  const currentDate = dayjs().tz(userTz).startOf("day");
  const currentDateStr = currentDate.format("YYYY-MM-DD");

  // Get user data
  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, email, avatar_url")
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
    // First try to find an active plan activated before today
    let planToShow = allPlans.find(plan => {
      if (!plan.is_active) return false;
      if (!plan.activated_at) return true; // Legacy plans without activation date
      const activatedDate = plan.activated_at.slice(0, 10);
      return activatedDate < currentDateStr;
    });
    
    // If no active plan found, look for plan deactivated today (was active until today)
    if (!planToShow) {
      planToShow = allPlans.find(plan => {
        if (!plan.deactivated_at) return false;
        const deactivatedDate = plan.deactivated_at.slice(0, 10);
        return deactivatedDate === currentDateStr; // Deactivated today, so show until end of day
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

  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    },
    workoutPlan: activeWorkoutPlan,
  });
};

export default function Workouts() {
  const { todaysWorkout, complianceData: initialComplianceData, todaysCompletedGroups } = useLoaderData<{ 
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
  const [currentDayWorkout, setCurrentDayWorkout] = useState(todaysWorkout);
  const [isLoadingWorkout, setIsLoadingWorkout] = useState(false);
  const weekFetcher = useFetcher<{ workouts: Record<string, any>, completions: Record<string, string[]> }>();
  const submitFetcher = useFetcher();
  
  // Track current week and cached workout data
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day);
    sunday.setHours(0, 0, 0, 0);
    return sunday;
  });
  const [weekWorkouts, setWeekWorkouts] = useState<Record<string, any>>({});
  const [weekCompletions, setWeekCompletions] = useState<Record<string, string[]>>({});

  // Update compliance data when initial data changes
  useEffect(() => {
    setComplianceData(initialComplianceData);
  }, [initialComplianceData]);

  // Calculate the current date with offset
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
  const currentDate = new Date(today);
  currentDate.setDate(today.getDate() + dayOffset);
  const currentDateApi = currentDate.toISOString().slice(0, 10);

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
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dayOffset);
    const dateStr = targetDate.toISOString().slice(0, 10);
    const workoutData = weekWorkouts[dateStr];
    const completionData = weekCompletions[dateStr] || [];

    if (workoutData !== undefined) {
      setCurrentDayWorkout(workoutData);
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
      const weekStart = new Date(targetDate);
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
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
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
    
    // Fetch the rest of the week's data
    fetchWorkoutWeek(currentWeekStart);
  }, []);

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
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + offset);
    const weekdayName = targetDate.toLocaleDateString("en-US", {
      weekday: "long",
    });
    const formattedDate = targetDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
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
    // Prevent changes if workout is already submitted or not today's workout
    if (isWorkoutSubmitted || dayOffset !== 0) return;
    
    setCompletedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Function to refresh compliance data
  const refreshComplianceData = async () => {
    try {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      
      const response = await fetch(`/api/get-workout-completions?start=${startOfWeek.toISOString().slice(0, 10)}&end=${endOfWeek.toISOString().slice(0, 10)}`);
      if (response.ok) {
        const data = await response.json();
        const completionsByDate = data.completionsByDate || {};
        
        // Build compliance data for the week
        const newComplianceData = [];
        for (let i = 0; i < 7; i++) {
          const day = new Date(startOfWeek);
          day.setDate(startOfWeek.getDate() + i);
          const dayStr = day.toISOString().slice(0, 10);
          const hasCompletion = completionsByDate[dayStr] && completionsByDate[dayStr].length > 0;
          newComplianceData.push(hasCompletion ? 1 : 0);
        }
        
        setComplianceData(newComplianceData);
      }
    } catch (error) {
      console.error('Failed to refresh compliance data:', error);
    }
  };

  // Handle workout submission - OPTIMISTIC UI with fetcher
  const handleSubmitWorkout = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const completedGroupIds = Object.entries(completedGroups)
      .filter(([_, completed]) => completed)
      .map(([groupId]) => groupId);

    // Optimistically update UI
    setShowSuccess(true);
    setIsWorkoutSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => setShowSuccess(false), 3000);

    // Optionally, update complianceData optimistically for today
    const todayIdx = (today.getDay() + 7 - currentWeekStart.getDay()) % 7;
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
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const formatDateShort = (date: Date) => {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

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
                {isLoadingWorkout ? "Loading..." : currentDayWorkout ? currentDayWorkout.name : "Rest Day"}
              </h2>
              {currentDayWorkout && !currentDayWorkout.isRest && currentDayWorkout.uniqueTypes && currentDayWorkout.uniqueTypes.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {currentDayWorkout.uniqueTypes.map((type: string) => (
                    <span
                      key={type}
                      className="px-2 py-0.5 xs:py-1 bg-green-100 text-green-800 rounded-md text-xs xs:text-sm font-medium"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              )}
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
                  {currentDayWorkout?.isRest ? "Rest day - take time to recover!" : "No workout scheduled for this day."}
                </p>
              ) : (
                currentDayWorkout.groups.map((group: any, idx: number) => (
                  <div
                    key={group.id}
                    className="bg-white dark:bg-secondary-light/5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow duration-200 p-4 sm:p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-secondary dark:text-alabaster">
                        Group {idx + 1} - {group.type}
                      </h3>
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`group-${group.id}`}
                          className={`text-sm select-none ${
                            isWorkoutSubmitted || dayOffset !== 0
                              ? "text-gray-500 dark:text-gray-400 cursor-not-allowed" 
                              : "text-gray-dark dark:text-gray-light cursor-pointer"
                          }`}
                        >
                          {dayOffset !== 0 
                            ? completedGroups[group.id] 
                              ? "Completed" 
                              : "Not completed"
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
                          disabled={isWorkoutSubmitted || dayOffset !== 0}
                          className={`w-5 h-5 rounded border-gray-light dark:border-davyGray text-primary focus:ring-primary ${
                            isWorkoutSubmitted || dayOffset !== 0
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
                  disabled={isSubmitting || isWorkoutSubmitted}
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
                {formatDateShort(startOfWeek)} - {formatDateShort(endOfWeek)}
              </div>
            </div>
            <div className="space-y-3">
              {dayLabels.map((label, i) => {
                // Determine if this is today or future/past
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const thisDate = new Date(startOfWeek);
                thisDate.setDate(startOfWeek.getDate() + i);
                thisDate.setHours(0, 0, 0, 0);
                const isToday = thisDate.getTime() === today.getTime();
                const isFuture = thisDate.getTime() > today.getTime();
                
                // Check if there are workouts assigned for this day
                const dateStr = thisDate.toISOString().slice(0, 10);
                const dayWorkout = weekWorkouts[dateStr];
                const hasWorkoutsAssigned = dayWorkout && !dayWorkout.isRest && dayWorkout.groups && dayWorkout.groups.length > 0;
                
                // Determine status and display
                let status: string;
                let displayText: string;
                const percentage = Math.round((complianceData[i] || 0) * 100);
                
                if (isFuture) {
                  status = "pending";
                  displayText = "Pending";
                } else if (isToday) {
                  if (complianceData[i] > 0) {
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
                  if (complianceData[i] > 0) {
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
                      {thisDate.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-3 h-3 rounded-full ${
                          status === "pending"
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
                      <span className={`text-sm ${
                        isToday && status === "pending"
                          ? 'bg-primary/10 dark:bg-primary/20 text-primary px-3 py-1 rounded-md border border-primary/20'
                          : 'text-gray-dark dark:text-gray-light'
                      }`}>
                        {displayText}
                      </span>
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
