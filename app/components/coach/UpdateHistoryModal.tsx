import Modal from "~/components/ui/Modal";
import { useState, useEffect, useRef } from "react";

interface Update {
  id: string;
  message: string;
  created_at: string;
}

interface UpdateHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  updates: Update[];
  onLoadMore: () => void;
  hasMore: boolean;
  emptyMessage?: string;
}

export default function UpdateHistoryModal({
  isOpen,
  onClose,
  updates,
  onLoadMore,
  hasMore,
  emptyMessage,
}: UpdateHistoryModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowTopFade(scrollTop > 10);
    setShowBottomFade(scrollTop < scrollHeight - clientHeight - 10);
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    
    // Check initial scroll state
    handleScroll();
    
    const scrollElement = scrollRef.current;
    scrollElement.addEventListener('scroll', handleScroll);
    
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [updates]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update History" size="lg">
      <div className="relative">
        {/* Top fade */}
        {showTopFade && (
          <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white dark:from-charcoal to-transparent pointer-events-none z-10" />
        )}
        
        {/* Scrollable content */}
        <div 
          ref={scrollRef}
          className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-track-gray-100 scrollbar-thumb-gray-300 dark:scrollbar-track-gray-700 dark:scrollbar-thumb-gray-500"
        >
          <div className="space-y-4">
            {updates.length === 0 ? (
              <div className="text-center text-gray-500 text-sm">
                {emptyMessage || "No updates yet."}
              </div>
            ) : (
              updates.map((update) => (
                <div
                  key={update.id}
                  className="border-b border-gray-light dark:border-davyGray pb-3 last:border-0 last:pb-0"
                >
                  <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
                    {new Date(update.created_at).toLocaleDateString()}
                  </div>
                  <p className="text-sm text-secondary dark:text-alabaster">
                    {update.message}
                  </p>
                </div>
              ))
            )}
            {hasMore && (
              <div className="flex justify-center mt-4">
                <button
                  className="px-4 py-2 border border-gray-light dark:border-davyGray rounded text-sm text-primary hover:bg-gray-50 dark:hover:bg-davyGray"
                  onClick={onLoadMore}
                >
                  ...Load More
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom fade */}
        {showBottomFade && (
          <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white dark:from-charcoal to-transparent pointer-events-none z-10" />
        )}
      </div>
    </Modal>
  );
} 