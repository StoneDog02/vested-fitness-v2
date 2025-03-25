export type WorkoutType = "Single" | "SuperSet" | "GiantSet";

export interface WorkoutSet {
  setNumber: number;
  weight?: number;
  reps: number;
  completed: boolean;
  notes?: string;
}

export interface Exercise {
  id: string;
  name: string;
  description: string;
  type: WorkoutType;
  videoUrl?: string;
  sets: WorkoutSet[];
}

export interface DailyWorkout {
  id: string;
  name: string;
  exercises: Exercise[];
  date: string;
  completed: boolean;
}
