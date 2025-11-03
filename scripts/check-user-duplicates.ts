/**
 * Script to check for duplicate users in the database
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkDuplicates() {
  const authId = "1b2d77c9-dd16-4cff-accd-fba6232c0ac5";
  const email = "stoney.harward@gmail.com";

  console.log("Checking for duplicate users...\n");

  // Check by auth_id
  const { data: usersByAuthId, error: authError } = await supabase
    .from("users")
    .select("id, auth_id, email, name, role")
    .eq("auth_id", authId);

  console.log(`Users with auth_id ${authId}:`);
  if (authError) {
    console.error("Error:", authError);
  } else {
    console.log(`Found ${usersByAuthId?.length || 0} user(s)`);
    if (usersByAuthId && usersByAuthId.length > 0) {
      usersByAuthId.forEach(user => {
        console.log(JSON.stringify(user, null, 2));
      });
    }
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Check by email
  const { data: usersByEmail, error: emailError } = await supabase
    .from("users")
    .select("id, auth_id, email, name, role")
    .eq("email", email);

  console.log(`Users with email ${email}:`);
  if (emailError) {
    console.error("Error:", emailError);
  } else {
    console.log(`Found ${usersByEmail?.length || 0} user(s)`);
    if (usersByEmail && usersByEmail.length > 0) {
      usersByEmail.forEach(user => {
        console.log(JSON.stringify(user, null, 2));
      });
    }
  }
}

checkDuplicates()
  .then(() => {
    console.log("\n✅ Check completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });

