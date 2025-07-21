import React from "react";
import Modal from "~/components/ui/Modal";

export interface FormResponse {
  id: string;
  question_id: string;
  response_text?: string;
  response_number?: number;
  response_options?: any;
  question?: {
    question_text: string;
    question_type: string;
  };
}

export interface CompletedFormInstance {
  id: string;
  form_id: string;
  client_id: string;
  coach_id: string;
  sent_at: string;
  completed_at: string;
  status: 'completed' | 'expired' | 'sent';
  expires_at?: string;
  form?: {
    title: string;
    description?: string;
  };
  responses?: FormResponse[];
  client?: {
    name: string;
  };
}

interface CheckInFormResponseViewerProps {
  isOpen: boolean;
  onClose: () => void;
  formInstance: CompletedFormInstance;
}

export default function CheckInFormResponseViewer({
  isOpen,
  onClose,
  formInstance,
}: CheckInFormResponseViewerProps) {
  const formatResponse = (response: FormResponse) => {
    if (response.response_text) {
      return response.response_text;
    }
    if (response.response_number !== undefined && response.response_number !== null) {
      return response.response_number.toString();
    }
    if (response.response_options) {
      if (Array.isArray(response.response_options)) {
        return response.response_options.join(', ');
      }
      return JSON.stringify(response.response_options);
    }
    return 'No response';
  };



  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Form Response: ${formInstance.form?.title || 'Check-In Form'}`}
      size="lg"
    >
      <div className="space-y-6">
        {/* Form Info */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Client:</span>
              <span className="ml-2 text-gray-900 dark:text-gray-100">
                {formInstance.client?.name || 'Unknown'}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Sent:</span>
              <span className="ml-2 text-gray-900 dark:text-gray-100">
                {new Date(formInstance.sent_at).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Completed:</span>
              <span className="ml-2 text-gray-900 dark:text-gray-100">
                {new Date(formInstance.completed_at).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>
              <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                Completed
              </span>
            </div>
          </div>
        </div>

        {/* Form Description */}
        {formInstance.form?.description && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-blue-700 dark:text-blue-300 text-sm">
              {formInstance.form.description}
            </p>
          </div>
        )}

        {/* Responses */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Client Responses
          </h3>
          
          {formInstance.responses && formInstance.responses.length > 0 ? (
            <div className="space-y-4">
              {formInstance.responses
                .sort((a, b) => (a.question?.question_text || '').localeCompare(b.question?.question_text || ''))
                .map((response, index) => (
                  <div key={response.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">
                        {index + 1}. {response.question?.question_text}
                      </h4>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
                      <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                        {formatResponse(response)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>No responses found for this form.</p>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
} 