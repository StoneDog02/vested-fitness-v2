import { Form, Link, useActionData, useSearchParams } from "@remix-run/react";
import { json, type ActionFunction, type MetaFunction } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { getOrCreateStripeCustomer, createStripeSubscription, attachPaymentMethod } from "~/utils/stripe.server";
import React, { useRef, useEffect, useState } from "react";
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useStripe, useElements } from '@stripe/react-stripe-js';

export const meta: MetaFunction = () => {
  return [
    { title: "Register | Kava Training" },
    { name: "description", content: "Create a new Kava Training account" },
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
  };
  success?: boolean;
  message?: string;
  clientSecret?: string | null;
  free?: boolean;
};

// Utility to generate a slug from a name
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const name = formData.get("name")?.toString();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const goal = formData.get("goal")?.toString();
  const planPriceId = formData.get("plan_price_id")?.toString();
  const paymentMethodId = formData.get("paymentMethodId")?.toString();
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

  // Generate slug from name
  const slug = slugify(name);

  const { error: insertError } = await supabase.from("users").insert({
    auth_id,
    email,
    name,
    role,
    status: 'active', // Explicitly set status for new users
    ...(coach_id ? { coach_id } : {}),
    ...(goal ? { goal } : {}),
    slug,
  });

  if (insertError) {
    let errorMessage = insertError.message;
    if (
      insertError.message.includes('duplicate key value') &&
      insertError.message.includes('users_email_key')
    ) {
      errorMessage = "An account with this email already exists. Please log in or use a different email.";
    }
    console.error('[REGISTRATION] Failed to insert user:', errorMessage);
    return json<ActionData>({
      error: errorMessage,
      fields: { name, email, password, userType: role, inviteCode },
    });
  }

  // Fetch the user row by auth_id to get the correct id (primary key)
  const { data: userRow, error: fetchUserError } = await supabase
    .from("users")
    .select("id, email")
    .eq("auth_id", auth_id)
    .single();
  if (fetchUserError || !userRow) {
    console.error('[REGISTRATION] Failed to fetch user after insert:', fetchUserError);
    return json<ActionData>({
      error: "Failed to fetch user after registration.",
      fields: { name, email, password, userType: role, inviteCode },
    });
  }
  const userId = userRow.id;

  // Only run Stripe logic for clients
  if (role === 'client') {
    // Create Stripe customer and update user record
    let stripeCustomerId: string | undefined = undefined;
    try {
      stripeCustomerId = await getOrCreateStripeCustomer({ userId, email });
      console.log('[REGISTRATION] stripeCustomerId:', stripeCustomerId);
      await supabase.from("users").update({ stripe_customer_id: stripeCustomerId }).eq("auth_id", auth_id);
      // If paymentMethodId is present, attach it and set as default
      if (stripeCustomerId && paymentMethodId) {
        console.log('[REGISTRATION] Attaching payment method:', paymentMethodId, 'to customer:', stripeCustomerId);
        await attachPaymentMethod({ customerId: stripeCustomerId, paymentMethodId });
        console.log('[REGISTRATION] Payment method attached');
      }
    } catch (e) {
      // Optionally log or handle error, but don't block registration
      console.error("Failed to create Stripe customer or attach payment method:", e);
    }

    // If planPriceId is present, create a Stripe subscription for the user
    if (stripeCustomerId && planPriceId) {
      try {
        console.log('[REGISTRATION] Creating subscription with:', { planPriceId, paymentMethodId, stripeCustomerId });
        // Use an absolute URL for the API endpoint to create the subscription and get clientSecret
        const url = new URL(request.url);
        const origin = url.origin;
        const res = await fetch(`${origin}/api/create-subscription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ priceId: planPriceId, paymentMethodId, customerId: stripeCustomerId }),
        });
        const data = await res.json();
        console.log('[REGISTRATION] Subscription creation response:', data);
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to create subscription');
        }
        
        // Handle free products - no payment confirmation needed
        if (data.free) {
          console.log('[REGISTRATION] Free product detected, skipping payment confirmation');
          return json<ActionData>({
            fields: { name: '', email: '', password: '', userType: role },
            error: undefined,
            success: true,
            message: `Account created! ${data.message} We've sent a verification email to ${email}. Please check your inbox to verify your account before logging in.`,
            clientSecret: null,
            free: true,
          });
        }
        
        // Pass clientSecret to the frontend for Stripe.js confirmation (paid products)
        return json<ActionData>({
          fields: { name: '', email: '', password: '', userType: role },
          error: undefined,
          success: true,
          message: `Account created! We've sent a verification email to ${email}. Please check your inbox to verify your account before logging in.`,
          clientSecret: data.clientSecret || null,
        });
      } catch (e) {
        console.error('Failed to create Stripe subscription:', e);
      }
    }
  }

  // If client, mark invite as accepted
  if (inviteCode) {
    await supabase
      .from("client_invitations")
      .update({ accepted: true })
      .eq("token", inviteCode)
      .eq("email", email);
    
    // Send email notification to coach if email notifications are enabled
    try {
      // Get coach's email notification preference
      const { data: coach } = await supabase
        .from("users")
        .select("email, email_notifications")
        .eq("id", coach_id)
        .single();
      
      if (coach && coach.email_notifications) {
        // Import Resend here to avoid issues with server-side rendering
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        await resend.emails.send({
          from: "Kava Training <noreply@kavatraining.com>",
          to: coach.email,
          subject: `New Client Registration: ${name}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #22c55e;">New Client Registration!</h2>
              <p>Hello Coach,</p>
              <p>Great news! <strong>${name}</strong> has successfully registered and joined your client roster.</p>
              <p><strong>Client Details:</strong></p>
              <ul>
                <li><strong>Name:</strong> ${name}</li>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Goal:</strong> ${goal || 'Not specified'}</li>
              </ul>
              <p>Your new client is now ready to start their fitness journey with you!</p>
              <p>You can view their profile and begin setting up their meal and workout plans from your dashboard.</p>
              <p>Best regards,<br />The Kava Training Team</p>
              <div style="margin-top: 32px; text-align: center;">
                <img src="https://kavatraining.com/KAVA-TRAINING.svg" alt="KAVA TRAINING Logo" style="height: 48px; margin: 0 auto;" />
              </div>
            </div>
          `,
        });
        console.log(`[REGISTRATION] Coach notification email sent to ${coach.email} for new client ${name}`);
      } else {
        console.log(`[REGISTRATION] Coach notification skipped - email notifications disabled or coach not found`);
      }
    } catch (error) {
      // Don't fail registration if email notification fails
      console.error("Failed to send coach notification email:", error);
    }
  }

  // Success: prompt to check email for verification
  return json<ActionData>({
    fields: { name: "", email: "", password: "", userType: role },
    error: undefined,
    success: true,
    message: `Account created! We've sent a verification email to ${email}. Please check your inbox to verify your account before logging in.`,
  });
};

// Add a CardForm component for client invite registration
interface CardSectionProps {
  cardError: string | null;
  setCardError: (err: string | null) => void;
  cardPaymentMethodId: string | null;
  setCardPaymentMethodId: (id: string | null) => void;
  paymentLoading: boolean;
  setPaymentLoading: (loading: boolean) => void;
}

function CardSection({ cardError, setCardError, cardPaymentMethodId }: { cardError: string | null, setCardError: (err: string | null) => void, cardPaymentMethodId: string | null }) {
  return (
    <div>
      <label htmlFor="card-element" className="block text-sm font-medium text-secondary mb-1">Card Details</label>
      <div id="card-element" className="border rounded-md p-2 bg-white">
        <CardElement onChange={e => setCardError(e.error ? e.error.message : null)} options={{ style: { base: { fontSize: '16px' } } }} />
      </div>
      <input type="hidden" name="paymentMethodId" value={cardPaymentMethodId || ''} />
      {cardError && <div className="text-red-600 text-sm mt-1">{cardError}</div>}
    </div>
  );
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!);

// 1. Top-level Register component: only renders ClientOnlyRegisterForm after mount
export default function Register(props: any) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return (
    <Elements stripe={stripePromise}>
      <ClientOnlyRegisterForm {...props} />
    </Elements>
  );
}

// 2. Move all previous Register logic (except the mount check) into ClientOnlyRegisterForm
function ClientOnlyRegisterForm(props: any) {
  const actionData = useActionData<ActionData>();
  const formError = actionData?.error || "";
  const success = actionData?.success;
  const message = actionData?.message;
  const clientSecret = actionData?.clientSecret;
  const [searchParams] = useSearchParams();
  const invite = searchParams.get("invite");
  const type = searchParams.get("type");
  const emailParam = searchParams.get("email") || "";
  const nameParam = searchParams.get("name") || "";
  const urlPlanPriceId = searchParams.get("plan_price_id") || "";
  const isClientInvite = invite && type === "client";
  const [planName, setPlanName] = React.useState<string>("");
  const [planPriceId, setPlanPriceId] = React.useState<string>(urlPlanPriceId);
  const [planPrice, setPlanPrice] = React.useState<string>("");
  const [paymentLoading, setPaymentLoading] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = React.useState(false);
  const [cardPaymentMethodId, setCardPaymentMethodId] = React.useState<string | null>(null);
  const [cardLoading, setCardLoading] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [cardError, setCardError] = React.useState<string | null>(null);

  const stripe = useStripe();
  const elements = useElements();

  // Fetch plan info robustly: use plan_price_id from invite fetch if available, else fallback to URL
  React.useEffect(() => {
    if (isClientInvite) {
      let didSetFromInvite = false;
      if (invite) {
        fetch(`/api/invite-client?invite=${invite}`)
          .then((res) => res.json())
          .then((data) => {
            if (data && data.plan_price_id) {
              setPlanPriceId(data.plan_price_id);
              didSetFromInvite = true;
              // Fetch plan details from Stripe plans API
              fetch("/api/get-stripe-plans")
                .then((res) => res.json())
                .then((plansData) => {
                  const plan = (plansData.plans || []).find((p: any) => p.id === data.plan_price_id);
                  if (plan) {
                    setPlanName(plan.name);
                    const price = plan.amount != null ? (plan.amount / 100).toLocaleString(undefined, { style: "currency", currency: plan.currency }) : "";
                    const displayPrice = plan.amount === 0 ? "Free" : (plan.interval ? `${price} / ${plan.interval}` : price);
                    setPlanPrice(displayPrice);
                  } else {
                    setPlanName("Unknown Plan");
                    setPlanPrice("");
                  }
                });
            }
          })
          .catch(() => {
            // ignore fetch error, fallback below
          })
          .finally(() => {
            // Fallback: if plan_price_id is in URL and not set from invite, use it
            if (!didSetFromInvite && urlPlanPriceId) {
              setPlanPriceId(urlPlanPriceId);
              fetch("/api/get-stripe-plans")
                .then((res) => res.json())
                .then((plansData) => {
                  const plan = (plansData.plans || []).find((p: any) => p.id === urlPlanPriceId);
                  if (plan) {
                    setPlanName(plan.name);
                    const price = plan.amount != null ? (plan.amount / 100).toLocaleString(undefined, { style: "currency", currency: plan.currency }) : "";
                    const displayPrice = plan.amount === 0 ? "Free" : (plan.interval ? `${price} / ${plan.interval}` : price);
                    setPlanPrice(displayPrice);
                  } else {
                    setPlanName("Unknown Plan");
                    setPlanPrice("");
                  }
                });
            }
          });
      } else if (urlPlanPriceId) {
        setPlanPriceId(urlPlanPriceId);
        fetch("/api/get-stripe-plans")
          .then((res) => res.json())
          .then((plansData) => {
            const plan = (plansData.plans || []).find((p: any) => p.id === urlPlanPriceId);
            if (plan) {
              setPlanName(plan.name);
              const price = plan.amount != null ? (plan.amount / 100).toLocaleString(undefined, { style: "currency", currency: plan.currency }) : "";
              const displayPrice = plan.amount === 0 ? "Free" : (plan.interval ? `${price} / ${plan.interval}` : price);
              setPlanPrice(displayPrice);
            } else {
              setPlanName("Unknown Plan");
              setPlanPrice("");
            }
          });
      }
    }
  }, [isClientInvite, invite, urlPlanPriceId]);

  React.useEffect(() => {
    // Handle free products - show success immediately without payment confirmation
    if (actionData?.free) {
      setPaymentSuccess(true);
      setPaymentLoading(false);
      setPaymentError(null);
      return;
    }
    
    if (clientSecret) {
      // Confirm payment intent with Stripe.js
      setPaymentLoading(true);
      setPaymentError(null);
      setPaymentSuccess(false);
      stripePromise.then(async (stripe) => {
        if (!stripe) {
          setPaymentError('Stripe.js failed to load');
          setPaymentLoading(false);
          return;
        }
        const result = await stripe.confirmCardPayment(clientSecret);
        if (result.error) {
          setPaymentError(result.error.message || 'Payment confirmation failed');
        } else if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
          setPaymentSuccess(true);
        }
        setPaymentLoading(false);
      });
    }
  }, [clientSecret, actionData?.free]);

  // Unified form submit handler
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (isClientInvite && planPriceId) {
      e.preventDefault();
      setPaymentLoading(true);
      setCardError(null);

      // Check if this is a free plan by looking at the plan price
      const isFreePlan = planPrice === "Free";
      
      if (isFreePlan) {
        // For free plans, skip payment method creation and submit directly
        console.log('[REGISTRATION] Free plan detected, skipping payment method creation');
        setPaymentLoading(false);
        setTimeout(() => {
          formRef.current?.submit();
        }, 0);
        return;
      }

      // Only proceed if mounted (client)
      if (!elements || !stripe) {
        setCardError("Stripe is not loaded");
        setPaymentLoading(false);
        return;
      }
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        setCardError("Card input not found");
        setPaymentLoading(false);
        return;
      }
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
      });
      if (error) {
        setCardError(error.message || "Card error");
        setPaymentLoading(false);
        return;
      }
      setCardPaymentMethodId(paymentMethod.id);
      setCardError(null);
      setPaymentLoading(false);
      setTimeout(() => {
        formRef.current?.submit();
      }, 0);
      return;
    }
    // For non-client-invite, allow normal submit
  };

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
          {paymentLoading && (
            <div className="rounded-md bg-yellow-50 p-4 mb-4">
              <div className="flex">
                <div className="text-sm text-yellow-700">
                  {paymentError || (actionData?.free ? "Activating free plan..." : "Processing payment...")}
                </div>
              </div>
            </div>
          )}
          {paymentError && (
            <div className="rounded-md bg-red-50 p-4 mb-4">
              <div className="flex">
                <div className="text-sm text-red-700">{paymentError}</div>
              </div>
            </div>
          )}
          {paymentSuccess && (
            <div className="rounded-md bg-green-50 p-4 mb-4">
              <div className="flex">
                <div className="text-sm text-green-700">
                  {actionData?.free ? "Free plan activated successfully!" : "Payment confirmed successfully!"}
                </div>
              </div>
            </div>
          )}
          {!success && (
            <Form method="post" className="space-y-6" ref={formRef} onSubmit={handleSubmit}>
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
              {/* Plan name and price (read-only) for client invite */}
              {isClientInvite && planPriceId && planName && (
                <div>
                  <label htmlFor="plan_name" className="block text-sm font-medium text-secondary mb-1">
                    Subscription Plan
                  </label>
                  <input
                    id="plan_name"
                    name="plan_name"
                    type="text"
                    value={planName}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-gray-100 text-secondary dark:text-alabaster cursor-not-allowed"
                    tabIndex={-1}
                  />
                  {planPrice && (
                    <div className="mt-1 text-xs text-secondary dark:text-alabaster opacity-60">
                      {planPrice === "$0.00" || planPrice === "$0.00 / month" || planPrice === "$0.00 / year" ? "Free" : planPrice}
                    </div>
                  )}
                </div>
              )}
              {isClientInvite && planPriceId && planPrice !== "Free" && (
                <div>
                  {elements && (
                    <CardSection
                      cardError={cardError}
                      setCardError={setCardError}
                      cardPaymentMethodId={cardPaymentMethodId}
                    />
                  )}
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
              {isClientInvite && (
                <div className="mt-6 border border-gray-200 rounded-md p-4 bg-gray-50">
                  <h3 className="text-md font-semibold mb-2 text-secondary">Terms and Conditions</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>Minimum Commitment:</strong> By registering, you agree to a <span className="font-semibold">4-month minimum commitment</span> to your coaching plan. For legal and contractual reasons, your account cannot be deleted or cancelled until you have completed 4 monthly payments.
                  </p>
                  <p className="text-sm text-gray-700 mb-2">
                    If you have questions about this policy, please contact your coach before completing registration.
                  </p>
                  <div className="flex items-center mt-3">
                    <input
                      id="terms"
                      name="terms"
                      type="checkbox"
                      required
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor="terms" className="ml-2 block text-sm text-gray-800">
                      I have read and agree to the Terms and Conditions above
                    </label>
                  </div>
                </div>
              )}
              {isClientInvite && planPriceId && (
                <input type="hidden" name="plan_price_id" value={planPriceId} />
              )}
              {/* Always show submit button for client invite */}
              {isClientInvite && (
                <button
                  type="submit"
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  disabled={paymentLoading || cardLoading}
                >
                  {paymentLoading || cardLoading ? 'Processing...' : 'Create Account'}
                </button>
              )}
              {!isClientInvite && (
                <button
                  type="submit"
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  Create Account
                </button>
              )}
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}
