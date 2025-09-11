/**
 * Mobile device detection and utilities
 */

export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ||
         window.innerWidth <= 768;
};

export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return 'ontouchstart' in window || 
         navigator.maxTouchPoints > 0 || 
         (navigator as any).msMaxTouchPoints > 0;
};

/**
 * Enhanced click handler for mobile compatibility
 */
export const createMobileClickHandler = (
  originalHandler: (e: React.MouseEvent) => void,
  options: {
    preventDoubleTap?: boolean;
    delay?: number;
    disabled?: boolean;
  } = {}
) => {
  const { preventDoubleTap = true, delay = 0, disabled = false } = options;
  
  return (e: React.MouseEvent) => {
    if (disabled) return;
    
    // Prevent double-tap zoom on mobile
    if (preventDoubleTap && isMobileDevice()) {
      e.preventDefault();
    }
    
    // Add delay for touch event handling
    if (delay > 0) {
      setTimeout(() => {
        originalHandler(e);
      }, delay);
    } else {
      originalHandler(e);
    }
  };
};

/**
 * Mobile-optimized form submission handler
 */
export const createMobileFormHandler = (
  submitHandler: () => Promise<void> | void,
  options: {
    preventMultipleSubmissions?: boolean;
    showLoadingState?: boolean;
    onError?: (error: Error) => void;
  } = {}
) => {
  const { 
    preventMultipleSubmissions = true, 
    showLoadingState = true,
    onError 
  } = options;
  
  let isSubmitting = false;
  
  return async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (preventMultipleSubmissions && isSubmitting) {
      return;
    }
    
    isSubmitting = true;
    
    try {
      await submitHandler();
    } catch (error) {
      console.error('Form submission error:', error);
      if (onError) {
        onError(error as Error);
      }
    } finally {
      isSubmitting = false;
    }
  };
};

/**
 * Get mobile-specific CSS classes
 */
export const getMobileClasses = (baseClasses: string = ''): string => {
  const mobileClasses = isMobileDevice() ? 'mobile-touch-target' : '';
  return `${baseClasses} ${mobileClasses}`.trim();
};
