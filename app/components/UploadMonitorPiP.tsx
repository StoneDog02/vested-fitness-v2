/**
 * Picture-in-Picture Upload Monitor Component
 * Draggable floating window that shows upload progress
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { uploadQueue, type UploadTask, type UploadProgress } from '~/utils/uploadQueue';

interface UploadMonitorPiPProps {
  uploads: UploadTask[];
}

export default function UploadMonitorPiP({ uploads }: UploadMonitorPiPProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    return { x: window.innerWidth - 320, y: 20 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [uploadProgresses, setUploadProgresses] = useState<Map<string, UploadProgress>>(new Map());

  useEffect(() => {
    setMounted(true);
    // Initialize position after mount
    if (typeof window !== 'undefined') {
      setPosition({ x: window.innerWidth - 320, y: 20 });
    }
  }, []);

  // Subscribe to progress updates for all uploads (must be before any conditional returns)
  useEffect(() => {
    if (uploads.length === 0) return;
    
    const unsubscribers: (() => void)[] = [];
    
    uploads.forEach((upload) => {
      const unsubscribe = uploadQueue.onProgress(upload.id, (progress) => {
        setUploadProgresses(prev => {
          const next = new Map(prev);
          next.set(upload.id, progress);
          return next;
        });
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [uploads]);

  // Handle dragging with smooth real-time updates
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!headerRef.current || !containerRef.current) return;
    e.preventDefault(); // Prevent text selection during drag
    e.stopPropagation(); // Prevent event bubbling
    
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    setIsDragging(true);
    setDragOffset({ x: offsetX, y: offsetY });

    // Capture current expanded state for viewport calculations
    const currentExpanded = isExpanded;
    const width = currentExpanded ? 400 : 300;
    const height = currentExpanded ? 300 : 80;
    
    // Use requestAnimationFrame for smooth updates
    let animationFrameId: number | null = null;
    
    const handleMouseMove = (e: MouseEvent) => {
      // Cancel previous frame if still pending
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      
      animationFrameId = requestAnimationFrame(() => {
        const newX = e.clientX - offsetX;
        const newY = e.clientY - offsetY;
        
        // Constrain to viewport
        const maxX = window.innerWidth - width;
        const maxY = window.innerHeight - height;
        
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY)),
        });
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // Use capture phase for better responsiveness
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp, { once: true });
  }, [isExpanded]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Hide if no uploads or not mounted (after all hooks)
  if (uploads.length === 0 || !mounted || typeof window === 'undefined') {
    return null;
  }

  const activeUpload = uploads[0]; // Show first active upload
  const progress = uploadProgresses.get(activeUpload.id) || activeUpload.progress || { percent: 0, loaded: 0, total: activeUpload.fileSize };
  const status = activeUpload.status || 'pending';

  return createPortal(
    <div
      ref={containerRef}
      className={`fixed z-[9998] bg-white dark:bg-night rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 transition-all duration-300 ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      } ${isExpanded ? 'w-[400px]' : 'w-[300px]'} animate-slide-up`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        willChange: isDragging ? 'transform, left, top' : 'auto',
      }}
    >
      {/* Header - Draggable */}
      <div
        ref={headerRef}
        onMouseDown={handleMouseDown}
        role="button"
        tabIndex={0}
        aria-label="Drag to move upload monitor"
        className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center space-x-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30">
            {status === 'uploading' && (
              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {status === 'processing' && (
              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            )}
            {status === 'completed' && (
              <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {status === 'error' && (
              <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-secondary dark:text-alabaster">
              {status === 'uploading' ? 'Uploading...' : status === 'processing' ? 'Processing...' : status === 'completed' ? 'Complete' : status === 'error' ? 'Failed' : 'Pending'}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{activeUpload.clientName}</p>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <svg
            className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Progress Bar */}
        <div className="mb-3">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                status === 'error'
                  ? 'bg-red-500'
                  : status === 'completed'
                  ? 'bg-green-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {progress.percent}%
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
            </span>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="space-y-3 mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Check-In Details</p>
              <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Type:</span>
                  <span className="font-medium">{activeUpload.recordingType === 'video' ? '📹 Video' : '🎤 Audio'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="font-medium">{formatDuration(activeUpload.duration)}</span>
                </div>
                <div className="flex justify-between">
                  <span>File Size:</span>
                  <span className="font-medium">{formatBytes(activeUpload.fileSize)}</span>
                </div>
                {activeUpload.notes && (
                  <div>
                    <span className="block mb-1">Notes:</span>
                    <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2 max-h-20 overflow-y-auto">
                      {activeUpload.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {status === 'error' && activeUpload.error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                <p className="text-xs text-red-800 dark:text-red-200 font-semibold mb-1">Error:</p>
                <p className="text-xs text-red-700 dark:text-red-300">{activeUpload.error.message}</p>
              </div>
            )}

            {uploads.length > 1 && (
              <div className="text-xs text-gray-500 dark:text-gray-500">
                +{uploads.length - 1} more upload{uploads.length - 1 !== 1 ? 's' : ''} in queue
              </div>
            )}
          </div>
        )}

        {/* Compact View - Just show progress */}
        {!isExpanded && (
          <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
            {activeUpload.recordingType === 'video' ? '📹' : '🎤'} {formatDuration(activeUpload.duration)}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}

