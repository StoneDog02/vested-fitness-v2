import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import AddSupplementModal from "~/components/coach/AddSupplementModal";
import { json, redirect } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import NABadge from "../components/ui/NABadge";

interface Supplement {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  instructions: string;
  compliance: number;
}

// In-memory cache for client supplements (expires after 30s)
const clientSupplementsCache: Record<string, { data: any; expires: number }> = {};

export const meta: MetaFunction = () => {
  return [
    { title: "Client Supplements | Kava Training" },
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
  const clientIdParam = params.clientId;
  // Check cache (per client)
  if (clientIdParam && clientSupplementsCache[clientIdParam] && clientSupplementsCache[clientIdParam].expires > Date.now()) {
    return json(clientSupplementsCache[clientIdParam].data);
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Find client by slug or id (parallel)
  const [initialClientResult, clientByIdResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, created_at")
      .eq("slug", clientIdParam)
      .single(),
    supabase
      .from("users")
      .select("id, created_at")
      .eq("id", clientIdParam)
      .single(),
  ]);
  let client = initialClientResult.data || clientByIdResult.data;
  if (!client) {
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

  // Batch fetch all supplements and completions in parallel
  const [supplementsRaw, completionsRaw, completions7dRaw] = await Promise.all([
    supabase
      .from("supplements")
      .select("id, name, dosage, frequency, instructions")
      .eq("user_id", client.id),
    supabase
      .from("supplement_completions")
      .select("supplement_id, completed_at")
      .eq("user_id", client.id)
      .gte("completed_at", weekStart.toISOString())
      .lt("completed_at", weekEnd.toISOString()),
    (() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 6); // 7 days including today
      return supabase
        .from("supplement_completions")
        .select("supplement_id, completed_at")
        .eq("user_id", client.id)
        .gte("completed_at", weekAgo.toISOString())
        .lte("completed_at", today.toISOString());
    })(),
  ]);

  // Build complianceData: for each day, percent of supplements completed
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayStr = day.toISOString().split('T')[0]; // Get YYYY-MM-DD format
    // For each supplement, check if a completion exists for this day
    const supplementIds = (supplementsRaw.data || []).map((s: any) => s.id);
    let completedCount = 0;
    for (const supplementId of supplementIds) {
      const found = (completionsRaw.data || []).find((c: any) => {
        return (
          c.completed_at.startsWith(dayStr) &&
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
  // Group completions by supplement_id for last 7 days
  const completions7dBySupp: Record<string, string[]> = {};
  (completions7dRaw.data || []).forEach((c: any) => {
    if (!completions7dBySupp[c.supplement_id]) completions7dBySupp[c.supplement_id] = [];
    completions7dBySupp[c.supplement_id].push(c.completed_at);
  });
  const supplements = (supplementsRaw.data || []).map((supplement: any) => {
    // Count unique days with a completion
    const daysWithCompletion = new Set(
      (completions7dBySupp[supplement.id] || []).map((d) =>
        new Date(d).toISOString().slice(0, 10)
      )
    );
    const compliance = Math.round((daysWithCompletion.size / 7) * 100);
    return {
      id: supplement.id,
      name: supplement.name,
      dosage: supplement.dosage,
      frequency: supplement.frequency,
      instructions: supplement.instructions ?? "",
      compliance,
    };
  });

  const result = {
    supplements,
    complianceData,
    weekStart: weekStart.toISOString(),
    client: { id: client.id, created_at: client.created_at, name: "Client" },
  };
  // Cache result
  if (clientIdParam) {
    clientSupplementsCache[clientIdParam] = { data: result, expires: Date.now() + 30_000 };
  }
  return json(result);
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
  const { supplements, complianceData: initialComplianceData, weekStart, client } = useLoaderData<{
    supplements: Supplement[];
    complianceData: number[];
    weekStart: string;
    client: { id: string; name: string; created_at?: string } | null;
  }>();
  const fetcher = useFetcher();
  const complianceFetcher = useFetcher<{ complianceData: number[] }>();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(
    null
  );
  const [, setSearchParams] = useSearchParams();
  const [complianceData, setComplianceData] = useState<number[]>(initialComplianceData);
  const [currentWeekStart, setCurrentWeekStart] = useState(weekStart);

  // Update compliance data when fetcher returns
  useEffect(() => {
    if (complianceFetcher.data?.complianceData) {
      setComplianceData(complianceFetcher.data.complianceData);
    }
  }, [complianceFetcher.data]);

  // Update when initial loader data changes
  useEffect(() => {
    setComplianceData(initialComplianceData);
    setCurrentWeekStart(weekStart);
  }, [initialComplianceData, weekStart]);

  // Week navigation state
  const calendarStart = currentWeekStart
    ? new Date(currentWeekStart)
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

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Bright color scaling from theme green to red with smooth transitions
  function getBarColor(percent: number) {
    const percentage = percent * 100; // Convert to percentage
    if (percentage >= 95) return "#00CC03"; // Theme green - perfect
    if (percentage >= 90) return "#00E804"; // Bright theme green - excellent
    if (percentage >= 85) return "#32E135"; // Theme light green - very good
    if (percentage >= 80) return "#65E668"; // Lighter green - good
    if (percentage >= 75) return "#98EB9B"; // Very light green - above average
    if (percentage >= 70) return "#B8F0BA"; // Pale green - decent
    if (percentage >= 65) return "#D4F5D6"; // Very pale green - okay
    if (percentage >= 60) return "#F0FAF0"; // Almost white green - needs improvement
    if (percentage >= 55) return "#FFF8DC"; // Cream - concerning
    if (percentage >= 50) return "#FFE135"; // Bright yellow - poor
    if (percentage >= 45) return "#FFD700"; // Gold - very poor
    if (percentage >= 40) return "#FFA500"; // Orange - critical
    if (percentage >= 35) return "#FF6347"; // Tomato - very critical
    if (percentage >= 30) return "#FF4500"; // Red orange - extremely poor
    if (percentage >= 25) return "#FF0000"; // Pure red - critical
    if (percentage >= 20) return "#DC143C"; // Crimson - very critical
    if (percentage >= 15) return "#B22222"; // Fire brick - extremely poor
    if (percentage >= 10) return "#8B0000"; // Dark red - needs immediate attention
    return "#660000"; // Very dark red - emergency
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
                      onClick={() => {
                        const prev = new Date(calendarStart);
                        prev.setDate(prev.getDate() - 7);
                        setCurrentWeekStart(prev.toISOString());
                        
                        // Use fetcher for fast data loading
                        const params = new URLSearchParams();
                        params.set("weekStart", prev.toISOString());
                        params.set("clientId", client?.id || "");
                        complianceFetcher.load(`/api/get-supplement-compliance-week?${params.toString()}`);
                      }}
                      aria-label="Previous week"
                      type="button"
                    >
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <span>
                      Week of {formatDateShort(calendarStart)} -{" "}
                      {formatDateShort(calendarEnd)}
                    </span>
                    <button
                      className="p-1 rounded hover:bg-gray-100"
                      onClick={() => {
                        const next = new Date(calendarStart);
                        next.setDate(next.getDate() + 7);
                        setCurrentWeekStart(next.toISOString());
                        
                        // Use fetcher for fast data loading
                        const params = new URLSearchParams();
                        params.set("weekStart", next.toISOString());
                        params.set("clientId", client?.id || "");
                        complianceFetcher.load(`/api/get-supplement-compliance-week?${params.toString()}`);
                      }}
                      aria-label="Next week"
                      type="button"
                    >
                      <ChevronRightIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {dayLabels.map((label, i) => {
                    const thisDate = new Date(calendarStart);
                    thisDate.setDate(calendarStart.getDate() + i);
                    thisDate.setHours(0,0,0,0);
                    const signupDate = client?.created_at ? new Date(client.created_at) : null;
                    if (signupDate) signupDate.setHours(0,0,0,0);
                    const isBeforeSignup = signupDate && thisDate < signupDate;
                    // Find if a plan exists for this day
                    const planForDay = supplements && supplements.length > 0 ? true : false;
                    const isNoPlan = !planForDay;
                    // Determine if today or future
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const isToday = thisDate.getTime() === today.getTime();
                    const isFuture = thisDate.getTime() > today.getTime();
                    
                    // Determine percentage for display
                    const percentage = Math.round((complianceData[i] || 0) * 100);
                    let displayPercentage = percentage;
                    
                    // For pending days, show 0% in the bar but don't show percentage text
                    if (isFuture || (isToday && complianceData[i] === 0)) {
                      displayPercentage = 0;
                    }
                    
                    return (
                      <div key={label} className="flex items-center gap-4">
                        <span className="text-xs text-gray-500 w-10 text-left flex-shrink-0">
                          {label}
                        </span>
                        <div className="flex-1" />
                        <div className="flex items-center min-w-[120px] max-w-[200px] w-2/5">
                          <div className="relative flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="absolute left-0 top-0 h-2 rounded-full"
                              style={{
                                width: `${displayPercentage}%`,
                                background: displayPercentage > 0 ? getBarColor(complianceData[i] || 0) : 'transparent',
                                transition: "width 0.3s, background 0.3s",
                              }}
                            />
                          </div>
                          <span className="ml-4 text-xs font-medium text-right whitespace-nowrap min-w-[40px]">
                            {isBeforeSignup ? (
                              <NABadge reason="Client was not signed up yet" />
                            ) : complianceData[i] === -1 ? (
                              <NABadge reason="Supplement was added today. Compliance will be recorded starting tomorrow" />
                            ) : isToday ? (
                              <span className="bg-primary/10 dark:bg-primary/20 text-primary px-2 py-1 rounded-md border border-primary/20">Pending</span>
                            ) : isFuture ? (
                              <span className="text-gray-500">Pending</span>
                            ) : isNoPlan ? (
                              <NABadge reason="Plan hasn’t been created for client yet" />
                            ) : (
                              `${percentage}%`
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
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
