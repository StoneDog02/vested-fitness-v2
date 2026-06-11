import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const clientId = params.clientId;
  if (clientId) {
    return redirect(`/dashboard/messages?clientId=${clientId}`);
  }
  return redirect("/dashboard/messages");
};
