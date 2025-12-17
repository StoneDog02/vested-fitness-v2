/**
 * Background Upload Queue Manager
 * Handles file uploads in the background, even when user navigates away
 */

import {
  storeFile,
  getFile,
  removeFile,
  storeUploadMetadata,
  getStoredUploadMetadata,
  clearStoredUploads,
  taskToMetadata,
  type StoredUploadMetadata,
} from './uploadPersistence';

export interface UploadProgress {
  percent: number;
  loaded: number;
  total: number;
}

export interface UploadTask {
  id: string;
  clientId: string;
  clientName: string;
  filePath: string;
  signedUrl: string;
  token: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  file: File;
  fileSize: number;
  recordingType: 'video' | 'audio';
  duration: number;
  transcript?: string;
  notes?: string;
  mimeType: string;
  progress?: UploadProgress;
  status?: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: Error;
  onProgress?: (percent: number, loaded: number, total: number) => void;
  onComplete?: (result: { path: string }) => void | Promise<void>;
  onError?: (error: Error) => void;
  _onCompleteCalled?: boolean; // Guard to prevent duplicate callback execution
}

class UploadQueue {
  private uploads: Map<string, UploadTask> = new Map();
  private activeUploads: Set<string> = new Set();
  private maxConcurrent = 1; // Only one upload at a time for now
  private progressCallbacks: Map<string, (progress: UploadProgress) => void> = new Map();
  
  /**
   * Subscribe to progress updates for a specific upload
   */
  onProgress(id: string, callback: (progress: UploadProgress) => void): () => void {
    this.progressCallbacks.set(id, callback);
    // Return unsubscribe function
    return () => {
      this.progressCallbacks.delete(id);
    };
  }
  
  /**
   * Get current progress for an upload
   */
  getProgress(id: string): UploadProgress | null {
    const task = this.uploads.get(id);
    return task?.progress || null;
  }

  /**
   * Add an upload task to the queue
   */
  async add(task: UploadTask): Promise<void> {
    task.status = 'pending';
    this.uploads.set(task.id, task);
    
    // Store file in IndexedDB for persistence
    try {
      await storeFile(task.id, task.file);
    } catch (error) {
      console.error('Failed to store file for persistence:', error);
      // Continue anyway - upload will work, just won't persist across refresh
    }
    
    // Save metadata to localStorage
    this.saveMetadata();
    
    this.processQueue();
  }

  /**
   * Get all active uploads
   */
  getAll(): UploadTask[] {
    return Array.from(this.uploads.values());
  }

  /**
   * Get a specific upload by ID
   */
  get(id: string): UploadTask | undefined {
    return this.uploads.get(id);
  }

  /**
   * Remove an upload from the queue
   */
  async remove(id: string): Promise<void> {
    this.uploads.delete(id);
    this.activeUploads.delete(id);
    
    // Remove from IndexedDB
    try {
      await removeFile(id);
    } catch (error) {
      console.error('Failed to remove file from IndexedDB:', error);
    }
    
    // Update metadata
    this.saveMetadata();
  }

  /**
   * Process the upload queue
   */
  private async processQueue(): Promise<void> {
    // Don't start new uploads if we're at max concurrent
    if (this.activeUploads.size >= this.maxConcurrent) {
      return;
    }

    // Find next pending upload
    const pending = Array.from(this.uploads.values()).find(
      (task) => !this.activeUploads.has(task.id)
    );

    if (!pending) {
      return; // No pending uploads
    }

      // Mark as active and start upload
      this.activeUploads.add(pending.id);
      pending.status = 'uploading';
      this.uploadFile(pending);
  }

  /**
   * Upload a file using XMLHttpRequest for progress tracking
   */
  private async uploadFile(task: UploadTask): Promise<void> {
    const {
      id,
      file,
      signedUrl,
      filePath,
      onProgress,
      onComplete,
      onError,
    } = task;

    try {
      // Upload using XMLHttpRequest for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            const progress: UploadProgress = {
              percent,
              loaded: event.loaded,
              total: event.total,
            };
            
            // Update task progress
            task.progress = progress;
            task.status = 'uploading';
            
            // Save metadata periodically (every 10% or every 2 seconds)
            if (percent % 10 === 0 || Math.random() < 0.1) {
              this.saveMetadata();
            }
            
            // Call original callback if provided
            if (onProgress) {
              onProgress(percent, event.loaded, event.total);
            }
            
            // Notify progress subscribers
            const callback = this.progressCallbacks.get(id);
            if (callback) {
              callback(progress);
            }
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            let errorMessage = `Upload failed (${xhr.status})`;
            let errorDetails: any = {};
            
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorMessage = errorData.error || errorData.message || errorMessage;
              errorDetails = errorData;
            } catch {
              if (xhr.responseText) {
                errorMessage = xhr.responseText.length > 200
                  ? xhr.responseText.substring(0, 200) + '...'
                  : xhr.responseText;
              }
            }
            
            // Enhanced error logging for debugging
            console.error('Upload failed:', {
              status: xhr.status,
              statusText: xhr.statusText,
              errorMessage,
              errorDetails,
              fileType: file.type,
              taskMimeType: task.mimeType,
              recordingType: task.recordingType,
              fileSize: file.size,
              fileName: file.name,
              responseText: xhr.responseText
            });
            
            reject(new Error(errorMessage));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload. Please check your connection and try again.'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload was cancelled.'));
        });

        // Use the signed URL for upload (it already contains the token)
        // Use PUT with the file directly
        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('cache-control', '3600');
        xhr.setRequestHeader('x-upsert', 'false');
        
        // Normalize MIME type - Supabase Storage only accepts base types without codec parameters
        // e.g., "video/webm;codecs=vp8,opus" -> "video/webm"
        let contentType = file.type || task.mimeType || '';
        if (contentType) {
          // Strip codec parameters and any other parameters after semicolon
          contentType = contentType.split(';')[0].trim();
        }
        
        // Fallback to default MIME type if still empty
        if (!contentType) {
          contentType = task.recordingType === 'video' ? 'video/webm' : 'audio/webm';
        }
        
        // Log for debugging
        console.log('Uploading file with MIME type:', {
          originalFileType: file.type,
          taskMimeType: task.mimeType,
          normalizedContentType: contentType,
          recordingType: task.recordingType,
          fileName: file.name
        });
        
        // Set Content-Type header - this is critical for Supabase Storage validation
        xhr.setRequestHeader('Content-Type', contentType);
        
        xhr.send(file);
      });

      // Upload successful - mark as processing first
      task.status = 'processing';
      this.saveMetadata(); // Save processing state immediately
      
      // Call onComplete callback (this creates the check-in record)
      // Guard: Only call once to prevent duplicate check-in creation
      if (onComplete && !task._onCompleteCalled) {
        task._onCompleteCalled = true; // Mark as called immediately
        this.saveMetadata(); // Save the guard flag
        
        try {
          await onComplete({ path: filePath });
          // Only mark as completed if onComplete succeeds
          task.status = 'completed';
          this.saveMetadata(); // Save completed state
        } catch (error) {
          // If check-in creation fails, mark as error
          console.error('Error in onComplete callback:', error);
          task.status = 'error';
          task.error = error instanceof Error ? error : new Error(String(error));
          this.saveMetadata();
          
          // Call onError if provided
          if (task.onError) {
            task.onError(task.error);
          }
        }
      } else if (!onComplete) {
        // No callback, just mark as completed
        task.status = 'completed';
        this.saveMetadata();
      } else if (task._onCompleteCalled) {
        // Callback already called, just mark as completed
        console.log('onComplete already called for task, skipping:', id);
        task.status = 'completed';
        this.saveMetadata();
      }
      
      // Update progress to 100%
      const callback = this.progressCallbacks.get(id);
      if (callback && task.progress) {
        callback({ ...task.progress, percent: 100 });
      }

      // Continue processing queue
      this.activeUploads.delete(id);
      this.processQueue();
    } catch (error) {
      // Upload failed
      const errorObj = error instanceof Error ? error : new Error(String(error));
      task.status = 'error';
      task.error = errorObj;
      
      if (onError) {
        onError(errorObj);
      }

      // Continue processing queue (don't block other uploads)
      this.activeUploads.delete(id);
      this.processQueue();
      
      // Update metadata after error
      this.saveMetadata();
    }
  }

  /**
   * Save metadata to localStorage
   */
  private saveMetadata(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const tasks = Array.from(this.uploads.values());
      const metadata = tasks.map(taskToMetadata);
      storeUploadMetadata(metadata);
    } catch (error) {
      console.error('Failed to save upload metadata:', error);
    }
  }

  /**
   * Cancel an upload
   */
  cancel(id: string): void {
    // Note: XMLHttpRequest abort is not exposed here, but uploads can be tracked
    this.remove(id);
  }
  
  /**
   * Recover uploads from storage (call on app initialization)
   */
  async recoverUploads(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      const metadataList = getStoredUploadMetadata();
      
      for (const metadata of metadataList) {
        // Clean up old completed or errored uploads (older than 1 hour)
        if (metadata.status === 'completed' || metadata.status === 'error') {
          const age = Date.now() - (metadata.createdAt || 0);
          if (age > 3600000) { // 1 hour
            await removeFile(metadata.id);
            // Also remove from metadata
            const updatedMetadata = metadataList.filter(m => m.id !== metadata.id);
            storeUploadMetadata(updatedMetadata);
            continue;
          }
          // Skip recent completed uploads - they're done
          if (metadata.status === 'completed') {
            continue;
          }
        }
        
        // Skip tasks that are in 'processing' state - they're already being processed
        // This prevents duplicate uploads when recovery runs while check-in is being created
        if (metadata.status === 'processing') {
          console.log('Skipping recovery of processing task (likely already completed):', metadata.id);
          // Check if file exists in storage - if it does, mark as completed
          try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(metadata.supabaseUrl, metadata.supabaseAnonKey);
            const pathParts = metadata.filePath.split('/');
            const folder = pathParts.slice(0, -1).join('/');
            const fileName = pathParts[pathParts.length - 1];
            
            const { data: fileData } = await supabase.storage
              .from('checkin-media')
              .list(folder, { search: fileName });
            
            if (fileData && fileData.length > 0) {
              // File exists, mark as completed
              console.log('File exists in storage, marking task as completed:', metadata.id);
              metadata.status = 'completed';
              const updatedMetadata = metadataList.map(m => 
                m.id === metadata.id ? { ...m, status: 'completed' as const } : m
              );
              storeUploadMetadata(updatedMetadata);
            }
          } catch (error) {
            console.error('Error checking file existence during recovery:', error);
          }
          continue;
        }
        
        // Skip if already in queue
        if (this.uploads.has(metadata.id)) {
          continue;
        }
        
        // Before recovering, check if the file already exists in storage
        // If it does, the upload already completed and we should skip recovery
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(metadata.supabaseUrl, metadata.supabaseAnonKey);
          const pathParts = metadata.filePath.split('/');
          const folder = pathParts.slice(0, -1).join('/');
          const fileName = pathParts[pathParts.length - 1];
          
          const { data: fileData } = await supabase.storage
            .from('checkin-media')
            .list(folder, { search: fileName });
          
          if (fileData && fileData.length > 0) {
            // File already exists in storage - upload completed, mark as completed and skip recovery
            console.log('File already exists in storage, marking task as completed and skipping recovery:', metadata.id);
            const updatedMetadata = metadataList.map(m => 
              m.id === metadata.id ? { ...m, status: 'completed' as const } : m
            );
            storeUploadMetadata(updatedMetadata);
            // Clean up the local file since it's already uploaded
            await removeFile(metadata.id);
            continue;
          }
        } catch (error) {
          console.error('Error checking file existence before recovery:', error);
          // Continue with recovery if check fails
        }
        
        // Try to recover the file
        const recoveredFile = await getFile(metadata.id);
        if (!recoveredFile) {
          console.warn(`File not found for upload ${metadata.id}, skipping recovery`);
          // Clean up metadata for missing files
          const updatedMetadata = metadataList.filter(m => m.id !== metadata.id);
          storeUploadMetadata(updatedMetadata);
          continue;
        }
        
        // Recreate the File with correct MIME type (IndexedDB might lose it)
        // Use the MIME type from metadata, or infer from recording type
        const mimeType = metadata.mimeType || 
          (metadata.recordingType === 'video' ? 'video/webm' : 'audio/webm');
        
        // Get file extension from MIME type or use default
        const getExtension = (mime: string, type: 'video' | 'audio') => {
          const baseType = mime.split(';')[0];
          switch (baseType) {
            case 'video/mp4': return 'mp4';
            case 'video/quicktime': return 'mov';
            case 'audio/mp3':
            case 'audio/mpeg': return 'mp3';
            case 'audio/wav': return 'wav';
            case 'audio/m4a':
            case 'audio/mp4': return 'm4a';
            default: return type === 'video' ? 'webm' : 'webm';
          }
        };
        
        const extension = getExtension(mimeType, metadata.recordingType);
        const fileName = `recording.${extension}`;
        
        // Recreate File with correct MIME type
        const file = new File([recoveredFile], fileName, { type: mimeType });
        
        // Recreate the upload task (without callbacks - they'll be set by the monitor)
        const task: UploadTask = {
          id: metadata.id,
          clientId: metadata.clientId,
          clientName: metadata.clientName,
          filePath: metadata.filePath,
          signedUrl: metadata.signedUrl,
          token: metadata.token,
          supabaseUrl: metadata.supabaseUrl,
          supabaseAnonKey: metadata.supabaseAnonKey,
          file,
          fileSize: metadata.fileSize,
          recordingType: metadata.recordingType,
          duration: metadata.duration,
          transcript: metadata.transcript,
          notes: metadata.notes,
          mimeType: mimeType,
          status: 'pending', // Always reset to pending for recovery - let it restart
          progress: metadata.progress,
        };
        
        this.uploads.set(metadata.id, task);
      }
      
      // Process the queue for any pending uploads
      this.processQueue();
      
      // Update metadata after recovery
      this.saveMetadata();
    } catch (error) {
      console.error('Failed to recover uploads:', error);
    }
  }

  /**
   * Get upload status for a specific upload
   */
  getStatus(id: string): UploadTask['status'] {
    const task = this.uploads.get(id);
    return task?.status || undefined;
  }
}

// Singleton instance
export const uploadQueue = new UploadQueue();

// Recover uploads on page load
if (typeof window !== 'undefined') {
  // Wait a bit for the page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      uploadQueue.recoverUploads();
    });
  } else {
    // Already loaded
    uploadQueue.recoverUploads();
  }
  
  // Save metadata periodically as backup
  setInterval(() => {
    try {
      const queue = uploadQueue as any;
      if (queue.saveMetadata) {
        queue.saveMetadata();
      }
    } catch (e) {
      console.warn('Failed to save upload queue metadata:', e);
    }
  }, 10000); // Every 10 seconds
}

