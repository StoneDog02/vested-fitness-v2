import type { Exercise } from "~/types/workout";
import { useState, useEffect, useRef } from "react";

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
          <div className="flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-2 mb-2">
            {type !== "Single" && (
              <span className="px-2 py-0.5 xs:py-1 bg-green-100 text-green-800 rounded-md text-xs xs:text-sm font-medium w-max xs:w-auto mb-1 xs:mb-0">
                {type === "Super" ? "Super Set" : "Giant Set"}
              </span>
            )}
            <h3 className="text-lg xs:text-xl font-semibold text-secondary dark:text-alabaster leading-tight">
              {exercises.map((ex) => ex.name).join(" + ")}
            </h3>
          </div>
          <p className="text-xs xs:text-sm text-secondary dark:text-alabaster/90">
            {exercises[0].description}
          </p>
        </div>

      </div>

      {/* Video and Table Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Sets Table */}
        <div className="overflow-x-auto pr-4">
          <table className="w-[95%]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 px-4 font-medium text-secondary dark:text-alabaster">
                  SET
                </th>
                {exercises.map((exercise) => (
                  <th
                    key={exercise.id}
                    className="text-left py-2 px-4 font-medium text-secondary dark:text-alabaster"
                  >
                    {exercise.name} (LBS)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exercises[0].sets.map((set) => (
                <tr
                  key={set.setNumber}
                  className="border-b border-gray-100 dark:border-gray-700/50"
                >
                  <td className="py-2 px-4 text-secondary dark:text-alabaster/90">
                    {getSetLabel(type, set.setNumber)}
                  </td>
                  {exercises.map((exercise) => (
                    <td
                      key={`${exercise.id}-${set.setNumber}`}
                      className="py-2 px-4"
                    >
                      {set.setNumber === 1 ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={weights[`${exercise.id}-${set.setNumber}`] || ""}
                            onChange={(e) =>
                              handleWeightChange(
                                exercise.id,
                                set.setNumber,
                                e.target.value
                              )
                            }
                            disabled={isSubmitted}
                            className={`w-20 px-2 py-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-secondary dark:text-alabaster focus:ring-1 focus:ring-primary focus:border-primary dark:focus:border-primary dark:focus:ring-primary-light ${
                              isSubmitted ? "cursor-not-allowed opacity-50" : ""
                            }`}
                            placeholder="0"
                          />
                          {/* Personal Best mock display */}
                          <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded">
                            PB: 185 lbs
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600">
                          -
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-1 gap-4">
          {exercises.map((exercise) =>
            exercise.videoUrl ? (
              <div
                key={exercise.id}
                className="relative bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center h-[160px] sm:h-[220px] overflow-hidden"
              >
                <div className="absolute top-2 left-2 z-10">
                  <span className="text-xs sm:text-sm font-medium text-secondary dark:text-alabaster">
                    {exercise.name}
                  </span>
                </div>
                <VideoPlayer url={exercise.videoUrl} label={exercise.name} />
              </div>
            ) : (
              <div
                key={exercise.id}
                className="relative aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center h-[120px] sm:h-[180px]"
              >
                <div className="absolute top-2 left-2">
                  <span className="text-xs sm:text-sm font-medium text-secondary dark:text-alabaster">
                    {exercise.name}
                  </span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400"
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
          className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
        >
          Notes
        </label>
        <textarea
          id={`notes-${exercises[0].id}`}
          value={notes}
          onChange={(e) => !isSubmitted && setNotes(e.target.value)}
          disabled={isSubmitted}
          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 text-secondary dark:text-alabaster placeholder-gray-400 dark:placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary dark:focus:border-primary dark:focus:ring-primary-light ${
            isSubmitted ? "cursor-not-allowed opacity-50" : ""
          }`}
          rows={2}
          placeholder="Add any notes about this exercise..."
        />
      </div>
    </div>
  );
}

function VideoPlayer({ url, label }: { url: string; label: string }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center bg-black rounded-lg`}
    >
      <video
        ref={videoRef}
        src={url}
        controls
        className="w-full h-full max-h-[160px] sm:max-h-[220px] rounded-lg object-contain bg-black"
        style={{ background: "#000" }}
      >
        <track kind="captions" label="English captions" src="" default />
      </video>
      <button
        type="button"
        onClick={handleFullscreen}
        className="absolute bottom-2 right-2 bg-black/60 text-white rounded-full p-2 hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-primary z-20"
        aria-label={
          isFullscreen
            ? `Exit fullscreen for ${label}`
            : `Go fullscreen for ${label}`
        }
      >
        {isFullscreen ? (
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
              d="M9 9L5 5m0 0v4m0-4h4m6 6l4 4m0 0h-4m4 0v-4"
            />
          </svg>
        ) : (
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
              d="M15 3h6v6m0-6L10 14m-1 1H3v-6m0 6l11-11"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
