import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ClientDetailLayout from "~/components/coach/ClientDetailLayout";
import AddSupplementModal from "~/components/coach/AddSupplementModal";
import { json, redirect } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { useLoaderData, useFetcher, useSearchParams, useRevalidator, useParams } from "@remix-run/react";
import { useState, useEffect, useRef } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import NABadge from "../components/ui/NABadge";
import { getCurrentDate, USER_TIMEZONE, getStartOfWeek } from "~/lib/timezone";
import dayjs from "dayjs";

interface Supplement {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  instructions?: string;
  active_from?: string;
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
    // Parse the date string as if it's in the user's timezone
    const weekStartDayjs = dayjs.tz(weekStartParam, USER_TIMEZONE).startOf("day");
    weekStart = weekStartDayjs.toDate();
  } else {
    // Use timezone-aware week start calculation
    const weekStartDayjs = getStartOfWeek();
    weekStart = weekStartDayjs.toDate();
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Batch fetch all supplements and completions in parallel
  const [supplementsRaw, completionsRaw, completions7dRaw] = await Promise.all([
    supabase
      .from("supplements")
      .select("id, name, dosage, frequency, instructions, active_from")
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
      active_from: supplement.active_from,
      compliance,
    };
  });

  const result = {
    supplements,
    complianceData,
    weekStart: dayjs(weekStart).tz(USER_TIMEZONE).format('YYYY-MM-DD'),
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
    return redirect(request.url);
  }

  if (intent === "add") {
    const name = formData.get("name") as string;
    const dosage = formData.get("dosage") as string;
    const frequency = formData.get("frequency") as string;
    const instructions = formData.get("instructions") as string;
    const active_from = formData.get("active_from") as string;
    
    const { data, error } = await supabase
      .from("supplements")
      .insert({
        user_id: client.id,
        name,
        dosage,
        frequency,
        instructions: instructions || null,
        active_from: active_from || new Date().toISOString().split('T')[0], // Default to today if not provided
      })
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to add supplement" }, { status: 500 });
    }
    // Invalidate cache for this client
    if (params.clientId) {
      delete clientSupplementsCache[params.clientId];
    }
    return json({ supplement: data });
  }
  if (intent === "edit") {
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const dosage = formData.get("dosage") as string;
    const frequency = formData.get("frequency") as string;
    const instructions = formData.get("instructions") as string;
    const active_from = formData.get("active_from") as string;
    
    const updateData: any = { name, dosage, frequency, instructions: instructions || null };
    if (active_from) {
      updateData.active_from = active_from;
    }
    
    const { data, error } = await supabase
      .from("supplements")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return json({ error: error?.message || "Failed to update supplement" }, { status: 500 });
    }
    // Invalidate cache for this client
    if (params.clientId) {
      delete clientSupplementsCache[params.clientId];
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
    // Invalidate cache for this client
    if (params.clientId) {
      delete clientSupplementsCache[params.clientId];
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
  
  // State to track newly activated supplements for each day
  const [newlyActivatedSupplements, setNewlyActivatedSupplements] = useState<{ [day: string]: string[] }>({});
  const fetcher = useFetcher<{
    supplement?: any;
    deletedSupplement?: any;
    error?: string;
  }>();
  const complianceFetcher = useFetcher<{ 
    complianceData: number[];
    newlyActivatedSupplements?: { [day: string]: string[] };
  }>();
  const revalidator = useRevalidator();
  const { clientId } = useParams();

  // Track if we've already processed the current fetcher data
  const processedFetcherData = useRef<any>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(
    null
  );
  const [removingSupplementId, setRemovingSupplementId] = useState<string | null>(null);

  // Cleanup processed data on unmount
  useEffect(() => {
    return () => {
      processedFetcherData.current = null;
    };
  }, []);
  const [, setSearchParams] = useSearchParams();
  const [complianceData, setComplianceData] = useState<number[]>(initialComplianceData);
  const [currentWeekStart, setCurrentWeekStart] = useState(weekStart);

  // Initial API call to get real-time compliance data
  useEffect(() => {
    if (client?.id) {
      const params = new URLSearchParams();
      // weekStart is already in YYYY-MM-DD format
      const weekStartDate = currentWeekStart || '';
      params.set("weekStart", weekStartDate);
      params.set("clientId", client.id);

      complianceFetcher.load(`/api/get-supplement-compliance-week?${params.toString()}`);
    }
  }, [client?.id, currentWeekStart]);

  // Update compliance data when fetcher returns
  useEffect(() => {
    if (complianceFetcher.data?.complianceData) {
      setComplianceData(complianceFetcher.data.complianceData);
    }
    if (complianceFetcher.data?.newlyActivatedSupplements) {
      setNewlyActivatedSupplements(complianceFetcher.data.newlyActivatedSupplements);
    }
  }, [complianceFetcher.data]);

  // Update when initial loader data changes
  useEffect(() => {
    setComplianceData(initialComplianceData);
    setCurrentWeekStart(weekStart);
  }, [initialComplianceData, weekStart]);

  // Week navigation state - use consistent week start calculation
  const calendarStart = currentWeekStart
    ? dayjs.tz(currentWeekStart, USER_TIMEZONE).startOf("day").toDate()
    : getStartOfWeek().toDate();
  const calendarEnd = dayjs.tz(currentWeekStart || getStartOfWeek().format('YYYY-MM-DD'), USER_TIMEZONE).add(6, "day").toDate();
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
    // Reset processed data when starting a new edit operation
    processedFetcherData.current = null;
    setEditingSupplement(supplement);
    setIsAddModalOpen(true);
  };

  const handleModalClose = () => {
    // Reset processed data when closing modal
    processedFetcherData.current = null;
    setIsAddModalOpen(false);
    setEditingSupplement(null);
  };

  const handleRemoveClick = (supplementId: string) => {
    setRemovingSupplementId(supplementId);
  };

  // Helper function to check if a supplement was newly activated on a given day
  const isSupplementNewlyActivated = (supplementId: string, date: string) => {
    return newlyActivatedSupplements[date]?.includes(supplementId) || false;
  };

  // Refresh page data when supplement form submission completes successfully
  useEffect(() => {
    // Only process if we have new data and haven't processed it yet
    if (fetcher.state === "idle" && fetcher.data && 
        (fetcher.data.supplement || fetcher.data.deletedSupplement) &&
        processedFetcherData.current !== fetcher.data) {
      
      processedFetcherData.current = fetcher.data;
      
      // For delete operations, clear cache immediately and delay revalidation
      if (fetcher.data.deletedSupplement) {
        // Clear cache immediately using the correct key
        if (clientId) {
          delete clientSupplementsCache[clientId];
        }
        // Clear removing state
        setRemovingSupplementId(null);
        // Delay revalidation to ensure cache is cleared
        setTimeout(() => {
          revalidator.revalidate();
        }, 200);
      } else {
        // For add/edit operations, proceed normally
        revalidator.revalidate();
        
        setIsAddModalOpen(false);
        setEditingSupplement(null);
      }
    }
  }, [fetcher.state, fetcher.data, revalidator, clientId]);

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
                  <div className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg sm:text-xl font-semibold text-secondary dark:text-alabaster truncate">
                              {supplement.name}
                            </h3>
                            {/* Show indicator if supplement was newly activated today */}
                            {supplement.active_from && isSupplementNewlyActivated(supplement.id, supplement.active_from) && (
                              <div className="mt-1">
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                  </svg>
                                  New supplement added. Compliance will start tomorrow for this supplement.
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditClick(supplement)}
                              className="text-xs sm:text-sm px-2 sm:px-3"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 p-2"
                              onClick={() => {
                                handleRemoveClick(supplement.id);
                                const formData = new FormData();
                                formData.append("intent", "remove");
                                formData.append("id", supplement.id);
                                fetcher.submit(formData, { method: "post" });
                              }}
                              disabled={removingSupplementId === supplement.id}
                            >
                              {removingSupplementId === supplement.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
                              ) : (
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              )}
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1 sm:space-y-2">
                          <p className="text-sm text-gray-dark dark:text-gray-light">
                            <span className="font-medium">Dosage:</span>{" "}
                            {supplement.dosage}
                          </p>
                          <p className="text-sm text-gray-dark dark:text-gray-light">
                            <span className="font-medium">Frequency:</span>{" "}
                            {supplement.frequency}
                          </p>
                          {supplement.instructions && (
                            <p className="text-sm text-gray-dark dark:text-gray-light">
                              <span className="font-medium">Instructions:</span>{" "}
                              {supplement.instructions}
                            </p>
                          )}
                        </div>
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
                        params.set("weekStart", dayjs.tz(prev, USER_TIMEZONE).format('YYYY-MM-DD'));
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
                        params.set("weekStart", dayjs.tz(next, USER_TIMEZONE).format('YYYY-MM-DD'));
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
                    // Use the same day calculation as the API
                    const thisDate = dayjs.tz(currentWeekStart || getStartOfWeek().format('YYYY-MM-DD'), USER_TIMEZONE).add(i, "day").startOf("day");
                    // Find if a plan exists for this day
                    const planForDay = supplements && supplements.length > 0 ? true : false;
                    const isNoPlan = !planForDay;
                    // Determine if today or future using dayjs consistently
                    const today = getCurrentDate().startOf("day");
                    const isToday = thisDate.isSame(today, "day");
                    const isFuture = thisDate.isAfter(today, "day");
                    
                    // Determine percentage for display
                    const complianceValue = complianceData[i] || 0;
                    let percentage = 0;
                    let displayPercentage = 0;
                    let barColor = 'transparent';
                    
                    // Handle special cases first
                    if (complianceValue === -3) {
                      // Client was not signed up yet - N/A
                      displayPercentage = 0;
                      barColor = 'transparent';
                    } else if (complianceValue === -2) {
                      // No supplements assigned - N/A
                      displayPercentage = 0;
                      barColor = 'transparent';
                    } else if (complianceValue === -1) {
                      // Supplements added today - compliance starts tomorrow
                      displayPercentage = 0;
                      barColor = 'transparent';
                    } else if (isFuture || (isToday && complianceValue === 0)) {
                      // Future days or today with no completions
                      displayPercentage = 0;
                      barColor = 'transparent';
                    } else {
                      // Normal case - convert decimal to percentage
                      percentage = Math.round(complianceValue * 100);
                      displayPercentage = percentage;
                      if (percentage > 0) {
                        barColor = getBarColor(complianceValue);
                      }
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
                                background: barColor,
                                transition: "width 0.3s, background 0.3s",
                              }}
                            />
                          </div>
                          <span className="ml-4 text-xs font-medium text-right whitespace-nowrap min-w-[40px]">
                            {complianceValue === -3 ? (
                              <NABadge reason="Client was not signed up yet" />
                            ) : complianceValue === -2 ? (
                              <NABadge reason="No supplements assigned by coach" />
                            ) : complianceValue === -1 ? (
                              <NABadge reason="Supplements added today - compliance starts tomorrow" />
                            ) : isToday ? (
                              <span className="bg-primary/10 dark:bg-primary/20 text-primary px-2 py-1 rounded-md border border-primary/20">Pending</span>
                            ) : isFuture ? (
                              <span className="text-gray-700 dark:text-gray-300">Pending</span>
                            ) : isNoPlan ? (
                              <NABadge reason="Plan hasn't been created for client yet" />
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
            form.append("instructions", fields.instructions || "");
            if (fields.active_from) {
              form.append("active_from", fields.active_from);
            }
            if (editingSupplement) {
              form.append("id", editingSupplement.id);
            }
            fetcher.submit(form, { method: "post" });
            // Don't close modal immediately - let the useEffect handle it after successful submission
          }}
          editingSupplement={editingSupplement}
          isLoading={fetcher.state !== "idle"}
        />
      </div>
    </ClientDetailLayout>
  );
}
