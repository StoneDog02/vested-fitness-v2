import type { Exercise } from "~/types/workout";
import { useState, useEffect } from "react";

interface WorkoutCardProps {
  exercises: Exercise[];
  type: "Single" | "Super" | "Giant";
  isSubmitted?: boolean;
  completionStates?: boolean[];
  onCompletionChange?: (exerciseIds: string[], completed: boolean) => void;
  dayOffset: number;
}

export default function WorkoutCard({
  exercises,
  type,
  isSubmitted = false,
  completionStates,
  onCompletionChange,
  dayOffset,
}: WorkoutCardProps) {
  const [isCompleted, setIsCompleted] = useState(false);
  const [notes, setNotes] = useState("");
  const [weights, setWeights] = useState<Record<string, string>>({});

  // Reset state when day changes
  useEffect(() => {
    setIsCompleted(false);
    setNotes("");
    setWeights({});
  }, [dayOffset]);

  // Initialize completion state from props if available
  useEffect(() => {
    if (completionStates && completionStates.length > 0) {
      setIsCompleted(completionStates[0]);
    }
  }, [completionStates]);

  useEffect(() => {
    // Initialize weights state only on the client side
    setWeights(
      Object.fromEntries(
        exercises.flatMap((exercise) =>
          exercise.sets.map((set) => [
            `${exercise.id}-${set.setNumber}`,
            set.weight?.toString() || "",
          ])
        )
      )
    );
  }, [exercises]);

  const handleWeightChange = (
    exerciseId: string,
    setNumber: number,
    value: string
  ) => {
    if (isSubmitted) return; // Prevent changes if submitted
    setWeights((prev) => ({
      ...prev,
      [`${exerciseId}-${setNumber}`]: value,
    }));
  };

  const handleCompletionChange = (checked: boolean) => {
    if (isSubmitted) return;
    setIsCompleted(checked);
    if (onCompletionChange) {
      onCompletionChange(
        exercises.map((ex) => ex.id),
        checked
      );
    }
  };

  const getSetLabel = (
    type: "Super" | "Giant" | "Single",
    setNumber: number
  ) => {
    switch (type) {
      case "Super":
        return `Super Set ${setNumber}`;
      case "Giant":
        return `Giant Set ${setNumber}`;
      default:
        return `Set ${setNumber}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Exercise Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {type !== "Single" && (
              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-md text-sm font-medium">
                {type === "Super" ? "Super Set" : "Giant Set"}
              </span>
            )}
            <h3 className="text-xl font-semibold text-secondary dark:text-alabaster">
              {exercises.map((ex) => ex.name).join(" + ")}
            </h3>
          </div>
          <p className="text-sm text-gray-600">{exercises[0].description}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isCompleted}
            onChange={(e) => handleCompletionChange(e.target.checked)}
            disabled={isSubmitted}
            className={`w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-primary-light ${
              isSubmitted ? "cursor-not-allowed opacity-50" : ""
            }`}
          />
          <span className="text-sm text-gray-600">Complete</span>
        </div>
      </div>

      {/* Video and Table Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Sets Table */}
        <div className="overflow-x-auto pr-4">
          <table className="w-[95%]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-4 font-medium text-gray-600">
                  SET
                </th>
                {exercises.map((exercise) => (
                  <th
                    key={exercise.id}
                    className="text-left py-2 px-4 font-medium text-gray-600"
                  >
                    {exercise.name} (LBS)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exercises[0].sets.map((set) => (
                <tr key={set.setNumber} className="border-b border-gray-100">
                  <td className="py-2 px-4">
                    {getSetLabel(type, set.setNumber)}
                  </td>
                  {exercises.map((exercise) => (
                    <td
                      key={`${exercise.id}-${set.setNumber}`}
                      className="py-2 px-4"
                    >
                      <input
                        type="number"
                        value={weights[`${exercise.id}-${set.setNumber}`]}
                        onChange={(e) =>
                          handleWeightChange(
                            exercise.id,
                            set.setNumber,
                            e.target.value
                          )
                        }
                        disabled={isSubmitted}
                        className={`w-20 px-2 py-1 border rounded bg-white dark:bg-transparent ${
                          isSubmitted ? "cursor-not-allowed opacity-50" : ""
                        }`}
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-1 gap-4">
          {exercises.map(
            (exercise) =>
              exercise.videoUrl && (
                <div
                  key={exercise.id}
                  className="relative aspect-video bg-gray-100 rounded-lg flex items-center justify-center h-[150px]"
                >
                  <div className="absolute top-2 left-2">
                    <span className="text-sm font-medium text-gray-600">
                      {exercise.name}
                    </span>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="w-12 h-12 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
              )
          )}
        </div>
      </div>

      {/* Notes Field */}
      <div>
        <label
          htmlFor={`notes-${exercises[0].id}`}
          className="block text-sm font-medium text-gray-600 mb-1"
        >
          Notes
        </label>
        <textarea
          id={`notes-${exercises[0].id}`}
          value={notes}
          onChange={(e) => !isSubmitted && setNotes(e.target.value)}
          disabled={isSubmitted}
          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-transparent ${
            isSubmitted ? "cursor-not-allowed opacity-50" : ""
          }`}
          rows={2}
          placeholder="Add any notes about this exercise..."
        />
      </div>
    </div>
  );
}
