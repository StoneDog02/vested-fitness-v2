import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

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

  const weekStart = new Date(weekStartParam);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

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

  // Fetch all meal completions for this user for the week
  const { data: completionsRaw } = await supabase
    .from("meal_completions")
    .select("meal_id, completed_at")
    .eq("user_id", clientId)
    .gte("completed_at", weekStart.toISOString())
    .lt("completed_at", weekEnd.toISOString());



  // For each day in the week, find the plan that was active on that day
  const complianceData: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    day.setHours(0, 0, 0, 0);
    // Find the plan active on this day
    const plan = mealPlans.find((p) => {
      const activated = p.activatedAt ? new Date(p.activatedAt) : null;
      const deactivated = p.deactivatedAt ? new Date(p.deactivatedAt) : null;
      const dayStr = day.toISOString().slice(0, 10);
      const activatedStr = activated ? activated.toISOString().slice(0, 10) : null;
      return (
        activated && activatedStr && activatedStr <= dayStr && (!deactivated || deactivated > day)
      );
    });
    if (!plan) {
      complianceData.push(0);
      continue;
    }
    // Meals for this plan
    const meals = plan.meals;
    // Completions for this day and these meals
    const mealIds = new Set(meals.map((m) => m.id));
    const dayStr = day.toISOString().slice(0, 10); // Get YYYY-MM-DD format
    const completions = (completionsRaw || []).filter((c) => {
      const completedDateStr = c.completed_at.slice(0, 10); // Get YYYY-MM-DD from timestamp
      return completedDateStr === dayStr && mealIds.has(c.meal_id);
    });
    const percent = meals.length > 0 ? completions.length / meals.length : 0;
    complianceData.push(percent);
  }

  return json({ complianceData });
}; 