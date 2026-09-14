/**
 * Global Upload Monitor Component
 * Monitors background uploads and shows notifications when complete
 * This component should be rendered at the root level
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '~/context/ToastContext';
import { uploadQueue, type UploadTask } from '~/utils/uploadQueue';
import UploadMonitorPiP from './UploadMonitorPiP';

const COMPLETED_AUTO_DISMISS_MS = 3000;

export default function UploadMonitor() {
  const toast = useToast();
  const [allUploads, setAllUploads] = useState<UploadTask[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isRecovered, setIsRecovered] = useState(false);
  const [monitoredTasks, setMonitoredTasks] = useState<Set<string>>(new Set());
  const completionTimers = useRef<Map<string, number>>(new Map());

  // Recover uploads on mount
  useEffect(() => {
    uploadQueue.recoverUploads().then(() => {
      setIsRecovered(true);
    });
  }, []);

  useEffect(() => {
    // Check for active uploads periodically
    const interval = setInterval(() => {
      setAllUploads(uploadQueue.getAll());
    }, 500); // Update more frequently for smooth progress

    return () => clearInterval(interval);
  }, [isRecovered]);

  // Re-show a dismissed upload when it finishes or fails; drop ids that left the queue
  useEffect(() => {
    setDismissedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        const task = allUploads.find((upload) => upload.id === id);
        if (!task) {
          changed = true;
          continue;
        }
        if (task.status === 'completed' || task.status === 'error') {
          changed = true;
          continue;
        }
        next.add(id);
      }
      return changed ? next : prev;
    });
  }, [allUploads]);

  // Auto-remove completed uploads after a short "Complete" display
  useEffect(() => {
    for (const task of allUploads) {
      if (task.status !== 'completed' || completionTimers.current.has(task.id)) {
        continue;
      }

      const timer = window.setTimeout(() => {
        uploadQueue.remove(task.id).catch(console.error);
        completionTimers.current.delete(task.id);
        setAllUploads(uploadQueue.getAll());
        setMonitoredTasks((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }, COMPLETED_AUTO_DISMISS_MS);

      completionTimers.current.set(task.id, timer);
    }
  }, [allUploads]);

  useEffect(() => {
    return () => {
      completionTimers.current.forEach((timer) => clearTimeout(timer));
      completionTimers.current.clear();
    };
  }, []);

  const handleDismiss = useCallback((uploadId: string) => {
    const task = uploadQueue.get(uploadId);
    const status = task?.status || 'pending';

    if (status === 'error' || status === 'completed') {
      const timer = completionTimers.current.get(uploadId);
      if (timer) {
        clearTimeout(timer);
        completionTimers.current.delete(uploadId);
      }
      uploadQueue.remove(uploadId).catch(console.error);
      setAllUploads(uploadQueue.getAll());
      setMonitoredTasks((prev) => {
        const next = new Set(prev);
        next.delete(uploadId);
        return next;
      });
      setDismissedIds((prev) => {
        if (!prev.has(uploadId)) return prev;
        const next = new Set(prev);
        next.delete(uploadId);
        return next;
      });
      return;
    }

    // Hide in-progress uploads only — they keep running in the background
    setDismissedIds((prev) => new Set(prev).add(uploadId));
  }, []);

  // Monitor upload progress and show notifications
  useEffect(() => {
    allUploads.forEach((task) => {
      // Skip if we've already set up callbacks for this task
      if (monitoredTasks.has(task.id)) {
        return;
      }

      // Mark as monitored
      setMonitoredTasks((prev) => new Set(prev).add(task.id));

      // Store original callbacks
      const originalOnComplete = task.onComplete;
      const originalOnError = task.onError;

      // Wrap onComplete to show toast (PiP auto-dismisses after 3s)
      task.onComplete = async (result) => {
        if (originalOnComplete) {
          await originalOnComplete(result);
        }

        toast.success(
          'Check-In Upload Complete',
          `${task.clientName}'s check-in has been uploaded successfully!`
        );
      };

      // Wrap onError to show toast (failed PiP stays until the coach closes it)
      task.onError = async (error) => {
        if (originalOnError) {
          try {
            await originalOnError(error);
          } catch (callbackError) {
            console.error('Error in original onError callback:', callbackError);
          }
        }

        toast.error(
          'Upload Failed',
          `Failed to upload ${task.clientName}'s check-in: ${error.message}`
        );
      };
    });
  }, [allUploads, toast, monitoredTasks]);

  const visibleUploads = allUploads.filter((upload) => !dismissedIds.has(upload.id));

  return (
    <>
      <UploadMonitorPiP uploads={visibleUploads} onDismiss={handleDismiss} />
    </>
  );
}
