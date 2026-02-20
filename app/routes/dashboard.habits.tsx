import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { extractAuthFromCookie, validateAndRefreshToken } from "~/lib/supabase";
import { getCurrentDate, USER_TIMEZONE } from "~/lib/timezone";
import dayjs from "dayjs";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import { useState, useEffect, useRef } from "react";
import { FireIcon } from "@heroicons/react/24/solid";

export interface HabitPresetRow {
  id: string;
  name: string;
  description: string | null;
  preset_type: string;
  target_default: number | null;
  target_unit: string | null;
  created_at: string;
}

export interface AssignedHabitRow {
  id: string;
  client_id: string;
  habit_preset_id: string;
  custom_name: string | null;
  custom_description: string | null;
  target_value: number | null;
  target_unit: string | null;
  frequency: string;
  times_per_week: number | null;
  schedule_days: number[] | null;
  preset: HabitPresetRow;
}

export interface HabitNoteRow {
  id: string;
  client_habit_id: string | null;
  author_role: string;
  content: string;
  created_at: string;
}

export interface HabitCompletionRow {
  id: string;
  client_habit_id: string;
  completed_at: string;
  value: number | null;
}

export const meta: MetaFunction = () => [
  { title: "Habits | Vested Fitness" },
  { name: "description", content: "Keep daily consistency with goals created by your coach." },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const cookies = parse(request.headers.get("cookie") || "");
  const { accessToken, refreshToken } = extractAuthFromCookie(cookies);
  let authId: string | undefined;
  if (accessToken && refreshToken) {
    const validation = await validateAndRefreshToken(accessToken, refreshToken);
    if (validation.valid) {
      const token = validation.newAccessToken || accessToken;
      const decoded = jwt.decode(token) as Record<string, unknown> | null;
      authId = decoded && typeof decoded === "object" && "sub" in decoded ? (decoded.sub as string) : undefined;
    }
  }
  if (!authId) return redirect("/auth/login");

  const { data: user } = await supabase.from("users").select("id, role").eq("auth_id", authId).single();
  if (!user || user.role !== "client") {
    return json({
      assignedHabits: [],
      completionsToday: [],
      completionsLast7: [],
      notes: [],
      todayStr: getCurrentDate().format("YYYY-MM-DD"),
      weekStartStr: getCurrentDate().startOf("week").format("YYYY-MM-DD"),
    });
  }

  const today = getCurrentDate();
  const todayStr = today.format("YYYY-MM-DD");
  // Current week Sun–Sat: day() is 0=Sun, 1=Mon, … 6=Sat
  const weekStart = today.subtract(today.day(), "day");
  const weekStartStr = weekStart.format("YYYY-MM-DD");
  const weekEndStr = weekStart.add(7, "day").format("YYYY-MM-DD");
  const tomorrow = today.add(1, "day").format("YYYY-MM-DD");

  const [assignedRes, notesRes] = await Promise.all([
    supabase
      .from("client_habits")
      .select(`
        id, client_id, habit_preset_id, custom_name, custom_description, target_value, target_unit, frequency, times_per_week, schedule_days,
        habit_presets ( id, name, description, preset_type, target_default, target_unit, created_at )
      `)
      .eq("client_id", user.id)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("habit_notes")
      .select("id, client_habit_id, author_role, content, created_at")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const assignedRaw = assignedRes.data || [];
  const clientHabitIds = assignedRaw.map((r: any) => r.id);

  let completionsToday: HabitCompletionRow[] = [];
  let completionsLast7: HabitCompletionRow[] = [];
  if (clientHabitIds.length > 0) {
    const [todayRes, last7Res] = await Promise.all([
      supabase
        .from("habit_completions")
        .select("id, client_habit_id, completed_at, value")
        .in("client_habit_id", clientHabitIds)
        .gte("completed_at", todayStr)
        .lt("completed_at", tomorrow),
      supabase
        .from("habit_completions")
        .select("id, client_habit_id, completed_at, value")
        .in("client_habit_id", clientHabitIds)
        .gte("completed_at", weekStartStr)
        .lt("completed_at", weekEndStr),
    ]);
    completionsToday = (todayRes.data || []) as HabitCompletionRow[];
    completionsLast7 = (last7Res.data || []) as HabitCompletionRow[];
  }

  const assignedHabits: AssignedHabitRow[] = assignedRaw.map((row: any) => ({
    id: row.id,
    client_id: row.client_id,
    habit_preset_id: row.habit_preset_id,
    custom_name: row.custom_name,
    custom_description: row.custom_description,
    target_value: row.target_value,
    target_unit: row.target_unit,
    frequency: row.frequency,
    times_per_week: row.times_per_week ?? null,
    schedule_days: row.schedule_days ?? null,
    preset: row.habit_presets,
  }));
  const notes = (notesRes.data || []) as HabitNoteRow[];

  return json({
    assignedHabits,
    completionsToday,
    completionsLast7,
    notes,
    todayStr,
    weekStartStr,
  });
};

function displayName(assigned: AssignedHabitRow) {
  return assigned.custom_name?.trim() || assigned.preset?.name || "Habit";
}

function formatTarget(assigned: AssignedHabitRow) {
  if (assigned.target_unit) return assigned.target_unit;
  const value = assigned.target_value ?? assigned.preset?.target_default;
  const unit = assigned.preset?.target_unit;
  if (value != null && unit) return `${value} ${unit}`;
  return null;
}

function computeStreak(completedDates: Set<string>, todayStr: string): number {
  let streak = 0;
  let d = dayjs(todayStr);
  for (let i = 0; i < 365; i++) {
    const key = d.format("YYYY-MM-DD");
    if (completedDates.has(key)) streak++;
    else break;
    d = d.subtract(1, "day");
  }
  return streak;
}

function completionsThisWeek(completedDates: Set<string>): number {
  const weekStart = dayjs().startOf("isoWeek").format("YYYY-MM-DD");
  const weekEnd = dayjs().endOf("isoWeek").format("YYYY-MM-DD");
  return [...completedDates].filter((d) => d >= weekStart && d <= weekEnd).length;
}

export default function DashboardHabits() {
  const { assignedHabits, completionsToday, completionsLast7, notes, todayStr, weekStartStr } =
    useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [noteContent, setNoteContent] = useState("");
  const [noteHabitId, setNoteHabitId] = useState<string>("");

  const submitFetcher = useFetcher();
  const noteFetcher = useFetcher();

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const c of completionsToday) {
      next[c.client_habit_id] = true;
    }
    setChecked(next);
  }, [completionsToday]);

  const handleToggle = (clientHabitId: string) => {
    setChecked((prev) => ({ ...prev, [clientHabitId]: !prev[clientHabitId] }));
  };

  const handleSubmitHabits = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitFetcher.state !== "idle") return;
    const completed = assignedHabits.filter((a) => checked[a.id]).map((a) => ({
      client_habit_id: a.id,
      date: todayStr,
      value: values[a.id] ? parseFloat(values[a.id]) : undefined,
    }));
    const payload = { date: todayStr, completions: completed };
    submitFetcher.submit(payload, {
      method: "post",
      action: "/api/submit-habit-completions",
      encType: "application/json",
    });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() || noteFetcher.state !== "idle") return;
    noteFetcher.submit(
      { content: noteContent.trim(), clientHabitId: noteHabitId || null },
      { method: "post", action: "/api/create-habit-note", encType: "application/json" }
    );
    setNoteContent("");
    setNoteHabitId("");
  };

  const submitDone = submitFetcher.data as { success?: boolean; error?: string } | undefined;
  const noteDone = noteFetcher.data as { note?: unknown; error?: string } | undefined;

  const revalidatedRef = useRef<{ submit?: unknown; note?: unknown }>({});
  useEffect(() => {
    let didRevalidate = false;
    if (submitDone?.success && revalidatedRef.current.submit !== submitDone) {
      revalidatedRef.current.submit = submitDone;
      didRevalidate = true;
    }
    if (noteDone?.note && revalidatedRef.current.note !== noteDone) {
      revalidatedRef.current.note = noteDone;
      didRevalidate = true;
    }
    if (didRevalidate) revalidator.revalidate();
  }, [submitDone, noteDone, revalidator]);

  const apiError = submitDone?.error || noteDone?.error;

  // 0 = Monday, 1 = Tuesday, ..., 6 = Sunday (matches schedule_days in DB)
  const todayDayIndex = (dayjs().day() + 6) % 7;
  const habitsForToday = assignedHabits.filter((a) => {
    if (a.frequency === "daily" || !a.frequency) return true;
    // Times per week with "any day" (no specific schedule_days): show every day
    if (a.frequency === "times_per_week" && (!a.schedule_days || a.schedule_days.length === 0)) return true;
    if ((a.frequency === "weekly" || a.frequency === "times_per_week") && a.schedule_days?.length) {
      return a.schedule_days.includes(todayDayIndex);
    }
    return false;
  });
  const completedTodayForDisplay = habitsForToday.filter((a) => checked[a.id]).length;
  const totalToday = habitsForToday.length;

  const last7ByHabit: Record<string, Set<string>> = {};
  for (const c of completionsLast7) {
    if (!last7ByHabit[c.client_habit_id]) last7ByHabit[c.client_habit_id] = new Set();
    last7ByHabit[c.client_habit_id].add(c.completed_at);
  }

  // Current week Sun–Sat (weekStartStr is Sunday)
  const sevenDayDates = Array.from({ length: 7 }, (_, i) =>
    dayjs(weekStartStr).add(i, "day").format("YYYY-MM-DD")
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {apiError && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
          {apiError}
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">Habits</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Keep daily consistency with goals created by your coach.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Focus */}
        <Card
          title="Today's Focus"
          action={
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {completedTodayForDisplay}/{totalToday} completed
            </span>
          }
        >
          {assignedHabits.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 py-4">No habits assigned yet. Ask your coach to assign habits.</p>
          ) : habitsForToday.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 py-4">No habits scheduled for today. Check back on your scheduled days.</p>
          ) : (
            <>
              <ul className="space-y-4">
                {habitsForToday.map((assigned) => {
                  const isChecked = checked[assigned.id] ?? false;
                  const targetStr = formatTarget(assigned);
                  const hasTarget = assigned.preset?.preset_type === "steps" || assigned.preset?.preset_type === "water";
                  return (
                    <li
                      key={assigned.id}
                      className="p-4 rounded-xl border border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-secondary dark:text-alabaster">{displayName(assigned)}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {targetStr ? `${targetStr} · ` : ""}
                          {assigned.frequency === "daily"
                            ? "Every day"
                            : assigned.frequency === "weekly"
                              ? "Weekly"
                              : assigned.frequency === "times_per_week" && assigned.times_per_week
                                ? `${assigned.times_per_week}x per week`
                                : "Flexible"}
                        </div>
                        {assigned.custom_description?.trim() || assigned.preset?.description ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {assigned.custom_description?.trim() || assigned.preset?.description}
                          </p>
                        ) : null}
                        {notes.some((n) => n.client_habit_id === assigned.id && n.author_role === "coach") && (
                          <div className="mt-2 text-sm text-purple-600 dark:text-purple-400">
                            {notes
                              .filter((n) => n.client_habit_id === assigned.id && n.author_role === "coach")
                              .slice(0, 1)
                              .map((n) => (
                                <span key={n.id}>
                                  Coach Note ({dayjs(n.created_at).format("MMM D")}): {n.content}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {assigned.frequency === "daily"
                            ? "Daily"
                            : assigned.frequency === "times_per_week" && assigned.times_per_week
                              ? `${assigned.times_per_week}x/week`
                              : assigned.frequency === "weekly"
                                ? "Weekly"
                                : assigned.frequency}
                        </span>
                        {hasTarget && (
                          <input
                            type="number"
                            placeholder={assigned.preset?.target_default?.toString() || ""}
                            value={values[assigned.id] ?? ""}
                            onChange={(e) => setValues((v) => ({ ...v, [assigned.id]: e.target.value }))}
                            className="w-20 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-secondary dark:text-alabaster"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggle(assigned.id)}
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isChecked
                              ? "bg-primary border-primary text-white"
                              : "border-gray-300 dark:border-gray-500 hover:border-primary"
                          }`}
                          aria-label={isChecked ? "Mark incomplete" : "Mark complete"}
                        >
                          {isChecked ? "✓" : ""}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <form onSubmit={handleSubmitHabits} className="mt-6">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitFetcher.state !== "idle"}
                >
                  Submit Habits
                </Button>
              </form>
            </>
          )}
        </Card>

        {/* Weekly Momentum */}
        <Card title="Weekly Momentum">
          {assignedHabits.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 py-4">No habits to show momentum for.</p>
          ) : (
            <ul className="space-y-4">
              {assignedHabits.map((assigned) => {
                const completedDates = last7ByHabit[assigned.id] || new Set<string>();
                const streak = computeStreak(completedDates, todayStr);
                const isTimesPerWeek = assigned.frequency === "times_per_week" && assigned.times_per_week;
                const weekCount = completionsThisWeek(completedDates);
                return (
                  <li
                    key={assigned.id}
                    className="p-4 rounded-xl border border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50"
                  >
                    <div className="font-medium text-secondary dark:text-alabaster">{displayName(assigned)}</div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {isTimesPerWeek ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm ${
                            weekCount >= (assigned.times_per_week ?? 0)
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                              : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                          }`}
                        >
                          {weekCount}/{assigned.times_per_week} this week
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-sm">
                          <FireIcon className="w-4 h-4" />
                          {streak} day streak
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 mt-3">
                      {sevenDayDates.map((d) => {
                        const filled = completedDates.has(d);
                        return (
                          <div
                            key={d}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                              filled ? "bg-primary text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-500"
                            }`}
                            title={dayjs(d).format("ddd MMM D")}
                          >
                            {dayjs(d).format("D")}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This week (Sun–Sat)</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Coach Notes */}
      <Card title="Coach Notes">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Share quick feedback or updates for your coach. Tie it to a specific habit or leave it general.
        </p>
        <form onSubmit={handleAddNote} className="space-y-4">
          <div>
            <label htmlFor="client-habit-note-content" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">Add a note</label>
            <textarea
              id="client-habit-note-content"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Share a quick note with your coach."
              rows={3}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster"
            />
          </div>
          <div>
            <label htmlFor="client-habit-note-habit" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">Tie to habit</label>
            <select
              id="client-habit-note-habit"
              value={noteHabitId}
              onChange={(e) => setNoteHabitId(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster"
            >
              <option value="">General note</option>
              {assignedHabits.map((a) => (
                <option key={a.id} value={a.id}>
                  {displayName(a)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" disabled={!noteContent.trim() || noteFetcher.state !== "idle"}>
            Add Note
          </Button>
        </form>
        <div className="mt-6">
          <h4 className="font-medium text-secondary dark:text-alabaster mb-2">Notes</h4>
          {notes.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className={`p-3 rounded-lg border ${
                    note.author_role === "coach"
                      ? "bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800"
                      : "bg-gray-50 dark:bg-gray-700/50 border-gray-100 dark:border-gray-600"
                  }`}
                >
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {note.author_role === "coach" ? "Coach" : "You"} · {dayjs(note.created_at).format("MMM D, YYYY")}
                  </div>
                  <p className="text-sm text-secondary dark:text-alabaster mt-1">{note.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
