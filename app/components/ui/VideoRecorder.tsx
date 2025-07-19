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
}

export default function VideoRecorder({ 
  onRecordingComplete, 
  onCancel, 
  recordingType = 'video',
  enableDictation = false
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
      startTimeRef.current = Date.now();

      // Start speech recognition if enabled
      if (enableDictation && SpeechRecognitionAPI && typeof window !== 'undefined') {
        console.log('Starting speech recognition...');
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

            const newTranscript = finalTranscript + interimTranscript;
            console.log('Speech recognition result:', {
              finalTranscript,
              interimTranscript,
              newTranscript,
              resultLength: newTranscript.length
            });
            
            setTranscript(newTranscript);
            transcriptRef.current = newTranscript; // Update ref with latest transcript
          };

          recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsTranscribing(false);
          };

          recognition.onend = () => {
            console.log('Speech recognition ended, final transcript:', {
              transcript: transcriptRef.current,
              transcriptLength: transcriptRef.current?.length
            });
            setIsTranscribing(false);
          };

          recognition.start();
          console.log('Speech recognition started successfully');
          setSpeechRecognition(recognition);
          setIsTranscribing(true);
        } catch (error) {
          console.error('Speech recognition not supported:', error);
        }
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
    }
  }, [mediaRecorder, isRecording, stream]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorder && isRecording) {
      if (isPaused) {
        mediaRecorder.resume();
        setIsPaused(false);
        startTimeRef.current = Date.now() - (recordingTime * 1000);
      } else {
        mediaRecorder.pause();
        setIsPaused(true);
      }
    }
  }, [mediaRecorder, isRecording, isPaused, recordingTime]);

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

      {/* Video Preview */}
      {recordingType === 'video' && (
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            muted
            className="w-full h-64 object-contain"
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
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-gray-dark dark:text-gray-light">
              Live Transcription
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