import { useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import WorkoutCard from "~/components/workout/WorkoutCard";
import type { Exercise, WorkoutType } from "~/types/workout";

export const meta: MetaFunction = () => {
  return [
    { title: "Workouts | Vested Fitness" },
    { name: "description", content: "View and track your workout plans" },
  ];
};

// Mock workout data
const mockWorkout = {
  name: "Push/Pull/Legs Split",
  currentWeek: "Week 5",
  schedule: [
    { day: "Monday", focus: "Push Day" },
    { day: "Tuesday", focus: "Pull Day" },
    { day: "Wednesday", focus: "Leg Day" },
    { day: "Thursday", focus: "Rest Day" },
    { day: "Friday", focus: "Push Day" },
    { day: "Saturday", focus: "Pull Day" },
    { day: "Sunday", focus: "Rest Day" },
  ],
  todayExercises: [
    // Single Exercise
    {
      id: "1",
      name: "Bench Press",
      type: "Single" as WorkoutType,
      description: "4 sets x 6-10 reps",
      videoUrl: "https://example.com/bench-press",
      sets: [
        { setNumber: 1, weight: undefined, reps: 10, completed: false },
        { setNumber: 2, weight: undefined, reps: 8, completed: false },
        { setNumber: 3, weight: undefined, reps: 6, completed: false },
        { setNumber: 4, weight: undefined, reps: 6, completed: false },
      ],
    },
    // Super Set
    [
      {
        id: "2a",
        name: "Lat Pulldown",
        type: "Super" as WorkoutType,
        description: "3 sets x 12 reps",
        videoUrl: "https://example.com/lat-pulldown",
        sets: [
          { setNumber: 1, weight: undefined, reps: 12, completed: false },
          { setNumber: 2, weight: undefined, reps: 12, completed: false },
          { setNumber: 3, weight: undefined, reps: 12, completed: false },
        ],
      },
      {
        id: "2b",
        name: "Face Pulls",
        type: "Super" as WorkoutType,
        description: "3 sets x 15 reps",
        videoUrl: "https://example.com/face-pulls",
        sets: [
          { setNumber: 1, weight: undefined, reps: 15, completed: false },
          { setNumber: 2, weight: undefined, reps: 15, completed: false },
          { setNumber: 3, weight: undefined, reps: 15, completed: false },
        ],
      },
    ] as Exercise[],
    // Giant Set
    [
      {
        id: "3a",
        name: "Dumbbell Row",
        type: "Giant" as WorkoutType,
        description: "3 sets x 10 reps each arm",
        videoUrl: "https://example.com/db-row",
        sets: [
          { setNumber: 1, weight: undefined, reps: 10, completed: false },
          { setNumber: 2, weight: undefined, reps: 10, completed: false },
          { setNumber: 3, weight: undefined, reps: 10, completed: false },
        ],
      },
      {
        id: "3b",
        name: "Hammer Curls",
        type: "Giant" as WorkoutType,
        description: "3 sets x 12 reps",
        videoUrl: "https://example.com/hammer-curls",
        sets: [
          { setNumber: 1, weight: undefined, reps: 12, completed: false },
          { setNumber: 2, weight: undefined, reps: 12, completed: false },
          { setNumber: 3, weight: undefined, reps: 12, completed: false },
        ],
      },
      {
        id: "3c",
        name: "Rope Curls",
        type: "Giant" as WorkoutType,
        description: "3 sets x 15 reps",
        videoUrl: "https://example.com/rope-curls",
        sets: [
          { setNumber: 1, weight: undefined, reps: 15, completed: false },
          { setNumber: 2, weight: undefined, reps: 15, completed: false },
          { setNumber: 3, weight: undefined, reps: 15, completed: false },
        ],
      },
    ] as Exercise[],
  ],
};

// Mock calendar data (simplified)
const getCalendarData = () => {
  const today = new Date();
  const calendar = [];

  // Find the most recent Sunday
  const currentDay = today.getDay();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - currentDay);

  // Generate 7 days starting from Sunday
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    // Format date as "Wed, Mar 19" etc
    const formattedDate = date
      .toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
      .replace(",", "");

    // Find the workout for this day
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    const workoutDay = mockWorkout.schedule.find(
      (day) => day.day.toLowerCase() === dayName.toLowerCase()
    );

    // Determine completion percentage based on date
    let completion = 0;
    if (date < today) {
      // For past days, generate a random completion between 80-100%
      completion = Math.floor(Math.random() * 21) + 80;
    }

    calendar.push({
      date: formattedDate,
      workout: workoutDay?.focus || "Rest Day",
      completion,
    });
  }

  return calendar;
};

export default function Workouts() {
  const [dayOffset, setDayOffset] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [calendarData, setCalendarData] = useState(getCalendarData());
  const [submittedData, setSubmittedData] = useState<
    Record<string, { exercises: Record<string, boolean> }>
  >({});
  const [completedExercises, setCompletedExercises] = useState<
    Record<string, boolean>
  >({});

  // Get the formatted date display
  const getDateDisplay = (offset: number) => {
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + offset);

    // Get the weekday name for schedule highlighting
    const weekdayName = targetDate.toLocaleDateString("en-US", {
      weekday: "long",
    });

    // Format the date
    const formattedDate = targetDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Determine the display text
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

  // Find if there's a workout for this day
  const workoutDay = mockWorkout.schedule.find(
    (day) => day.day.toLowerCase() === dateDisplay.weekday.toLowerCase()
  );

  const handlePrevDay = () => {
    setDayOffset((prev) => prev - 1);
    setCompletedExercises({}); // Reset completion state
  };

  const handleNextDay = () => {
    setDayOffset((prev) => prev + 1);
    setCompletedExercises({}); // Reset completion state
  };

  const handleExerciseCompletion = (
    exerciseIds: string[],
    completed: boolean
  ) => {
    setCompletedExercises((prev) => {
      const newState = { ...prev };
      exerciseIds.forEach((id) => {
        newState[id] = completed;
      });
      return newState;
    });
  };

  const handleSubmitWorkouts = async () => {
    setIsSubmitting(true);
    setShowSuccess(false);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get today's date for tracking submission
    const today = new Date()
      .toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
      .replace(",", "");

    // Update submitted data with actual completion states
    setSubmittedData((prev) => ({
      ...prev,
      [today]: {
        exercises: { ...completedExercises },
      },
    }));

    // Calculate completion percentage based on completed exercises
    const totalExercises = mockWorkout.todayExercises.reduce(
      (count, exerciseOrGroup) => {
        return (
          count + (Array.isArray(exerciseOrGroup) ? exerciseOrGroup.length : 1)
        );
      },
      0
    );

    const completedCount =
      Object.values(completedExercises).filter(Boolean).length;
    const completionPercentage = Math.round(
      (completedCount / totalExercises) * 100
    );

    // Update the compliance data for today with actual completion percentage
    setCalendarData((prevData) => {
      return prevData.map((day) => {
        if (day.date === today) {
          return {
            ...day,
            completion: completionPercentage,
          };
        }
        return day;
      });
    });

    setIsSubmitting(false);
    setShowSuccess(true);

    // Scroll to top of page
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Hide success message after 5 seconds
    setTimeout(() => {
      setShowSuccess(false);
    }, 5000);
  };

  // Get the date string for the currently displayed day
  const displayedDateString = new Date(
    new Date().setDate(new Date().getDate() + dayOffset)
  )
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .replace(",", "");

  // Check if the current displayed date is submitted
  const isDateSubmitted = displayedDateString in submittedData;

  return (
    <div className="p-4 sm:p-6">
      {/* Success Message */}
      {showSuccess && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-green-100 border border-green-500 text-green-700 px-4 sm:px-8 py-2 sm:py-3 rounded-lg shadow-lg flex items-center text-sm sm:text-base">
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 mr-2"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Workouts submitted successfully!
        </div>
      )}

      <h1 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6">
        Today&apos;s Workout
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="md:col-span-2">
          <Card className="mb-4 sm:mb-6">
            {/* Date Navigation */}
            <div className="relative flex justify-between items-center mb-4 sm:mb-6">
              <button
                onClick={handlePrevDay}
                className="flex items-center text-green-500 hover:text-green-600 transition-colors text-sm sm:text-base"
              >
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 mr-1"
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

              <div className="absolute left-1/2 -translate-x-1/2 text-center pt-2 sm:pt-[0.75rem]">
                <h2 className="text-lg sm:text-xl font-semibold text-secondary dark:text-alabaster">
                  {dateDisplay.title}
                </h2>
                <div className="text-xs sm:text-sm text-gray-dark dark:text-gray-light mt-0.5 sm:mt-1">
                  {dateDisplay.subtitle}
                </div>
                {dayOffset !== 0 ? (
                  <button
                    onClick={() => setDayOffset(0)}
                    className="text-xs text-primary hover:text-primary-dark transition-colors duration-200 mt-0.5 sm:mt-1"
                  >
                    Go to today
                  </button>
                ) : (
                  <div className="h-4 sm:h-[1.5rem]"></div>
                )}
              </div>

              <button
                onClick={handleNextDay}
                className="flex items-center text-green-500 hover:text-green-600 transition-colors text-sm sm:text-base"
              >
                Next
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 ml-1"
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

            {/* Workout Day Label */}
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-600 mb-4 sm:mb-6">
              {workoutDay?.focus || "Rest Day"}
            </h2>

            {/* Exercises */}
            <div className="space-y-4 sm:space-y-6">
              {!workoutDay || workoutDay.focus === "Rest Day" ? (
                <p className="text-gray-600">
                  No workout scheduled for this day.
                </p>
              ) : (
                mockWorkout.todayExercises.map((exerciseOrGroup) => (
                  <div
                    key={
                      Array.isArray(exerciseOrGroup)
                        ? exerciseOrGroup[0].id
                        : exerciseOrGroup.id
                    }
                    className="bg-white dark:bg-secondary-light/5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow duration-200 p-4 sm:p-6"
                  >
                    {Array.isArray(exerciseOrGroup) ? (
                      <WorkoutCard
                        key={exerciseOrGroup[0].id}
                        exercises={exerciseOrGroup}
                        type={exerciseOrGroup.length > 2 ? "Giant" : "Super"}
                        isSubmitted={isDateSubmitted}
                        completionStates={
                          isDateSubmitted
                            ? exerciseOrGroup.map(
                                (ex) =>
                                  submittedData[displayedDateString].exercises[
                                    ex.id
                                  ]
                              )
                            : undefined
                        }
                        onCompletionChange={handleExerciseCompletion}
                        dayOffset={dayOffset}
                      />
                    ) : (
                      <WorkoutCard
                        key={exerciseOrGroup.id}
                        exercises={[exerciseOrGroup]}
                        type="Single"
                        isSubmitted={isDateSubmitted}
                        completionStates={
                          isDateSubmitted
                            ? [
                                submittedData[displayedDateString].exercises[
                                  exerciseOrGroup.id
                                ],
                              ]
                            : undefined
                        }
                        onCompletionChange={handleExerciseCompletion}
                        dayOffset={dayOffset}
                      />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Submit Button */}
            {workoutDay && workoutDay.focus !== "Rest Day" && (
              <div className="mt-4 sm:mt-6 flex justify-end">
                <Button
                  variant="primary"
                  className="w-full sm:w-auto px-4 sm:px-8 text-base sm:text-lg flex items-center justify-center gap-2"
                  onClick={handleSubmitWorkouts}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4 sm:h-5 sm:w-5"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    "Submit Completed Workouts"
                  )}
                </Button>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* Workout Plan Info */}
          <Card title={mockWorkout.name}>
            <div className="text-xs sm:text-sm text-gray-dark dark:text-gray-light mb-3 sm:mb-4">
              {mockWorkout.currentWeek}
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              {mockWorkout.schedule.map((day, index) => (
                <div
                  key={index}
                  className={`p-2 rounded-lg ${
                    day.day.toLowerCase() === dateDisplay.weekday.toLowerCase()
                      ? "bg-primary/10 border border-primary"
                      : "bg-gray-lightest dark:bg-secondary-light/5"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span
                      className={`text-sm sm:text-base font-medium ${
                        day.day.toLowerCase() ===
                        dateDisplay.weekday.toLowerCase()
                          ? "text-secondary dark:text-alabaster"
                          : "text-secondary dark:text-alabaster/70"
                      }`}
                    >
                      {day.day}
                    </span>
                    <span
                      className={`text-xs sm:text-sm ${
                        day.day.toLowerCase() ===
                        dateDisplay.weekday.toLowerCase()
                          ? "text-gray-dark dark:text-gray-light"
                          : "text-gray-dark dark:text-gray-light/70"
                      }`}
                    >
                      {day.focus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Workout Calendar */}
          <Card title="Workout Compliance">
            <div className="space-y-1.5 sm:space-y-2">
              {calendarData.map((day, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-xs sm:text-sm p-2 rounded-lg hover:bg-gray-lightest dark:hover:bg-secondary-light/5"
                >
                  <div className="flex items-baseline">
                    <span className="text-secondary dark:text-alabaster">
                      {day.date}
                    </span>
                    <span className="text-[10px] sm:text-xs text-gray-dark dark:text-gray-light ml-1 sm:ml-2">
                      ({day.workout})
                    </span>
                  </div>
                  <span
                    className={`${
                      day.completion >= 80
                        ? "text-green-500"
                        : day.completion >= 50
                        ? "text-yellow-500"
                        : day.completion > 0
                        ? "text-red-500"
                        : "text-gray-dark dark:text-gray-light"
                    }`}
                  >
                    {day.completion > 0 ? `${day.completion}%` : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
