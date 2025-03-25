import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { ActionFunctionArgs, json } from "@remix-run/node";
import { resetPassword } from "~/lib/supabase";

interface ActionData {
  error?: string;
  success?: boolean;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const email = formData.get("email") as string;

  const { error } = await resetPassword(email);

  if (error instanceof Error) {
    return json<ActionData>({ error: error.message }, { status: 400 });
  }

  return json<ActionData>({ success: true });
};

export default function ResetPassword() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  if (actionData?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-alabaster dark:bg-night p-4">
        <div className="max-w-md w-full space-y-8 bg-white dark:bg-davyGray p-8 rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-bold text-secondary dark:text-alabaster">
            Check your email
          </h2>
          <p className="text-gray dark:text-gray-light">
            We&apos;ve sent you a link to reset your password. Please check your
            email and follow the instructions.
          </p>
          <div>
            <Link
              to="/auth/sign-in"
              className="inline-block text-primary hover:text-primary-dark"
            >
              Return to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-alabaster dark:bg-night p-4">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-davyGray p-8 rounded-lg shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-secondary dark:text-alabaster">
            Reset your password
          </h2>
          <p className="mt-2 text-sm text-gray dark:text-gray-light">
            Enter your email address and we&apos;ll send you a link to reset
            your password.
          </p>
        </div>

        <Form method="post" className="mt-8 space-y-6">
          {actionData?.error && (
            <div className="text-red-500 text-sm text-center" role="alert">
              {actionData.error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-secondary dark:text-alabaster"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary dark:bg-night dark:text-alabaster dark:border-davyGray"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Sending reset link..." : "Send reset link"}
            </button>
          </div>

          <div className="text-center">
            <Link
              to="/auth/sign-in"
              className="text-sm text-primary hover:text-primary-dark"
            >
              Back to sign in
            </Link>
          </div>
        </Form>
      </div>
    </div>
  );
}
