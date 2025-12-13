/**
 * Global Upload Monitor Component
 * Monitors background uploads and shows notifications when complete
 * This component should be rendered at the root level
 */

import { useEffect, useState } from 'react';
import { useToast } from '~/context/ToastContext';
import { uploadQueue, type UploadTask } from '~/utils/uploadQueue';
import UploadMonitorPiP from './UploadMonitorPiP';

export default function UploadMonitor() {
  const toast = useToast();
  const [activeUploads, setActiveUploads] = useState<UploadTask[]>([]);
  const [isRecovered, setIsRecovered] = useState(false);

  // Recover uploads on mount
  useEffect(() => {
    uploadQueue.recoverUploads().then(() => {
      setIsRecovered(true);
    });
  }, []);

  useEffect(() => {
    // Check for active uploads periodically
    const interval = setInterval(() => {
      const allUploads = uploadQueue.getAll();
      // Only show uploads that are not completed (pending, uploading, processing, error)
      const active = allUploads.filter(
        (upload) => upload.status !== 'completed' || upload.status === undefined
      );
      setActiveUploads(active);
    }, 500); // Update more frequently for smooth progress

    return () => clearInterval(interval);
  }, [isRecovered]);

  // Track tasks we've already set up callbacks for
  const [monitoredTasks, setMonitoredTasks] = useState<Set<string>>(new Set());

  // Monitor upload progress and show notifications
  useEffect(() => {
    activeUploads.forEach((task) => {
      // Skip if we've already set up callbacks for this task
      if (monitoredTasks.has(task.id)) {
        return;
      }

      // Mark as monitored
      setMonitoredTasks(prev => new Set(prev).add(task.id));

      // Store original callbacks
      const originalOnComplete = task.onComplete;
      const originalOnError = task.onError;

      // Wrap onComplete to show toast
      task.onComplete = async (result) => {
        // Call original callback first
        if (originalOnComplete) {
          try {
            await originalOnComplete(result);
          } catch (error) {
            console.error('Error in original onComplete callback:', error);
          }
        }

        // Show success toast
        toast.success(
          'Check-In Upload Complete',
          `${task.clientName}'s check-in has been uploaded successfully!`
        );

        // Clean up
        uploadQueue.remove(task.id).catch(console.error);
        setMonitoredTasks(prev => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      };

      // Wrap onError to show toast
      task.onError = async (error) => {
        // Call original callback first
        if (originalOnError) {
          try {
            await originalOnError(error);
          } catch (callbackError) {
            console.error('Error in original onError callback:', callbackError);
          }
        }

        // Show error toast
        toast.error(
          'Upload Failed',
          `Failed to upload ${task.clientName}'s check-in: ${error.message}`
        );

        // Clean up
        uploadQueue.remove(task.id).catch(console.error);
        setMonitoredTasks(prev => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      };
    });
  }, [activeUploads, toast, monitoredTasks]);

  // Render picture-in-picture monitor
  return (
    <>
      <UploadMonitorPiP uploads={activeUploads} />
    </>
  );
}

