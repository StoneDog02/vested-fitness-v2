import { useState } from "react";
import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";

export const meta: MetaFunction = () => {
  return [
    { title: "Payment Settings | Vested Fitness" },
    {
      name: "description",
      content: "Manage your payment methods and subscription",
    },
  ];
};

// Mock payment data
const mockPaymentMethods = [
  {
    id: "pm_1",
    type: "card",
    brand: "visa",
    last4: "4242",
    expMonth: 12,
    expYear: 2025,
    isDefault: true,
  },
  {
    id: "pm_2",
    type: "card",
    brand: "mastercard",
    last4: "5555",
    expMonth: 3,
    expYear: 2026,
    isDefault: false,
  },
];

const mockSubscription = {
  plan: "Premium Coaching",
  amount: 149.99,
  interval: "month",
  status: "active",
  nextBillingDate: "2023-06-15",
};

const mockBillingHistory = [
  {
    id: "inv_1",
    date: "2023-05-15",
    amount: 149.99,
    status: "paid",
    description: "Premium Coaching - Monthly",
  },
  {
    id: "inv_2",
    date: "2023-04-15",
    amount: 149.99,
    status: "paid",
    description: "Premium Coaching - Monthly",
  },
  {
    id: "inv_3",
    date: "2023-03-15",
    amount: 149.99,
    status: "paid",
    description: "Premium Coaching - Monthly",
  },
];

export default function PaymentSettings() {
  const [showAddCardForm, setShowAddCardForm] = useState(false);

  const formatCardBrand = (brand: string) => {
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  return (
    <>
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
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-primary text-primary dark:text-primary"
        >
          Payment Method
        </Link>
        <Link
          to="/dashboard/settings/terms"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:border-primary/50"
        >
          Terms & Conditions
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <Card title="Payment Methods">
          <div className="space-y-4">
            {mockPaymentMethods.map((method) => (
              <div
                key={method.id}
                className="flex justify-between items-center p-3 border border-gray-light rounded-md"
              >
                <div className="flex items-center">
                  <div className="w-10 h-8 bg-gray-light flex items-center justify-center rounded mr-3">
                    {method.brand === "visa" ? (
                      <span className="text-blue-600 font-bold">VISA</span>
                    ) : method.brand === "mastercard" ? (
                      <span className="text-red-600 font-bold">MC</span>
                    ) : (
                      <span>{formatCardBrand(method.brand)}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-secondary">
                      {formatCardBrand(method.brand)} ending in {method.last4}
                    </p>
                    <p className="text-xs text-gray-dark">
                      Expires {method.expMonth}/{method.expYear}
                    </p>
                  </div>
                </div>
                <div className="flex items-center">
                  {method.isDefault && (
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded mr-2">
                      Default
                    </span>
                  )}
                  <button className="text-sm text-gray-dark hover:text-primary">
                    {method.isDefault ? "Edit" : "Set Default"}
                  </button>
                </div>
              </div>
            ))}

            {showAddCardForm ? (
              <div className="border border-gray-light rounded-md p-4">
                <h3 className="text-sm font-medium text-secondary mb-4">
                  Add New Payment Method
                </h3>
                <form className="space-y-4">
                  <div>
                    <label
                      htmlFor="card-number"
                      className="block text-sm font-medium text-secondary mb-1"
                    >
                      Card Number
                    </label>
                    <input
                      id="card-number"
                      type="text"
                      placeholder="1234 5678 9012 3456"
                      className="block w-full border border-gray-light rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary focus:border-primary"
                      required
                    />
                  </div>

                  <div className="flex space-x-4">
                    <div className="flex-1">
                      <label
                        htmlFor="exp-date"
                        className="block text-sm font-medium text-secondary mb-1"
                      >
                        Expiration Date
                      </label>
                      <input
                        id="exp-date"
                        type="text"
                        placeholder="MM/YY"
                        className="block w-full border border-gray-light rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary focus:border-primary"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <label
                        htmlFor="cvc"
                        className="block text-sm font-medium text-secondary mb-1"
                      >
                        CVC
                      </label>
                      <input
                        id="cvc"
                        type="text"
                        placeholder="123"
                        className="block w-full border border-gray-light rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary focus:border-primary"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      id="make-default"
                      type="checkbox"
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-light rounded"
                    />
                    <label
                      htmlFor="make-default"
                      className="ml-2 block text-sm text-secondary"
                    >
                      Make this my default payment method
                    </label>
                  </div>

                  <div className="flex space-x-3">
                    <Button type="submit" variant="primary">
                      Add Card
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddCardForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowAddCardForm(true)}
              >
                Add Payment Method
              </Button>
            )}
          </div>
        </Card>

        {/* Subscription Info */}
        <Card title="Subscription">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-medium text-secondary">
                  {mockSubscription.plan}
                </h3>
                <p className="text-sm text-gray-dark">
                  ${mockSubscription.amount}/{mockSubscription.interval}
                </p>
              </div>
              <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded">
                {mockSubscription.status}
              </span>
            </div>

            <div className="border-t border-gray-light pt-4">
              <h3 className="text-sm font-medium text-secondary mb-2">
                Next Billing Date
              </h3>
              <p className="text-sm text-gray-dark">
                {formatDate(mockSubscription.nextBillingDate)}
              </p>
            </div>

            <div className="border-t border-gray-light pt-4">
              <h3 className="text-sm font-medium text-secondary mb-2">
                Billing History
              </h3>
              <div className="space-y-2">
                {mockBillingHistory.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex justify-between items-center text-sm"
                  >
                    <div>
                      <p className="text-gray-dark">{invoice.description}</p>
                      <p className="text-xs text-gray-dark">
                        {formatDate(invoice.date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-dark">${invoice.amount}</p>
                      <p className="text-xs text-green-600">{invoice.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
