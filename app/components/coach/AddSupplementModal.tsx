import { Dialog } from "@headlessui/react";
import { useState, useEffect } from "react";
import Button from "~/components/ui/Button";

interface AddSupplementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (supplement: {
    name: string;
    dosage: string;
    frequency: string;
    instructions?: string;
    active_from?: string;
  }) => void;
  editingSupplement?: {
    name: string;
    dosage: string;
    frequency: string;
    instructions?: string;
    active_from?: string;
  } | null;
  isLoading?: boolean;
}

export default function AddSupplementModal({
  isOpen,
  onClose,
  onAdd,
  editingSupplement,
  isLoading = false,
}: AddSupplementModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    dosage: "",
    frequency: "",
    instructions: "",
    active_from: "",
  });

  // Update form data when editing a supplement
  useEffect(() => {
    if (editingSupplement) {
      setFormData({
        name: editingSupplement.name,
        dosage: editingSupplement.dosage,
        frequency: editingSupplement.frequency,
        instructions: editingSupplement.instructions || "",
        active_from: editingSupplement.active_from || "",
      });
    } else {
      setFormData({
        name: "",
        dosage: "",
        frequency: "",
        instructions: "",
        active_from: "",
      });
    }
  }, [editingSupplement]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoading) {
      onAdd(formData);
      setFormData({
        name: "",
        dosage: "",
        frequency: "",
        instructions: "",
        active_from: "",
      });
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      className="fixed inset-0 z-10 overflow-y-auto"
    >
      {/* Enhanced backdrop overlay */}
      <div className="fixed inset-0 bg-black/50 transition-opacity" />
      
      <div className="flex min-h-screen items-center justify-center p-4 relative z-20">
        <Dialog.Panel className="relative mx-auto max-w-md rounded-xl bg-white dark:bg-night p-6 w-full shadow-xl">
          <div className="relative">
          <Dialog.Title className="text-xl font-semibold text-secondary dark:text-alabaster mb-4">
            {editingSupplement ? "Edit Supplement" : "Add New Supplement"}
          </Dialog.Title>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Name
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                placeholder="e.g., Powder Multivitamin"
                required
              />
            </div>

            <div>
              <label
                htmlFor="dosage"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Dosage
              </label>
              <input
                type="text"
                id="dosage"
                value={formData.dosage}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, dosage: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                placeholder="e.g., 1 scoop"
                required
              />
            </div>

            <div>
              <label
                htmlFor="frequency"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Frequency
              </label>
              <input
                type="text"
                id="frequency"
                value={formData.frequency}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    frequency: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                placeholder="e.g., Once daily"
                required
              />
            </div>

            <div>
              <label
                htmlFor="instructions"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Instructions (optional)
              </label>
              <textarea
                id="instructions"
                value={formData.instructions}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    instructions: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                placeholder="e.g., Mix 1 scoop with water or juice in the morning"
                rows={3}
              />
            </div>

            <div>
              <label
                htmlFor="active_from"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Start Date (optional)
              </label>
              <input
                type="date"
                id="active_from"
                value={formData.active_from}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    active_from: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                placeholder="When should compliance tracking start?"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Leave empty to start tracking from today. Set a future date to delay compliance tracking.
              </p>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={isLoading}>
                {isLoading ? "Saving..." : (editingSupplement ? "Save Changes" : "Add Supplement")}
              </Button>
            </div>
            {isLoading && (
              <div className="absolute inset-0 bg-white/80 dark:bg-night/80 flex items-center justify-center rounded-xl">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-secondary dark:text-alabaster">Saving supplement...</p>
                </div>
              </div>
            )}
          </form>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
