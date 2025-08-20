import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

interface SetData {
  setNumber: number;
  weight?: number;
  reps: string;
  completed?: boolean;
  notes?: string;
}

interface ExerciseData {
  id: string;
  name: string;
  description: string;
  sets: SetData[];
}

interface WorkoutPlanData {
  id: string;
  title: string;
  description: string;
  instructions?: string;
  createdAt: string;
  isActive: boolean;
  builderMode?: 'week' | 'day';
  // Support both old flat structure and new day-based structure
  exercises?: ExerciseData[];
  days?: Array<{
    day: string;
    isRest: boolean;
    workout: {
      title: string;
      type?: string;
      exercises: Array<{
        type: string;
        notes?: string;
        exercises: Array<{
          name: string;
          sets: string;
          reps: string;
          notes?: string;
        }>;
      }>;
    } | null;
  }>;
}

interface ViewWorkoutPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  workoutPlan: WorkoutPlanData;
}

export default function ViewWorkoutPlanModal({
  isOpen,
  onClose,
  workoutPlan,
}: ViewWorkoutPlanModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={workoutPlan.title}
      size="lg"
    >
      <div className="space-y-6">
        <div>
          <p className="text-gray-dark dark:text-gray-light">
            {workoutPlan.description}
          </p>
          {workoutPlan.instructions && (
            <p className="text-sm text-gray-dark dark:text-gray-light mt-2">
              Instructions: {workoutPlan.instructions}
            </p>
          )}
          <p className="text-sm text-gray-dark dark:text-gray-light mt-2">
            Created: {workoutPlan.createdAt}
          </p>
        </div>

        {/* Display workout days if available */}
        {workoutPlan.days && workoutPlan.days.length > 0 ? (
          <div className="space-y-8">
            {/* Check if this is a flexible schedule (builderMode === 'day') */}
            {workoutPlan.builderMode === 'day' ? (
              // Flexible schedule: Show workout templates without day labels
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div className="text-center pb-6 border-b border-gray-200 dark:border-gray-600 mb-6">
                  <h3 className="text-2xl font-bold text-secondary dark:text-alabaster">
                    Workout Templates
                  </h3>
                  <p className="text-lg text-blue-600 dark:text-blue-400 font-semibold mt-1">
                    Flexible Schedule - Do Any Day
                  </p>
                </div>
                
                <div className="grid gap-6">
                  {workoutPlan.days
                    .filter(dayData => !dayData.isRest && dayData.workout)
                    .map((dayData, templateIndex) => (
                      <div key={templateIndex} className="space-y-4">
                        <div className="text-center pb-3 border-b border-gray-200 dark:border-gray-600">
                          <h4 className="text-xl font-semibold text-secondary dark:text-alabaster">
                            {dayData.workout?.title || `Workout ${templateIndex + 1}`}
                          </h4>
                        </div>
                        
                        {dayData.workout?.exercises.map((group, groupIndex) => (
                          <div key={groupIndex} className="space-y-3">
                            {group.notes && (
                              <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 border-l-4 border-blue-500">
                                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium italic">
                                  💡 {group.notes}
                                </p>
                              </div>
                            )}
                            
                            {group.exercises.map((exercise, exerciseIndex) => (
                              <div
                                key={`${groupIndex}-${exerciseIndex}`}
                                className="bg-white dark:bg-gray-900 rounded-lg p-5 border border-gray-200 dark:border-gray-600 shadow-sm hover:shadow-md transition-shadow"
                              >
                                <div className="flex justify-between items-start mb-4">
                                  <div>
                                    <h5 className="text-lg font-semibold text-secondary dark:text-alabaster mb-1">
                                      {exercise.name}
                                    </h5>
                                    {exercise.notes && (
                                      <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                                        {exercise.notes}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                      {typeof exercise.sets === "number" ? exercise.sets : parseInt(exercise.sets) || 1} Sets
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {Array.from({ length: typeof exercise.sets === "number" ? exercise.sets : parseInt(exercise.sets) || 1 }).map((_, setIndex) => (
                                    <div
                                      key={setIndex}
                                      className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700"
                                    >
                                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                        Set {setIndex + 1}
                                      </div>
                                      <div className="text-lg font-bold text-secondary dark:text-alabaster">
                                        {exercise.reps}
                                      </div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400">
                                        reps
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              // Fixed schedule: Show workouts by day of week
              workoutPlan.days.map((dayData, dayIndex) => (
                <div key={dayIndex} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                  {dayData.isRest ? (
                    <div className="text-center py-8">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
                        <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-semibold text-secondary dark:text-alabaster">
                        {dayData.day}
                      </h3>
                      <p className="text-blue-600 dark:text-blue-400 font-medium mt-1">Rest Day</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="text-center pb-4 border-b border-gray-200 dark:border-gray-600">
                        <h3 className="text-2xl font-bold text-secondary dark:text-alabaster">
                          {dayData.day}
                        </h3>
                        <p className="text-lg text-blue-600 dark:text-blue-400 font-semibold mt-1">
                          {dayData.workout?.title || 'Workout'}
                        </p>
                      </div>
                      
                      <div className="grid gap-4">
                        {dayData.workout?.exercises.map((group, groupIndex) => (
                          <div key={groupIndex} className="space-y-3">
                            {group.notes && (
                              <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 border-l-4 border-blue-500">
                                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium italic">
                                  💡 {group.notes}
                                </p>
                              </div>
                            )}
                            
                            {group.exercises.map((exercise, exerciseIndex) => (
                              <div
                                key={`${groupIndex}-${exerciseIndex}`}
                                className="bg-white dark:bg-gray-900 rounded-lg p-5 border border-gray-200 dark:border-gray-600 shadow-sm hover:shadow-md transition-shadow"
                              >
                                <div className="flex justify-between items-start mb-4">
                                  <div>
                                    <h4 className="text-lg font-semibold text-secondary dark:text-alabaster mb-1">
                                      {exercise.name}
                                    </h4>
                                    {exercise.notes && (
                                      <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                                        {exercise.notes}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                      {typeof exercise.sets === "number" ? exercise.sets : parseInt(exercise.sets) || 1} Sets
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {Array.from({ length: typeof exercise.sets === "number" ? exercise.sets : parseInt(exercise.sets) || 1 }).map((_, setIndex) => (
                                    <div
                                      key={setIndex}
                                      className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700"
                                    >
                                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                        Set {setIndex + 1}
                                      </div>
                                      <div className="text-lg font-bold text-secondary dark:text-alabaster">
                                        {exercise.reps}
                                      </div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400">
                                        reps
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          /* Fallback to old flat exercise structure */
          <div className="space-y-6">
            {workoutPlan.exercises?.map((exercise) => (
              <div
                key={exercise.id}
                className="border border-gray-light dark:border-davyGray rounded-lg p-4"
              >
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-medium text-secondary dark:text-alabaster">
                    {exercise.name}
                  </h3>
                  <span className="text-sm text-gray-dark dark:text-gray-light">
                    {exercise.description}
                  </span>
                </div>

                <div className="space-y-2 mt-2">
                  {exercise.sets.map((set) => (
                    <div
                      key={set.setNumber}
                      className="flex gap-4 text-sm items-center"
                    >
                      <span className="font-medium text-secondary dark:text-alabaster">
                        Set {set.setNumber}
                      </span>
                      <span className="text-gray-dark dark:text-gray-light">
                        Reps: {set.reps}
                      </span>
                      {set.weight !== undefined && (
                        <span className="text-gray-dark dark:text-gray-light">
                          Weight: {set.weight} lbs
                        </span>
                      )}
                      {set.notes && (
                        <span className="italic text-gray-500 dark:text-gray-400">
                          Notes: {set.notes}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
