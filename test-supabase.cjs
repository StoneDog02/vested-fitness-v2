const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

(async () => {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, coach_id, email")
    .eq("coach_id", "ae781460-898e-4a06-8554-8fa7fdf20478");
  console.log("Data:", data);
  console.log("Error:", error);
})();
