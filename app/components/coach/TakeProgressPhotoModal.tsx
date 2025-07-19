import React, { useState } from "react";
import Modal from "~/components/ui/Modal";
import PhotoCapture from "~/components/ui/PhotoCapture";

interface TakeProgressPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoUploaded: () => void;
  clientId: string;
  clientName?: string;
  allowMultiple?: boolean;
}

interface CapturedPhoto {
  blob: Blob;
  notes?: string;
  timestamp: number;
}

export default function TakeProgressPhotoModal({
  isOpen,
  onClose,
  onPhotoUploaded,
  clientId,
  clientName,
  allowMultiple = false,
}: TakeProgressPhotoModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [photosUploaded, setPhotosUploaded] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);

  const handlePhotoCaptured = async (blob: Blob, notes?: string) => {
    console.log('handlePhotoCaptured called', { allowMultiple, blobSize: blob.size, notes });
    
    if (allowMultiple) {
      // Store photo locally for multiple photo mode
      const capturedPhoto: CapturedPhoto = {
        blob,
        notes,
        timestamp: Date.now()
      };
      console.log('Adding photo to capturedPhotos', capturedPhoto);
      setCapturedPhotos(prev => {
        const newPhotos = [...prev, capturedPhoto];
        console.log('Updated capturedPhotos', newPhotos.length);
        return newPhotos;
      });
    } else {
      // Upload immediately for single photo mode
      await uploadPhoto(blob, notes);
    }
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
        const errorText = await response.text();
        console.error('Upload response:', response.status, errorText);
        throw new Error(`Failed to upload photo: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('Progress photo uploaded successfully:', result);
      
      setPhotosUploaded(prev => prev + 1);
      onPhotoUploaded();
      
      if (!allowMultiple) {
        onClose();
      }
    } catch (error) {
      console.error('Error uploading progress photo:', error);
      alert('Failed to upload progress photo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    if (!isUploading) {
      // Clear any captured photos when canceling
      setCapturedPhotos([]);
      onClose();
    }
  };

  const handleFinish = async () => {
    if (capturedPhotos.length > 0) {
      setIsUploading(true);
      
      try {
        // Upload all captured photos
        for (const photo of capturedPhotos) {
          await uploadPhoto(photo.blob, photo.notes);
        }
        
        // Clear captured photos after successful upload
        setCapturedPhotos([]);
        onClose();
      } catch (error) {
        console.error('Error uploading photos:', error);
        alert('Failed to upload some photos. Please try again.');
      } finally {
        setIsUploading(false);
      }
    } else {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title={allowMultiple && photosUploaded > 0 
        ? `Take Progress Photo (${photosUploaded} uploaded)` 
        : "Take Progress Photo"
      }
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
          onFinish={handleFinish}
          clientName={clientName}
          allowMultiple={allowMultiple}
          photosUploaded={capturedPhotos.length}
        />
      )}
    </Modal>
  );
} 