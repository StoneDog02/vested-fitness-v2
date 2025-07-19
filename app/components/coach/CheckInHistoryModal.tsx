import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import MediaPlayer from "~/components/ui/MediaPlayer";
import { useState, useEffect, useRef } from "react";

interface CheckInNote {
  id: string;
  date: string;
  notes: string;
  formattedDate?: string;
  weekRange?: string;
  video_url?: string;
  audio_url?: string;
  recording_type?: 'video' | 'audio' | 'text' | 'video_audio';
  recording_duration?: number;
  recording_thumbnail_url?: string;
}

interface CheckInHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkIns: CheckInNote[];
  onLoadMore: () => void;
  hasMore: boolean;
  emptyMessage?: string;
}

export default function CheckInHistoryModal({
  isOpen,
  onClose,
  checkIns,
  onLoadMore,
  hasMore,
  emptyMessage,
}: CheckInHistoryModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const [playingMediaId, setPlayingMediaId] = useState<string | null>(null);

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
  }, [checkIns]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Check In History" size="lg">
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
            {checkIns.length === 0 ? (
              <div className="text-center text-gray-500 text-sm">
                {emptyMessage || "No history yet."}
              </div>
            ) : (
              checkIns.map((checkIn) => (
                <div
                  key={checkIn.id}
                  className="border-b border-gray-light dark:border-davyGray pb-3 last:border-0 last:pb-0"
                >
                  <div className="text-xs text-gray-dark dark:text-gray-light mb-1">
                    {checkIn.formattedDate ? checkIn.formattedDate : (() => { const d = new Date(checkIn.date); const mm = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); const yyyy = d.getFullYear(); return `${mm}/${dd}/${yyyy}`; })()}
                  </div>
                  
                  {/* Media Player */}
                  {checkIn.recording_type && checkIn.recording_type !== 'text' && (
                    <div className="mb-3">
                      <MediaPlayer
                        videoUrl={checkIn.video_url}
                        audioUrl={checkIn.audio_url}
                        recordingType={checkIn.recording_type}
                        duration={checkIn.recording_duration}
                        thumbnailUrl={checkIn.recording_thumbnail_url}
                        onClose={() => setPlayingMediaId(null)}
                      />
                    </div>
                  )}
                  
                  <p className="text-sm text-secondary dark:text-alabaster">
                    {checkIn.notes}
                  </p>
                </div>
              ))
            )}

            {hasMore && (
              <div className="flex justify-center mt-4">
                <Button variant="outline" onClick={onLoadMore} className="text-sm">
                  ...Load More
                </Button>
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
