require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Utility to generate a slug from a name
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

(async () => {
  // Fetch all users
  const { data: users, error } = await supabase
    .from("users")
    .select("id, name, slug");
  if (error) {
    console.error("Error fetching users:", error);
    process.exit(1);
  }

  for (const user of users) {
    if (!user.slug || user.slug.trim() === "") {
      const slug = slugify(user.name || "");
      if (!slug) continue;
      const { error: updateError } = await supabase
        .from("users")
        .update({ slug })
        .eq("id", user.id);
      if (updateError) {
        console.error(`Error updating user ${user.id}:`, updateError);
      } else {
        console.log(`Updated user ${user.id} with slug: ${slug}`);
      }
    }
  }
  console.log("Slug backfill complete.");
})();
