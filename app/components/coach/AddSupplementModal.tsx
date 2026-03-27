import { Dialog } from "@headlessui/react";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import Button from "~/components/ui/Button";
import type { CoachDraftEnvelope, SupplementDraftPayload } from "~/utils/coachDraftStorage";
import {
  clearSupplementDraft,
  flushSupplementDraft,
  loadSupplementDraftEnvelope,
  saveSupplementDraftDebounced,
  saveSupplementDraftSync,
} from "~/utils/coachDraftStorage";

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
  draftClientId?: string | null;
  /** `null` when adding a new supplement (draft key uses "new"). */
  draftSupplementId?: string | null;
}

function formFromEditing(
  editing: AddSupplementModalProps["editingSupplement"]
) {
  if (editing) {
    return {
      name: editing.name,
      dosage: editing.dosage,
      frequency: editing.frequency,
      instructions: editing.instructions || "",
      active_from: editing.active_from || "",
    };
  }
  return {
    name: "",
    dosage: "",
    frequency: "",
    instructions: "",
    active_from: "",
  };
}

export default function AddSupplementModal({
  isOpen,
  onClose,
  onAdd,
  editingSupplement,
  isLoading = false,
  draftClientId = null,
  draftSupplementId = null,
}: AddSupplementModalProps) {
  const [formData, setFormData] = useState(() => formFromEditing(editingSupplement));
  const prevOpenRef = useRef(false);
  const [draftReady, setDraftReady] = useState(!draftClientId);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [pendingDraftEnvelope, setPendingDraftEnvelope] =
    useState<CoachDraftEnvelope<SupplementDraftPayload> | null>(null);
  const draftReadyRef = useRef(!draftClientId);
  const showDraftPromptRef = useRef(false);
  const supplementBaselineRef = useRef("");
  const supplementNeedsBaselineCommitRef = useRef(false);
  const editingRef = useRef(editingSupplement);
  editingRef.current = editingSupplement;

  useEffect(() => {
    draftReadyRef.current = draftReady;
  }, [draftReady]);

  useEffect(() => {
    showDraftPromptRef.current = showDraftPrompt;
  }, [showDraftPrompt]);

  useEffect(() => {
    setFormData(formFromEditing(editingSupplement));
  }, [editingSupplement]);

  const payloadFromForm = (): SupplementDraftPayload => ({
    name: formData.name,
    dosage: formData.dosage,
    frequency: formData.frequency,
    instructions: formData.instructions,
    active_from: formData.active_from,
  });

  const commitSupplementBaseline = () => {
    supplementBaselineRef.current = JSON.stringify(payloadFromForm());
  };

  useLayoutEffect(() => {
    if (!supplementNeedsBaselineCommitRef.current || !isOpen) return;
    commitSupplementBaseline();
    supplementNeedsBaselineCommitRef.current = false;
  });

  useEffect(() => {
    if (!isOpen) {
      const cid = draftClientId;
      const sid = draftSupplementId;
      if (cid) {
        flushSupplementDraft(cid, sid);
        if (draftReadyRef.current && !showDraftPromptRef.current) {
          saveSupplementDraftSync(cid, sid, payloadFromForm());
        }
      }
      setShowDraftPrompt(false);
      setPendingDraftEnvelope(null);
      setDraftReady(!draftClientId);
      prevOpenRef.current = false;
      return;
    }

    if (!prevOpenRef.current) {
      if (draftClientId) {
        setDraftReady(false);
        const env = loadSupplementDraftEnvelope(draftClientId, draftSupplementId);
        if (env) {
          setPendingDraftEnvelope(env);
          setShowDraftPrompt(true);
        } else {
          setShowDraftPrompt(false);
          setPendingDraftEnvelope(null);
          setDraftReady(true);
          supplementNeedsBaselineCommitRef.current = true;
        }
        prevOpenRef.current = true;
      } else {
        setDraftReady(true);
        setShowDraftPrompt(false);
        setPendingDraftEnvelope(null);
        supplementNeedsBaselineCommitRef.current = true;
        prevOpenRef.current = true;
      }
    }
  }, [isOpen, draftClientId, draftSupplementId]);

  useEffect(() => {
    if (
      !isOpen ||
      !draftClientId ||
      !draftReady ||
      showDraftPrompt ||
      isLoading
    ) {
      return;
    }
    saveSupplementDraftDebounced(
      draftClientId,
      draftSupplementId,
      payloadFromForm()
    );
  }, [
    isOpen,
    draftClientId,
    draftSupplementId,
    draftReady,
    showDraftPrompt,
    isLoading,
    formData,
  ]);

  const isDirty =
    !!draftClientId &&
    draftReady &&
    JSON.stringify(payloadFromForm()) !== supplementBaselineRef.current;

  useEffect(() => {
    if (!draftClientId) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLoading) return;
      if (showDraftPrompt || isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draftClientId, isLoading, showDraftPrompt, isDirty]);

  const handleRestoreDraft = () => {
    if (!pendingDraftEnvelope) return;
    const p = pendingDraftEnvelope.payload;
    const next = {
      name: p.name,
      dosage: p.dosage,
      frequency: p.frequency,
      instructions: p.instructions || "",
      active_from: p.active_from || "",
    };
    setFormData(next);
    setShowDraftPrompt(false);
    setPendingDraftEnvelope(null);
    setDraftReady(true);
    supplementNeedsBaselineCommitRef.current = true;
  };

  const handleStartFreshDraft = () => {
    if (!draftClientId) return;
    clearSupplementDraft(draftClientId, draftSupplementId);
    const fresh = formFromEditing(editingRef.current);
    setFormData(fresh);
    setShowDraftPrompt(false);
    setPendingDraftEnvelope(null);
    setDraftReady(true);
    supplementNeedsBaselineCommitRef.current = true;
  };

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
            {showDraftPrompt && pendingDraftEnvelope && (
              <div
                className="rounded-lg border border-amber-200 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-3 flex flex-col gap-2"
                role="status"
              >
                <p className="text-sm text-secondary dark:text-alabaster">
                  You have an unsaved local draft
                  {pendingDraftEnvelope.updatedAt
                    ? ` from ${new Date(pendingDraftEnvelope.updatedAt).toLocaleString()}`
                    : ""}
                  .
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={handleRestoreDraft}>
                    Restore draft
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleStartFreshDraft}
                  >
                    Start fresh
                  </Button>
                </div>
              </div>
            )}
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
