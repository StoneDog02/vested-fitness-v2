import { useState, useEffect } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import DatePicker from "~/components/ui/DatePicker";
import { useFetcher } from "@remix-run/react";
import dayjs from "dayjs";
import { getTodayString } from "~/lib/dateUtils";
import { InformationCircleIcon, ClockIcon, ArrowPathIcon, LightBulbIcon } from "@heroicons/react/24/outline";

interface Plan {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  interval?: string | null;
}

interface CreateSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  clientEmail: string;
  hasPaymentMethod?: boolean;
  paymentMethodLast4?: string;
}

export default function CreateSubscriptionModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  clientEmail,
  hasPaymentMethod = true,
  paymentMethodLast4,
}: CreateSubscriptionModalProps) {
  const fetcher = useFetcher();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [taxPercentage, setTaxPercentage] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(getTodayString());
  const [notes, setNotes] = useState<string>("");
  const [plansLoading, setPlansLoading] = useState(false);

  // Fetch plans when modal opens
  useEffect(() => {
    if (isOpen) {
      setPlansLoading(true);
      fetch("/api/get-stripe-plans")
        .then((res) => res.json())
        .then((data) => {
          setPlans(data.plans || []);
          if (data.plans && data.plans.length > 0) {
            setSelectedPlanId(data.plans[0].id);
          }
        })
        .finally(() => setPlansLoading(false));
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedPlanId("");
      setTaxPercentage("");
      setStartDate(getTodayString());
      setNotes("");
    }
  }, [isOpen]);

  // Close modal on success
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1500);
    }
  }, [fetcher.state, fetcher.data?.success, onClose]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const baseAmount = selectedPlan?.amount || 0;
  const taxAmount = taxPercentage && parseFloat(taxPercentage) > 0
    ? Math.round(baseAmount * (parseFloat(taxPercentage) / 100))
    : 0;
  const invoiceTotal = baseAmount + taxAmount;
  
  // Stripe processing fees: 2.9% + $0.30
  const processingFee = Math.round(invoiceTotal * 0.029 + 30);
  const netIncome = invoiceTotal - processingFee;

  const formatPrice = (amount: number | null, currency: string = "usd") => {
    if (amount == null) return "$0.00";
    return (amount / 100).toLocaleString(undefined, {
      style: "currency",
      currency,
    });
  };

  const formatPriceWithInterval = (amount: number | null, currency: string, interval?: string | null) => {
    const price = formatPrice(amount, currency);
    return interval ? `${price} / ${interval}` : price;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId) return;

    fetcher.submit(
      {
        clientId,
        priceId: selectedPlanId,
        taxPercentage: taxPercentage || "0",
        startDate,
        notes,
      },
      {
        method: "POST",
        action: "/api/create-client-subscription",
      }
    );
  };

  const isSubmitting = fetcher.state !== "idle";
  const firstPaymentDate = startDate ? dayjs(startDate).format("M/D/YYYY") : "";
  const recurringInterval = selectedPlan?.interval === "month" ? "Every month" : selectedPlan?.interval || "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Subscription" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Success/Error Messages */}
        {fetcher.state === "idle" && fetcher.data?.success && (
          <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-4 rounded-lg">
            Subscription created successfully!
          </div>
        )}
        {fetcher.state === "idle" && fetcher.data?.error && (
          <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-lg">
            {fetcher.data.error}
          </div>
        )}
        {fetcher.state !== "idle" && fetcher.data?.error && (
          <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-lg">
            {fetcher.data.error}
          </div>
        )}

        {/* Client Information */}
        <div className="bg-gray-50 dark:bg-davyGray rounded-lg p-4">
          <div className="text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Client Information
          </div>
          <div className="text-sm text-gray-dark dark:text-gray-light">
            <div>{clientName}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              ({clientEmail})
            </div>
            <div className={`mt-2 ${hasPaymentMethod ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {hasPaymentMethod 
                ? `✓ Card on file${paymentMethodLast4 ? ` (ending in ${paymentMethodLast4})` : ''}`
                : '⚠ No payment method on file'}
            </div>
          </div>
        </div>

        {/* Warning if no payment method */}
        {!hasPaymentMethod && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <InformationCircleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  Payment Method Required
                </div>
                <div className="text-yellow-700 dark:text-yellow-300">
                  This client needs to add a payment method before you can create a subscription. They can add a payment method in their account settings under Payment Method.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Select Product */}
        <div>
          <label htmlFor="plan" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Select Product
          </label>
          <select
            id="plan"
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
            disabled={plansLoading || isSubmitting}
            required
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} - {formatPriceWithInterval(plan.amount, plan.currency, plan.interval)}
              </option>
            ))}
          </select>
          {selectedPlan && (
            <div className="mt-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="font-semibold text-blue-800 dark:text-blue-200">
                {selectedPlan.name}
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300">
                {formatPriceWithInterval(selectedPlan.amount, selectedPlan.currency, selectedPlan.interval)}
              </div>
              {selectedPlan.name === "Personal Training" && (
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Custom meal plans, workout plans, supplement regimens with weekly check ins
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tax Percentage */}
        <div>
          <label htmlFor="tax" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Tax Percentage (%)
          </label>
          <input
            id="tax"
            type="number"
            step="0.1"
            min="0"
            value={taxPercentage}
            onChange={(e) => setTaxPercentage(e.target.value)}
            placeholder="e.g., 8.5"
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster"
            disabled={isSubmitting}
          />
          <p className="text-xs text-gray-dark dark:text-gray-light mt-1">
            Enter the tax percentage to add to the subscription price (optional)
          </p>
        </div>

        {/* Subscription Start Date */}
        <div>
          <label htmlFor="start-date" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Subscription Start Date
          </label>
          <DatePicker
            id="start-date"
            value={startDate}
            onChange={setStartDate}
            minDate={getTodayString()}
          />
          <p className="text-xs text-gray-dark dark:text-gray-light mt-1">
            When should the subscription start? The first payment will be charged on this date.
          </p>
        </div>

        {/* Subscription Summary */}
        <div className="border-t border-gray-light dark:border-davyGray pt-4">
          <h3 className="font-bold text-secondary dark:text-alabaster mb-4">
            Subscription Summary
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-dark dark:text-gray-light">Subtotal:</span>
              <span className="text-secondary dark:text-alabaster">{formatPrice(baseAmount)}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-dark dark:text-gray-light">Tax ({taxPercentage}%):</span>
                <span className="text-secondary dark:text-alabaster">{formatPrice(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-dark dark:text-gray-light">Invoice total (client pays):</span>
              <span className="text-secondary dark:text-alabaster">{formatPrice(invoiceTotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-dark dark:text-gray-light flex items-center gap-1">
                Processing fees
                <InformationCircleIcon className="w-4 h-4 text-red-500" />
              </span>
              <span className="text-red-600 dark:text-red-400">-{formatPrice(processingFee)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-light dark:border-davyGray">
              <span className="font-medium text-green-600 dark:text-green-400">Net income per month:</span>
              <span className="font-medium text-green-600 dark:text-green-400">{formatPrice(netIncome)}</span>
            </div>
          </div>

          {/* Payment Schedule */}
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-gray-dark dark:text-gray-light">
              <ClockIcon className="w-4 h-4" />
              <span>First payment: {firstPaymentDate}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-dark dark:text-gray-light">
              <ArrowPathIcon className="w-4 h-4" />
              <span>Recurring: {recurringInterval}</span>
            </div>
          </div>

          {/* Processing Fee Breakdown */}
          <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <LightBulbIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                  Processing Fee Breakdown:
                </div>
                <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                  <li>Stripe charges 2.9% + $0.30 per transaction</li>
                  <li>Fee is deducted from the total amount charged</li>
                  <li>Client pays the invoice total, you receive the net amount</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
            Notes (Optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about this subscription..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg bg-white dark:bg-night text-secondary dark:text-alabaster resize-none"
            disabled={isSubmitting}
          />
        </div>

        {/* Action Buttons */}
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
            disabled={isSubmitting || !selectedPlanId}
            className="flex-1"
          >
            {isSubmitting ? "Creating..." : "Create Subscription"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

