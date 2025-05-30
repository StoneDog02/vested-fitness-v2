import { Form, Link, useActionData, useSearchParams } from "@remix-run/react";
import { json, type ActionFunction, type MetaFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

export const meta: MetaFunction = () => {
  return [
    { title: "Register | Vested Fitness" },
    { name: "description", content: "Create a new Vested Fitness account" },
  ];
};

type ActionData = {
  error?: string;
  fields?: {
    name: string;
    email: string;
    password: string;
    userType: string;
    inviteCode?: string;
    goal?: string;
    tierLevel?: string;
  };
  success?: boolean;
  message?: string;
};

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const name = formData.get("name")?.toString();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const goal = formData.get("goal")?.toString();
  const tierLevel = formData.get("tierLevel")?.toString();
  const inviteCodeRaw =
    formData.get("invite")?.toString() ||
    new URL(request.url).searchParams.get("invite");
  const inviteCode = inviteCodeRaw || undefined;

  if (!name || !email || !password || (inviteCode && !goal)) {
    return json<ActionData>({
      error: "All fields are required",
      fields: {
        name: name || "",
        email: email || "",
        password: password || "",
        userType: inviteCode ? "client" : "coach",
        inviteCode,
      },
    });
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Set redirect to /auth/callback for email verification
  const emailRedirectTo =
    process.env.SUPABASE_EMAIL_REDIRECT_TO ||
    "http://localhost:3000/auth/callback";

  let role: "coach" | "client" = "coach";
  let coach_id: string | undefined = undefined;

  if (inviteCode) {
    // Look up the invite in client_invitations
    const { data: invite, error: inviteError } = await supabase
      .from("client_invitations")
      .select("coach_id, accepted")
      .eq("token", inviteCode)
      .eq("email", email)
      .single();
    if (!invite || inviteError) {
      return json<ActionData>({
        error: "Invalid or expired invitation.",
        fields: { name, email, password, userType: "client", inviteCode },
      });
    }
    if (invite.accepted) {
      return json<ActionData>({
        error: "This invitation has already been used.",
        fields: { name, email, password, userType: "client", inviteCode },
      });
    }
    role = "client";
    coach_id = invite.coach_id;
  }

  // Sign up with Supabase Auth
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: { name, role },
    },
  });

  if (signUpError) {
    return json<ActionData>({
      error: signUpError.message,
      fields: { name, email, password, userType: role, inviteCode },
    });
  }

  // Insert into users table
  const auth_id = signUpData.user?.id;
  if (!auth_id) {
    return json<ActionData>({
      error: "Failed to get user ID from Supabase.",
      fields: { name, email, password, userType: role, inviteCode },
    });
  }

  const { error: insertError } = await supabase.from("users").insert({
    auth_id,
    email,
    name,
    role,
    ...(coach_id ? { coach_id } : {}),
    ...(goal ? { goal } : {}),
    ...(tierLevel ? { tier_level: tierLevel } : {}),
  });

  if (insertError) {
    return json<ActionData>({
      error: insertError.message,
      fields: { name, email, password, userType: role, inviteCode },
    });
  }

  // If client, mark invite as accepted
  if (inviteCode) {
    await supabase
      .from("client_invitations")
      .update({ accepted: true })
      .eq("token", inviteCode)
      .eq("email", email);
  }

  // Success: prompt to check email for verification
  return json<ActionData>({
    fields: { name: "", email: "", password: "", userType: role },
    error: undefined,
    success: true,
    message: `Account created! We've sent a verification email to ${email}. Please check your inbox to verify your account before logging in.`,
  });
};

export default function Register() {
  const actionData = useActionData<ActionData>();
  const formError = actionData?.error || "";
  const success = actionData?.success;
  const message = actionData?.message;
  const [searchParams] = useSearchParams();
  const invite = searchParams.get("invite");
  const type = searchParams.get("type");
  const emailParam = searchParams.get("email") || "";
  const nameParam = searchParams.get("name") || "";
  const tierLevelParam = searchParams.get("tierLevel") || "";

  const isClientInvite = invite && type === "client";

  return (
    <div className="min-h-screen bg-gray-lightest flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold text-secondary">
          {isClientInvite
            ? "Create your client account"
            : "Create your coach account"}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-dark">
          Or{" "}
          <Link
            to="/auth/login"
            className="font-medium text-primary hover:text-primary-dark"
          >
            sign in to your existing account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {success && message && (
            <div className="rounded-md bg-green-50 p-4 mb-4">
              <div className="flex">
                <div className="text-sm text-green-700">{message}</div>
              </div>
            </div>
          )}
          {formError && (
            <div className="rounded-md bg-red-50 p-4 mb-4">
              <div className="flex">
                <div className="text-sm text-red-700">{formError}</div>
              </div>
            </div>
          )}
          <Form method="post" className="space-y-6">
            {isClientInvite && (
              <input type="hidden" name="invite" value={invite} />
            )}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-secondary"
              >
                Full Name
              </label>
              <div className="mt-1">
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  defaultValue={
                    isClientInvite ? nameParam : actionData?.fields?.name || ""
                  }
                  readOnly={!!isClientInvite}
                  className="appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary bg-gray-100"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-secondary"
              >
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={
                    isClientInvite
                      ? emailParam
                      : actionData?.fields?.email || ""
                  }
                  readOnly={!!isClientInvite}
                  className="appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary bg-gray-100"
                />
              </div>
            </div>
            {isClientInvite && tierLevelParam && (
              <div>
                <label
                  htmlFor="tierLevel"
                  className="block text-sm font-medium text-secondary"
                >
                  Tier
                </label>
                <div className="mt-1">
                  <input
                    id="tierLevel"
                    name="tierLevel"
                    type="text"
                    value={tierLevelParam}
                    readOnly
                    className="appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary bg-gray-100"
                  />
                  <input
                    type="hidden"
                    name="tierLevel"
                    value={tierLevelParam}
                  />
                </div>
              </div>
            )}
            {isClientInvite && (
              <div>
                <label
                  htmlFor="goal"
                  className="block text-sm font-medium text-secondary"
                >
                  Fitness Goal
                </label>
                <div className="mt-1">
                  <input
                    id="goal"
                    name="goal"
                    type="text"
                    required
                    placeholder="e.g. Lose weight, gain muscle, maintain, etc."
                    className="appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>
            )}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-secondary"
              >
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary"
                />
              </div>
            </div>
            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                Create Account
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
