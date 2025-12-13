/**
 * Upload Persistence Utilities
 * Handles storing and recovering upload tasks across page navigation and refreshes
 */

import type { UploadTask } from './uploadQueue';

const DB_NAME = 'upload-queue-db';
const DB_VERSION = 1;
const STORE_NAME = 'upload-files';
const STORAGE_KEY = 'upload-queue-metadata';

export interface StoredUploadMetadata {
  id: string;
  clientId: string;
  clientName: string;
  filePath: string;
  signedUrl: string;
  token: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  fileSize: number;
  recordingType: 'video' | 'audio';
  duration: number;
  transcript?: string;
  notes?: string;
  mimeType: string;
  status?: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  progress?: {
    percent: number;
    loaded: number;
    total: number;
  };
  createdAt: number;
}

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Store a file blob in IndexedDB
 */
export async function storeFile(id: string, file: File): Promise<void> {
  try {
    const database = await initDB();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ id, file, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to store file in IndexedDB:', error);
    throw error;
  }
}

/**
 * Retrieve a file blob from IndexedDB
 */
export async function getFile(id: string): Promise<File | null> {
  try {
    const database = await initDB();
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result?.file || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to retrieve file from IndexedDB:', error);
    return null;
  }
}

/**
 * Remove a file from IndexedDB
 */
export async function removeFile(id: string): Promise<void> {
  try {
    const database = await initDB();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to remove file from IndexedDB:', error);
  }
}

/**
 * Store upload metadata in localStorage
 */
export function storeUploadMetadata(metadata: StoredUploadMetadata[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
  } catch (error) {
    console.error('Failed to store upload metadata:', error);
  }
}

/**
 * Get stored upload metadata from localStorage
 */
export function getStoredUploadMetadata(): StoredUploadMetadata[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to retrieve upload metadata:', error);
  }
  return [];
}

/**
 * Clear all stored upload data
 */
export async function clearStoredUploads(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
    
    // Clear IndexedDB
    const database = await initDB();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to clear stored uploads:', error);
  }
}

/**
 * Convert UploadTask to StoredUploadMetadata (without file)
 */
export function taskToMetadata(task: UploadTask): StoredUploadMetadata {
  return {
    id: task.id,
    clientId: task.clientId,
    clientName: task.clientName,
    filePath: task.filePath,
    signedUrl: task.signedUrl,
    token: task.token,
    supabaseUrl: task.supabaseUrl,
    supabaseAnonKey: task.supabaseAnonKey,
    fileSize: task.fileSize,
    recordingType: task.recordingType,
    duration: task.duration,
    transcript: task.transcript,
    notes: task.notes,
    mimeType: task.mimeType,
    status: task.status,
    progress: task.progress,
    createdAt: Date.now(),
  };
}

