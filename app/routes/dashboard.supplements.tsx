import { useState, useEffect } from "react";
import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
dayjs.extend(utc);
dayjs.extend(timezone);

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
  instructions: string;
}

interface LoaderData {
  supplements: Supplement[];
}

export const loader: LoaderFunction = async ({ request }) => {
  try {
    // Extract user key from auth cookie for per-user cache
    const cookies = request.headers.get('cookie') || '';
    let authId: string | undefined = undefined;
    const supabaseAuthCookieKey = cookies
      .split(';')
      .map(c => c.trim())
      .find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
    let accessToken;
    if (supabaseAuthCookieKey) {
      try {
        const cookieVal = supabaseAuthCookieKey.split('=')[1];
        const decoded = Buffer.from(cookieVal, "base64").toString("utf-8");
        const [access] = JSON.parse(JSON.parse(decoded));
        accessToken = access;
      } catch (e) {
        accessToken = undefined;
      }
    }
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken);
        authId = decoded && typeof decoded === "object" && "sub" in decoded ? decoded.sub as string : undefined;
      } catch (e) {}
    }
    // If we have a user, check cache
    if (authId && supplementsLoaderCache[authId] && supplementsLoaderCache[authId].expires > Date.now()) {
      return json(supplementsLoaderCache[authId].data);
    }
    // Fetch supplements from API
    const supplementsResponse = await fetch(`${new URL(request.url).origin}/api/get-supplements`, {
      headers: {
        'Cookie': cookies,
      },
    });

    if (!supplementsResponse.ok) {
      console.error('Failed to fetch supplements');
      const result = { supplements: [] } as LoaderData;
      if (authId) supplementsLoaderCache[authId] = { data: result, expires: Date.now() + 30_000 };
      return json(result);
    }

    const supplementsData = await supplementsResponse.json();
    const result = { supplements: supplementsData.supplements || [] } as LoaderData;
    if (authId) supplementsLoaderCache[authId] = { data: result, expires: Date.now() + 30_000 };
    return json(result);
  } catch (error) {
    console.error('Error loading supplements:', error);
    return json({ supplements: [] } as LoaderData);
  }
};

export default function Supplements() {
  const { supplements } = useLoaderData<LoaderData>();
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

  // TODO: In the future, use user-specific timezone from profile if available
  const userTz = "America/Denver"; // Northern Utah timezone
  const currentDate = dayjs().tz(userTz).startOf("day");
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
    const today = dayjs().tz(userTz).startOf("day");
    const startOfWeek = today.startOf("week");
    const endOfWeek = startOfWeek.endOf("week");

    try {
      const response = await fetch(`/api/get-supplement-completions?startDate=${startOfWeek.format("YYYY-MM-DD")}&endDate=${endOfWeek.format("YYYY-MM-DD")}`);
      if (response.ok) {
        const data = await response.json();
        
        // Process compliance data for the week
        const weekComplianceData = [];
        for (let i = 0; i < 7; i++) {
          const date = startOfWeek.add(i, "day");
          const dateStr = date.format("YYYY-MM-DD");
          
          const dayCompletions = data.completions.filter((c: any) => 
            c.completed_at.startsWith(dateStr)
          );
          
          const totalSupplements = supplements.length;
          const completedCount = dayCompletions.length;
          const percentage = totalSupplements > 0 ? Math.round((completedCount / totalSupplements) * 100) : 0;
          
          weekComplianceData.push({
            date: date,
            percentage: percentage,
            status: percentage > 0 ? "completed" : "pending"
          });
        }
        
        setComplianceData(weekComplianceData);
      }
    } catch (error) {
      console.error('Error loading compliance data:', error);
    }
  };

  useEffect(() => {
    if (supplements.length > 0) {
      loadComplianceData();
    }
  }, [supplements]);

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
    const today = dayjs().tz(userTz).startOf("day");
    const startOfWeek = today.startOf("week");
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
              {supplements.map((supplement: Supplement) => (
                <div
                  key={supplement.id}
                  className="flex items-start p-4 rounded-lg border border-gray-light dark:border-davyGray hover:shadow-md transition-shadow duration-200"
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
                  <div className="ml-3 flex-grow">
                    <label
                      htmlFor={`supplement-${supplement.id}`}
                      className={`font-medium text-secondary dark:text-alabaster text-lg ${
                        isDaySubmitted || dayOffset !== 0 ? "cursor-not-allowed" : "cursor-pointer"
                      }`}
                    >
                      {supplement.name}
                    </label>
                    <div className="mt-1 text-sm text-gray-dark dark:text-gray-light">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <span className="font-medium">Dosage:</span>{" "}
                          {supplement.dosage}
                        </div>
                        <div>
                          <span className="font-medium">Frequency:</span>{" "}
                          {supplement.frequency}
                        </div>
                      </div>
                      {supplement.instructions && (
                        <div className="mt-2 italic">{supplement.instructions}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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
                  const today = dayjs().tz(userTz).startOf("day");
                  const startOfWeek = today.startOf("week");
                  const endOfWeek = startOfWeek.endOf("week");
                  return `${startOfWeek.format("MMM D")} - ${endOfWeek.format("MMM D")}`;
                })()}
              </div>
            </div>
            <div className="space-y-3">
              {complianceData.map((day: any, index: number) => {
                // Determine if this is today or future/past
                const today = dayjs().tz(userTz).startOf("day");
                const isToday = day.date.isSame(today, "day");
                const isFuture = day.date.isAfter(today, "day");
                
                // Determine status and display
                let status: string;
                let displayText: string;
                
                if (isFuture) {
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
                          status === "pending"
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
                      <span className={`text-sm ${
                        isToday && status === "pending"
                          ? 'bg-primary/10 dark:bg-primary/20 text-primary px-3 py-1 rounded-md border border-primary/20'
                          : 'text-gray-dark dark:text-gray-light'
                      }`}>
                        {displayText}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
