import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import { useToast } from "~/context/ToastContext";
import type { FormQuestion, FormTemplate } from "./CreateCheckInFormModal";

interface CoachFormSummary {
  id: string;
  title: string;
  description?: string | null;
  created_at: string;
  question_count: number;
}

interface CoachFormDetail extends CoachFormSummary {
  questions: Array<{
    id: number;
    question_text: string;
    question_type: string;
    is_required: boolean;
    options: string[];
    order_index: number;
  }>;
}

interface ViewCheckInFormsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit: (form: FormTemplate) => void;
  refreshToken?: number;
  onDeleteSuccess?: () => void;
}

export default function ViewCheckInFormsModal({
  isOpen,
  onClose,
  onEdit,
  refreshToken = 0,
  onDeleteSuccess,
}: ViewCheckInFormsModalProps) {
  const toast = useToast();
  const [forms, setForms] = useState<CoachFormSummary[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [formsError, setFormsError] = useState<string | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [selectedForm, setSelectedForm] = useState<CoachFormDetail | null>(null);
  const [loadingFormDetail, setLoadingFormDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchForms();
    } else {
      setSelectedFormId(null);
      setSelectedForm(null);
      setShowDeleteConfirmation(false);
      setDeleteError(null);
    }
  }, [isOpen, refreshToken]);

  const fetchForms = async () => {
    setLoadingForms(true);
    setFormsError(null);
    try {
      const response = await fetch("/api/get-check-in-forms");
      if (!response.ok) {
        throw new Error("Failed to load forms");
      }
      const data = await response.json();
      setForms(Array.isArray(data.forms) ? data.forms : []);
    } catch (error) {
      console.error("Error loading forms:", error);
      setFormsError(
        error instanceof Error ? error.message : "Unable to load forms right now."
      );
    } finally {
      setLoadingForms(false);
    }
  };

  const fetchFormDetail = async (formId: string) => {
    setLoadingFormDetail(true);
    setDetailError(null);
    try {
      const response = await fetch(`/api/get-check-in-form/${formId}`);
      if (!response.ok) {
        throw new Error("Failed to load form details");
      }
      const data = await response.json();
      setSelectedForm(data.form);
    } catch (error) {
      console.error("Error loading form detail:", error);
      const message =
        error instanceof Error ? error.message : "Unable to load this form.";
      setDetailError(message);
      setFormsError(message);
      setSelectedFormId(null);
      setShowDeleteConfirmation(false);
    } finally {
      setLoadingFormDetail(false);
    }
  };

  useEffect(() => {
    if (selectedFormId) {
      fetchFormDetail(selectedFormId);
    }
  }, [selectedFormId]);

  const handleSelectForm = (formId: string) => {
    setFormsError(null);
    setDetailError(null);
    setSelectedFormId(formId);
    setShowDeleteConfirmation(false);
    setDeleteError(null);
  };

  const handleBackToForms = () => {
    setSelectedForm(null);
    setSelectedFormId(null);
    setShowDeleteConfirmation(false);
    setDeleteError(null);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirmation(false);
    setDeleteError(null);
  };

  const handleDeleteForm = async () => {
    if (!selectedFormId || !selectedForm) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/delete-check-in-form/${selectedFormId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete form");
      }

      toast.success(
        "Form Deleted",
        `"${selectedForm.title}" has been removed successfully.`
      );

      setForms((prev) => prev.filter((form) => form.id !== selectedFormId));
      setSelectedForm(null);
      setSelectedFormId(null);
      setShowDeleteConfirmation(false);
      onDeleteSuccess?.();
    } catch (error) {
      console.error("Error deleting form:", error);
      const message =
        error instanceof Error ? error.message : "Unable to delete this form.";
      setDeleteError(message);
      toast.error("Failed to Delete Form", message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = () => {
    if (!selectedForm) return;
    const template: FormTemplate = {
      id: selectedForm.id,
      title: selectedForm.title,
      description: selectedForm.description || "",
      questions: selectedForm.questions
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .map((question) => ({
          id: `${question.id}`,
          question_text: question.question_text,
          question_type: (question.question_type || "text") as FormQuestion["question_type"],
          is_required: question.is_required,
          options: question.options || [],
          order_index: question.order_index,
          persistedId: question.id,
        })),
    };
    onEdit(template);
  };

  const formattedForms = useMemo(() => {
    return forms.map((form) => ({
      ...form,
      createdLabel: dayjs(form.created_at).format("MMM D, YYYY"),
    }));
  }, [forms]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={selectedForm ? "Form Details" : "Form Manager"}
      size="xl"
    >
      <div className="space-y-6">
        {!selectedForm && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-secondary dark:text-alabaster">
                Your Created Forms
              </h3>
              <Button variant="outline" size="sm" onClick={fetchForms} disabled={loadingForms}>
                {loadingForms ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            {formsError && (
              <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                {formsError}
              </div>
            )}
            {loadingForms ? (
              <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : formattedForms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-light dark:border-davyGray px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                <p className="text-base font-medium">No forms created yet.</p>
                <p className="mt-2 text-sm">
                  Create a form to save templates you can send to clients.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 max-h-[28rem] overflow-y-auto pr-1">
                {formattedForms.map((form) => (
                  <button
                    key={form.id}
                    onClick={() => handleSelectForm(form.id)}
                    className="rounded-lg border border-gray-light dark:border-davyGray bg-white dark:bg-night px-4 py-4 text-left shadow-sm transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-secondary dark:text-alabaster">
                        {form.title}
                      </h4>
                      <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {form.createdLabel}
                      </span>
                    </div>
                    {form.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                        {form.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 font-medium text-primary">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h6.586A2 2 0 0012 16.414l4.707-4.707a1 1 0 000-1.414L12 5.586A2 2 0 0010.586 5H4zm9 5a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1V9a1 1 0 011-1z" />
                        </svg>
                        {form.question_count} {form.question_count === 1 ? "Question" : "Questions"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedForm && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-secondary dark:text-alabaster">
                  {selectedForm.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Created {dayjs(selectedForm.created_at).format("MMMM D, YYYY")}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setSelectedForm(null)}>
                ← Back to Forms
              </Button>
            </div>

            {detailError && (
              <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                {detailError}
              </div>
            )}

            {loadingFormDetail ? (
              <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <>
                {selectedForm.description && (
                  <p className="rounded-lg border border-gray-light dark:border-davyGray bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {selectedForm.description}
                  </p>
                )}

                <div className="space-y-4">
                  {selectedForm.questions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-light dark:border-davyGray px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                      <p>No questions added to this form yet.</p>
                    </div>
                  ) : (
                    <ol className="space-y-4">
                      {selectedForm.questions
                        .slice()
                        .sort((a, b) => a.order_index - b.order_index)
                        .map((question, index) => (
                          <li
                            key={question.id}
                            className="rounded-lg border border-gray-light dark:border-davyGray bg-white dark:bg-night px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-medium text-secondary dark:text-alabaster">
                                  {index + 1}. {question.question_text}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-blue-600 dark:text-blue-200">
                                    {question.question_type}
                                  </span>
                                  {question.is_required && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/30 px-2 py-1 text-red-600 dark:text-red-200">
                                      Required
                                    </span>
                                  )}
                                </div>
                                {question.options && question.options.length > 0 && (
                                  <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                    {question.options.map((option, optionIndex) => (
                                      <li key={`${question.id}-option-${optionIndex}`} className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                                        {option}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                    </ol>
                  )}
                </div>

                <div className="space-y-4 border-t border-gray-light dark:border-davyGray pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-3">
                      <Button variant="secondary" onClick={handleBackToForms}>
                        Back
                      </Button>
                      <Button variant="primary" onClick={handleEdit}>
                        Edit Form
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDeleteConfirmation((prev) => !prev);
                        setDeleteError(null);
                      }}
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-900/20"
                    >
                      {showDeleteConfirmation ? "Cancel Delete" : "Delete Form"}
                    </Button>
                  </div>

                  {showDeleteConfirmation && (
                    <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50/60 dark:bg-red-900/10 px-4 py-4">
                      <p className="text-sm text-red-700 dark:text-red-200">
                        Deleting this form will archive the template so it can&apos;t be sent again.
                        Past submissions stay in client history, but the template cannot be recovered.
                      </p>
                      {deleteError && (
                        <div className="mt-3 rounded-md border border-red-400 bg-red-100/60 px-3 py-2 text-sm text-red-700 dark:border-red-600 dark:bg-red-900/30 dark:text-red-100">
                          {deleteError}
                        </div>
                      )}
                      <div className="mt-4 flex justify-end gap-3">
                        <Button
                          variant="secondary"
                          onClick={handleCancelDelete}
                          disabled={isDeleting}
                        >
                          Keep Form
                        </Button>
                        <Button
                          variant="outline"
                          disabled={isDeleting}
                          onClick={handleDeleteForm}
                          className="border-red-500 text-red-600 hover:bg-red-600 hover:text-white dark:border-red-400 dark:text-red-100 dark:hover:bg-red-700"
                        >
                          {isDeleting ? "Deleting..." : "Delete Form"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

