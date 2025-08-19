import { useState, useEffect } from "react";
import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import NABadge from "~/components/ui/NABadge";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import dayjs from "dayjs";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { parse } from "cookie";
import { 
  USER_TIMEZONE, 
  getCurrentDate, 
  getStartOfWeek, 
  getEndOfWeek,
  isToday,
  isFuture 
} from "~/lib/timezone";

// In-memory cache for supplements loader (per user, 30s TTL)
const supplementsLoaderCache: Record<string, { data: any; expires: number }> = {};

export const meta: MetaFunction = () => {
  return [
    { title: "Supplements | Kava Training" },
    { name: "description", content: "View and track your supplements" },
  ];
};

interface Supplement {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  instructions?: string;
  active_from?: string;
  created_at?: string;
}

interface LoaderData {
  supplements: Supplement[];
  userId: string;
  userCreatedAt?: string;
}

export const loader: LoaderFunction = async ({ request }) => {
  try {
    // Extract user key from auth cookie for per-user cache
    const cookies = parse(request.headers.get("cookie") || "");
    const supabaseAuthCookieKey = Object.keys(cookies).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
    );
    

    
    let accessToken;
    if (supabaseAuthCookieKey) {
      try {
        const decoded = Buffer.from(
          cookies[supabaseAuthCookieKey],
          "base64"
        ).toString("utf-8");
        const [access] = JSON.parse(JSON.parse(decoded));
        accessToken = access;

      } catch (e) {
        console.error('❌ [LOADER] Error extracting access token:', e);
        accessToken = undefined;
      }
    }
    
    let authId: string | undefined = undefined;
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken);
        authId = decoded && typeof decoded === "object" && "sub" in decoded ? decoded.sub as string : undefined;
      } catch (e) {
        console.error('❌ [LOADER] Error decoding auth token:', e);
      }
    } else {
      console.log('⚠️ [LOADER] No access token found');
    }
    // If we have a user, check cache
    if (authId && supplementsLoaderCache[authId] && supplementsLoaderCache[authId].expires > Date.now()) {
      return json(supplementsLoaderCache[authId].data);
    }
    // Fetch supplements from API
    const supplementsResponse = await fetch(`${new URL(request.url).origin}/api/get-supplements`, {
      headers: {
        'Cookie': request.headers.get("cookie") || "",
      },
    });

    if (!supplementsResponse.ok) {
      console.error('Failed to fetch supplements');
      const result = { supplements: [], userId: '', userCreatedAt: undefined } as LoaderData;
      if (authId) supplementsLoaderCache[authId] = { data: result, expires: Date.now() + 30_000 };
      return json(result);
    }

    const supplementsData = await supplementsResponse.json();
    
    // Get user ID from the auth token
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    

    
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, created_at")
      .eq("auth_id", authId)
      .single();
    
    if (userError) {
      console.error('❌ [LOADER] Error fetching user:', userError);
      console.error('❌ [LOADER] Error details:', {
        code: userError.code,
        message: userError.message,
        details: userError.details,
        hint: userError.hint
      });
    }
    

    
    const result = { 
      supplements: supplementsData.supplements || [],
      userId: user?.id || '',
      userCreatedAt: user?.created_at || undefined
    } as LoaderData;
    

    
    if (authId) supplementsLoaderCache[authId] = { data: result, expires: Date.now() + 30_000 };
    return json(result);
  } catch (error) {
    console.error('Error loading supplements:', error);
    return json({ supplements: [], userId: '', userCreatedAt: undefined } as LoaderData);
  }
};

export default function Supplements() {
  const { supplements, userId, userCreatedAt } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const submitFetcher = useFetcher();
  const [checkedSupplements, setCheckedSupplements] = useState<{
    [key: string]: boolean;
  }>({});
  const [dayOffset, setDayOffset] = useState(0);
  const [complianceData, setComplianceData] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDaySubmitted, setIsDaySubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentDate = getCurrentDate();
  const currentDateString = currentDate.format("YYYY-MM-DD");

  // Load supplement completions for the current date
  useEffect(() => {
    const loadCompletions = async () => {
      try {
        const response = await fetch(`/api/get-supplement-completions?date=${currentDateString}`);
        if (response.ok) {
          const data = await response.json();
          const completedSupplementIds = data.completions.map((c: any) => c.supplement_id);
          const newCheckedSupplements: { [key: string]: boolean } = {};
          completedSupplementIds.forEach((id: string) => {
            newCheckedSupplements[id] = true;
          });
          setCheckedSupplements(newCheckedSupplements);
          
          // If there are completions, mark the day as submitted
          if (completedSupplementIds.length > 0) {
            setIsDaySubmitted(true);
          } else {
            setIsDaySubmitted(false);
          }
        }
      } catch (error) {
        console.error('Error loading supplement completions:', error);
      }
    };

    // Reset submission state when changing days
    setIsDaySubmitted(false);
    setCheckedSupplements({});
    setSubmitError(null);
    
    loadCompletions();
  }, [currentDateString]);

  // Load compliance data for the current week
  const loadComplianceData = async () => {
    console.log('🔍 Loading compliance data...', { userId, supplementsCount: supplements.length });
    
    const today = getCurrentDate();
    const startOfWeek = getStartOfWeek();
    
    console.log('📅 Week range:', { 
      startOfWeek: startOfWeek.format('YYYY-MM-DD'),
      endOfWeek: startOfWeek.add(6, 'day').format('YYYY-MM-DD')
    });

    try {
      const url = `/api/get-supplement-compliance-week?weekStart=${startOfWeek.format("YYYY-MM-DD")}&clientId=${encodeURIComponent(userId)}`;
      console.log('🌐 Fetching from:', url);
      
      const response = await fetch(url);
      console.log('📡 Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Compliance data received:', data);
        
        // Process compliance data for the week
        const weekComplianceData = [];
        for (let i = 0; i < 7; i++) {
          const date = startOfWeek.add(i, "day");
          const complianceValue = data.complianceData[i] || 0;
          const percentage = complianceValue === -1 ? 0 : Math.round(complianceValue * 100);
          
          weekComplianceData.push({
            date: date,
            percentage: percentage,
            complianceValue: complianceValue,
            status: complianceValue === -1 ? "na" : (percentage > 0 ? "completed" : "pending")
          });
        }
        
        console.log('📈 Processed week compliance data:', weekComplianceData);
        setComplianceData(weekComplianceData);
      } else {
        console.error('❌ Failed to fetch compliance data:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
      }
    } catch (error) {
      console.error('💥 Error loading compliance data:', error);
    }
  };

  useEffect(() => {
    console.log('🔄 useEffect triggered:', { userId, supplementsCount: supplements.length });
    if (userId) {
      loadComplianceData();
    } else {
      console.log('⚠️ No userId available, skipping compliance data load');
    }
  }, [userId]); // Remove supplements dependency - always load compliance data

  const handleSupplementCheck = (id: string) => {
    // Prevent changes if day is already submitted or not today
    if (isDaySubmitted || dayOffset !== 0) return;
    
    setCheckedSupplements((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Format date display
  const getRelativeDay = (offset: number) => {
    switch (offset) {
      case 0:
        return "Today";
      case 1:
        return "Tomorrow";
      case -1:
        return "Yesterday";
      default:
        return currentDate.add(offset, "day").format("dddd");
    }
  };

  const dateDisplay = {
    title: getRelativeDay(dayOffset),
    subtitle: currentDate.add(dayOffset, "day").format("MMMM D, YYYY"),
  };

  // Optimistic supplement submission handler
  const handleSubmitSupplements = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    // Get all checked supplement IDs
    const completedSupplementIds = Object.entries(checkedSupplements)
      .filter(([_, checked]) => checked)
      .map(([id]) => id);

    // Optimistically update UI
    setIsDaySubmitted(true);
    setShowSuccess(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => setShowSuccess(false), 3000);

    // Optionally, update complianceData optimistically for today
    const today = getCurrentDate();
    const startOfWeek = getStartOfWeek();
    const todayIdx = (today.day() + 7 - startOfWeek.day()) % 7;
    setComplianceData(prev => {
      const newData = [...prev];
      if (newData[todayIdx]) {
        newData[todayIdx].percentage = 100 * (completedSupplementIds.length / supplements.length);
        newData[todayIdx].status = completedSupplementIds.length > 0 ? "completed" : "pending";
      }
      return newData;
    });

    // Submit to backend using fetcher
    submitFetcher.submit(
      { supplementIds: completedSupplementIds, date: currentDateString },
      { method: "POST", action: "/api/submit-supplement-completions", encType: "application/json" }
    );
    setIsSubmitting(false);

    // Dispatch custom event to trigger dashboard revalidation
    window.dispatchEvent(new Event("supplements:completed"));
  };

  return (
    <div className="p-6">
      {/* Success Message */}
      {showSuccess && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 bg-primary text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-fade-in">
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
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span>Supplements Submitted Successfully</span>
        </div>
      )}

      <h1 className="text-2xl font-bold text-secondary dark:text-alabaster mb-6">
        Supplements
      </h1>

      {/* GET SUPPS Button */}
      <div className="mb-6 text-right">
        <a
          href="https://completenutritionlogan.com/collections/supplements"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-col items-center gap-2"
        >
          <Button
            variant="primary"
            className="px-8 py-3 text-lg font-semibold"
          >
            GET SUPPS
          </Button>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 tracking-wider">
            USE CODE: MIKE15
          </span>
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            {/* Date Navigation */}
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() => setDayOffset(dayOffset - 1)}
                className="text-primary hover:text-primary-dark transition-colors duration-200 flex items-center gap-1"
              >
                <svg
                  className="w-4 h-4"
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
                Previous
              </button>
              <div className="text-center">
                <h2 className="text-xl font-semibold text-secondary dark:text-alabaster">
                  {dateDisplay.title}
                </h2>
                <div className="text-sm text-gray-dark dark:text-gray-light mt-1">
                  {dateDisplay.subtitle}
                </div>
                {dayOffset !== 0 && (
                  <button
                    onClick={() => setDayOffset(0)}
                    className="text-xs text-primary hover:text-primary-dark transition-colors duration-200 mt-1"
                  >
                    Go to today
                  </button>
                )}
              </div>
              <button
                onClick={() => setDayOffset(dayOffset + 1)}
                className="text-primary hover:text-primary-dark transition-colors duration-200 flex items-center gap-1"
              >
                Next
                <svg
                  className="w-4 h-4"
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

            <div className="space-y-4">
              {supplements.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex flex-col items-center">
                    <h3 className="text-lg font-semibold text-secondary dark:text-alabaster mb-2">
                      No Supplements Assigned
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm max-w-md text-center">
                      Your coach hasn't assigned any supplements to your plan yet. Once supplements are added, you'll be able to track your daily intake here.
                    </p>
                  </div>
                </div>
              ) : (
                supplements.map((supplement: Supplement) => (
                  <div
                    key={supplement.id}
                    className="flex items-start p-5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-soft hover:shadow-medium transition-shadow duration-200 bg-white dark:bg-gray-700"
                  >
                    <div className="flex-shrink-0 pt-1">
                      <input
                        type="checkbox"
                        id={`supplement-${supplement.id}`}
                        checked={!!checkedSupplements[supplement.id]}
                        onChange={() => handleSupplementCheck(supplement.id)}
                        disabled={isDaySubmitted || dayOffset !== 0}
                        className={`h-4 w-4 rounded border-gray-light text-primary focus:ring-primary ${
                          isDaySubmitted || dayOffset !== 0
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer"
                        }`}
                      />
                    </div>
                    <div className="ml-4 flex-grow">
                      <div className="mb-3">
                        <label
                          htmlFor={`supplement-${supplement.id}`}
                          className={`font-bold text-xl text-secondary dark:text-alabaster ${
                            isDaySubmitted || dayOffset !== 0 ? "cursor-not-allowed" : "cursor-pointer"
                          }`}
                        >
                          {supplement.name}
                        </label>
                        {/* Show indicator if supplement was created today */}
                        {supplement.created_at && supplement.created_at.startsWith(currentDateString) && (
                          <div className="mt-2">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              New supplement added. Compliance will start tomorrow for this supplement.
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                          <div className="flex items-center">
                            <span className="font-semibold text-sm text-gray-700 dark:text-gray-300 mr-2">Dosage:</span>
                            <span className="text-sm text-gray-600 dark:text-gray-400">{supplement.dosage}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="font-semibold text-sm text-gray-700 dark:text-gray-300 mr-2">Frequency:</span>
                            <span className="text-sm text-gray-600 dark:text-gray-400">{supplement.frequency}</span>
                          </div>
                        </div>
                        {supplement.instructions && (
                          <div className="pt-2 border-t border-gray-100 dark:border-gray-600">
                            <div className="italic text-sm text-gray-600 dark:text-gray-400">
                              {supplement.instructions}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Submit Button - Only show for today's supplements */}
            {dayOffset === 0 && supplements.length > 0 && (
              <div className="flex justify-end mt-6 pt-6 border-t border-gray-light dark:border-davyGray">
                <Button
                  variant="primary"
                  disabled={isSubmitting || isDaySubmitted}
                  onClick={handleSubmitSupplements}
                >
                  <span className="flex items-center gap-2">
                    {isSubmitting ? (
                      <>
                        <svg
                          className="animate-spin h-5 w-5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        <span>Submitting...</span>
                      </>
                    ) : isDaySubmitted ? (
                      "Supplements Submitted"
                    ) : (
                      "Submit Supplements"
                    )}
                  </span>
                </Button>
              </div>
            )}

            {/* Show error if present */}
            {submitError && (
              <div className="text-red-600 text-sm mt-2">{submitError}</div>
            )}

            {/* Show message for past/future days */}
            {dayOffset !== 0 && (
              <div className="mt-6 pt-6 border-t border-gray-light dark:border-davyGray">
                <div className="text-center text-gray-600 dark:text-gray-400 text-sm">
                  {dayOffset < 0 
                    ? "This is a past day. Supplement status is shown as recorded."
                    : "This is a future day. You can only submit today's supplements."
                  }
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {/* Daily Progress Summary */}
          <Card title="Daily Progress">
            <div className="mb-4 bg-gray-lightest dark:bg-secondary-light/20 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-secondary dark:text-alabaster">
                  Supplement Progress
                </h3>
                <span className="text-sm text-gray-dark dark:text-gray-light">
                  {Object.values(checkedSupplements).filter(Boolean).length} of {supplements.length} supplements completed
                </span>
              </div>
              <div className="w-full bg-gray-300 dark:bg-davyGray rounded-full h-3 mb-2">
                <div
                  className="bg-primary h-3 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: supplements.length > 0 
                      ? `${(Object.values(checkedSupplements).filter(Boolean).length / supplements.length) * 100}%` 
                      : "0%",
                  }}
                ></div>
              </div>
              <div className="text-xs text-gray-dark dark:text-gray-light text-right">
                {supplements.length > 0 
                  ? Math.round((Object.values(checkedSupplements).filter(Boolean).length / supplements.length) * 100)
                  : 0}% complete
              </div>
            </div>
          </Card>

          {/* Supplement Compliance Calendar */}
          <Card title="Supplement Compliance">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-medium">This Week</span>
              <div className="text-xs text-gray-500">
                {(() => {
                  const today = getCurrentDate();
                  const startOfWeek = getStartOfWeek();
                  const endOfWeek = getEndOfWeek();
                  return `${startOfWeek.format("MMM D")} - ${endOfWeek.format("MMM D")}`;
                })()}
              </div>
            </div>
            <div className="space-y-3">
              {(() => {

                return complianceData.map((day: any, index: number) => {
                  // Determine if this is today or future/past
                  const today = getCurrentDate();
                  const isToday = day.date.isSame(today, "day");
                  const isFuture = day.date.isAfter(today, "day");
                  
                  // Debug logging for timezone issues
                  if (index === 0) {
                    console.log('🔍 [SUPPLEMENTS] Debug timezone info:', {
                      today: today.format('YYYY-MM-DD HH:mm:ss'),
                      todayTz: today.format('Z'),
                      dayDate: day.date.format('YYYY-MM-DD HH:mm:ss'),
                      dayDateTz: day.date.format('Z'),
                      isToday,
                      dayIndex: index,
                      complianceValue: day.complianceValue
                    });
                  }
                  
                  // Determine status and display
                  let status: string;
                  let displayText: string;
                  let showNABadge = false;
                  let naReason = "";
                  
                  // Check if this day is before the user signed up
                  const signupDate = userCreatedAt ? dayjs(userCreatedAt).tz(USER_TIMEZONE).startOf("day") : null;
                  const isBeforeSignup = signupDate && day.date.isBefore(signupDate, "day");
                  
                  if (isBeforeSignup) {
                    showNABadge = true;
                    naReason = "You weren't signed up yet!";
                    status = "na";
                    displayText = "";
                  } else if (day.complianceValue === -2) {
                    showNABadge = true;
                    naReason = "No supplements assigned by your coach";
                    status = "na";
                    displayText = "";
                  } else if (day.complianceValue === -1) {
                    showNABadge = true;
                    naReason = "Supplements added today - compliance starts tomorrow";
                    status = "na";
                    displayText = "";
                  } else if (isFuture) {
                    status = "pending";
                    displayText = "Pending";
                  } else if (isToday) {
                    if (day.percentage > 0) {
                      status = "completed";
                      displayText = `${day.percentage}%`;
                    } else {
                      status = "pending";
                      displayText = "Pending";
                    }
                  } else {
                    // Past day
                    status = "completed";
                    displayText = `${day.percentage}%`;
                  }

                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 border-b dark:border-davyGray last:border-0"
                    >
                      <div className="text-sm font-medium text-secondary dark:text-alabaster">
                        {day.date.format("ddd, MMM D")}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block w-3 h-3 rounded-full ${
                            isBeforeSignup || status === "na"
                              ? "bg-gray-light dark:bg-davyGray"
                              : status === "pending"
                              ? isToday
                                ? "bg-green-500"
                                : "bg-gray-light dark:bg-davyGray"
                              : day.percentage >= 80
                              ? "bg-primary"
                              : day.percentage > 0
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                        ></span>
                        {showNABadge ? (
                          <NABadge reason={naReason} />
                        ) : (
                          <span className={`text-sm ${
                            isToday && status === "pending"
                              ? 'bg-primary/10 dark:bg-primary/20 text-primary px-3 py-1 rounded-md border border-primary/20'
                              : 'text-gray-dark dark:text-gray-light'
                          }`}>
                            {displayText}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
