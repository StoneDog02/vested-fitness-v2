import React, { useState } from "react";
import Modal from "~/components/ui/Modal";
import Button from "~/components/ui/Button";
import VideoRecorder from "~/components/ui/VideoRecorder";
import MediaPlayerModal from "~/components/ui/MediaPlayerModal";

interface AddCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (thisWeek: string, recordingData?: { blob: Blob; duration: number; type: 'video' | 'audio' }) => void;
  lastWeekNotes: string;
  clientId: string;
  completedForms?: any[];
}

export default function AddCheckInModal({
  isOpen,
  onClose,
  onSubmit,
  lastWeekNotes,
  clientId,
  completedForms = [],
}: AddCheckInModalProps) {
  const [thisWeek, setThisWeek] = useState("");
  const [showRecorder, setShowRecorder] = useState(false);
  const [recordingType, setRecordingType] = useState<'video' | 'audio'>('video');
  const [recordingData, setRecordingData] = useState<{ blob: Blob; duration: number; type: 'video' | 'audio'; transcript?: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [expandedForms, setExpandedForms] = useState<Set<string>>(new Set());

  const toggleFormExpansion = (formId: string) => {
    setExpandedForms(prev => {
      const newSet = new Set(prev);
      if (newSet.has(formId)) {
        newSet.delete(formId);
      } else {
        newSet.add(formId);
      }
      return newSet;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thisWeek.trim() && !recordingData) return;
    
    setIsUploading(true);
    
    try {
      // If there's recording data, upload it first
      if (recordingData) {
        console.log('Uploading recording data:', {
          hasTranscript: !!recordingData.transcript,
          transcriptLength: recordingData.transcript?.length,
          transcriptPreview: recordingData.transcript?.substring(0, 100)
        });
        
        const formData = new FormData();
        
        // Create a proper File object from the blob
        const fileName = `recording.${recordingData.type === 'video' ? 'webm' : 'webm'}`;
        const file = new File([recordingData.blob], fileName, { 
          type: recordingData.type === 'video' ? 'video/webm' : 'audio/webm' 
        });
        
        formData.append('file', file);
        formData.append('clientId', clientId);
        formData.append('recordingType', recordingData.type);
        formData.append('duration', recordingData.duration.toString());
        if (recordingData.transcript) {
          formData.append('transcript', recordingData.transcript);
        }
        
        const response = await fetch('/api/upload-checkin-media', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Upload response:', response.status, errorText);
          throw new Error(`Failed to upload recording: ${response.status} ${errorText}`);
        }
      }
      
      // Submit the check-in
      onSubmit(thisWeek, recordingData || undefined);
    setThisWeek("");
      setRecordingData(null);
      setShowRecorder(false);
    onClose();
    } catch (error) {
      console.error('Error submitting check-in:', error);
      alert('Failed to submit check-in. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRecordingComplete = (blob: Blob, duration: number, type: 'video' | 'audio', transcript?: string) => {
    console.log('Recording completed with transcript:', {
      hasTranscript: !!transcript,
      transcriptLength: transcript?.length,
      transcriptPreview: transcript?.substring(0, 100)
    });
    
    setRecordingData({ blob, duration, type, transcript });
    setShowRecorder(false);
    
    // Auto-fill notes with transcript if available
    if (transcript && transcript.trim()) {
      setThisWeek(transcript);
    }
  };

  const handleCancelRecording = () => {
    setShowRecorder(false);
  };

  if (showRecorder) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Record Check In"
        size="video"
      >
        <VideoRecorder
          onRecordingComplete={handleRecordingComplete}
          onCancel={handleCancelRecording}
          recordingType={recordingType}
          enableDictation={true}
          completedForms={completedForms}
        />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Check In Notes"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
            Last Week
          </h4>
          <p className="text-sm text-gray-dark dark:text-gray-light mb-4 p-3 bg-gray-50 dark:bg-davyGray rounded-lg">
            {lastWeekNotes}
          </p>
        </div>

        {/* Recent Form Responses */}
        {completedForms.length > 0 && (
          <div>
            <h4 className="font-medium text-secondary dark:text-alabaster mb-2">
              Recent Form Responses
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {/* Filter to show only recent forms (last 7 days) */}
              {completedForms
                .filter(form => {
                  const sevenDaysAgo = new Date();
                  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                  return new Date(form.completed_at) >= sevenDaysAgo;
                })
                .slice(0, 3)
                .map((form) => {
                  const isExpanded = expandedForms.has(form.id);
                  return (
                    <div
                      key={form.id}
                      className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg overflow-hidden"
                    >
                      {/* Form Header - Always Visible */}
                      <button
                        onClick={() => toggleFormExpansion(form.id)}
                        className="w-full p-3 text-left hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors duration-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <h5 className="font-medium text-green-800 dark:text-green-200 text-sm">
                              {form.form.title}
                            </h5>
                            <span className="text-xs text-green-600 dark:text-green-400">
                              {new Date(form.completed_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-green-600 dark:text-green-400">
                              {form.responses?.length || 0} responses
                            </span>
                            <svg 
                              className={`w-4 h-4 text-green-600 dark:text-green-400 transition-transform duration-200 ${
                                isExpanded ? 'rotate-180' : ''
                              }`} 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </button>

                      {/* Form Responses - Expandable */}
                      {isExpanded && form.responses && form.responses.length > 0 && (
                        <div className="px-3 pb-3 border-t border-green-200 dark:border-green-800">
                          <div className="space-y-2 pt-2">
                            {form.responses.map((response: any, index: number) => (
                              <div key={response.id} className="text-xs">
                                <div className="font-medium text-green-800 dark:text-green-200 mb-1">
                                  Q{index + 1}: {response.question?.question_text || `Question ${index + 1}`}
                                </div>
                                <div className="text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">
                                  A: {response.response_text || response.response_number || response.response_options?.join(', ') || 'No response'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              {completedForms.filter(form => {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                return new Date(form.completed_at) >= sevenDaysAgo;
              }).length === 0 && (
                <div className="text-center text-green-600 dark:text-green-400 text-xs italic py-4">
                  No forms completed in the last 7 days
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recording Options */}
        <div className="border border-gray-light dark:border-davyGray rounded-lg p-4">
          <h4 className="font-medium text-secondary dark:text-alabaster mb-3">
            Add Recording (Optional)
          </h4>
          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-300 text-sm">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" clipRule="evenodd" />
              </svg>
              <span>🎤 Live transcription will automatically fill the notes field</span>
            </div>
          </div>
          <div className="flex space-x-3 mb-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRecordingType('video');
                setShowRecorder(true);
              }}
              className="flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
              <span>Camera & Audio</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRecordingType('audio');
                setShowRecorder(true);
              }}
              className="flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              <span>Audio Only</span>
            </Button>
          </div>
          {recordingData && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-green-700 dark:text-green-300">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>
                    {recordingData.type === 'video' ? 'Camera & Audio' : 'Audio'} recording ready 
                    ({Math.floor(recordingData.duration / 60)}:{(recordingData.duration % 60).toString().padStart(2, '0')})
                    {recordingData.transcript && ' • Transcript available'}
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    className="flex items-center space-x-1 px-2 py-1 text-xs text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 transition-colors rounded"
                    title="Preview recording"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRecordingData(null);
                      setShowRecorder(true); // Start recording again immediately
                    }}
                    className="flex items-center space-x-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors rounded"
                    title="Redo recording"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                    <span>Redo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRecordingData(null);
                      setThisWeek(''); // Clear notes if they were auto-filled from transcript
                    }}
                    className="flex items-center space-x-1 px-2 py-1 text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors rounded"
                    title="Delete recording"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="thisWeek"
            className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
          >
            This Week
          </label>
          <textarea
            id="thisWeek"
            name="thisWeek"
            rows={4}
            className="w-full px-3 py-2 border border-gray-light dark:border-davyGray rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-night text-secondary dark:text-alabaster"
            placeholder="Enter this week's check-in notes (optional if recording)..."
            value={thisWeek}
            onChange={(e) => setThisWeek(e.target.value)}
          />
        </div>

        <div className="flex justify-end space-x-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="primary" 
            disabled={(!thisWeek.trim() && !recordingData) || isUploading}
          >
            {isUploading ? 'Uploading...' : 'Send Notes'}
          </Button>
        </div>
      </form>

      {/* Preview Modal */}
      {recordingData && (
        <MediaPlayerModal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          videoUrl={recordingData.type === 'video' ? URL.createObjectURL(recordingData.blob) : undefined}
          audioUrl={recordingData.type === 'audio' ? URL.createObjectURL(recordingData.blob) : undefined}
          recordingType={recordingData.type}
          title="Preview Recording"
          transcript={recordingData.transcript}
        />
      )}
    </Modal>
  );
}
