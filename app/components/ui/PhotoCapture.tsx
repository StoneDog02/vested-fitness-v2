import React, { useState, useRef, useCallback } from 'react';
import Button from './Button';

interface PhotoCaptureProps {
  onPhotoCaptured: (blob: Blob, notes?: string) => void;
  onCancel: () => void;
  clientName?: string;
}

export default function PhotoCapture({ 
  onPhotoCaptured, 
  onCancel, 
  clientName
}: PhotoCaptureProps) {

  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'capture' | 'upload' | 'review'>('capture');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setMode('review');
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  }, [stopCamera]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file.');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB.');
        return;
      }

      // Convert file to blob and create preview
      const blob = new Blob([file], { type: file.type });
      const photoUrl = URL.createObjectURL(blob);
      setCapturedPhoto(photoUrl);
      setSelectedFileName(file.name);
      setMode('review');
      setError(null);
    }
  }, []);

  const retakePhoto = useCallback(() => {
    if (capturedPhoto) {
      URL.revokeObjectURL(capturedPhoto);
      setCapturedPhoto(null);
    }
    setNotes('');
    setSelectedFileName(null);
    setMode('capture');
    startCamera();
  }, [capturedPhoto, startCamera]);

  const savePhoto = useCallback(() => {
    if (!capturedPhoto) return;

    // Convert the photo URL back to blob
    fetch(capturedPhoto)
      .then(res => res.blob())
      .then(blob => {
        onPhotoCaptured(blob, notes.trim() || undefined);
      })
      .catch(err => {
        console.error('Error saving photo:', err);
        setError('Failed to save photo. Please try again.');
      });
  }, [capturedPhoto, notes, onPhotoCaptured]);

  const handleCancel = useCallback(() => {
    if (capturedPhoto) {
      URL.revokeObjectURL(capturedPhoto);
    }
    setSelectedFileName(null);
    stopCamera();
    onCancel();
  }, [capturedPhoto, stopCamera, onCancel]);

  const switchToUpload = useCallback(() => {
    stopCamera();
    setMode('upload');
    setError(null);
  }, [stopCamera]);

  const switchToCapture = useCallback(() => {
    setMode('capture');
    setError(null);
    startCamera();
  }, [startCamera]);

  // Start camera when component mounts in capture mode
  React.useEffect(() => {
    if (mode === 'capture') {
      startCamera();
    }
    return () => {
      stopCamera();
      if (capturedPhoto) {
        URL.revokeObjectURL(capturedPhoto);
      }
    };
  }, [startCamera, stopCamera, capturedPhoto, mode]);

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
          <Button variant="secondary" onClick={mode === 'capture' ? startCamera : () => setMode('upload')}>
            Try Again
          </Button>
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'review' && capturedPhoto) {
    return (
      <div className="flex flex-col space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-medium text-secondary dark:text-alabaster mb-2">
            Review Your Photo
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Make sure you're happy with this progress photo
          </p>
        </div>
        
        <div className="relative bg-black rounded-lg overflow-hidden">
          <img 
            src={capturedPhoto} 
            alt="Captured preview" 
            className="w-full h-96 object-contain"
          />
          {selectedFileName && (
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              {selectedFileName}
            </div>
          )}
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
            Choose Different Photo
          </Button>
          <Button variant="primary" onClick={savePhoto} className="flex-1">
            Save Photo
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'upload') {
    return (
      <div className="flex flex-col space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-medium text-secondary dark:text-alabaster mb-2">
            Upload Progress Photo
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {clientName ? `Upload a progress photo for ${clientName}` : 'Select a photo from your device'}
          </p>
        </div>

        <div className="border-2 border-dashed border-gray-light dark:border-davyGray rounded-lg p-8 text-center hover:border-primary dark:hover:border-primary transition-colors">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Click to select a photo from your device
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Supports JPG, PNG, GIF • Max 10MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button 
            variant="primary" 
            onClick={() => fileInputRef.current?.click()}
            className="mx-auto min-h-[44px] px-6"
          >
            Choose Photo
          </Button>
        </div>

        <div className="flex space-x-3">
          <Button variant="secondary" onClick={switchToCapture} className="flex-1">
            Use Camera
          </Button>
          <Button variant="secondary" onClick={handleCancel} className="flex-1">
            Cancel
          </Button>
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
        <Button variant="secondary" onClick={switchToUpload} className="flex-1">
          Upload Photo
        </Button>
        <Button variant="primary" onClick={capturePhoto} className="flex-1">
          Take Photo
        </Button>
      </div>
    </div>
  );
} 