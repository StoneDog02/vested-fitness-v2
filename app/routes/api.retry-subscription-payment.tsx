import { json, type ActionFunctionArgs } from "@remix-run/node";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { stripe } from "~/utils/stripe.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Authenticate coach
    const cookies = parse(request.headers.get("cookie") || "");
    const supabaseAuthCookieKey = Object.keys(cookies).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
    );

    let accessToken: string | undefined;
    if (supabaseAuthCookieKey) {
      try {
        const decoded = Buffer.from(
          cookies[supabaseAuthCookieKey],
          "base64"
        ).toString("utf-8");
        const [access] = JSON.parse(JSON.parse(decoded));
        accessToken = access;
      } catch (error) {
        accessToken = undefined;
      }
    }

    let authId: string | undefined;
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
        authId =
          decoded && typeof decoded === "object" && "sub" in decoded
            ? (decoded.sub as string)
            : undefined;
      } catch (error) {
        authId = undefined;
      }
    }

    if (!authId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    let clientId: string | null = null;
    let subscriptionId: string | null = null;

    if (contentType.includes("application/json")) {
      try {
        const body = await request.json();
        clientId = typeof body.clientId === "string" ? body.clientId : null;
        subscriptionId =
          typeof body.subscriptionId === "string" ? body.subscriptionId : null;
      } catch (error) {
        return json({ error: "Invalid JSON payload" }, { status: 400 });
      }
    } else {
      const formData = await request.formData();
      clientId = formData.get("clientId")?.toString() ?? null;
      subscriptionId = formData.get("subscriptionId")?.toString() ?? null;
    }

    if (!clientId || !subscriptionId) {
      return json({ error: "Missing clientId or subscriptionId" }, { status: 400 });
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Ensure the authenticated coach owns this client
    const { data: coachUser } = await supabase
      .from("users")
      .select("id, role")
      .eq("auth_id", authId)
      .single();

    if (!coachUser || coachUser.role !== "coach") {
      return json({ error: "Only coaches can retry payments" }, { status: 403 });
    }

    const { data: client } = await supabase
      .from("users")
      .select("id, stripe_customer_id, email")
      .eq("id", clientId)
      .eq("coach_id", coachUser.id)
      .single();

    if (!client) {
      return json({ error: "Client not found or access denied" }, { status: 404 });
    }

    if (!client.stripe_customer_id) {
      return json({ error: "Client has no Stripe customer record" }, { status: 400 });
    }

    // Fetch subscription and invoice details
    let subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice"],
      });
    } catch (error: any) {
      return json(
        { error: error?.message || "Unable to retrieve subscription" },
        { status: 400 }
      );
    }

    if (
      (typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id) !== client.stripe_customer_id
    ) {
      return json(
        { error: "Subscription does not belong to this client" },
        { status: 403 }
      );
    }

    let latestInvoice = subscription.latest_invoice;
    let invoiceId: string | null = null;

    if (latestInvoice) {
      if (typeof latestInvoice === "string") {
        invoiceId = latestInvoice;
      } else if (typeof latestInvoice === "object" && latestInvoice.id) {
        invoiceId = latestInvoice.id;
      }
    }

    if (!invoiceId) {
      return json(
        { error: "No invoice found to retry. Ask the client to update payment method." },
        { status: 400 }
      );
    }

    let invoiceObj;
    try {
      invoiceObj = await stripe.invoices.retrieve(invoiceId, {
        expand: ["payment_intent"],
      });
    } catch (error: any) {
      return json(
        { error: error?.message || "Unable to retrieve invoice" },
        { status: 400 }
      );
    }

    if (invoiceObj.status === "paid") {
      return json({
        success: true,
        message: "Invoice is already paid.",
      });
    }

    if (invoiceObj.status === "draft") {
      try {
        invoiceObj = await stripe.invoices.finalizeInvoice(invoiceId, {
          auto_advance: true,
        });
      } catch (error: any) {
        return json(
          { error: error?.message || "Unable to finalize invoice" },
          { status: 400 }
        );
      }
    }

    if (invoiceObj.status !== "open") {
      return json({
        error: `Invoice is not open. Current status: ${invoiceObj.status}`,
      }, { status: 400 });
    }

    // Determine payment method
    const customer = await stripe.customers.retrieve(client.stripe_customer_id);
    const defaultPaymentMethodId =
      (customer as any).invoice_settings?.default_payment_method ||
      (subscription.default_payment_method &&
        (typeof subscription.default_payment_method === "string"
          ? subscription.default_payment_method
          : subscription.default_payment_method.id));

    let paymentMethodId = defaultPaymentMethodId;

    if (!paymentMethodId) {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: client.stripe_customer_id,
        type: "card",
        limit: 1,
      });
      paymentMethodId = paymentMethods.data[0]?.id;
    }

    if (!paymentMethodId) {
      return json(
        {
          error: "Client has no payment method on file. Add a payment method to retry.",
        },
        { status: 400 }
      );
    }

    try {
      await stripe.invoices.pay(invoiceObj.id, {
        payment_method: paymentMethodId,
        off_session: true,
      });

      const updatedSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice", "latest_invoice.payment_intent"],
      });

      return json({
        success: true,
        subscription: updatedSubscription,
        message: "Payment retry initiated. Check subscription status for updates.",
      });
    } catch (error: any) {
      return json(
        {
          error: error?.message || "Stripe payment attempt failed",
          code: error?.code,
          decline_code: error?.decline_code,
          payment_intent: error?.payment_intent,
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error retrying subscription payment:", error);
    return json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

