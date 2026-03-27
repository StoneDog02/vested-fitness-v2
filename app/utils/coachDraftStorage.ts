/**
 * Client-side coach draft persistence (localStorage + IndexedDB).
 * Cleared explicitly after successful save to Supabase — no server drafts.
 */

export const COACH_DRAFT_VERSION = 1 as const;

export type CoachDraftEnvelope<T> = {
  version: typeof COACH_DRAFT_VERSION;
  updatedAt: string;
  payload: T;
};

export type MealPlanDraftPayload = {
  title: string;
  description: string;
  meals: unknown;
  activeMealIndex?: number;
};

export type SupplementDraftPayload = {
  name: string;
  dosage: string;
  frequency: string;
  instructions: string;
  active_from: string;
};

/** Matches CustomizeHabitModal cadence options (avoid importing from components). */
export type HabitCustomizeCadenceDraft = "daily" | "weekly" | "times_per_week";

export type HabitCustomizeDraftPayload = {
  habitName: string;
  goalTarget: string;
  cadence: HabitCustomizeCadenceDraft;
  timesPerWeek: number;
  scheduleDays: number[];
  scheduleAnyDay: boolean;
  notesForClient: string;
};

export type HabitPresetCreateDraftPayload = {
  name: string;
  description: string;
};

/** Serializable workout modal state (File fields omitted). */
export type WorkoutDraftPayload = {
  planName: string;
  instructions: string;
  builderMode: "week" | "day";
  workoutDaysPerWeek: number;
  weekPlans: Record<string, unknown>;
  workoutTemplates: unknown[];
  savedDays: Record<string, boolean>;
  currentDayIndex: number;
  currentWorkoutIndex: number;
};

const LS_PREFIX = "vf:coachDraft:v1:";

const IDB_NAME = "vf-coach-drafts";
const IDB_VERSION = 1;
const IDB_STORE = "drafts";

function mealStorageKey(clientId: string, planIdOrNew: string): string {
  return `${LS_PREFIX}meal:${clientId}:${planIdOrNew}`;
}

function supplementStorageKey(clientId: string, supplementIdOrNew: string): string {
  return `${LS_PREFIX}supplement:${clientId}:${supplementIdOrNew}`;
}

function habitCustomizeStorageKey(clientId: string, habitPresetId: string): string {
  return `${LS_PREFIX}habitCustom:${clientId}:${habitPresetId}`;
}

function habitPresetCreateStorageKey(clientId: string): string {
  return `${LS_PREFIX}habitPresetNew:${clientId}`;
}

function workoutStorageKey(clientId: string, planIdOrNew: string): string {
  return `${LS_PREFIX}workout:${clientId}:${planIdOrNew}`;
}

// --- localStorage (meal + supplement) ---

export function loadMealDraftEnvelope(
  clientId: string,
  planId: string | null
): CoachDraftEnvelope<MealPlanDraftPayload> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(mealStorageKey(clientId, planId ?? "new"));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoachDraftEnvelope<MealPlanDraftPayload>;
    if (parsed?.version !== COACH_DRAFT_VERSION || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMealDraftSync(
  clientId: string,
  planId: string | null,
  payload: MealPlanDraftPayload
): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: CoachDraftEnvelope<MealPlanDraftPayload> = {
      version: COACH_DRAFT_VERSION,
      updatedAt: new Date().toISOString(),
      payload,
    };
    localStorage.setItem(mealStorageKey(clientId, planId ?? "new"), JSON.stringify(envelope));
  } catch (e) {
    console.warn("[coachDraft] Failed to save meal draft", e);
  }
}

export function clearMealDraft(clientId: string, planId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(mealStorageKey(clientId, planId ?? "new"));
  } catch {
    /* ignore */
  }
}

const mealDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function saveMealDraftDebounced(
  clientId: string,
  planId: string | null,
  payload: MealPlanDraftPayload,
  ms = 400
): void {
  const key = mealStorageKey(clientId, planId ?? "new");
  const prev = mealDebounceTimers.get(key);
  if (prev) clearTimeout(prev);
  mealDebounceTimers.set(
    key,
    setTimeout(() => {
      mealDebounceTimers.delete(key);
      saveMealDraftSync(clientId, planId, payload);
    }, ms)
  );
}

export function flushMealDraft(clientId: string, planId: string | null): void {
  const key = mealStorageKey(clientId, planId ?? "new");
  const prev = mealDebounceTimers.get(key);
  if (prev) {
    clearTimeout(prev);
    mealDebounceTimers.delete(key);
  }
}

// --- supplement ---

export function loadSupplementDraftEnvelope(
  clientId: string,
  supplementId: string | null
): CoachDraftEnvelope<SupplementDraftPayload> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(supplementStorageKey(clientId, supplementId ?? "new"));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoachDraftEnvelope<SupplementDraftPayload>;
    if (parsed?.version !== COACH_DRAFT_VERSION || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSupplementDraftSync(
  clientId: string,
  supplementId: string | null,
  payload: SupplementDraftPayload
): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: CoachDraftEnvelope<SupplementDraftPayload> = {
      version: COACH_DRAFT_VERSION,
      updatedAt: new Date().toISOString(),
      payload,
    };
    localStorage.setItem(
      supplementStorageKey(clientId, supplementId ?? "new"),
      JSON.stringify(envelope)
    );
  } catch (e) {
    console.warn("[coachDraft] Failed to save supplement draft", e);
  }
}

export function clearSupplementDraft(clientId: string, supplementId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(supplementStorageKey(clientId, supplementId ?? "new"));
  } catch {
    /* ignore */
  }
}

const supplementDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function saveSupplementDraftDebounced(
  clientId: string,
  supplementId: string | null,
  payload: SupplementDraftPayload,
  ms = 400
): void {
  const key = supplementStorageKey(clientId, supplementId ?? "new");
  const prev = supplementDebounceTimers.get(key);
  if (prev) clearTimeout(prev);
  supplementDebounceTimers.set(
    key,
    setTimeout(() => {
      supplementDebounceTimers.delete(key);
      saveSupplementDraftSync(clientId, supplementId, payload);
    }, ms)
  );
}

export function flushSupplementDraft(clientId: string, supplementId: string | null): void {
  const key = supplementStorageKey(clientId, supplementId ?? "new");
  const prev = supplementDebounceTimers.get(key);
  if (prev) {
    clearTimeout(prev);
    supplementDebounceTimers.delete(key);
  }
}

// --- habit (customize modal + create preset on client habits page) ---

export function loadHabitCustomizeDraftEnvelope(
  clientId: string,
  habitPresetId: string
): CoachDraftEnvelope<HabitCustomizeDraftPayload> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(habitCustomizeStorageKey(clientId, habitPresetId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoachDraftEnvelope<HabitCustomizeDraftPayload>;
    if (parsed?.version !== COACH_DRAFT_VERSION || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveHabitCustomizeDraftSync(
  clientId: string,
  habitPresetId: string,
  payload: HabitCustomizeDraftPayload
): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: CoachDraftEnvelope<HabitCustomizeDraftPayload> = {
      version: COACH_DRAFT_VERSION,
      updatedAt: new Date().toISOString(),
      payload,
    };
    localStorage.setItem(
      habitCustomizeStorageKey(clientId, habitPresetId),
      JSON.stringify(envelope)
    );
  } catch (e) {
    console.warn("[coachDraft] Failed to save habit customize draft", e);
  }
}

export function clearHabitCustomizeDraft(clientId: string, habitPresetId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(habitCustomizeStorageKey(clientId, habitPresetId));
  } catch {
    /* ignore */
  }
}

const habitCustomizeDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function saveHabitCustomizeDraftDebounced(
  clientId: string,
  habitPresetId: string,
  payload: HabitCustomizeDraftPayload,
  ms = 400
): void {
  const key = habitCustomizeStorageKey(clientId, habitPresetId);
  const prev = habitCustomizeDebounceTimers.get(key);
  if (prev) clearTimeout(prev);
  habitCustomizeDebounceTimers.set(
    key,
    setTimeout(() => {
      habitCustomizeDebounceTimers.delete(key);
      saveHabitCustomizeDraftSync(clientId, habitPresetId, payload);
    }, ms)
  );
}

export function flushHabitCustomizeDraft(clientId: string, habitPresetId: string): void {
  const key = habitCustomizeStorageKey(clientId, habitPresetId);
  const prev = habitCustomizeDebounceTimers.get(key);
  if (prev) {
    clearTimeout(prev);
    habitCustomizeDebounceTimers.delete(key);
  }
}

export function loadHabitPresetCreateDraftEnvelope(
  clientId: string
): CoachDraftEnvelope<HabitPresetCreateDraftPayload> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(habitPresetCreateStorageKey(clientId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoachDraftEnvelope<HabitPresetCreateDraftPayload>;
    if (parsed?.version !== COACH_DRAFT_VERSION || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveHabitPresetCreateDraftSync(
  clientId: string,
  payload: HabitPresetCreateDraftPayload
): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: CoachDraftEnvelope<HabitPresetCreateDraftPayload> = {
      version: COACH_DRAFT_VERSION,
      updatedAt: new Date().toISOString(),
      payload,
    };
    localStorage.setItem(habitPresetCreateStorageKey(clientId), JSON.stringify(envelope));
  } catch (e) {
    console.warn("[coachDraft] Failed to save habit preset create draft", e);
  }
}

export function clearHabitPresetCreateDraft(clientId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(habitPresetCreateStorageKey(clientId));
  } catch {
    /* ignore */
  }
}

const habitPresetCreateDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function saveHabitPresetCreateDraftDebounced(
  clientId: string,
  payload: HabitPresetCreateDraftPayload,
  ms = 400
): void {
  const key = habitPresetCreateStorageKey(clientId);
  const prev = habitPresetCreateDebounceTimers.get(key);
  if (prev) clearTimeout(prev);
  habitPresetCreateDebounceTimers.set(
    key,
    setTimeout(() => {
      habitPresetCreateDebounceTimers.delete(key);
      saveHabitPresetCreateDraftSync(clientId, payload);
    }, ms)
  );
}

export function flushHabitPresetCreateDraft(clientId: string): void {
  const key = habitPresetCreateStorageKey(clientId);
  const prev = habitPresetCreateDebounceTimers.get(key);
  if (prev) {
    clearTimeout(prev);
    habitPresetCreateDebounceTimers.delete(key);
  }
}

// --- IndexedDB (workout) ---

let idbPromise: Promise<IDBDatabase> | null = null;

function openWorkoutDraftDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
  });
  return idbPromise;
}

type WorkoutDraftRecord = {
  id: string;
  envelope: CoachDraftEnvelope<WorkoutDraftPayload>;
};

export async function loadWorkoutDraftEnvelope(
  clientId: string,
  planId: string | null
): Promise<CoachDraftEnvelope<WorkoutDraftPayload> | null> {
  if (typeof window === "undefined") return null;
  try {
    const db = await openWorkoutDraftDB();
    const id = workoutStorageKey(clientId, planId ?? "new");
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const r = store.get(id);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const row = r.result as WorkoutDraftRecord | undefined;
        if (!row?.envelope || row.envelope.version !== COACH_DRAFT_VERSION) {
          resolve(null);
          return;
        }
        resolve(row.envelope);
      };
    });
  } catch (e) {
    console.warn("[coachDraft] Failed to load workout draft", e);
    return null;
  }
}

export async function saveWorkoutDraftSync(
  clientId: string,
  planId: string | null,
  payload: WorkoutDraftPayload
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openWorkoutDraftDB();
    const id = workoutStorageKey(clientId, planId ?? "new");
    const envelope: CoachDraftEnvelope<WorkoutDraftPayload> = {
      version: COACH_DRAFT_VERSION,
      updatedAt: new Date().toISOString(),
      payload,
    };
    const record: WorkoutDraftRecord = { id, envelope };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const r = store.put(record);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve();
    });
  } catch (e) {
    console.warn("[coachDraft] Failed to save workout draft", e);
  }
}

export async function clearWorkoutDraft(clientId: string, planId: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openWorkoutDraftDB();
    const id = workoutStorageKey(clientId, planId ?? "new");
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const r = store.delete(id);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

const workoutDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function saveWorkoutDraftDebounced(
  clientId: string,
  planId: string | null,
  payload: WorkoutDraftPayload,
  ms = 400
): void {
  const id = workoutStorageKey(clientId, planId ?? "new");
  const prev = workoutDebounceTimers.get(id);
  if (prev) clearTimeout(prev);
  workoutDebounceTimers.set(
    id,
    setTimeout(() => {
      workoutDebounceTimers.delete(id);
      void saveWorkoutDraftSync(clientId, planId, payload);
    }, ms)
  );
}

export function flushWorkoutDraft(clientId: string, planId: string | null): void {
  const id = workoutStorageKey(clientId, planId ?? "new");
  const prev = workoutDebounceTimers.get(id);
  if (prev) {
    clearTimeout(prev);
    workoutDebounceTimers.delete(id);
  }
}
