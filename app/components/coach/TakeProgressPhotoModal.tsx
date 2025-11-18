import React, { useState } from "react";
import Modal from "~/components/ui/Modal";
import PhotoCapture from "~/components/ui/PhotoCapture";

interface TakeProgressPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoUploaded: () => void;
  clientId: string;
  clientName?: string;
}

export default function TakeProgressPhotoModal({
  isOpen,
  onClose,
  onPhotoUploaded,
  clientId,
  clientName,
}: TakeProgressPhotoModalProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handlePhotoCaptured = async (blob: Blob, notes?: string) => {
    console.log('handlePhotoCaptured called', { blobSize: blob.size, notes });
    
    // Upload immediately for single photo mode
    await uploadPhoto(blob, notes);
  };

  const uploadPhoto = async (blob: Blob, notes?: string) => {
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      
      // Create a proper File object from the blob
      const fileName = `progress-photo-${Date.now()}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      
      formData.append('file', file);
      formData.append('clientId', clientId);
      if (notes) {
        formData.append('notes', notes);
      }
      
      const response = await fetch('/api/upload-progress-photo', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to upload progress photo. Please try again.';
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
            if (errorData.details) {
              console.error('Upload error details:', errorData.details);
            }
          } catch (e) {
            console.error('Failed to parse error response:', e);
          }
        } else {
          const errorText = await response.text();
          console.error('Upload response:', response.status, errorText);
          if (errorText) {
            errorMessage = errorText;
          }
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('Progress photo uploaded successfully:', result);
      
      onPhotoUploaded();
      onClose();
    } catch (error) {
      console.error('Error uploading progress photo:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload progress photo. Please try again.';
      alert(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    if (!isUploading) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="Take or Upload Progress Photo"
      size="lg"
    >
      {isUploading ? (
        <div className="flex flex-col items-center justify-center p-6 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-secondary dark:text-alabaster">Uploading photo...</p>
        </div>
      ) : (
        <PhotoCapture
          onPhotoCaptured={handlePhotoCaptured}
          onCancel={handleCancel}
          clientName={clientName}
        />
      )}
    </Modal>
  );
} 