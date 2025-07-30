import invariant from "tiny-invariant";

export function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing required environment variable: ${key}`);
    throw new Error(`${key} must be set`);
  }
  return value;
}

export function init() {
  try {
    // Validate required environment variables
    [
      "OPENAI_API_KEY",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_KEY",
      "SESSION_SECRET",
    ].forEach(getEnvVar);
    
    console.log("✅ All required environment variables are set");
  } catch (error) {
    console.error("❌ Environment variable validation failed:", error);
    throw error;
  }
}

export function getOpenAIConfig() {
  return {
    apiKey: getEnvVar("OPENAI_API_KEY"),
  };
}
