import type { Exercise } from "~/types/workout";
import { useUser } from "~/context/UserContext";
import { useState, useEffect, useRef } from "react";

interface WorkoutCardProps {
  exercises: Exercise[];
  type: "Single" | "Super" | "Giant";
  isSubmitted?: boolean;
  dayOffset: number;
}

export default function WorkoutCard({
  exercises,
  type,
  isSubmitted = false,
  dayOffset,
}: WorkoutCardProps) {
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [personalBests, setPersonalBests] = useState<Record<string, number>>({});
  // Fetch PBs for each exercise on mount
  useEffect(() => {
    async function fetchPBs() {
      const pbMap: Record<string, number> = {};
      await Promise.all(
        exercises.map(async (exercise) => {
          const res = await fetch(`/api/personal-best?exerciseId=${exercise.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.weight === "number") {
              pbMap[exercise.id] = data.weight;
            }
          }
        })
      );
      setPersonalBests(pbMap);
    }
    fetchPBs();
  }, [exercises]);

  // Reset state when day changes
  useEffect(() => {
    setWeights({});
  }, [dayOffset]);

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
    // If this is set 1 and value is a new PB, update PB in Supabase
    if (setNumber === 1 && value && !isNaN(Number(value))) {
      const newWeight = Number(value);
      if (!personalBests[exerciseId] || newWeight > personalBests[exerciseId]) {
        setPersonalBests((prev) => ({ ...prev, [exerciseId]: newWeight }));
        // Update PB in Supabase
        fetch("/api/personal-best", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exerciseId, weight: newWeight }),
        });
      }
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
      {/* Sets and Video Container */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Exercise Cards with Sets */}
        <div className="relative">
          <div className="max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
            <div className="space-y-4">
              {exercises.map((exercise) => (
                <div
                  key={exercise.id}
                  className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center justify-end mb-4">
                    <div className="text-xs text-green-600 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-md">
                      PB: {personalBests[exercise.id] ? `${personalBests[exercise.id]} lbs` : "-"}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {exercise.sets.map((set) => (
                      <div key={set.setNumber} className="bg-white dark:bg-gray-700 rounded-md p-4 border border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-medium text-secondary dark:text-alabaster">
                            {getSetLabel(type, set.setNumber)}
                          </h5>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          {/* Weight Input */}
                          <div className="space-y-2">
                            <label htmlFor={`weight-${exercise.id}-${set.setNumber}`} className="text-sm font-medium text-gray-600 dark:text-gray-400">
                              Weight (lbs)
                            </label>
                            {set.setNumber === 1 ? (
                              <input
                                id={`weight-${exercise.id}-${set.setNumber}`}
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
                                className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-600 dark:border-gray-500 text-secondary dark:text-alabaster focus:ring-2 focus:ring-primary focus:border-primary dark:focus:border-primary dark:focus:ring-primary-light text-sm ${
                                  isSubmitted ? "cursor-not-allowed opacity-50" : ""
                                }`}
                                placeholder="0"
                              />
                            ) : (
                              <div className="px-3 py-2 text-gray-400 dark:text-gray-500 text-sm bg-gray-100 dark:bg-gray-600 rounded-md">
                                -
                              </div>
                            )}
                          </div>
                          
                          {/* Reps Display */}
                          <div className="space-y-2">
                            <label htmlFor={`reps-${exercise.id}-${set.setNumber}`} className="text-sm font-medium text-gray-600 dark:text-gray-400">
                              Reps
                            </label>
                                                                                <div id={`reps-${exercise.id}-${set.setNumber}`} className="px-3 py-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-lg font-bold rounded-md text-center">
                              {set.reps}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Scroll indicators */}
          <div className="absolute top-0 left-0 right-2 h-4 bg-gradient-to-b from-white dark:from-gray-900 to-transparent pointer-events-none rounded-t-lg"></div>
          <div className="absolute bottom-0 left-0 right-2 h-4 bg-gradient-to-t from-white dark:from-gray-900 to-transparent pointer-events-none rounded-b-lg"></div>
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
