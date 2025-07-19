import React, { useState, useRef, useCallback } from 'react';
import Button from './Button';

interface PhotoCaptureProps {
  onPhotoCaptured: (blob: Blob, notes?: string) => void;
  onCancel: () => void;
  clientName?: string;
  allowMultiple?: boolean;
  onFinish?: () => void;
  photosUploaded?: number;
}

export default function PhotoCapture({ 
  onPhotoCaptured, 
  onCancel, 
  clientName, 
  allowMultiple = false,
  onFinish,
  photosUploaded = 0
}: PhotoCaptureProps) {

  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Use back camera if available
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Unable to access camera. Please check permissions and try again.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Flip the canvas horizontally to un-mirror the captured image
    context.scale(-1, 1);
    context.translate(-canvas.width, 0);

    // Draw the current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        const photoUrl = URL.createObjectURL(blob);
        setCapturedPhoto(photoUrl);
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    if (capturedPhoto) {
      URL.revokeObjectURL(capturedPhoto);
      setCapturedPhoto(null);
    }
    setNotes('');
    startCamera();
  }, [capturedPhoto, startCamera]);

  const savePhoto = useCallback(() => {
    if (!capturedPhoto) return;

    // Convert the photo URL back to blob
    fetch(capturedPhoto)
      .then(res => res.blob())
      .then(blob => {
        onPhotoCaptured(blob, notes.trim() || undefined);
        
        if (allowMultiple) {
          // Reset for next photo
          URL.revokeObjectURL(capturedPhoto);
          setCapturedPhoto(null);
          setNotes('');
          startCamera();
        }
      })
      .catch(err => {
        console.error('Error saving photo:', err);
        setError('Failed to save photo. Please try again.');
      });
  }, [capturedPhoto, notes, onPhotoCaptured, allowMultiple, startCamera]);

  const handleCancel = useCallback(() => {
    if (capturedPhoto) {
      URL.revokeObjectURL(capturedPhoto);
    }
    stopCamera();
    onCancel();
  }, [capturedPhoto, stopCamera, onCancel]);

  const handleFinish = useCallback(() => {
    if (capturedPhoto) {
      URL.revokeObjectURL(capturedPhoto);
    }
    stopCamera();
    onFinish?.();
  }, [capturedPhoto, stopCamera, onFinish]);

  // Start camera when component mounts
  React.useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (capturedPhoto) {
        URL.revokeObjectURL(capturedPhoto);
      }
    };
  }, [startCamera, stopCamera, capturedPhoto]);



  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 space-y-4">
        <div className="text-red-600 text-center">
          <svg className="w-12 h-12 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-sm">{error}</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary" onClick={startCamera}>
            Try Again
          </Button>
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (capturedPhoto) {
    return (
      <div className="flex flex-col space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-medium text-secondary dark:text-alabaster mb-2">
            Photo Preview
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Review your progress photo
          </p>
        </div>
        
        <div className="relative bg-black rounded-lg overflow-hidden">
          <img 
            src={capturedPhoto} 
            alt="Captured preview" 
            className="w-full h-96 object-contain"
          />
        </div>

        <div>
          <label htmlFor="photo-notes" className="block text-sm font-medium text-secondary dark:text-alabaster mb-2">
            Notes (Optional)
          </label>
          <textarea
            id="photo-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about this progress photo..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
          />
        </div>

        <div className="flex space-x-3">
          <Button variant="secondary" onClick={retakePhoto} className="flex-1">
            Retake Photo
          </Button>
          {allowMultiple ? (
            <>
              <Button variant="primary" onClick={savePhoto} className="flex-1">
                Save & Take Another
              </Button>
              <Button variant="secondary" onClick={handleFinish} className="flex-1">
                Finish ({photosUploaded} total)
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={savePhoto} className="flex-1">
              Save Photo
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-medium text-secondary dark:text-alabaster mb-2">
          Take Progress Photo
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {clientName ? `Take a progress photo for ${clientName}` : 'Position yourself and take a photo'}
          {allowMultiple && photosUploaded > 0 && (
            <span className="block mt-1 text-primary font-medium">
              {photosUploaded} photo{photosUploaded !== 1 ? 's' : ''} taken
            </span>
          )}
        </p>
      </div>

      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-96 object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        
        {/* Hidden canvas for photo capture */}
        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
        />
        
        {/* Camera controls */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <button
            onClick={capturePhoto}
            className="flex items-center justify-center w-16 h-16 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-12 h-12 bg-white border-4 border-gray-300 rounded-full"></div>
          </button>
        </div>
      </div>

      <div className="flex space-x-3">
        <Button variant="secondary" onClick={handleCancel} className="flex-1">
          Cancel
        </Button>
        <Button variant="primary" onClick={capturePhoto} className="flex-1">
          Take Photo
        </Button>
      </div>
    </div>
  );
} 