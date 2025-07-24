import invariant from "tiny-invariant";

export function getEnvVar(key: string): string {
  const value = process.env[key];
  invariant(value, `${key} must be set`);
  return value;
}

export function init() {
  // Validate required environment variables
  [
    "OPENAI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_KEY",
    "SESSION_SECRET",
  ].forEach(getEnvVar);
}

export function getOpenAIConfig() {
  return {
    apiKey: getEnvVar("OPENAI_API_KEY"),
  };
}
