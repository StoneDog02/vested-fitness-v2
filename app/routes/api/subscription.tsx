import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { createSubscription } from "~/utils/stripe.server";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const customerId = formData.get("customerId")?.toString();
  const priceId = formData.get("priceId")?.toString();

  if (!customerId || !priceId) {
    return json(
      { error: "Customer ID and Price ID are required" },
      { status: 400 }
    );
  }

  try {
    const subscription = await createSubscription(customerId, priceId);
    return json({ subscription });
  } catch (error) {
    console.error("Subscription Error:", error);
    return json({ error: "Failed to create subscription" }, { status: 400 });
  }
}
