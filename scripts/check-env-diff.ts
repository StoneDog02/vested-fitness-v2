/**
 * Script to check environment differences between local and production
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

console.log("Environment Check:\n");
console.log("=".repeat(50));
console.log("SUPABASE_URL:", SUPABASE_URL);
console.log("SUPABASE_SERVICE_KEY:", SUPABASE_SERVICE_KEY ? `${SUPABASE_SERVICE_KEY.substring(0, 20)}...` : "NOT SET");
console.log("=".repeat(50));

if (SUPABASE_URL) {
  const url = new URL(SUPABASE_URL);
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  
  console.log("\nEnvironment Type:");
  if (isLocalhost) {
    console.log("⚠️  LOCAL Supabase instance detected");
    console.log("   This means you're using Supabase CLI or a local instance");
    console.log("   Your local database is SEPARATE from production database");
  } else {
    console.log("✅ CLOUD Supabase instance detected");
    console.log("   This is the production Supabase project");
  }
  
  console.log("\nHostname:", url.hostname);
  console.log("Port:", url.port || "default");
}

console.log("\nKey Insight:");
console.log("If login works on production but not locally, the issue is likely:");
console.log("1. Different Supabase projects (local vs production)");
console.log("2. Different databases (data not synced)");
console.log("3. Different auth_id values for the same user");

