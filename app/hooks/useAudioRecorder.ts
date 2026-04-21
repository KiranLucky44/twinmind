import { useCallback, useRef, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

interface UseAudioRecorderOptions {
  chunkDuration?: number; // in milliseconds
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const { chunkDuration = 30000 } = options; // Default 30 seconds
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { appendTranscript, setIsRecording: setAppIsRecording, settings } = useApp();
  const { groqApiKey } = settings;

  // Send audio chunk to transcription API
  const sendChunkForTranscription = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size === 0) return;

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      // Whisper/Groq handles .webm much better when the mimeType is webm.
      formData.append('audio', audioBlob, 'audio.webm');

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'x-groq-api-key': groqApiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.text && data.text.trim()) {
        appendTranscript(data.text);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Transcription error:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsTranscribing(false);
    }
  }, [appendTranscript, groqApiKey]);

  // Handle recording data
  const handleDataAvailable = useCallback((event: BlobEvent) => {
    if (event.data.size > 0) {
      sendChunkForTranscription(event.data);
    }
  }, [sendChunkForTranscription]);

  const isRestartingRef = useRef(false);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = handleDataAvailable;

      mediaRecorder.onerror = (event) => {
        const errorMsg = `Recording error: ${event.error}`;
        console.error(errorMsg);
        setError(errorMsg);
      };

      mediaRecorder.onstart = () => {
        setIsRecording(true);
        setAppIsRecording(true);
        chunksRef.current = [];
      };

      // Define scheduleNextChunk in the same scope so it can be called recursively
      const scheduleNextChunk = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            isRestartingRef.current = true;
            mediaRecorderRef.current.stop();
          }
        }, chunkDuration);
      };

      mediaRecorder.onstop = () => {
        if (isRestartingRef.current) {
          isRestartingRef.current = false;
          // IMPORTANT: Do NOT stop the stream tracks here.
          // Just start the recorder again to create a new standalone chunk.
          try {
            if (mediaRecorderRef.current && streamRef.current?.active) {
              mediaRecorderRef.current.start();
              scheduleNextChunk();
            }
          } catch (e) {
            console.error('Failed to restart MediaRecorder after chunk:', e);
            setError('Failed to restart recording chunk.');
          }
          return;
        }

        setIsRecording(false);
        setAppIsRecording(false);
        
        // Cleanup stream only on full stop
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      scheduleNextChunk();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
      
      // Handle specific permission errors
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone permission denied. Please allow access and try again.');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone device found. Please check your audio input.');
        } else {
          setError(errorMessage);
        }
      } else {
        setError(errorMessage);
      }
      
      console.error('Failed to start recording:', errorMessage);
      setIsRecording(false);
      setAppIsRecording(false);
    }
  }, [handleDataAvailable, chunkDuration, setAppIsRecording]);

  // Stop recording
  const stopRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }

      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      mediaRecorderRef.current = null;
      setIsRecording(false);
      setAppIsRecording(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop recording';
      console.error('Error stopping recording:', errorMessage);
      setError(errorMessage);
    }
  }, [setAppIsRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // isSupported: start false (matches SSR), resolve client-side in useEffect
  // This prevents the hydration mismatch where server sees window=undefined.
  const [isSupported, setIsSupported] = useState(false);
  useEffect(() => {
    setIsSupported(
      typeof window !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof MediaRecorder !== 'undefined'
    );
  }, []);

  return {
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
    isSupported,
  };
}
