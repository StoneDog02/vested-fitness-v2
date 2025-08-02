import { useState, useRef, useEffect } from "react";
import type { MetaFunction } from "@remix-run/node";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import { ChatBox } from "~/components/ui/ChatBox";
import { useParams, useMatches } from "@remix-run/react";
import dayjs from "dayjs";

export const meta: MetaFunction = () => {
  return [
    { title: "Chat | Kava Training" },
    { name: "description", content: "Chat with your coach" },
  ];
};

export default function Chat() {
  const { clientId } = useParams();
  const matches = useMatches();
  
  // Get user data from parent route
  const parentMatch = useMatches().find((m) => m.id === "routes/dashboard");
  const parentData = (parentMatch?.data ?? {}) as { user?: any; role?: string };
  const user = parentData.user;
  const userRole = parentData.role;

  // State for coach data
  const [coachName, setCoachName] = useState("Your Coach");
  const [loading, setLoading] = useState(true);

  // Fetch coach information
  useEffect(() => {
    async function fetchCoachData() {
      if (user?.coach_id) {
        try {
          const response = await fetch(`/api/get-coach-info?coachId=${user.coach_id}`);
          if (response.ok) {
            const data = await response.json();
            setCoachName(data.coachName || "Your Coach");
          }
        } catch (error) {
          console.error("Failed to fetch coach data:", error);
        }
      }
      setLoading(false);
    }

    fetchCoachData();
  }, [user?.coach_id]);

  // Format dates and weights
  const signUpDate = user?.created_at ? dayjs(user.created_at).format("MMM D, YYYY") : "N/A";
  const startingWeight = user?.starting_weight ? `${user.starting_weight} lbs` : "N/A";
  const currentWeight = user?.current_weight ? `${user.current_weight} lbs` : "N/A";

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
          Chat with Coach
        </h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left side - Chat Messages */}
        <div>
          <Card className="bg-white rounded-lg shadow-lg p-0 min-h-[60vh] flex flex-col">
            <div className="flex flex-col flex-1">
              <ChatBox clientId={clientId || "CLIENT_ID_PLACEHOLDER"} />
            </div>
          </Card>
        </div>
        
        {/* Right side - Client Info */}
        <div className="space-y-6">
          {/* Client Information */}
          <Card title="Your Information">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary-light rounded-xl flex items-center justify-center text-white font-semibold shadow-soft">
                  {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <div>
                  <h3 className="font-semibold text-secondary dark:text-alabaster">
                    {user?.name || "User"}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {userRole === "client" ? "Client" : "User"}
                  </p>
                </div>
              </div>
              
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Coach:</span>
                  <span className="text-sm text-secondary dark:text-alabaster">
                    {loading ? "Loading..." : coachName}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Sign Up Date:</span>
                  <span className="text-sm text-secondary dark:text-alabaster">{signUpDate}</span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Starting Weight:</span>
                  <span className="text-sm text-secondary dark:text-alabaster">{startingWeight}</span>
                </div>
                
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Current Weight:</span>
                  <span className="text-sm text-secondary dark:text-alabaster">{currentWeight}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
