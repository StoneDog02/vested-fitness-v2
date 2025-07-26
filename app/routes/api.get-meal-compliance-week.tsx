import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import dayjs from "dayjs";
import { USER_TIMEZONE } from "~/lib/timezone";

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  const clientId = url.searchParams.get("clientId");

  if (!weekStartParam || !clientId) {
    return json({ error: "Missing required parameters" }, { status: 400 });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const weekStart = dayjs(weekStartParam).tz(USER_TIMEZONE).startOf("day");
  const weekEnd = weekStart.add(7, "day");

  // Fetch meal plans for the client
  const dbStart = performance.now();
  const { data: mealPlansRaw } = await supabase
    .from("meal_plans")
    .select(
      "id, title, description, is_active, created_at, activated_at, deactivated_at"
    )
    .eq("user_id", clientId)
    .eq("is_template", false)
    .order("created_at", { ascending: false });

  // For each meal plan, fetch meals and foods
  const fetchMealsAndFoods = async (plans: any[]) => {
    return Promise.all(
      (plans || []).map(async (plan) => {
        const { data: mealsRaw } = await supabase
          .from("meals")
          .select("id, name, time, sequence_order")
          .eq("meal_plan_id", plan.id)
          .order("sequence_order", { ascending: true });
        const meals = (await Promise.all(
          (mealsRaw || []).map(async (meal) => {
            const { data: foods } = await supabase
              .from("foods")
              .select("name, portion, calories, protein, carbs, fat")
              .eq("meal_id", meal.id);
            return { ...meal, foods: foods || [] };
          })
        ))
        // Filter out meals with no foods
        .filter((meal) => meal.foods && meal.foods.length > 0);
        return {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          createdAt: plan.created_at,
          isActive: plan.is_active,
          activatedAt: plan.activated_at,
          deactivatedAt: plan.deactivated_at,
          meals,
        };
      })
    );
  };

  const mealPlans = await fetchMealsAndFoods(mealPlansRaw || []);

  // Get user's signup date
  const { data: user } = await supabase
    .from("users")
    .select("created_at")
    .eq("id", clientId)
    .single();

  // Fetch all meal completions for this user for the week
  const { data: completionsRaw } = await supabase
    .from("meal_completions")
    .select("meal_id, completed_at")
    .eq("user_id", clientId)
    .gte("completed_at", weekStart.format("YYYY-MM-DD"))
    .lt("completed_at", weekEnd.format("YYYY-MM-DD"));



  // For each day in the week, find the plan that was active on that day
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = weekStart.add(i, "day");
    const dayStr = day.format("YYYY-MM-DD"); // Get YYYY-MM-DD format
    
    // Check if this day is before the user signed up
    if (user?.created_at) {
      const signupDate = dayjs(user.created_at).tz(USER_TIMEZONE).startOf("day");
      if (day.isBefore(signupDate)) {
        // Return -1 to indicate N/A for days before signup
        complianceData.push(-1);
        continue;
      }
    }
    
    // Find the plan active on this day
    const plan = mealPlans.find((p) => {
      const activated = p.activatedAt ? dayjs(p.activatedAt).tz(USER_TIMEZONE) : null;
      const deactivated = p.deactivatedAt ? dayjs(p.deactivatedAt).tz(USER_TIMEZONE) : null;
      const activatedStr = activated ? activated.format("YYYY-MM-DD") : null;
      return (
        activated && activatedStr && activatedStr <= dayStr && (!deactivated || deactivated.isAfter(day))
      );
    });
    
    if (!plan) {
      complianceData.push(0);
      continue;
    }
    
    // Check if this is the day the plan was first activated
    const planActivated = plan.activatedAt ? dayjs(plan.activatedAt).tz(USER_TIMEZONE) : null;
    const planActivatedStr = planActivated ? planActivated.format("YYYY-MM-DD") : null;
    const isActivationDay = planActivatedStr === dayStr;
    
    // Check if this is the first plan for this client (to handle immediate activation)
    // A plan is considered the first if it's the only plan or if it's the earliest created plan
    const isFirstPlan = mealPlans.length === 1 || 
      mealPlans.every(p => p.id === plan.id || p.activatedAt === null) ||
      mealPlans.every(p => p.id === plan.id || dayjs(p.createdAt).isAfter(dayjs(plan.createdAt)));
    
    // Check if plan was created today (for immediate activation)
    const planCreated = dayjs(plan.createdAt).tz(USER_TIMEZONE);
    const planCreatedStr = planCreated.format("YYYY-MM-DD");
    const isCreatedToday = planCreatedStr === dayStr;
    
    if (isActivationDay || (isFirstPlan && planActivatedStr === dayStr) || isCreatedToday) {
      // Return -1 to indicate N/A for activation/creation day
      complianceData.push(-1);
      continue;
    }
    
    // Meals for this plan
    const meals = plan.meals;
    
    // Group meals by name and time to handle A/B options as single meals
    const mealGroups = meals.reduce((groups: Record<string, any[]>, meal: any) => {
      const key = `${meal.name}-${meal.time}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(meal);
      return groups;
    }, {});
    
    const uniqueMealGroups = Object.keys(mealGroups);
    const totalUniqueMeals = uniqueMealGroups.length;
    
    // Count completed unique meal groups
    const completedUniqueMealGroups = uniqueMealGroups.filter(groupKey => {
      const [mealName, mealTime] = groupKey.split('-');
      const groupMeals = meals.filter((m: any) => 
        m.name === mealName && m.time.startsWith(mealTime)
      );
      
      // Check if any meal in this group was completed
      const groupMealIds = new Set(groupMeals.map((m: any) => m.id));
      const groupCompletions = (completionsRaw || []).filter((c: any) => {
        const completedDateStr = c.completed_at.slice(0, 10); // Get YYYY-MM-DD from timestamp
        return completedDateStr === dayStr && groupMealIds.has(c.meal_id);
      });
      
      return groupCompletions.length > 0; // If any meal in the group was completed, the group is complete
    });
    
    const completedUniqueMeals = completedUniqueMealGroups.length;
    const percent = totalUniqueMeals > 0 ? completedUniqueMeals / totalUniqueMeals : 0;
    complianceData.push(percent);
  }

  return json({ complianceData });
}; 