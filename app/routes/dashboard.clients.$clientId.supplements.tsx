import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import AddSupplementModal from "~/components/coach/AddSupplementModal";
import { useState } from "react";
import { json, redirect } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";

interface Supplement {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  instructions: string;
  compliance: number;
}

export const meta: MetaFunction = () => {
  return [
    { title: "Client Supplements | Vested Fitness" },
    { name: "description", content: "Manage client supplement protocols" },
  ];
};

export const loader = async ({
  params,
  request,
}: {
  params: { clientId: string };
  request: Request;
}) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  console.log("[SUPPLEMENTS][LOADER] params:", params);

  // Find client by slug or id
  const { data: initialClient, error } = await supabase
    .from("users")
    .select("id")
    .eq("slug", params.clientId)
    .single();
  let client = initialClient;
  if (error || !client) {
    const { data: clientById } = await supabase
      .from("users")
      .select("id")
      .eq("id", params.clientId)
      .single();
    client = clientById;
    console.log("[SUPPLEMENTS][LOADER] Fallback to id, found:", client);
  } else {
    console.log("[SUPPLEMENTS][LOADER] Found by slug:", client);
  }
  if (!client) {
    console.log("[SUPPLEMENTS][LOADER] No client found, returning empty.");
    return json({
      supplements: [],
      complianceData: [0, 0, 0, 0, 0, 0, 0],
      weekStart: null,
    });
  }

  // Get week start from query param, default to current week
  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  let weekStart: Date;
  if (weekStartParam) {
    weekStart = new Date(weekStartParam);
    weekStart.setHours(0, 0, 0, 0);
  } else {
    weekStart = new Date();
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Fetch all supplements for this client
  const { data: supplementsRaw, error: supplementsError } = await supabase
    .from("supplements")
    .select("id, name, dosage, frequency, instructions")
    .eq("user_id", client.id);
  console.log(
    "[SUPPLEMENTS][LOADER] supplementsRaw:",
    supplementsRaw,
    "error:",
    supplementsError
  );

  // Fetch all completions for this user for the week
  const { data: completionsRaw } = await supabase
    .from("supplement_completions")
    .select("supplement_id, completed_at")
    .eq("user_id", client.id)
    .gte("completed_at", weekStart.toISOString())
    .lt("completed_at", weekEnd.toISOString());

  // Build complianceData: for each day, percent of supplements completed
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    day.setHours(0, 0, 0, 0);
    // For each supplement, check if a completion exists for this day
    const supplementIds = (supplementsRaw || []).map((s) => s.id);
    let completedCount = 0;
    for (const supplementId of supplementIds) {
      const found = (completionsRaw || []).find((c) => {
        const compDate = new Date(c.completed_at);
        compDate.setHours(0, 0, 0, 0);
        return (
          compDate.getTime() === day.getTime() &&
          c.supplement_id === supplementId
        );
      });
      if (found) completedCount++;
    }
    const percent =
      supplementIds.length > 0 ? completedCount / supplementIds.length : 0;
    complianceData.push(percent);
  }

  // For each supplement, calculate compliance (percent of last 7 days with a completion)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6); // 7 days including today
  const supplements = await Promise.all(
    (supplementsRaw || []).map(async (supplement) => {
      // Fetch completions for this supplement in the last 7 days
      const { data: completions, error: completionsError } = await supabase
        .from("supplement_completions")
        .select("completed_at")
        .eq("supplement_id", supplement.id)
        .eq("user_id", client.id)
        .gte("completed_at", weekAgo.toISOString())
        .lte("completed_at", today.toISOString());
      // Count unique days with a completion
      const daysWithCompletion = new Set(
        (completions || []).map((c) =>
          new Date(c.completed_at).toISOString().slice(0, 10)
        )
      );
      const compliance = Math.round((daysWithCompletion.size / 7) * 100);
      console.log(
        "[SUPPLEMENTS][LOADER] Supplement:",
        supplement,
        "completions:",
        completions,
        "compliance:",
        compliance,
        "completionsError:",
        completionsError
      );
      return {
        id: supplement.id,
        name: supplement.name,
        dosage: supplement.dosage,
        frequency: supplement.frequency,
        instructions: supplement.instructions ?? "",
        compliance,
      };
    })
  );

  console.log("[SUPPLEMENTS][LOADER] Final supplements:", supplements);
  return json({
    supplements,
    complianceData,
    weekStart: weekStart.toISOString(),
  });
};

export const action = async ({
  request,
  params,
}: {
  request: Request;
  params: { clientId: string };
}) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const formData = await request.formData();
  const intent = formData.get("intent");

  console.log("[SUPPLEMENTS][ACTION] intent:", intent, "params:", params);

  // Find client by slug or id
  const { data: initialClient, error } = await supabase
    .from("users")
    .select("id")
    .eq("slug", params.clientId)
    .single();
  let client = initialClient;
  if (error || !client) {
    const { data: clientById } = await supabase
      .from("users")
      .select("id")
      .eq("id", params.clientId)
      .single();
    client = clientById;
    console.log("[SUPPLEMENTS][ACTION] Fallback to id, found:", client);
  } else {
    console.log("[SUPPLEMENTS][ACTION] Found by slug:", client);
  }
  if (!client) {
    console.log("[SUPPLEMENTS][ACTION] No client found, redirecting.");
    return redirect(request.url);
  }

  if (intent === "add") {
    const name = formData.get("name") as string;
    const dosage = formData.get("dosage") as string;
    const frequency = formData.get("frequency") as string;
    const instructions = formData.get("instructions") as string;
    const { data, error } = await supabase
      .from("supplements")
      .insert({
        user_id: client.id,
        name,
        dosage,
        frequency,
        instructions,
      })
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to add supplement" }, { status: 500 });
    }
    return json({ supplement: data });
  }
  if (intent === "edit") {
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const dosage = formData.get("dosage") as string;
    const frequency = formData.get("frequency") as string;
    const instructions = formData.get("instructions") as string;
    const { data, error } = await supabase
      .from("supplements")
      .update({ name, dosage, frequency, instructions })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to update supplement" }, { status: 500 });
    }
    return json({ supplement: data });
  }
  if (intent === "remove") {
    const id = formData.get("id") as string;
    const { data, error } = await supabase
      .from("supplements")
      .delete()
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to delete supplement" }, { status: 500 });
    }
    return json({ deletedSupplement: data });
  }
  return redirect(request.url);
};

export default function ClientSupplements() {
  const { supplements, complianceData, weekStart } = useLoaderData<{
    supplements: Supplement[];
    complianceData: number[];
    weekStart: string;
  }>();
  const fetcher = useFetcher();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(
    null
  );
  const [, setSearchParams] = useSearchParams();

  // Week navigation state
  const calendarStart = weekStart
    ? new Date(weekStart)
    : (() => {
        const now = new Date();
        const day = now.getDay();
        const sunday = new Date(now);
        sunday.setDate(now.getDate() - day);
        sunday.setHours(0, 0, 0, 0);
        return sunday;
      })();
  const calendarEnd = new Date(calendarStart);
  calendarEnd.setDate(calendarStart.getDate() + 6);
  function formatDateShort(date: Date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  function handlePrevWeek() {
    const prev = new Date(calendarStart);
    prev.setDate(prev.getDate() - 7);
    prev.setHours(0, 0, 0, 0);
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.set("weekStart", prev.toISOString());
      return newParams;
    });
  }
  function handleNextWeek() {
    const next = new Date(calendarStart);
    next.setDate(next.getDate() + 7);
    next.setHours(0, 0, 0, 0);
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.set("weekStart", next.toISOString());
      return newParams;
    });
  }
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function getBarColor(percent: number) {
    if (percent <= 0.5) {
      // Red to yellow
      const r = 220 + (250 - 220) * (percent / 0.5);
      const g = 38 + (204 - 38) * (percent / 0.5);
      const b = 38 + (21 - 38) * (percent / 0.5);
      return `rgb(${r},${g},${b})`;
    } else {
      // Yellow to green
      const r = 250 + (22 - 250) * ((percent - 0.5) / 0.5);
      const g = 204 + (163 - 204) * ((percent - 0.5) / 0.5);
      const b = 21 + (74 - 21) * ((percent - 0.5) / 0.5);
      return `rgb(${r},${g},${b})`;
    }
  }

  const handleEditClick = (supplement: Supplement) => {
    setEditingSupplement(supplement);
    setIsAddModalOpen(true);
  };

  const handleModalClose = () => {
    setIsAddModalOpen(false);
    setEditingSupplement(null);
  };

  return (
    <ClientDetailLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
            Client&apos;s Supplements
          </h1>
          <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
            Add Supplement
          </Button>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          {/* Supplements List */}
          <div className="flex-1 space-y-6">
            {supplements.length === 0 ? (
              <Card>
                <div className="p-6 text-center">
                  <h3 className="text-xl font-semibold text-secondary dark:text-alabaster mb-2">
                    Add Supplements Here
                  </h3>
                  <p className="text-gray-dark dark:text-gray-light">
                    Click the &quot;Add Supplement&quot; button above to start
                    adding supplements to your client&apos;s protocol.
                  </p>
                </div>
              </Card>
            ) : (
              supplements.map((supplement) => (
                <Card key={supplement.id}>
                  <div className="p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-semibold text-secondary dark:text-alabaster mb-2">
                          {supplement.name}
                        </h3>
                        <div className="space-y-2">
                          <p className="text-sm text-gray-dark dark:text-gray-light">
                            <span className="font-medium">Dosage:</span>{" "}
                            {supplement.dosage}
                          </p>
                          <p className="text-sm text-gray-dark dark:text-gray-light">
                            <span className="font-medium">Frequency:</span>{" "}
                            {supplement.frequency}
                          </p>
                          <p className="text-sm text-gray-dark dark:text-gray-light">
                            <span className="font-medium">Instructions:</span>{" "}
                            {supplement.instructions}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(supplement)}
                        >
                          Edit
                        </Button>
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="remove" />
                          <input
                            type="hidden"
                            name="id"
                            value={supplement.id}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                            type="submit"
                          >
                            Remove
                          </Button>
                        </fetcher.Form>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Supplement Compliance Calendar Card */}
          <div className="w-full md:w-fit">
            <Card>
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-secondary dark:text-alabaster">
                    Supplement Compliance Calendar
                  </h2>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <button
                      className="p-1 rounded hover:bg-gray-100"
                      onClick={handlePrevWeek}
                      aria-label="Previous week"
                      type="button"
                    >
                      <svg
                        className="h-5 w-5"
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
                    </button>
                    <span>
                      Week of {formatDateShort(calendarStart)} -{" "}
                      {formatDateShort(calendarEnd)}
                    </span>
                    <button
                      className="p-1 rounded hover:bg-gray-100"
                      onClick={handleNextWeek}
                      aria-label="Next week"
                      type="button"
                    >
                      <svg
                        className="h-5 w-5"
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
                </div>
                <div className="flex flex-col gap-2">
                  {dayLabels.map((label, i) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-10 text-left flex-shrink-0">
                        {label}
                      </span>
                      <div className="flex-1" />
                      <div className="flex items-center w-1/3 min-w-[80px] max-w-[180px]">
                        <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="absolute left-0 top-0 h-2 rounded-full"
                            style={{
                              width: `${Math.round(
                                (complianceData[i] || 0) * 100
                              )}%`,
                              background: getBarColor(complianceData[i] || 0),
                              transition: "width 0.3s, background 0.3s",
                            }}
                          />
                        </div>
                        <span
                          className="ml-3 text-xs font-medium min-w-[32px] text-right"
                          style={{ color: getBarColor(complianceData[i] || 0) }}
                        >
                          {Math.round((complianceData[i] || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>

        <AddSupplementModal
          isOpen={isAddModalOpen}
          onClose={handleModalClose}
          onAdd={(fields) => {
            // Use fetcher.Form for add/edit
            const form = new FormData();
            if (editingSupplement) {
              form.append("intent", "edit");
              form.append("id", editingSupplement.id);
            } else {
              form.append("intent", "add");
            }
            form.append("name", fields.name);
            form.append("dosage", fields.dosage);
            form.append("frequency", fields.frequency);
            form.append("instructions", fields.instructions);
            fetcher.submit(form, { method: "post" });
            setIsAddModalOpen(false);
            setEditingSupplement(null);
          }}
          editingSupplement={editingSupplement}
        />
      </div>
    </ClientDetailLayout>
  );
}
