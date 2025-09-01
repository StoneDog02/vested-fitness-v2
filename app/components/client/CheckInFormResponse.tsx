import React, { useState } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";

export interface FormQuestion {
  id: string;
  question_text: string;
  question_type: 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox';
  is_required: boolean;
  options?: string[];
  order_index: number;
}

export interface FormInstance {
  id: string;
  form_id: string;
  client_id: string;
  coach_id: string;
  sent_at: string;
  completed_at?: string;
  status: 'sent' | 'completed' | 'expired';
  expires_at?: string;
  form?: {
    title: string;
    description?: string;
  };
  questions?: FormQuestion[];
}

interface CheckInFormResponseProps {
  isOpen: boolean;
  onClose: () => void;
  formInstance: FormInstance;
  onSubmit: (responses: Record<string, any>) => void;
}

export default function CheckInFormResponse({
  isOpen,
  onClose,
  formInstance,
  onSubmit,
}: CheckInFormResponseProps) {
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleResponseChange = (questionId: string, value: any) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value,
    }));
    
    // Clear error when user starts typing
    if (errors[questionId]) {
      setErrors(prev => ({
        ...prev,
        [questionId]: '',
      }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    formInstance.questions?.forEach(question => {
      if (question.is_required) {
        const response = responses[question.id];
        if (!response || 
            (typeof response === 'string' && !response.trim()) ||
            (Array.isArray(response) && response.length === 0)) {
          newErrors[question.id] = 'This question is required';
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSubmit(responses);
      setResponses({});
      setErrors({});
      onClose();
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = (question: FormQuestion) => {
    const value = responses[question.id];
    const error = errors[question.id];

    switch (question.question_type) {
      case 'text':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleResponseChange(question.id, e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster ${
              error ? 'border-red-500' : 'border-gray-light dark:border-davyGray'
            }`}
            placeholder="Enter your answer..."
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => handleResponseChange(question.id, e.target.value)}
            rows={4}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster ${
              error ? 'border-red-500' : 'border-gray-light dark:border-davyGray'
            }`}
            placeholder="Enter your answer..."
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={value || ''}
            onChange={(e) => handleResponseChange(question.id, e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster ${
              error ? 'border-red-500' : 'border-gray-light dark:border-davyGray'
            }`}
            placeholder="Enter a number..."
          />
        );

      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => handleResponseChange(question.id, e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster ${
              error ? 'border-red-500' : 'border-gray-light dark:border-davyGray'
            }`}
          >
            <option value="">Select an option...</option>
            {question.options?.map((option, index) => (
              <option key={index} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {question.options?.map((option, index) => (
              <label key={index} className="flex items-center space-x-2">
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={value === option}
                  onChange={(e) => handleResponseChange(question.id, e.target.value)}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-light dark:border-davyGray"
                />
                <span className="text-secondary dark:text-alabaster">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {question.options?.map((option, index) => (
              <label key={index} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  value={option}
                  checked={Array.isArray(value) && value.includes(option)}
                  onChange={(e) => {
                    const currentValues = Array.isArray(value) ? value : [];
                    const newValues = e.target.checked
                      ? [...currentValues, option]
                      : currentValues.filter(v => v !== option);
                    handleResponseChange(question.id, newValues);
                  }}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-light dark:border-davyGray rounded"
                />
                <span className="text-secondary dark:text-alabaster">{option}</span>
              </label>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  const isExpired = formInstance.expires_at && new Date(formInstance.expires_at) < new Date();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={formInstance.form?.title || "Check-In Form"}
      size="lg"
    >
      {isExpired ? (
        <div className="text-center py-8">
          <div className="text-red-600 dark:text-red-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-secondary dark:text-alabaster mb-2">
            Form Expired
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            This check-in form has expired and can no longer be completed.
          </p>
          <div className="mt-6">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {formInstance.form?.description && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-blue-700 dark:text-blue-300 text-sm">
                {formInstance.form.description}
              </p>
            </div>
          )}

          <div className="space-y-6">
            {formInstance.questions?.map((question, index) => {
              return (
                <div key={question.id} className="space-y-2">
                  <label className="block text-sm font-medium text-secondary dark:text-alabaster">
                    {index + 1}. {question.question_text}
                    {question.is_required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>
                  
                  {renderQuestion(question)}
                  
                  {errors[question.id] && (
                    <p className="text-red-500 text-sm">{errors[question.id]}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-light dark:border-davyGray">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Responses'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
} 