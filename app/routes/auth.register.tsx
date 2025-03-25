import { Form, Link, useActionData, useSearchParams } from "@remix-run/react";
import { json, type ActionFunction, type MetaFunction } from "@remix-run/node";

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
  };
};

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const name = formData.get("name")?.toString();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const userType = formData.get("userType")?.toString();
  // Get the invite code if present
  const inviteCode = formData.get("inviteCode")?.toString();

  if (!name || !email || !password || !userType) {
    return json<ActionData>({
      error: "All fields are required",
      fields: {
        name: name || "",
        email: email || "",
        password: password || "",
        userType: userType || "client",
        inviteCode: inviteCode,
      },
    });
  }

  // This would typically call Supabase auth signUp
  // For demo purposes, we'll just return a success
  // const { error } = await supabase.auth.signUp({ email, password });

  // if (error) {
  //   return json<ActionData>({
  //     error: error.message,
  //     fields: { name, email, password, userType, inviteCode },
  //   });
  // }

  // In a real implementation, we would verify the invite code
  // and link the new user to the coach who sent the invitation

  // For demo, redirect to dashboard
  return json<ActionData>({
    fields: {
      name,
      email,
      password,
      userType,
      inviteCode,
    },
  });
};

export default function Register() {
  const actionData = useActionData<ActionData>();
  const [searchParams] = useSearchParams();
  const formError = actionData?.error || "";

  // Get invitation data from URL parameters
  const inviteCode = searchParams.get("invite") || "";
  const invitedEmail = searchParams.get("email") || "";
  const invitedName = searchParams.get("name") || "";
  const userType = searchParams.get("type") || "client";

  // Determine if this is an invitation-based registration
  const isInvited = !!inviteCode;

  return (
    <div className="min-h-screen bg-gray-lightest flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold text-secondary">
          {isInvited ? "Complete Your Registration" : "Create your account"}
        </h2>
        {isInvited ? (
          <p className="mt-2 text-center text-sm text-gray-dark">
            You&apos;ve been invited to join Vested Fitness
          </p>
        ) : (
          <p className="mt-2 text-center text-sm text-gray-dark">
            Or{" "}
            <Link
              to="/auth/login"
              className="font-medium text-primary hover:text-primary-dark"
            >
              sign in to your existing account
            </Link>
          </p>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <Form method="post" className="space-y-6">
            {formError && (
              <div className="rounded-md bg-red-50 p-4 mb-4">
                <div className="flex">
                  <div className="text-sm text-red-700">{formError}</div>
                </div>
              </div>
            )}

            {/* Hidden input for invite code */}
            {inviteCode && (
              <input type="hidden" name="inviteCode" value={inviteCode} />
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
                  defaultValue={actionData?.fields?.name || invitedName}
                  className="appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary"
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
                  defaultValue={actionData?.fields?.email || invitedEmail}
                  readOnly={isInvited}
                  className={`appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary ${
                    isInvited ? "bg-gray-50" : ""
                  }`}
                />
                {isInvited && (
                  <p className="mt-1 text-xs text-gray-dark">
                    Email address is pre-filled from your invitation and cannot
                    be changed
                  </p>
                )}
              </div>
            </div>

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
              <label
                htmlFor="userType"
                className="block text-sm font-medium text-secondary"
              >
                Account Type
              </label>
              <div className="mt-2 space-y-2">
                <div className="flex items-center">
                  <input
                    id="client"
                    name="userType"
                    type="radio"
                    defaultChecked={userType === "client"}
                    value="client"
                    disabled={isInvited}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-light"
                  />
                  <label
                    htmlFor="client"
                    className="ml-2 block text-sm text-gray-dark"
                  >
                    I am a client looking for coaching
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    id="coach"
                    name="userType"
                    type="radio"
                    value="coach"
                    defaultChecked={userType === "coach"}
                    disabled={isInvited}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-light"
                  />
                  <label
                    htmlFor="coach"
                    className="ml-2 block text-sm text-gray-dark"
                  >
                    I am a coach providing services
                  </label>
                </div>
                {isInvited && (
                  <p className="text-xs text-gray-dark mt-1">
                    Account type is determined by your invitation
                  </p>
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                {isInvited ? "Complete Registration" : "Create Account"}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
