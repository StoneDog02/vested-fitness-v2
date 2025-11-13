import React, { useEffect, useState } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

export interface FormQuestion {
  id: string;
  question_text: string;
  question_type: "text" | "textarea" | "number" | "select" | "radio" | "checkbox";
  is_required: boolean;
  options?: string[];
  order_index: number;
  persistedId?: number;
}

export interface FormTemplate {
  id?: string;
  title: string;
  description: string;
  questions: FormQuestion[];
}

interface CreateCheckInFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: FormTemplate) => Promise<void> | void;
  initialForm?: FormTemplate | null;
  mode?: "create" | "edit";
}

export default function CreateCheckInFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialForm = null,
  mode = "create",
}: CreateCheckInFormModalProps) {
  const [title, setTitle] = useState(initialForm?.title ?? "");
  const [description, setDescription] = useState(initialForm?.description ?? "");
  const [questions, setQuestions] = useState<FormQuestion[]>(initialForm?.questions ?? []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialForm?.title ?? "");
      setDescription(initialForm?.description ?? "");
      setQuestions(initialForm?.questions ?? []);
    } else if (mode === "create") {
      // Reset state when closing in create mode
      setTitle("");
      setDescription("");
      setQuestions([]);
    }
  }, [isOpen, initialForm, mode]);

  const addQuestion = () => {
    const newQuestion: FormQuestion = {
      id: `temp-${Date.now()}`,
      question_text: "",
      question_type: 'text',
      is_required: false,
      options: [],
      order_index: questions.length,
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (index: number, field: keyof FormQuestion, value: string | boolean) => {
    const updatedQuestions = [...questions];
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value };
    setQuestions(updatedQuestions);
  };

  const removeQuestion = (index: number) => {
    const updatedQuestions = questions.filter((_, i) => i !== index);
    // Reorder the remaining questions
    const reorderedQuestions = updatedQuestions.map((q, i) => ({
      ...q,
      order_index: i,
    }));
    setQuestions(reorderedQuestions);
  };

  const addOption = (questionIndex: number) => {
    const updatedQuestions = [...questions];
    const currentOptions = updatedQuestions[questionIndex].options || [];
    updatedQuestions[questionIndex] = {
      ...updatedQuestions[questionIndex],
      options: [...currentOptions, ""],
    };
    setQuestions(updatedQuestions);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updatedQuestions = [...questions];
    const currentOptions = [...(updatedQuestions[questionIndex].options || [])];
    currentOptions[optionIndex] = value;
    updatedQuestions[questionIndex] = {
      ...updatedQuestions[questionIndex],
      options: currentOptions,
    };
    setQuestions(updatedQuestions);
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const updatedQuestions = [...questions];
    const currentOptions = [...(updatedQuestions[questionIndex].options || [])];
    currentOptions.splice(optionIndex, 1);
    updatedQuestions[questionIndex] = {
      ...updatedQuestions[questionIndex],
      options: currentOptions,
    };
    setQuestions(updatedQuestions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        id: initialForm?.id,
        title: title.trim(),
        description: description.trim(),
        questions: questions
          .filter((q) => q.question_text.trim())
          .map((q, index) => ({
            ...q,
            order_index: index,
          })),
      });
      if (mode === "create") {
        setTitle("");
        setDescription("");
        setQuestions([]);
      }
      onClose();
    } catch (error) {
      console.error('Error creating form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const questionTypes = [
    { value: 'text', label: 'Short Text' },
    { value: 'textarea', label: 'Long Text' },
    { value: 'number', label: 'Number' },
    { value: 'select', label: 'Dropdown' },
    { value: 'radio', label: 'Single Choice' },
    { value: 'checkbox', label: 'Multiple Choice' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "edit" ? "Edit Check-In Form" : "Create Check-In Form"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Form Details */}
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
              Form Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
              placeholder="e.g., Weekly Progress Check-In"
              required
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
              className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
              placeholder="Optional description of what this form is for..."
            />
          </div>
        </div>

        {/* Questions Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-secondary dark:text-alabaster">
              Questions
            </h3>
            <Button
              type="button"
              variant="secondary"
              onClick={addQuestion}
              className="text-sm"
            >
              + Add Question
            </Button>
          </div>

          {questions.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No questions added yet. Click &quot;Add Question&quot; to get started.</p>
            </div>
          )}

          {questions.map((question, index) => (
            <div key={question.id} className="border border-gray-light dark:border-davyGray rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-secondary dark:text-alabaster">
                  Question {index + 1}
                </h4>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => removeQuestion(index)}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Remove
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`question-text-${index}`} className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
                    Question Text *
                  </label>
                  <input
                    id={`question-text-${index}`}
                    type="text"
                    value={question.question_text}
                    onChange={(e) => updateQuestion(index, 'question_text', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                    placeholder="Enter your question..."
                    required
                  />
                </div>

                <div>
                  <label htmlFor={`question-type-${index}`} className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
                    Question Type
                  </label>
                  <select
                    id={`question-type-${index}`}
                    value={question.question_type}
                    onChange={(e) => updateQuestion(index, 'question_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                  >
                    {questionTypes.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id={`required-${index}`}
                  type="checkbox"
                  checked={question.is_required}
                  onChange={(e) => updateQuestion(index, 'is_required', e.target.checked)}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-light dark:border-davyGray rounded"
                />
                <label htmlFor={`required-${index}`} className="ml-2 text-sm text-secondary dark:text-alabaster">
                  Required question
                </label>
              </div>

              {/* Options for select, radio, checkbox */}
              {['select', 'radio', 'checkbox'].includes(question.question_type) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="block text-sm font-medium text-secondary dark:text-alabaster">
                      Options
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => addOption(index)}
                      className="text-sm"
                    >
                      + Add Option
                    </Button>
                  </div>

                  {(question.options || []).map((option, optionIndex) => (
                    <div key={optionIndex} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
                        placeholder={`Option ${optionIndex + 1}`}
                        required
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => removeOption(index, optionIndex)}
                        className="text-red-600 hover:text-red-700"
                      >
                        ×
                      </Button>
                    </div>
                  ))}

                  {(question.options || []).length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Add at least one option for this question type.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-light dark:border-davyGray">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!title.trim() || isSubmitting}
          >
            {isSubmitting
              ? mode === "edit"
                ? "Saving..."
                : "Creating..."
              : mode === "edit"
              ? "Save Changes"
              : "Create Form"}
          </Button>
        </div>
      </form>
    </Modal>
  );
} 