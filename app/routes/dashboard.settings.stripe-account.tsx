import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import Modal from "~/components/ui/Modal";
import DatePicker from "~/components/ui/DatePicker";
import Tooltip from "~/components/ui/Tooltip";
import { useFetcher } from "@remix-run/react";
import { getTodayString } from "~/lib/dateUtils";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

export const meta: MetaFunction = () => {
  return [
    { title: "Stripe Account | Kava Training" },
    { name: "description", content: "Manage your Stripe account and products" },
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Get coach from auth cookie
    const cookies = parse(request.headers.get("cookie") || "");
    const supabaseAuthCookieKey = Object.keys(cookies).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
    );
    let accessToken;
    if (supabaseAuthCookieKey) {
      try {
        const decoded = Buffer.from(
          cookies[supabaseAuthCookieKey],
          "base64"
        ).toString("utf-8");
        const [access] = JSON.parse(JSON.parse(decoded));
        accessToken = access;
      } catch (e) {
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
      } catch (e) {
        authId = undefined;
      }
    }
    if (!authId) {
      throw new Response("Unauthorized", { status: 401 });
    }

    // Get coach user record
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: user } = await supabase
      .from("users")
      .select("id, role")
      .eq("auth_id", authId)
      .single();

    if (!user || user.role !== "coach") {
      throw new Response("Only coaches can access this", { status: 403 });
    }

    // Fetch Stripe account info, products, and coach's clients
    const url = new URL(request.url);
    const origin = url.origin;
    const [accountRes, productsRes] = await Promise.all([
      fetch(`${origin}/api/stripe-account-info`, {
        headers: { cookie: request.headers.get("cookie") || "" },
      }),
      fetch(`${origin}/api/stripe-products`, {
        headers: { cookie: request.headers.get("cookie") || "" },
      }),
    ]);

    const accountData = accountRes.ok ? await accountRes.json() : { account: null };
    const productsData = productsRes.ok ? await productsRes.json() : { products: [] };

    // Get coach's clients
    const { data: clients } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("coach_id", user.id)
      .eq("role", "client")
      .order("name", { ascending: true });

    return json({
      account: accountData.account,
      products: productsData.products || [],
      totalMonthlyRevenue: productsData.totalMonthlyRevenue || 0,
      expectedMonthlyRevenue: productsData.expectedMonthlyRevenue || 0,
      actualMonthlyRevenue: productsData.actualMonthlyRevenue || 0,
      refundsThisMonth: productsData.refundsThisMonth || 0,
      debug: productsData.debug,
      clients: clients || [],
    });
  } catch (error) {
    console.error("Error in Stripe account loader:", error);
    throw error;
  }
};

export default function StripeAccount() {
  const {
    account,
    products,
    totalMonthlyRevenue,
    expectedMonthlyRevenue,
    actualMonthlyRevenue,
    refundsThisMonth,
    debug,
    clients,
  } = useLoaderData<typeof loader>();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const fetcher = useFetcher();
  const archiveFetcher = useFetcher();

  // Refresh products after creation or archiving
  useEffect(() => {
    if (fetcher.data?.success || archiveFetcher.data?.success) {
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  }, [fetcher.data?.success, archiveFetcher.data?.success]);

  const formatPrice = (amount: number | null, currency: string = "usd") => {
    if (amount == null) return "$0.00";
    return (amount / 100).toLocaleString(undefined, {
      style: "currency",
      currency,
    });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleArchive = (productId: string, currentStatus: boolean) => {
    archiveFetcher.submit(
      {
        productId,
        archive: currentStatus,
      },
      {
        method: "POST",
        action: "/api/archive-stripe-product",
      }
    );
  };

  // Filter products based on showArchived state
  const displayedProducts = showArchived 
    ? products.filter((p: any) => !p.active) // Show only archived when toggle is on
    : products.filter((p: any) => p.active); // Show only active when toggle is off

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
          Settings
        </h1>
      </div>

      <div className="flex border-b border-gray-light dark:border-davyGray mb-6">
        <Link
          to="/dashboard/settings"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:border-primary/50"
        >
          General
        </Link>
        <Link
          to="/dashboard/settings/payment"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:border-primary/50"
        >
          Payment Method
        </Link>
        <Link
          to="/dashboard/settings/stripe-account"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-primary text-primary dark:text-primary"
        >
          Stripe Account
        </Link>
        <Link
          to="/dashboard/settings/terms"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:border-primary/50"
        >
          Terms & Conditions
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Stripe Account Info */}
          <Card title="Stripe Account Information">
            <div className="space-y-4">
              {account ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-dark dark:text-gray-light">Account Status:</span>
                    <span className={`text-sm font-medium ${account.charges_enabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {account.charges_enabled ? '✓ Active' : '✗ Inactive'}
                    </span>
                  </div>
                  {account.email && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-dark dark:text-gray-light">Email:</span>
                      <span className="text-sm text-secondary dark:text-alabaster">{account.email}</span>
                    </div>
                  )}
                  {account.country && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-dark dark:text-gray-light">Country:</span>
                      <span className="text-sm text-secondary dark:text-alabaster">{account.country.toUpperCase()}</span>
                    </div>
                  )}
                  {account.default_currency && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-dark dark:text-gray-light">Currency:</span>
                      <span className="text-sm text-secondary dark:text-alabaster">{account.default_currency.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-dark dark:text-gray-light">Payouts Enabled:</span>
                    <span className={`text-sm font-medium ${account.payouts_enabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {account.payouts_enabled ? 'Yes' : 'No'}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-dark dark:text-gray-light">
                  Unable to retrieve account information.
                </p>
              )}
            </div>
          </Card>

          {/* Total Monthly Payout */}
          <Card title="Total Monthly Payout">
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl font-bold text-primary dark:text-primary mb-2">
                  {formatPrice(actualMonthlyRevenue)}
                </div>
                <div className="text-sm text-gray-dark dark:text-gray-light">
                  Monthly Recurring Revenue (MRR) (Actual)
                </div>
                {refundsThisMonth > 0 && (
                  <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Includes {formatPrice(refundsThisMonth)} in refunds this month
                  </div>
                )}
              </div>
              <div className="text-center pt-2 border-t border-gray-light dark:border-davyGray">
                <div className="text-3xl font-bold text-secondary dark:text-alabaster mb-2">
                  {formatPrice(expectedMonthlyRevenue)}
                </div>
                <div className="text-sm text-gray-dark dark:text-gray-light">
                  Expected MRR
                </div>
              </div>
              <div className="pt-4 border-t border-gray-light dark:border-davyGray">
                <div className="text-xs text-gray-dark dark:text-gray-light space-y-1">
                  <div className="flex justify-between">
                    <span>Active Subscriptions:</span>
                    <span className="font-medium text-secondary dark:text-alabaster">
                      {products.reduce((sum: number, p: any) => sum + (p.activeClients || 0), 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average per Client:</span>
                    <span className="font-medium text-secondary dark:text-alabaster">
                      {products.reduce((sum: number, p: any) => sum + (p.activeClients || 0), 0) > 0
                        ? formatPrice(Math.round(totalMonthlyRevenue / products.reduce((sum: number, p: any) => sum + (p.activeClients || 0), 0)))
                        : formatPrice(0)}
                    </span>
                  </div>
                </div>
              </div>
              {debug && (
                <div className="pt-4 border-t border-gray-light dark:border-davyGray mt-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <div className="font-semibold mb-2">Debug Info:</div>
                    <div>Total Clients: {debug.totalClients}</div>
                    <div>Clients with Stripe IDs: {debug.clientsWithStripeIds}</div>
                    <div>Total Subscriptions: {debug.totalSubscriptions}</div>
                    <div>Active Subscriptions: {debug.activeSubscriptions}</div>
                    {Object.keys(debug.subscriptionsByStatus).length > 0 && (
                      <div className="mt-2">
                        <div className="font-semibold">By Status:</div>
                        {Object.entries(debug.subscriptionsByStatus).map(([status, count]) => (
                          <div key={status} className="ml-2">- {status}: {count}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Product Usage Stats */}
          <Card title="Product Usage">
            <div className="space-y-4">
              {products.filter((p: any) => p.active).length > 0 ? (
                products
                  .filter((p: any) => p.active)
                  .map((product: any) => (
                    <div
                      key={product.id}
                      className="border border-gray-light dark:border-davyGray rounded-lg p-4"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-semibold text-secondary dark:text-alabaster">
                            {product.name}
                          </h4>
                          {product.prices && product.prices.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {product.prices.map((price: any) => (
                                <div
                                  key={price.id}
                                  className="text-xs text-gray-dark dark:text-gray-light"
                                >
                                  {formatPrice(price.amount, price.currency)}
                                  {price.interval && ` / ${price.interval}`}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          {product.activeClients > 0 && product.clientNames && product.clientNames.length > 0 ? (
                            <Tooltip
                              content={
                                <div>
                                  <div className="font-semibold mb-1">Clients on this plan:</div>
                                  {product.clientNames.map((name, idx) => (
                                    <div key={idx}>{name}</div>
                                  ))}
                                </div>
                              }
                            >
                              <div className="cursor-pointer">
                                <div className="text-2xl font-bold text-primary dark:text-primary">
                                  {product.activeClients || 0}
                                </div>
                                <div className="text-xs text-gray-dark dark:text-gray-light">
                                  Active {product.activeClients === 1 ? 'Client' : 'Clients'}
                                </div>
                              </div>
                            </Tooltip>
                          ) : (
                            <div>
                              <div className="text-2xl font-bold text-primary dark:text-primary">
                                {product.activeClients || 0}
                              </div>
                              <div className="text-xs text-gray-dark dark:text-gray-light">
                                Active {product.activeClients === 1 ? 'Client' : 'Clients'}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-gray-dark dark:text-gray-light text-center py-4">
                  No active products found.
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column */}
        <div>
          {/* Products List */}
          <Card
          title="Products"
          action={
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 ml-auto">
              <Button
                variant={showArchived ? "primary" : "secondary"}
                onClick={() => setShowArchived(!showArchived)}
                className="text-sm whitespace-nowrap"
              >
                {showArchived ? "Show Active" : "Show Archived"}
              </Button>
              <Button
                variant="primary"
                onClick={() => setIsCreateModalOpen(true)}
                className="text-sm whitespace-nowrap"
              >
                Create Product
              </Button>
              <button
                onClick={() => setIsAssignModalOpen(true)}
                className="text-sm font-medium text-primary dark:text-primary hover:text-primary/80 dark:hover:text-primary/80 transition-colors whitespace-nowrap"
              >
                Assign Client to Plan
              </button>
            </div>
          }
        >
          {archiveFetcher.data?.success && (
            <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-3 rounded-lg mb-4">
              {archiveFetcher.data.message}
            </div>
          )}
          {archiveFetcher.data?.error && (
            <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4">
              {archiveFetcher.data.error}
            </div>
          )}
          <div className="space-y-4">
            {displayedProducts.length > 0 ? (
              displayedProducts.map((product: any) => (
                <div
                  key={product.id}
                  className={`border rounded-lg p-4 ${
                    product.active
                      ? "border-gray-light dark:border-davyGray"
                      : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/30"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-semibold text-secondary dark:text-alabaster">
                        {product.name}
                      </h4>
                      {product.description && (
                        <p className="text-sm text-gray-dark dark:text-gray-light mt-1">
                          {product.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        product.active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                      }`}>
                        {product.active ? 'Active' : 'Archived'}
                      </span>
                      {product.active && (
                        <Button
                          variant="secondary"
                          onClick={() => handleArchive(product.id, true)}
                          disabled={archiveFetcher.state !== "idle"}
                          className="text-xs px-2 py-1"
                        >
                          Archive
                        </Button>
                      )}
                      {!product.active && (
                        <Button
                          variant="secondary"
                          onClick={() => handleArchive(product.id, false)}
                          disabled={archiveFetcher.state !== "idle"}
                          className="text-xs px-2 py-1"
                        >
                          Activate
                        </Button>
                      )}
                    </div>
                  </div>
                  {product.prices && product.prices.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {product.prices.map((price: any) => (
                        <div
                          key={price.id}
                          className="text-sm text-gray-dark dark:text-gray-light flex justify-between items-center"
                        >
                          <span>
                            {formatPrice(price.amount, price.currency)}
                            {price.interval && ` / ${price.interval}`}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {price.id}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Created {formatDate(product.created)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-dark dark:text-gray-light text-center py-4">
                {showArchived
                  ? "No archived products found."
                  : "No products found. Create your first product to get started."}
              </p>
            )}
          </div>
        </Card>
        </div>
      </div>

      <CreateProductModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <AssignClientToPlanModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        clients={clients}
        products={products.filter((p: any) => p.active)}
      />
    </div>
  );
}

function CreateProductModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const fetcher = useFetcher();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [interval, setInterval] = useState<"month" | "year">("month");

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setDescription("");
      setAmount("");
      setCurrency("usd");
      setInterval("month");
    }
  }, [isOpen]);

  useEffect(() => {
    if (fetcher.data?.success) {
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  }, [fetcher.data?.success, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    fetcher.submit(
      {
        name,
        description,
        amount,
        currency,
        interval,
        intervalCount: "1",
      },
      {
        method: "POST",
        action: "/api/create-stripe-product",
      }
    );
  };

  const isSubmitting = fetcher.state !== "idle";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Product" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {fetcher.data?.success && (
          <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-4 rounded-lg">
            Product created successfully!
          </div>
        )}
        {fetcher.data?.error && (
          <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-lg">
            {fetcher.data.error}
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Product Name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
            placeholder="e.g., Personal Training"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster resize-none"
            placeholder="Describe your product..."
            disabled={isSubmitting}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
              Price ($) *
            </label>
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
              placeholder="200.00"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
              Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
              disabled={isSubmitting}
            >
              <option value="usd">USD</option>
              <option value="eur">EUR</option>
              <option value="gbp">GBP</option>
              <option value="cad">CAD</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="interval" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Billing Interval
          </label>
          <select
            id="interval"
            value={interval}
            onChange={(e) => setInterval(e.target.value as "month" | "year")}
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
            disabled={isSubmitting}
          >
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-light dark:border-davyGray">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !name || !amount}
            className="flex-1"
          >
            {isSubmitting ? "Creating..." : "Create Product"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignClientToPlanModal({
  isOpen,
  onClose,
  clients,
  products,
}: {
  isOpen: boolean;
  onClose: () => void;
  clients: Array<{ id: string; name: string; email: string }>;
  products: Array<{
    id: string;
    name: string;
    prices: Array<{
      id: string;
      amount: number | null;
      currency: string;
      interval?: string | null;
    }>;
  }>;
}) {
  const fetcher = useFetcher();
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedPriceId, setSelectedPriceId] = useState("");
  const [billingCycleAnchor, setBillingCycleAnchor] = useState(getTodayString());
  const [skipFirstPayment, setSkipFirstPayment] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelectedClientId("");
      setSelectedPriceId("");
      setBillingCycleAnchor(getTodayString());
      setSkipFirstPayment(true);
      setNotes("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (fetcher.data?.success) {
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1500);
    }
  }, [fetcher.data?.success, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !selectedPriceId) return;

    fetcher.submit(
      {
        clientId: selectedClientId,
        priceId: selectedPriceId,
        billingCycleAnchor,
        skipFirstPayment: skipFirstPayment.toString(),
        notes,
      },
      {
        method: "POST",
        action: "/api/manual-create-subscription",
      }
    );
  };

  const isSubmitting = fetcher.state !== "idle";
  const selectedProduct = products.find((p) =>
    p.prices.some((price) => price.id === selectedPriceId)
  );
  const selectedPrice = selectedProduct?.prices.find((p) => p.id === selectedPriceId);

  const formatPrice = (amount: number | null, currency: string = "usd") => {
    if (amount == null) return "$0.00";
    return (amount / 100).toLocaleString(undefined, {
      style: "currency",
      currency,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign Client to Plan" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {fetcher.data?.success && (
          <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-4 rounded-lg">
            Subscription created successfully!
          </div>
        )}
        {fetcher.data?.error && (
          <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-lg">
            {fetcher.data.error}
          </div>
        )}

        <div>
          <label htmlFor="client" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Select Client *
          </label>
          <select
            id="client"
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
            disabled={isSubmitting}
          >
            <option value="">Choose a client...</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} ({client.email})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="price" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Select Product & Price *
          </label>
          <select
            id="price"
            value={selectedPriceId}
            onChange={(e) => setSelectedPriceId(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
            disabled={isSubmitting}
          >
            <option value="">Choose a product...</option>
            {products.map((product) =>
              product.prices.map((price) => (
                <option key={price.id} value={price.id}>
                  {product.name} - {formatPrice(price.amount, price.currency)}
                  {price.interval && ` / ${price.interval}`}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label htmlFor="billingCycleAnchor" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Billing Cycle Anchor Date *
          </label>
          <DatePicker
            id="billingCycleAnchor"
            value={billingCycleAnchor}
            onChange={setBillingCycleAnchor}
            minDate={getTodayString()}
          />
          <p className="text-xs text-gray-dark dark:text-gray-light mt-1">
            This is when the subscription will start billing and when future billing cycles will occur.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="skipFirstPayment"
            checked={skipFirstPayment}
            onChange={(e) => setSkipFirstPayment(e.target.checked)}
            className="w-4 h-4 text-primary border-gray-light rounded focus:ring-primary"
            disabled={isSubmitting}
          />
          <label htmlFor="skipFirstPayment" className="text-sm text-secondary dark:text-alabaster">
            Skip first payment (use trial period)
          </label>
        </div>
        <p className="text-xs text-gray-dark dark:text-gray-light -mt-2 ml-6">
          If checked, the subscription will start in trial mode and won't charge until the billing cycle anchor date.
        </p>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Notes (Optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about this subscription..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster resize-none"
            disabled={isSubmitting}
          />
        </div>

        {selectedPrice && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
              Subscription Summary
            </div>
            <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <div>Product: {selectedProduct?.name}</div>
              <div>
                Price: {formatPrice(selectedPrice.amount, selectedPrice.currency)}
                {selectedPrice.interval && ` / ${selectedPrice.interval}`}
              </div>
              <div>Billing starts: {new Date(billingCycleAnchor).toLocaleDateString()}</div>
              <div>First payment: {skipFirstPayment ? "Skipped (trial)" : "On billing start date"}</div>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t border-gray-light dark:border-davyGray">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !selectedClientId || !selectedPriceId || !billingCycleAnchor}
            className="flex-1"
          >
            {isSubmitting ? "Creating..." : "Create Subscription"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

