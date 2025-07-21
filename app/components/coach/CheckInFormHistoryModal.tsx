import React, { useState, useEffect } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import CheckInFormResponseViewer, { CompletedFormInstance } from "./CheckInFormResponseViewer";

interface CheckInFormHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
}

export default function CheckInFormHistoryModal({
  isOpen,
  onClose,
  clientId,
  clientName,
}: CheckInFormHistoryModalProps) {
  const [forms, setForms] = useState<CompletedFormInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedForm, setSelectedForm] = useState<CompletedFormInstance | null>(null);
  const [showFormViewer, setShowFormViewer] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'expired'>('all');

  const fetchForms = async (pageNum: number = 1, append: boolean = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/get-completed-check-in-forms?clientId=${clientId}&page=${pageNum}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        if (append) {
          setForms(prev => [...prev, ...data.forms]);
        } else {
          setForms(data.forms);
        }
        setHasMore(data.forms.length === 10);
        setPage(pageNum);
      }
    } catch (error) {
      console.error('Error fetching form history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setForms([]);
      setPage(1);
      setHasMore(true);
      setSearchTerm("");
      setFilterStatus('all');
      fetchForms(1, false);
    }
  }, [isOpen, clientId]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchForms(page + 1, true);
    }
  };

  const handleViewForm = (form: CompletedFormInstance) => {
    setSelectedForm(form);
    setShowFormViewer(true);
  };

  const filteredForms = forms.filter(form => {
    const matchesSearch = form.form?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         form.form?.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'completed' && form.status === 'completed') ||
                         (filterStatus === 'expired' && form.status === 'expired');
    
    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400';
      case 'expired':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Check-In Form History - ${clientName}`}
        size="xl"
      >
        <div className="space-y-6">
          {/* Search and Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search forms by title or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'completed' | 'expired')}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="all">All Forms</option>
                <option value="completed">Completed</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>

          {/* Forms List */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredForms.length > 0 ? (
              filteredForms.map((form) => (
                <div
                  key={form.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">
                          {form.form?.title || 'Untitled Form'}
                        </h4>
                        <span className={`text-sm font-medium ${getStatusColor(form.status)}`}>
                          {form.status}
                        </span>
                      </div>
                      
                      {form.form?.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {form.form.description}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>Sent: {formatDate(form.sent_at)}</span>
                        {form.completed_at && (
                          <span>Completed: {formatDate(form.completed_at)}</span>
                        )}
                        {form.expires_at && (
                          <span>Expires: {formatDate(form.expires_at)}</span>
                        )}
                        <span>{form.responses?.length || 0} responses</span>
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => handleViewForm(form)}
                      variant="outline"
                      size="sm"
                      className="ml-4"
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-2">Loading...</span>
                  </div>
                ) : (
                  <div>
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>No forms found</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Load More Button */}
          {hasMore && filteredForms.length > 0 && (
            <div className="text-center">
              <Button
                onClick={handleLoadMore}
                variant="outline"
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button onClick={onClose} variant="secondary">
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Form Response Viewer Modal */}
      {selectedForm && (
        <CheckInFormResponseViewer
          isOpen={showFormViewer}
          onClose={() => {
            setShowFormViewer(false);
            setSelectedForm(null);
          }}
          formInstance={selectedForm}
        />
      )}
    </>
  );
} 