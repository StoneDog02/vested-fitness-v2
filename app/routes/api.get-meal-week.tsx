import { json } from "@remix-run/node";
import type { LoaderFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { USER_TIMEZONE } from "~/lib/timezone";

dayjs.extend(timezone);
dayjs.extend(utc);

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  
  if (!weekStartParam) {
    return json({ error: "Week start parameter is required" }, { status: 400 });
  }

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
      accessToken = undefined;
    }
  }
  
  let userId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      userId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      userId = undefined;
    }
  }
  
  if (!userId) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  
  // Get user row
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", userId)
    .single();
    
  if (!user) {
    return json({ error: "User not found" }, { status: 404 });
  }
  
  // Parse week start date and get week range
  const weekStart = dayjs(weekStartParam).tz(USER_TIMEZONE).startOf("day");
  const weekEnd = weekStart.add(7, "day");
  
  // Get meal plans that were active during this week
  const { data: mealPlansRaw } = await supabase
    .from("meal_plans")
    .select("id, title, is_active, activated_at, deactivated_at")
    .eq("user_id", user.id)
    .eq("is_template", false)
    .not("activated_at", "is", null);

  // Get completion data for the week
  const { data: completionsRaw } = await supabase
    .from("meal_completions")
    .select("completed_at, meal_id")
    .eq("user_id", user.id)
    .gte("completed_at", weekStart.format("YYYY-MM-DD"))
    .lt("completed_at", weekEnd.format("YYYY-MM-DD"));

  // Build meals object for each day of the week
  const meals: Record<string, any> = {};
  const completions: Record<string, string[]> = {};
  
  // Process completions into a map by date
  const completionsByDate: Record<string, string[]> = {};
  (completionsRaw || []).forEach(completion => {
    const dateStr = completion.completed_at.slice(0, 10); // Get YYYY-MM-DD from timestamp
    if (!completionsByDate[dateStr]) {
      completionsByDate[dateStr] = [];
    }
    completionsByDate[dateStr].push(completion.meal_id);
  });
  
  for (let i = 0; i < 7; i++) {
    const date = weekStart.add(i, "day");
    const dateStr = date.format("YYYY-MM-DD");
    
    // Find the meal plan active on this day
    const activePlan = (mealPlansRaw || []).find((plan) => {
      const activated = plan.activated_at ? dayjs(plan.activated_at).tz(USER_TIMEZONE) : null;
      const deactivated = plan.deactivated_at ? dayjs(plan.deactivated_at).tz(USER_TIMEZONE) : null;
      
      return activated && 
             activated.format("YYYY-MM-DD") <= dateStr && 
             (!deactivated || deactivated.isAfter(date));
    });
    
    if (!activePlan) {
      meals[dateStr] = {
        name: "No Meal Plan",
        date: "",
        meals: []
      };
    } else {
      // Get meals for this plan
      const { data: mealsRaw } = await supabase
        .from("meals")
        .select("id, name, time, sequence_order")
        .eq("meal_plan_id", activePlan.id)
        .order("sequence_order", { ascending: true });

      // Get foods for all meals in one query
      const mealIds = (mealsRaw || []).map(meal => meal.id);
      const { data: foodsRaw } = await supabase
        .from("foods")
        .select(`id, meal_id, name, portion, calories, protein, carbs, fat, food_library_id, food_library:food_library_id (calories, protein, carbs, fat)`)
        .in("meal_id", mealIds);

      // Group foods by meal_id
      const foodsByMealId: Record<string, any[]> = {};
      (foodsRaw || []).forEach(food => {
        if (!foodsByMealId[food.meal_id]) {
          foodsByMealId[food.meal_id] = [];
        }
        
        // Calculate macros (same logic as in the loader)
        const protein = food.food_library && typeof food.food_library === 'object' && 'protein' in food.food_library 
          ? Number(food.food_library.protein) 
          : Number(food.protein) || 0;
        const carbs = food.food_library && typeof food.food_library === 'object' && 'carbs' in food.food_library 
          ? Number(food.food_library.carbs) 
          : Number(food.carbs) || 0;
        const fat = food.food_library && typeof food.food_library === 'object' && 'fat' in food.food_library 
          ? Number(food.food_library.fat) 
          : Number(food.fat) || 0;
        const calories = protein * 4 + carbs * 4 + fat * 9;
        
        foodsByMealId[food.meal_id].push({
          id: food.id,
          name: food.name,
          portion: food.portion,
          calories,
          protein,
          carbs,
          fat,
        });
      });

      // Build the meal plan structure
      const mealsWithFoods = (mealsRaw || []).map(meal => ({
        ...meal,
        foods: foodsByMealId[meal.id] || []
      })).filter(meal => meal.foods.length > 0);

      meals[dateStr] = {
        name: activePlan.title,
        date: "",
        meals: mealsWithFoods
      };
    }
    
    // Add completion data
    completions[dateStr] = completionsByDate[dateStr] || [];
  }

  return json({
    meals,
    completions
  });
}; 