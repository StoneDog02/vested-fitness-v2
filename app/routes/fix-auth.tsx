import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

export const loader = async () => {
  try {
    // Create admin client
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY! // Using service key for admin privileges
    );

    // Update the user profile
    const { data, error } = await supabase
      .from("users")
      .update({
        auth_id: "d8b60c3b-6bc4-4a6e-abe5-2f77b89f97a2",
        updated_at: new Date().toISOString(),
      })
      .eq("id", "8048044a-b931-43c5-bbbc-ad9bd318dedd")
      .select()
      .single();

    if (error) {
      console.error("Error updating user:", error);
      return json({ success: false, error: error.message }, { status: 500 });
    }

    return json({
      success: true,
      message: "User updated successfully",
      user: data,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return json(
      {
        success: false,
        error: "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
};
