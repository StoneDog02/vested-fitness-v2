import React, { useState, useRef, useCallback } from 'react';
import Button from './Button';

// TypeScript declarations for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

const SpeechRecognitionAPI = typeof window !== 'undefined' 
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

interface VideoRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number, type: 'video' | 'audio', transcript?: string) => void;
  onCancel: () => void;
  recordingType?: 'video' | 'audio';
  enableDictation?: boolean;
  completedForms?: any[];
}

export default function VideoRecorder({ 
  onRecordingComplete, 
  onCancel, 
  recordingType = 'video',
  enableDictation = false,
  completedForms = []
}: VideoRecorderProps) {
  console.log('VideoRecorder initialized with:', {
    recordingType,
    enableDictation,
    hasSpeechRecognitionAPI: !!SpeechRecognitionAPI
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [transcript, setTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<SpeechRecognition | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const transcriptRef = useRef<string>(''); // Use ref to always have latest transcript
  const accumulatedTranscriptRef = useRef<string>(''); // Store transcript across pause/resume cycles
  const speechRecognitionRestartRef = useRef<NodeJS.Timeout | null>(null); // For auto-restarting speech recognition
  const speechRecognitionMonitorRef = useRef<NodeJS.Timeout | null>(null); // For monitoring speech recognition state

  const startSpeechRecognition = useCallback(() => {
    if (!enableDictation || !SpeechRecognitionAPI || typeof window === 'undefined') {
      return null;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Combine accumulated transcript with new results
        const newTranscript = accumulatedTranscriptRef.current + finalTranscript + interimTranscript;
        console.log('Speech recognition result:', {
          finalTranscript,
          interimTranscript,
          newTranscript,
          resultLength: newTranscript.length,
          accumulatedLength: accumulatedTranscriptRef.current.length
        });
        
        setTranscript(newTranscript);
        transcriptRef.current = newTranscript;
        
        // Update accumulated transcript with final results
        if (finalTranscript) {
          accumulatedTranscriptRef.current = accumulatedTranscriptRef.current + finalTranscript;
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsTranscribing(false);
        
        // Auto-restart speech recognition on certain errors
        if (event.error === 'no-speech' || event.error === 'audio-capture' || event.error === 'network') {
          console.log('Auto-restarting speech recognition due to error:', event.error);
          if (speechRecognitionRestartRef.current) {
            clearTimeout(speechRecognitionRestartRef.current);
          }
          speechRecognitionRestartRef.current = setTimeout(() => {
            if (isRecording && !isPaused) {
              const newRecognition = startSpeechRecognition();
              if (newRecognition) {
                setSpeechRecognition(newRecognition);
                setIsTranscribing(true);
              }
            }
          }, 1000);
        }
      };

      recognition.onend = () => {
        console.log('Speech recognition ended, final transcript:', {
          transcript: transcriptRef.current,
          transcriptLength: transcriptRef.current?.length
        });
        
        // Preserve the current transcript when speech recognition ends
        // Don't clear it, just mark as not transcribing
        setIsTranscribing(false);
        
        // Auto-restart speech recognition if recording is still active
        if (isRecording && !isPaused) {
          console.log('Auto-restarting speech recognition after end');
          if (speechRecognitionRestartRef.current) {
            clearTimeout(speechRecognitionRestartRef.current);
          }
          speechRecognitionRestartRef.current = setTimeout(() => {
            if (isRecording && !isPaused) {
              console.log('Attempting to restart speech recognition...');
              const newRecognition = startSpeechRecognition();
              if (newRecognition) {
                setSpeechRecognition(newRecognition);
                setIsTranscribing(true);
                console.log('Speech recognition restarted successfully');
              } else {
                console.log('Failed to restart speech recognition');
              }
            }
          }, 100); // Reduced delay for faster restart
        }
      };

      recognition.start();
      console.log('Speech recognition started successfully');
      return recognition;
    } catch (error) {
      console.error('Speech recognition not supported:', error);
      return null;
    }
  }, [enableDictation, isRecording, isPaused]);

  const startSpeechRecognitionMonitor = useCallback(() => {
    // Clear any existing monitor
    if (speechRecognitionMonitorRef.current) {
      clearInterval(speechRecognitionMonitorRef.current);
    }

    // Start monitoring speech recognition state
    speechRecognitionMonitorRef.current = setInterval(() => {
      if (isRecording && !isPaused && enableDictation && !isTranscribing) {
        console.log('Speech recognition monitor: restarting inactive recognition');
        const newRecognition = startSpeechRecognition();
        if (newRecognition) {
          setSpeechRecognition(newRecognition);
          setIsTranscribing(true);
        }
      }
    }, 3000); // Check every 3 seconds - less aggressive
  }, [isRecording, isPaused, enableDictation, isTranscribing, startSpeechRecognition]);

  const stopSpeechRecognitionMonitor = useCallback(() => {
    if (speechRecognitionMonitorRef.current) {
      clearInterval(speechRecognitionMonitorRef.current);
      speechRecognitionMonitorRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      let mediaStream: MediaStream;
      
      if (recordingType === 'video') {
        // Request camera and microphone
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user' // Use front camera
          },
          audio: true
        });
      } else {
        // Audio only
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      setStream(mediaStream);
      
      if (videoRef.current && recordingType === 'video') {
        videoRef.current.srcObject = mediaStream;
      }

      const recorder = new MediaRecorder(mediaStream, {
        mimeType: recordingType === 'video' 
          ? 'video/webm;codecs=vp9' 
          : 'audio/webm;codecs=opus'
      });

      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { 
          type: recordingType === 'video' ? 'video/webm' : 'audio/webm' 
        });
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        console.log('VideoRecorder onstop - transcript state:', {
          hasTranscript: !!transcriptRef.current,
          transcriptLength: transcriptRef.current?.length,
          transcriptPreview: transcriptRef.current?.substring(0, 100),
          isTranscribing,
          speechRecognitionActive: !!speechRecognition
        });
        
        // Capture the current transcript before stopping speech recognition
        const finalTranscript = transcriptRef.current;
        
        // Stop speech recognition if it's running
        if (speechRecognition) {
          speechRecognition.stop();
          setSpeechRecognition(null);
          setIsTranscribing(false);
        }
        
        // Call onRecordingComplete with the captured transcript
        onRecordingComplete(blob, duration, recordingType, finalTranscript);
      };

      setMediaRecorder(recorder);
      setRecordedChunks(chunks);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setTranscript(''); // Reset transcript
      accumulatedTranscriptRef.current = ''; // Reset accumulated transcript
      startTimeRef.current = Date.now();

      // Start speech recognition if enabled
      if (enableDictation) {
        console.log('Starting speech recognition...');
        const recognition = startSpeechRecognition();
        if (recognition) {
          setSpeechRecognition(recognition);
          setIsTranscribing(true);
        }
        // Start monitoring speech recognition state
        startSpeechRecognitionMonitor();
      }

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      recorder.start(1000); // Collect data every second
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording. Please check your permissions.');
    }
  }, [recordingType, onRecordingComplete]);

  const stopRecording = useCallback(() => {
    // Clear any pending speech recognition restart
    if (speechRecognitionRestartRef.current) {
      clearTimeout(speechRecognitionRestartRef.current);
      speechRecognitionRestartRef.current = null;
    }

    // Stop speech recognition monitor
    stopSpeechRecognitionMonitor();

    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setIsPaused(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    } else if (isPaused) {
      // If we're paused, we need to stop the stream and finalize
      setIsRecording(false);
      setIsPaused(false);
      
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      
      // Create final blob from recorded chunks
      if (recordedChunks.length > 0) {
        const blob = new Blob(recordedChunks, { 
          type: recordingType === 'video' ? 'video/webm' : 'audio/webm' 
        });
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        // Capture the current transcript
        const finalTranscript = transcriptRef.current;
        
        // Stop speech recognition if it's running
        if (speechRecognition) {
          speechRecognition.stop();
          setSpeechRecognition(null);
          setIsTranscribing(false);
        }
        
        // Call onRecordingComplete with the captured transcript
        onRecordingComplete(blob, duration, recordingType, finalTranscript);
      }
    }
  }, [mediaRecorder, isRecording, isPaused, stream, recordedChunks, recordingType, speechRecognition, onRecordingComplete]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorder && isRecording) {
      if (isPaused) {
        // Resume recording - just resume timer and speech recognition
        setIsPaused(false);
        startTimeRef.current = Date.now() - (recordingTime * 1000);

        // Resume speech recognition if it was enabled
        if (enableDictation) {
          const recognition = startSpeechRecognition();
          if (recognition) {
            setSpeechRecognition(recognition);
            setIsTranscribing(true);
          }
          // Restart speech recognition monitor
          startSpeechRecognitionMonitor();
        }

        // Resume timer
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      } else {
        // Pause recording - don't stop MediaRecorder, just pause timer and speech recognition
        setIsPaused(true);
        
        // Stop timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // Pause speech recognition and save current transcript
        if (speechRecognition) {
          // Save the current transcript before stopping
          accumulatedTranscriptRef.current = transcriptRef.current;
          speechRecognition.stop();
          setSpeechRecognition(null);
          setIsTranscribing(false);
        }
        
        // Stop speech recognition monitor when paused
        stopSpeechRecognitionMonitor();
      }
    }
  }, [mediaRecorder, isRecording, isPaused, recordingTime, stream, recordingType, enableDictation, onRecordingComplete, recordedChunks]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-medium text-secondary dark:text-alabaster mb-2">
          {recordingType === 'video' ? 'Camera & Audio Recording' : 'Audio Recording'}
        </h3>
        <p className="text-sm text-gray-dark dark:text-gray-light">
          {recordingType === 'video' 
            ? 'Record your camera and voice to provide personalized feedback'
            : 'Record audio-only messages for quick updates'
          }
        </p>
      </div>

      {/* Form Responses Reference */}
      {completedForms.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-3">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <h4 className="font-medium text-blue-800 dark:text-blue-200">
              Client Form Responses - Reference During Recording
            </h4>
          </div>
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {/* Filter to show only recent forms (last 30 days) */}
            {completedForms
              .filter(form => {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return new Date(form.completed_at) >= thirtyDaysAgo;
              })
              .slice(0, 2)
              .map((form) => (
              <div
                key={form.id}
                className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-blue-900 dark:text-blue-100 text-sm">
                    {form.form.title}
                  </h5>
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    {new Date(form.completed_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="space-y-2">
                  {form.responses?.map((response: any, index: number) => (
                    <div key={response.id} className="text-xs">
                      <div className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                        Q{index + 1}: {response.question?.question_text}
                      </div>
                      <div className="text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded">
                        A: {response.response_text || response.response_number || response.response_options?.join(', ') || 'No response'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {completedForms.length > 2 && (
              <div className="text-center text-blue-600 dark:text-blue-400 text-xs italic">
                +{completedForms.length - 2} more forms available
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video Preview */}
      {recordingType === 'video' && (
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            muted
            className="w-full h-64 object-contain"
            style={{ transform: 'scaleX(-1)' }}
          />
          {isRecording && (
            <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-medium">
              REC {formatTime(recordingTime)}
            </div>
          )}
        </div>
      )}

      {/* Audio Visualizer */}
      {recordingType === 'audio' && isRecording && (
        <div className="bg-gray-100 dark:bg-davyGray rounded-lg p-4 text-center">
          <div className="text-2xl mb-2">🎤</div>
          <div className="text-sm text-gray-dark dark:text-gray-light">
            Recording... {formatTime(recordingTime)}
          </div>
          <div className="flex justify-center space-x-1 mt-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-red-500 rounded-full animate-pulse"
                style={{
                  height: `${20 + Math.random() * 30}px`,
                  animationDelay: `${i * 0.1}s`
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Live Transcript Display */}
      {enableDictation && isRecording && (
        <div className="bg-gray-50 dark:bg-davyGray rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${isTranscribing ? 'bg-green-500 animate-pulse' : transcript ? 'bg-yellow-500' : 'bg-gray-400'}`}></div>
            <span className="text-sm font-medium text-gray-dark dark:text-gray-light">
              {isTranscribing ? 'Live Transcription' : transcript ? 'Transcription (Paused)' : 'Live Transcription'}
            </span>
          </div>
          <div className="text-sm text-gray-dark dark:text-gray-light min-h-[60px] max-h-[120px] overflow-y-auto">
            {transcript ? (
              <p className="whitespace-pre-wrap">{transcript}</p>
            ) : (
              <p className="text-gray-400 italic">Start speaking to see live transcription...</p>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-center space-x-3">
        {!isRecording ? (
          <Button
            onClick={startRecording}
            variant="primary"
            className="flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            <span>Start Recording</span>
          </Button>
        ) : (
          <>
            <Button
              onClick={pauseRecording}
              variant="secondary"
              className="flex items-center space-x-2"
            >
              {isPaused ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>Pause</span>
                </>
              )}
            </Button>
            <Button
              onClick={stopRecording}
              variant="primary"
              className="flex items-center space-x-2 bg-red-500 hover:bg-red-600"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
              </svg>
              <span>Stop Recording</span>
            </Button>
          </>
        )}
        <Button onClick={onCancel} variant="outline">
          Cancel
        </Button>
      </div>

      {/* Instructions */}
      <div className="text-xs text-gray-dark dark:text-gray-light text-center">
        {recordingType === 'video' ? (
          <p>Allow camera and microphone access when prompted</p>
        ) : (
          <p>Allow microphone access when prompted to record audio</p>
        )}
      </div>
    </div>
  );
} 