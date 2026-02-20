import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator, useParams } from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { extractAuthFromCookie, validateAndRefreshToken } from "~/lib/supabase";
import { getStartOfWeek, USER_TIMEZONE } from "~/lib/timezone";
import dayjs from "dayjs";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import CustomizeHabitModal from "~/components/coach/CustomizeHabitModal";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import { useState, useEffect, useRef } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

export interface HabitPresetRow {
  id: string;
  name: string;
  description: string | null;
  preset_type: string;
  target_default: number | null;
  target_unit: string | null;
  coach_id: string | null;
  created_at: string;
}

export interface AssignedHabitRow {
  id: string;
  client_id: string;
  habit_preset_id: string;
  coach_id: string;
  custom_name: string | null;
  custom_description: string | null;
  target_value: number | null;
  target_unit: string | null;
  frequency: string;
  times_per_week: number | null;
  schedule_days: number[] | null;
  assigned_at: string;
  preset: HabitPresetRow;
}

export interface HabitNoteRow {
  id: string;
  client_id: string;
  coach_id: string;
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
  { title: "Client Habits | Vested Fitness" },
  { name: "description", content: "Manage habit goals and track daily consistency" },
];

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const clientIdParam = params.clientId;
  if (!clientIdParam) return json({ client: null, presets: [], assignedHabits: [], completions: [], notes: [], weekStart: null }, { status: 200 });

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const [clientBySlug, clientById] = await Promise.all([
    supabase.from("users").select("id, name, coach_id, slug").eq("slug", clientIdParam).single(),
    supabase.from("users").select("id, name, coach_id, slug").eq("id", clientIdParam).single(),
  ]);
  const client = clientBySlug.data || clientById.data;
  if (!client) {
    return json({ client: null, presets: [], assignedHabits: [], completions: [], notes: [], weekStart: null }, { status: 200 });
  }

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
  const { data: currentUser } = await supabase.from("users").select("id, role").eq("auth_id", authId).single();
  if (!currentUser || currentUser.role !== "coach" || client.coach_id !== currentUser.id) {
    return json({ client: null, presets: [], assignedHabits: [], completions: [], notes: [], weekStart: null }, { status: 200 });
  }

  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  const weekStart = weekStartParam
    ? dayjs.tz(weekStartParam, USER_TIMEZONE).startOf("day").toDate()
    : getStartOfWeek().toDate();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const weekStartStr = dayjs(weekStart).format("YYYY-MM-DD");
  const weekEndStr = dayjs(weekEnd).format("YYYY-MM-DD");

  const [presetsRes, assignedRes, notesRes] = await Promise.all([
    supabase
      .from("habit_presets")
      .select("id, name, description, preset_type, target_default, target_unit, coach_id, created_at")
      .or("coach_id.is.null,coach_id.eq." + currentUser.id)
      .order("name", { ascending: true }),
    supabase
      .from("client_habits")
      .select(`
        id, client_id, habit_preset_id, coach_id, custom_name, custom_description, target_value, target_unit, frequency, times_per_week, schedule_days, assigned_at,
        habit_presets ( id, name, description, preset_type, target_default, target_unit, coach_id, created_at )
      `)
      .eq("client_id", client.id)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("habit_notes")
      .select("id, client_id, coach_id, client_habit_id, author_role, content, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const presets = (presetsRes.data || []) as HabitPresetRow[];
  const assignedRaw = assignedRes.data || [];
  const assignedHabits: AssignedHabitRow[] = assignedRaw.map((row: any) => ({
    id: row.id,
    client_id: row.client_id,
    habit_preset_id: row.habit_preset_id,
    coach_id: row.coach_id,
    custom_name: row.custom_name,
    custom_description: row.custom_description,
    target_value: row.target_value,
    target_unit: row.target_unit,
    frequency: row.frequency,
    times_per_week: row.times_per_week ?? null,
    schedule_days: row.schedule_days ?? null,
    assigned_at: row.assigned_at,
    preset: row.habit_presets,
  }));
  const clientHabitIds = assignedHabits.map((a) => a.id);
  let completions: HabitCompletionRow[] = [];
  if (clientHabitIds.length > 0) {
    const completionsRes = await supabase
      .from("habit_completions")
      .select("id, client_habit_id, completed_at, value")
      .in("client_habit_id", clientHabitIds)
      .gte("completed_at", weekStartStr)
      .lt("completed_at", weekEndStr);
    completions = (completionsRes.data || []) as HabitCompletionRow[];
  }
  const notes = (notesRes.data || []) as HabitNoteRow[];

  return json({
    client: { id: client.id, name: client.name, slug: client.slug },
    presets,
    assignedHabits,
    completions,
    notes,
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
  });
};

function formatTarget(preset: HabitPresetRow, targetValue: number | null, targetUnit: string | null) {
  if (targetUnit) return targetUnit;
  const value = targetValue ?? preset.target_default;
  const unit = preset.target_unit;
  if (value != null && unit) return `${value} ${unit}`;
  return null;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatScheduleDays(scheduleDays: number[] | null): string | null {
  if (!scheduleDays || scheduleDays.length === 0) return null;
  return scheduleDays.map((d) => DAY_LABELS[d]).join(", ");
}

function displayName(assigned: AssignedHabitRow) {
  return assigned.custom_name?.trim() || assigned.preset?.name || "Habit";
}

function displayDescription(assigned: AssignedHabitRow) {
  return assigned.custom_description?.trim() || assigned.preset?.description || "";
}

export default function ClientHabits() {
  const { client, presets, assignedHabits, completions, notes, weekStart, weekEnd } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const params = useParams();
  const clientId = params.clientId;

  const [searchLibrary, setSearchLibrary] = useState("");
  const [presetPage, setPresetPage] = useState(1);
  const [customizePreset, setCustomizePreset] = useState<HabitPresetRow | null>(null);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteHabitId, setNoteHabitId] = useState<string>("");

  const fetcherCreatePreset = useFetcher();
  const fetcherAssign = useFetcher();
  const fetcherUnassign = useFetcher();
  const fetcherNote = useFetcher();

  const filteredPresets = presets.filter(
    (p) =>
      !searchLibrary ||
      p.name.toLowerCase().includes(searchLibrary.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(searchLibrary.toLowerCase())
  );

  const PRESETS_PER_PAGE = 4;
  const totalPresetPages = Math.max(1, Math.ceil(filteredPresets.length / PRESETS_PER_PAGE));
  const currentPresetPage = Math.min(presetPage, totalPresetPages);
  const paginatedPresets = filteredPresets.slice(
    (currentPresetPage - 1) * PRESETS_PER_PAGE,
    currentPresetPage * PRESETS_PER_PAGE
  );

  useEffect(() => {
    setPresetPage(1);
  }, [searchLibrary]);

  const handleCreateHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || fetcherCreatePreset.state !== "idle") return;
    fetcherCreatePreset.submit(
      { name: createName.trim(), description: createDescription.trim() },
      { method: "post", action: "/api/create-habit-preset", encType: "application/json" }
    );
    setCreateName("");
    setCreateDescription("");
  };

  const handleAssignFromModal = (payload: {
    habitPresetId: string;
    customName: string;
    customDescription: string;
    targetValue: number | null;
    targetUnit: string | null;
    frequency: "daily" | "weekly" | "times_per_week";
    timesPerWeek: number | null;
    scheduleDays: number[] | null;
  }) => {
    if (!client?.id || fetcherAssign.state !== "idle") return;
    fetcherAssign.submit(
      {
        clientId: client.id,
        habitPresetId: payload.habitPresetId,
        customName: payload.customName,
        customDescription: payload.customDescription,
        targetValue: payload.targetValue,
        targetUnit: payload.targetUnit,
        frequency: payload.frequency,
        timesPerWeek: payload.timesPerWeek,
        scheduleDays: payload.scheduleDays,
      },
      { method: "post", action: "/api/assign-habit", encType: "application/json" }
    );
    setCustomizePreset(null);
  };

  const handleUnassign = (clientHabitId: string) => {
    if (fetcherUnassign.state !== "idle") return;
    fetcherUnassign.submit(
      { clientHabitId },
      { method: "post", action: "/api/unassign-habit", encType: "application/json" }
    );
  };

  const handleSendNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() || !client?.id || fetcherNote.state !== "idle") return;
    fetcherNote.submit(
      { clientId: client.id, content: noteContent.trim(), clientHabitId: noteHabitId || null },
      { method: "post", action: "/api/create-habit-note", encType: "application/json" }
    );
    setNoteContent("");
    setNoteHabitId("");
  };

  const assignDone = fetcherAssign.data as { assigned?: unknown; error?: string } | undefined;
  const unassignDone = fetcherUnassign.data as { success?: boolean; error?: string } | undefined;
  const createDone = fetcherCreatePreset.data as { preset?: unknown; error?: string } | undefined;
  const noteDone = fetcherNote.data as { note?: unknown; error?: string } | undefined;

  const revalidatedRef = useRef<{ assign?: unknown; unassign?: unknown; create?: unknown; note?: unknown }>({});
  useEffect(() => {
    let didRevalidate = false;
    if (assignDone?.assigned && revalidatedRef.current.assign !== assignDone) {
      revalidatedRef.current.assign = assignDone;
      didRevalidate = true;
    }
    if (unassignDone?.success && revalidatedRef.current.unassign !== unassignDone) {
      revalidatedRef.current.unassign = unassignDone;
      didRevalidate = true;
    }
    if (createDone?.preset && revalidatedRef.current.create !== createDone) {
      revalidatedRef.current.create = createDone;
      didRevalidate = true;
    }
    if (noteDone?.note && revalidatedRef.current.note !== noteDone) {
      revalidatedRef.current.note = noteDone;
      didRevalidate = true;
    }
    if (didRevalidate) revalidator.revalidate();
  }, [assignDone, unassignDone, createDone, noteDone, revalidator]);

  const apiError = assignDone?.error || unassignDone?.error || createDone?.error || noteDone?.error;

  const completionByHabitAndDate: Record<string, Set<string>> = {};
  for (const c of completions) {
    if (!completionByHabitAndDate[c.client_habit_id]) completionByHabitAndDate[c.client_habit_id] = new Set();
    completionByHabitAndDate[c.client_habit_id].add(c.completed_at);
  }

  if (!client) {
    return (
      <ClientDetailLayout>
        <div className="p-6">
          <p className="text-gray-500 dark:text-gray-400">Client not found.</p>
        </div>
      </ClientDetailLayout>
    );
  }

  const weekStartDate = weekStart ? dayjs(weekStart) : null;
  const prevWeek = weekStartDate ? weekStartDate.subtract(7, "day").format("YYYY-MM-DD") : "";
  const nextWeek = weekEnd || "";

  return (
    <ClientDetailLayout>
      <CustomizeHabitModal
        isOpen={!!customizePreset}
        onClose={() => setCustomizePreset(null)}
        preset={customizePreset}
        onAssign={handleAssignFromModal}
        isLoading={fetcherAssign.state !== "idle"}
      />
      <div className="p-6 space-y-6">
        {apiError && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
            {apiError}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">{client.name}'s Habits</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Create habit goals and track daily consistency.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Preset Library + Create Habit */}
          <div className="space-y-6">
            <Card
              title="Preset Library"
              action={null}
            >
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Search and assign habit presets, or add custom presets below.
              </p>
              <div className="relative mb-4">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search library..."
                  value={searchLibrary}
                  onChange={(e) => setSearchLibrary(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster"
                />
              </div>
              <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
                <span>{filteredPresets.length} presets</span>
                {totalPresetPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPresetPage((p) => Math.max(1, p - 1))}
                      disabled={currentPresetPage <= 1}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:pointer-events-none text-secondary dark:text-alabaster"
                      aria-label="Previous page"
                    >
                      <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <span className="min-w-[4rem] text-center">
                      {currentPresetPage} / {totalPresetPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPresetPage((p) => Math.min(totalPresetPages, p + 1))}
                      disabled={currentPresetPage >= totalPresetPages}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:pointer-events-none text-secondary dark:text-alabaster"
                      aria-label="Next page"
                    >
                      <ChevronRightIcon className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {paginatedPresets.map((preset) => {
                  const alreadyAssigned = assignedHabits.some((a) => a.habit_preset_id === preset.id);
                  const targetStr = formatTarget(preset, null, null);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={alreadyAssigned || fetcherAssign.state !== "idle"}
                      onClick={() => !alreadyAssigned && setCustomizePreset(preset)}
                      className={`p-4 rounded-xl border text-left transition-colors w-full ${
                        alreadyAssigned
                          ? "border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/30 cursor-default opacity-75"
                          : "border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:border-primary/30 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                      }`}
                    >
                      <div className="font-medium text-secondary dark:text-alabaster">{preset.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{preset.description || ""}</div>
                      {targetStr && (
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{targetStr}</div>
                      )}
                      {alreadyAssigned && (
                        <div className="text-xs font-medium text-primary mt-2">Assigned</div>
                      )}
                    </button>
                  );
                })}
                {filteredPresets.length === 0 && (
                  <p className="text-gray-500 dark:text-gray-400 text-sm py-4">No presets match your search.</p>
                )}
              </div>
            </Card>

            <Card title="Create Habit">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Add a new preset to your library. Presets can be customized and assigned to the client.
              </p>
              <form onSubmit={handleCreateHabit} className="space-y-4">
                <div>
                  <label htmlFor="coach-create-habit-name" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">Habit name</label>
                  <input
                    id="coach-create-habit-name"
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Breathwork session"
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster"
                  />
                </div>
                <div>
                  <label htmlFor="coach-create-habit-description" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">Description</label>
                  <textarea
                    id="coach-create-habit-description"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    placeholder="Describe the habit and why it matters."
                    rows={3}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster"
                  />
                </div>
                <Button type="submit" variant="primary" disabled={!createName.trim() || fetcherCreatePreset.state !== "idle"}>
                  Add Habit
                </Button>
              </form>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Presets can be customized and assigned to the client.</p>
            </Card>
          </div>

          {/* Right column: Assigned Habits + Habit Notes */}
          <div className="space-y-6">
            <Card title="Assigned Habits">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Habits assigned to this client. Use the week view to see completion.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                <a
                  href={`/dashboard/habits`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm text-secondary dark:text-alabaster"
                >
                  Client View Preview
                </a>
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium">
                  {client.name}
                </span>
              </div>
              {weekStart && weekEnd && (
                <div className="flex items-center justify-between mb-4">
                  <a
                    href={`?weekStart=${prevWeek}`}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-label="Previous week"
                  >
                    <ChevronLeftIcon className="w-5 h-5" />
                  </a>
                  <span className="text-sm font-medium text-secondary dark:text-alabaster">
                    {dayjs(weekStart).format("MMM D")} – {dayjs(weekEnd).subtract(1, "day").format("MMM D")}
                  </span>
                  <a
                    href={`?weekStart=${nextWeek}`}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-label="Next week"
                  >
                    <ChevronRightIcon className="w-5 h-5" />
                  </a>
                </div>
              )}
              {assignedHabits.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 py-6">No habits assigned yet. Start with a preset or create a custom habit.</p>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {assignedHabits.length} total habits ({assignedHabits.filter((a) => a.frequency === "daily").length} daily,{" "}
                    {assignedHabits.filter((a) => a.frequency === "weekly").length} weekly,{" "}
                    {assignedHabits.filter((a) => a.frequency === "times_per_week").length} times/week)
                  </p>
                  {assignedHabits.map((assigned) => {
                    const targetStr = formatTarget(assigned.preset, assigned.target_value, assigned.target_unit);
                    const days = completionByHabitAndDate[assigned.id] || new Set();
                    return (
                      <div
                        key={assigned.id}
                        className="p-4 rounded-xl border border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-secondary dark:text-alabaster">{displayName(assigned)}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {targetStr ? `${targetStr} · ` : ""}
                              {assigned.frequency === "daily"
                                ? "Every day"
                                : assigned.frequency === "weekly"
                                  ? formatScheduleDays(assigned.schedule_days) || "Weekly"
                                  : assigned.frequency === "times_per_week" && assigned.times_per_week
                                    ? `${assigned.times_per_week}x per week${formatScheduleDays(assigned.schedule_days) ? ` (${formatScheduleDays(assigned.schedule_days)})` : " (any day)"}`
                                    : "Flexible"}
                            </div>
                            {displayDescription(assigned) && (
                              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{displayDescription(assigned)}</div>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={fetcherUnassign.state !== "idle"}
                            onClick={() => handleUnassign(assigned.id)}
                          >
                            Unassign
                          </Button>
                        </div>
                        {weekStart && (
                          <div className="flex gap-1 mt-3">
                            {Array.from({ length: 7 }, (_, i) => {
                              const d = dayjs(weekStart).add(i, "day").format("YYYY-MM-DD");
                              const filled = days.has(d);
                              return (
                                <div
                                  key={d}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                                    filled ? "bg-primary text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-500"
                                  }`}
                                  title={d}
                                >
                                  {dayjs(d).format("D")}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card title="Habit Notes">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Add coaching notes. They can be general or tied to a habit.</p>
              <form onSubmit={handleSendNote} className="space-y-4">
                <div>
                  <label htmlFor="coach-habit-note-content" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">Add a note</label>
                  <textarea
                    id="coach-habit-note-content"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Add a quick coaching note or feedback for the client."
                    rows={3}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-secondary dark:text-alabaster"
                  />
                </div>
                <div>
                  <label htmlFor="coach-habit-note-habit" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">Tie to habit</label>
                  <select
                    id="coach-habit-note-habit"
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
                <Button type="submit" variant="primary" disabled={!noteContent.trim() || fetcherNote.state !== "idle"}>
                  Send note
                </Button>
              </form>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Notes will appear on the client habits screen.</p>
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-medium text-secondary dark:text-alabaster">Client Notes</h4>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">Latest</span>
                </div>
                {notes.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No client notes yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {notes.map((note) => (
                      <li key={note.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {note.author_role === "coach" ? "Coach" : "Client"} · {dayjs(note.created_at).format("MMM D, YYYY")}
                        </div>
                        <p className="text-sm text-secondary dark:text-alabaster mt-1">{note.content}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </ClientDetailLayout>
  );
}
