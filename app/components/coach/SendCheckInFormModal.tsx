import React, { useState, useEffect } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

interface CheckInForm {
  id: string;
  title: string;
  description?: string;
  created_at: string;
}

interface SendCheckInFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  onSubmit: (formId: string, expiresInDays: number) => void;
}

export default function SendCheckInFormModal({
  isOpen,
  onClose,
  clientName,
  onSubmit,
}: SendCheckInFormModalProps) {
  const [forms, setForms] = useState<CheckInForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchForms();
    }
  }, [isOpen]);

  const fetchForms = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/get-check-in-forms');
      if (response.ok) {
        const data = await response.json();
        setForms(data.forms || []);
      }
    } catch (error) {
      console.error('Error fetching forms:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFormId) return;

    setIsSubmitting(true);
    try {
      await onSubmit(selectedFormId, expiresInDays);
      setSelectedFormId("");
      setExpiresInDays(7);
      onClose();
    } catch (error) {
      console.error('Error sending form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Send Check-In Form to ${clientName}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="form-select" className="block text-sm font-medium text-secondary dark:text-alabaster mb-2">
            Select Form
          </label>
          {isLoading ? (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              Loading forms...
            </div>
          ) : forms.length === 0 ? (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              <p>No forms available.</p>
              <p className="text-sm mt-1">Create a form first to send to your client.</p>
            </div>
          ) : (
            <select
              id="form-select"
              value={selectedFormId}
              onChange={(e) => setSelectedFormId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
              required
            >
              <option value="">Choose a form...</option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedFormId && (
          <div>
            <label htmlFor="expires-select" className="block text-sm font-medium text-secondary dark:text-alabaster mb-2">
              Expires In
            </label>
            <select
              id="expires-select"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>1 week</option>
              <option value={14}>2 weeks</option>
              <option value={30}>1 month</option>
            </select>
          </div>
        )}

        {selectedFormId && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-300 text-sm">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span>
                This will send the form to {clientName} and create an automatic form sent update.
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-light dark:border-davyGray">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!selectedFormId || isSubmitting}
          >
            {isSubmitting ? 'Sending...' : 'Send Form'}
          </Button>
        </div>
      </form>
    </Modal>
  );
} 