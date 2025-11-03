/**
 * Script to sync a Supabase Auth user to the users table
 * Usage: npx tsx scripts/sync-auth-user.ts <auth_id> [name] [email] [role]
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../app/lib/supabase";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../.env") });

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function syncAuthUser(authId: string, name?: string, email?: string, role: "coach" | "client" = "coach") {
  console.log(`\nSyncing auth user: ${authId}`);

  // First, check if user already exists with this auth_id
  const { data: existingUserByAuthId, error: checkError } = await supabase
    .from("users")
    .select("id, name, email, role")
    .eq("auth_id", authId)
    .single();

  if (existingUserByAuthId) {
    console.log("✅ User already exists in users table with this auth_id:");
    console.log(JSON.stringify(existingUserByAuthId, null, 2));
    return existingUserByAuthId;
  }

  if (checkError && checkError.code !== "PGRST116") {
    // PGRST116 is "no rows returned" which is expected
    console.error("Error checking for existing user:", checkError);
    return null;
  }

  // Check if user exists with this email but different auth_id
  if (email) {
    const { data: existingUserByEmail, error: emailError } = await supabase
      .from("users")
      .select("id, name, email, role, auth_id")
      .eq("email", email)
      .single();

    if (existingUserByEmail) {
      console.log("⚠️  User exists with this email but different auth_id:");
      console.log(`  Current auth_id: ${existingUserByEmail.auth_id}`);
      console.log(`  New auth_id: ${authId}`);
      
      // Update the existing user's auth_id
      console.log("Updating auth_id for existing user...");
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({ auth_id: authId })
        .eq("id", existingUserByEmail.id)
        .select()
        .single();

      if (updateError) {
        console.error("❌ Error updating auth_id:", updateError);
        return null;
      }

      console.log("✅ Successfully updated user's auth_id:");
      console.log(JSON.stringify(updatedUser, null, 2));
      return updatedUser;
    }
  }

  // Get user info from Auth
  let authUser = null;
  try {
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(authId);
    if (authError) {
      console.error("Error fetching auth user:", authError);
      // Try alternative method
      const { data: users } = await supabase.auth.admin.listUsers();
      authUser = users?.users?.find(u => u.id === authId);
    } else {
      authUser = authData?.user;
    }
  } catch (e) {
    console.error("Error accessing auth admin:", e);
  }

  // Use provided values or fall back to auth user data
  const userName = name || authUser?.user_metadata?.name || authUser?.email?.split("@")[0] || "User";
  const userEmail = email || authUser?.email || "";
  const userRole = role || (authUser?.user_metadata?.role as "coach" | "client") || "coach";

  if (!userEmail) {
    console.error("❌ Error: Email is required. Please provide email as argument.");
    process.exit(1);
  }

  console.log(`Creating user record:`);
  console.log(`  Name: ${userName}`);
  console.log(`  Email: ${userEmail}`);
  console.log(`  Role: ${userRole}`);
  console.log(`  Auth ID: ${authId}`);

  // Generate slug from name
  const slug = slugify(userName);

  // Insert into users table
  const { data: newUser, error: insertError } = await supabase
    .from("users")
    .insert({
      auth_id: authId,
      email: userEmail,
      name: userName,
      role: userRole,
      status: "active",
      slug,
    })
    .select()
    .single();

  if (insertError) {
    console.error("❌ Error inserting user:", insertError);
    return null;
  }

  console.log("✅ Successfully created user:");
  console.log(JSON.stringify(newUser, null, 2));
  return newUser;
}

// Main execution
const args = process.argv.slice(2);
const authId = args[0];

if (!authId) {
  console.error("Usage: npx tsx scripts/sync-auth-user.ts <auth_id> <name> <email> [role]");
  console.error("\nExample:");
  console.error('  npx tsx scripts/sync-auth-user.ts 1b2d77c9-dd16-4cff-accd-fba6232c0ac5 "John Doe" "john@example.com" "coach"');
  process.exit(1);
}

const name = args[1];
const email = args[2];
const role = (args[3] as "coach" | "client") || "coach";

if (!name || !email) {
  console.error("Error: Both name and email are required");
  console.error("Usage: npx tsx scripts/sync-auth-user.ts <auth_id> <name> <email> [role]");
  process.exit(1);
}

syncAuthUser(authId, name, email, role)
  .then((user) => {
    if (user) {
      console.log("\n✅ User sync completed successfully!");
      process.exit(0);
    } else {
      console.log("\n❌ User sync failed!");
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("\n❌ Unexpected error:", error);
    process.exit(1);
  });

