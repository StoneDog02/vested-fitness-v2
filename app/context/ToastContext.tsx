import React, { createContext, useContext, useState, useCallback } from "react";
import { Toast, ToastType, ToastContainer } from "~/components/ui/Toast";

interface ToastContextType {
  addToast: (title: string, options?: {
    message?: string;
    type?: ToastType;
    duration?: number;
  }) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((
    title: string,
    options: {
      message?: string;
      type?: ToastType;
      duration?: number;
    } = {}
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    const toast: Toast = {
      id,
      title,
      message: options.message,
      type: options.type || "info",
      duration: options.duration || 4000,
    };

    setToasts((prev) => [...prev, toast]);
  }, []);

  // Convenience methods
  const success = useCallback((title: string, message?: string) => {
    addToast(title, { message, type: "success" });
  }, [addToast]);

  const error = useCallback((title: string, message?: string) => {
    addToast(title, { message, type: "error" });
  }, [addToast]);

  const warning = useCallback((title: string, message?: string) => {
    addToast(title, { message, type: "warning" });
  }, [addToast]);

  const info = useCallback((title: string, message?: string) => {
    addToast(title, { message, type: "info" });
  }, [addToast]);

  const value = {
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
} 