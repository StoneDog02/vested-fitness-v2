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
const mockCalendarData = [
  { date: "Mon, Apr 8", workout: "Push Day", status: "completed" },
  { date: "Tue, Apr 9", workout: "Pull Day", status: "completed" },
  { date: "Wed, Apr 10", workout: "Leg Day", status: "missed" },
  { date: "Thu, Apr 11", workout: "Push Day", status: "completed" },
  { date: "Fri, Apr 12", workout: "Pull Day", status: "pending" },
  { date: "Sat, Apr 13", workout: "Leg Day", status: "pending" },
  { date: "Sun, Apr 14", workout: "Rest Day", status: "pending" },
];

export default function Workouts() {
  const [dayOffset, setDayOffset] = useState(0);

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
  };

  const handleNextDay = () => {
    setDayOffset((prev) => prev + 1);
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Today&apos;s Workout</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="mb-6">
            {/* Date Navigation */}
            <div className="relative flex justify-between items-center mb-6">
              <button
                onClick={handlePrevDay}
                className="flex items-center text-green-500 hover:text-green-600 transition-colors"
              >
                <svg
                  className="w-5 h-5 mr-1"
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

              <div className="absolute left-1/2 -translate-x-1/2 text-center">
                <h2 className="text-2xl font-bold">{dateDisplay.title}</h2>
                <p className="text-gray-600">{dateDisplay.subtitle}</p>
              </div>

              <button
                onClick={handleNextDay}
                className="flex items-center text-green-500 hover:text-green-600 transition-colors"
              >
                Next
                <svg
                  className="w-5 h-5 ml-1"
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
            <h2 className="text-2xl font-semibold text-gray-600 mb-6">
              {workoutDay?.focus || "Rest Day"}
            </h2>

            {/* Exercises */}
            <div className="space-y-6">
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
                    className="bg-white dark:bg-secondary-light/5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow duration-200 p-6"
                  >
                    {Array.isArray(exerciseOrGroup) ? (
                      <WorkoutCard
                        key={exerciseOrGroup[0].id}
                        exercises={exerciseOrGroup}
                        type={exerciseOrGroup.length > 2 ? "Giant" : "Super"}
                      />
                    ) : (
                      <WorkoutCard
                        key={exerciseOrGroup.id}
                        exercises={[exerciseOrGroup]}
                        type="Single"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Workout Plan Info */}
          <Card title={mockWorkout.name}>
            <div className="text-sm text-gray-dark dark:text-gray-light mb-4">
              {mockWorkout.currentWeek}
            </div>

            <div className="space-y-2">
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
                      className={`font-medium ${
                        day.day.toLowerCase() ===
                        dateDisplay.weekday.toLowerCase()
                          ? "text-secondary dark:text-alabaster"
                          : "text-secondary dark:text-alabaster/70"
                      }`}
                    >
                      {day.day}
                    </span>
                    <span
                      className={`text-sm ${
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

            <Button variant="outline" className="w-full mt-4">
              View Full Program
            </Button>
          </Card>

          {/* Workout Calendar */}
          <Card title="Workout Compliance">
            <div className="space-y-2">
              {mockCalendarData.map((day, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b dark:border-davyGray last:border-0 pb-2 last:pb-0"
                >
                  <div>
                    <span className="text-sm text-secondary dark:text-alabaster">
                      {day.date}
                    </span>
                    <span className="text-xs text-gray-dark dark:text-gray-light ml-2">
                      ({day.workout})
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span
                      className={`inline-block w-3 h-3 rounded-full mr-2 ${
                        day.status === "completed"
                          ? "bg-green-500"
                          : day.status === "missed"
                          ? "bg-red-500"
                          : "bg-gray-light dark:bg-davyGray"
                      }`}
                    ></span>
                    <span className="text-sm capitalize text-gray-dark dark:text-gray-light">
                      {day.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
