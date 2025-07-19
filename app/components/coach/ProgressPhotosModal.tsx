import React, { useState, useEffect, useRef, useCallback } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import FullScreenImageModal from "~/components/ui/FullScreenImageModal";
import DeleteConfirmationModal from "~/components/ui/DeleteConfirmationModal";
import { useFetcher } from "@remix-run/react";
import { useToast } from "~/context/ToastContext";

interface LocalToast {
  id: string;
  title: string;
  message?: string;
  type: 'success' | 'error';
}

interface ProgressPhoto {
  id: string;
  photo_url: string;
  notes?: string;
  created_at: string;
}

interface ProgressPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName?: string;
  onPhotoDeleted?: (photoId: string) => void;
}

export default function ProgressPhotosModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  onPhotoDeleted,
}: ProgressPhotosModalProps) {
  const [fullScreenPhoto, setFullScreenPhoto] = useState<ProgressPhoto | null>(null);
  const [comparisonPhotos, setComparisonPhotos] = useState<[ProgressPhoto, ProgressPhoto] | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    photoId: string | null;
    photoUrl: string | null;
  }>({
    isOpen: false,
    photoId: null,
    photoUrl: null,
  });
  
  const [localToast, setLocalToast] = useState<LocalToast | null>(null);
  
  const fetcher = useFetcher();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const toast = useToast();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Load photos when modal opens
  useEffect(() => {
    if (isOpen && isInitialLoad) {
      loadPhotos(1);
      setIsInitialLoad(false);
    }
  }, [isOpen, isInitialLoad]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPhotos([]);
      setPage(1);
      setHasMore(true);
      setIsInitialLoad(true);
      setFullScreenPhoto(null);
      setComparisonPhotos(null);
      setIsCompareMode(false);
      setSelectedPhotos(new Set());
    }
  }, [isOpen]);

  // Handle fetcher data
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const data = fetcher.data as {
        photos: ProgressPhoto[];
        page: number;
        hasMore: boolean;
      };
      
      if (data.page === 1) {
        setPhotos(data.photos);
      } else {
        setPhotos(prev => [...prev, ...data.photos]);
      }
      
      setPage(data.page);
      setHasMore(data.hasMore);
      setIsLoading(false);
    }
  }, [fetcher.data, fetcher.state]);

  // Infinite scroll observer
  const lastPhotoRef = useCallback((node: HTMLDivElement) => {
    if (isLoading) return;
    
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadPhotos(page + 1);
      }
    });
    
    if (node) observerRef.current.observe(node);
  }, [isLoading, hasMore, page]);

  const loadPhotos = (pageNum: number) => {
    setIsLoading(true);
    fetcher.load(`/api/get-progress-photos?clientId=${clientId}&page=${pageNum}&pageSize=5`);
  };

  const toggleCompareMode = () => {
    setIsCompareMode(!isCompareMode);
    setSelectedPhotos(new Set());
  };

  const togglePhotoSelection = (photoId: string) => {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      if (newSelected.size < 2) {
        newSelected.add(photoId);
      }
    }
    setSelectedPhotos(newSelected);
  };

  const startComparison = () => {
    if (selectedPhotos.size === 2) {
      const selectedPhotoArray = Array.from(selectedPhotos);
      const photo1 = photos.find(p => p.id === selectedPhotoArray[0]);
      const photo2 = photos.find(p => p.id === selectedPhotoArray[1]);
      
      if (photo1 && photo2) {
        setComparisonPhotos([photo1, photo2]);
        setIsCompareMode(false);
        setSelectedPhotos(new Set());
      }
    }
  };

  const handleDeletePhoto = (photoId: string, photoUrl: string) => {
    setDeleteConfirmation({
      isOpen: true,
      photoId,
      photoUrl,
    });
  };

  const confirmDeletePhoto = async () => {
    if (!deleteConfirmation.photoId) return;

    setIsDeleting(deleteConfirmation.photoId);
    try {
          const response = await fetch(`/api/delete-progress-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ photoId: deleteConfirmation.photoId }),
    });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete photo');
      }

      // Success toast
      setLocalToast({
        id: Date.now().toString(),
        title: "Photo Deleted Successfully",
        message: "The progress photo has been permanently removed.",
        type: 'success'
      });
      
      // Auto-remove toast after 4 seconds
      setTimeout(() => setLocalToast(null), 4000);

      onPhotoDeleted?.(deleteConfirmation.photoId);
      setPhotos(prev => prev.filter(p => p.id !== deleteConfirmation.photoId));
      if (fullScreenPhoto?.id === deleteConfirmation.photoId) {
        setFullScreenPhoto(null);
      }
    } catch (error) {
      console.error('Error deleting photo:', error);
      
      // Error toast with helpful message
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete photo';
      setLocalToast({
        id: Date.now().toString(),
        title: "Delete Failed",
        message: errorMessage === "Unauthorized" 
          ? "You don't have permission to delete this photo."
          : errorMessage === "Photo not found"
          ? "The photo could not be found. It may have already been deleted."
          : "There was an error deleting the photo. Please try again.",
        type: 'error'
      });
      
      // Auto-remove toast after 4 seconds
      setTimeout(() => setLocalToast(null), 4000);
    } finally {
      setIsDeleting(null);
      setDeleteConfirmation({ isOpen: false, photoId: null, photoUrl: null });
    }
  };

  const cancelDeletePhoto = () => {
    setDeleteConfirmation({ isOpen: false, photoId: null, photoUrl: null });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Progress Photos${clientName ? ` - ${clientName}` : ''}`}
      size="xl"
    >
      <div className="space-y-4">
        {/* Local Toast */}
        {localToast && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className="w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl pointer-events-auto">
              <div className="p-4">
                <div className="flex items-start">
                  <div className={`flex-shrink-0 ${localToast.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                    {localToast.type === 'success' ? (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {localToast.title}
                    </p>
                    {localToast.message && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {localToast.message}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex-shrink-0 flex">
                    <button
                      className="inline-flex text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-md transition-colors"
                      onClick={() => setLocalToast(null)}
                    >
                      <span className="sr-only">Close</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Compare Mode Controls */}
        {photos.length > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant={isCompareMode ? "primary" : "secondary"}
              onClick={toggleCompareMode}
              size="sm"
            >
              {isCompareMode ? "Cancel Compare" : "Compare Photos"}
            </Button>
            
            {isCompareMode && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedPhotos.size}/2 photos selected
                </span>
                <Button
                  variant="primary"
                  onClick={startComparison}
                  disabled={selectedPhotos.size !== 2}
                  size="sm"
                >
                  Compare Selected
                </Button>
              </div>
            )}
          </div>
        )}
          {photos.length === 0 && !isLoading ? (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                No progress photos yet. Take the first one to start tracking progress!
              </p>
            </div>
          ) : (
            <>
              {/* Photo Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
                {photos.map((photo: ProgressPhoto, index: number) => (
                  <div
                    key={photo.id}
                    ref={index === photos.length - 1 ? lastPhotoRef : undefined}
                    className={`relative group cursor-pointer ${
                      isCompareMode && selectedPhotos.has(photo.id) 
                        ? 'ring-2 ring-primary ring-offset-2' 
                        : ''
                    }`}
                    onClick={() => {
                      if (isCompareMode) {
                        togglePhotoSelection(photo.id);
                      } else {
                        setFullScreenPhoto(photo);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (isCompareMode) {
                          togglePhotoSelection(photo.id);
                        } else {
                          setFullScreenPhoto(photo);
                        }
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={isCompareMode ? `Select photo for comparison` : `View photo taken on ${formatDate(photo.created_at)}`}
                  >
                  <img
                    src={photo.photo_url}
                    alt=""
                    className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center">
                    {isCompareMode ? (
                      <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedPhotos.has(photo.id) 
                          ? 'bg-primary border-primary' 
                          : 'bg-white border-gray-300'
                      }`}>
                        {selectedPhotos.has(photo.id) && (
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    ) : (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePhoto(photo.id, photo.photo_url);
                      }}
                      disabled={isDeleting === photo.id}
                      className="bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      title="Delete photo"
                    >
                      {isDeleting === photo.id ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Full Screen Image Modal */}
        <FullScreenImageModal
          isOpen={!!fullScreenPhoto}
          onClose={() => setFullScreenPhoto(null)}
          imageUrl={fullScreenPhoto?.photo_url || ''}
          imageAlt="Progress photo"
          dateTaken={fullScreenPhoto?.created_at}
          notes={fullScreenPhoto?.notes}
        />

        {/* Comparison Modal */}
        <FullScreenImageModal
          isOpen={!!comparisonPhotos}
          onClose={() => setComparisonPhotos(null)}
          imageUrl=""
          imageAlt="Progress photo comparison"
          comparisonMode={true}
          comparisonPhotos={comparisonPhotos}
        />

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal
          isOpen={deleteConfirmation.isOpen}
          onClose={cancelDeletePhoto}
          onConfirm={confirmDeletePhoto}
          title="Delete Progress Photo"
          message="Are you sure you want to delete this progress photo? This action cannot be undone."
          confirmText="Delete Photo"
          cancelText="Cancel"
          isLoading={isDeleting === deleteConfirmation.photoId}
        />

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
} 