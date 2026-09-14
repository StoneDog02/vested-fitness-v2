export type WorkoutCompletionRecord = {
  completed_at?: string | null;
  completed_groups?: string[] | null;
  is_rest?: boolean | null;
  total_groups?: number | null;
  workout_day_id?: string | null;
};

export const REST_COMPLIANCE = 2;

export const WORKOUT_COMPLETION_SELECT =
  "completed_at, completed_groups, is_rest, total_groups, workout_day_id";

export function isRestCompletion(
  completion: WorkoutCompletionRecord | null | undefined
): boolean {
  if (!completion) return false;
  if (completion.is_rest === true) return true;
  if (completion.is_rest === false) return false;
  return (
    !completion.completed_groups || completion.completed_groups.length === 0
  );
}

export function isWorkoutCompletion(
  completion: WorkoutCompletionRecord | null | undefined
): boolean {
  return !!completion && !isRestCompletion(completion);
}

export function completionComplianceValue(
  completion: WorkoutCompletionRecord | null | undefined,
  fallbackTotalGroups?: number
): number {
  if (!completion) return 0;
  if (isRestCompletion(completion)) return REST_COMPLIANCE;

  const total =
    (typeof completion.total_groups === "number" && completion.total_groups > 0
      ? completion.total_groups
      : fallbackTotalGroups) || 0;
  const done = Array.isArray(completion.completed_groups)
    ? completion.completed_groups.length
    : 0;

  if (total > 0) return done / total;
  return done > 0 ? 1 : 0;
}

export function getSubmittedTemplateIds(
  completions: WorkoutCompletionRecord[],
  templates: { id: string; groups?: { id: string }[] }[]
): Set<string> {
  const ids = new Set<string>();

  for (const completion of completions) {
    if (isRestCompletion(completion)) continue;

    if (completion.workout_day_id) {
      ids.add(completion.workout_day_id);
      continue;
    }

    const completedIds = new Set(completion.completed_groups || []);
    if (completedIds.size === 0) continue;

    for (const template of templates) {
      const templateGroupIds = (template.groups || []).map((group) => group.id);
      if (templateGroupIds.some((id) => completedIds.has(id))) {
        ids.add(template.id);
      }
    }
  }

  return ids;
}
