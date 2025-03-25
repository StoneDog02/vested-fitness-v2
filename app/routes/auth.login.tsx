import { Form, Link, useActionData } from "@remix-run/react";
import { json, type ActionFunction, type MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Login | Vested Fitness" },
    { name: "description", content: "Log in to your Vested Fitness account" },
  ];
};

type ActionData = {
  error?: string;
  fields?: {
    email: string;
    password: string;
  };
};

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return json<ActionData>({
      error: "Email and password are required",
      fields: { email: email || "", password: password || "" },
    });
  }

  // This would typically call Supabase auth signIn
  // For demo purposes, we'll just return a success
  // const { error } = await supabase.auth.signInWithPassword({ email, password });

  // if (error) {
  //   return json<ActionData>({
  //     error: error.message,
  //     fields: { email, password },
  //   });
  // }

  // For demo, redirect to dashboard
  return json<ActionData>({ fields: { email, password } });
};

export default function Login() {
  const actionData = useActionData<ActionData>();
  const formError = actionData?.error || "";

  return (
    <div className="min-h-screen bg-gray-lightest flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold text-secondary">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-dark">
          Or{" "}
          <Link
            to="/auth/register"
            className="font-medium text-primary hover:text-primary-dark"
          >
            create a new account
          </Link>
        </p>
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
                  defaultValue={actionData?.fields?.email}
                  className="appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary"
                />
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
                  autoComplete="current-password"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-light rounded-md shadow-sm placeholder-gray focus:outline-none focus:ring-primary focus:border-primary"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember_me"
                  name="remember_me"
                  type="checkbox"
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-light rounded"
                />
                <label
                  htmlFor="remember_me"
                  className="ml-2 block text-sm text-gray-dark"
                >
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <Link
                  to="#"
                  className="font-medium text-primary hover:text-primary-dark"
                >
                  Forgot your password?
                </Link>
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                Sign in
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
