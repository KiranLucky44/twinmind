'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

// ── Recording mic button ──────────────────────────────────────────────────────
function MicButton({
  isRecording,
  isDisabled,
  onClick,
}: {
  isRecording: boolean;
  isDisabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      className={`
        relative w-12 h-12 rounded-full transition-all duration-300 flex items-center justify-center
        disabled:opacity-40 disabled:cursor-not-allowed z-10
        ${isRecording
          ? 'bg-[#3b82f6] text-white animate-ethereal'
          : 'bg-[#1a2333]/80 hover:bg-blue-500/20 text-[#3b82f6] border border-blue-500/30'
        }
      `}
    >
      {/* Recording Ring Animation */}
      {isRecording && (
        <div className="absolute inset-0 rounded-full bg-blue-500 animate-recording-ring -z-10" />
      )}
      <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-white' : 'bg-[#3b82f6]'}`} />
    </button>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({
  isRecording,
  isTranscribing,
  segmentCount,
}: {
  isRecording: boolean;
  isTranscribing: boolean;
  segmentCount: number;
}) {
  const dot = isRecording
    ? 'bg-red-500 animate-pulse'
    : isTranscribing
    ? 'bg-blue-500 animate-pulse'
    : 'bg-slate-300 dark:bg-slate-600';

  const label = isRecording
    ? 'Recording'
    : isTranscribing
    ? 'Transcribing…'
    : 'Ready';

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span>{label}</span>
      {segmentCount > 0 && (
        <span className="ml-auto font-medium text-slate-400 dark:text-slate-500 tabular-nums">
          {segmentCount} seg{segmentCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const TranscriptPanel = () => {
  const { transcript, isTranscribing, clearTranscript } = useApp();
  const {
    isRecording,
    isTranscribing: hookIsTranscribing,
    error,
    startRecording,
    stopRecording,
    isSupported,
  } = useAudioRecorder({ chunkDuration: 30000 });

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest segment — use scrollIntoView for smooth behaviour
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [transcript]);

  const handleMicToggle = useCallback(async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Spacebar shortcut to toggle recording
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' && !e.repeat && isSupported) {
        e.preventDefault();
        handleMicToggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMicToggle, isSupported]);

  const isBusy = hookIsTranscribing || isTranscribing;

  return (
    <div className="flex flex-col h-full bg-transparent">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 shrink-0 flex items-center justify-between border-b border-[#1f2937] backdrop-blur-md bg-[#0b1220]/80 sticky top-0 z-20">
        <h2 className="text-[10px] font-bold text-[#9ca3af] tracking-widest uppercase">1. MIC & TRANSCRIPT</h2>
        <div className="flex items-center gap-1.5">
          {isRecording && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
          <span className={`text-[10px] font-bold ${isRecording ? 'text-blue-500' : 'text-[#4b5563]'}`}>
            {isRecording ? 'RECORDING' : 'IDLE'}
          </span>
        </div>
      </div>

      {/* ── Mic Section ──────────────────────────────────────────────────── */}
      <div className="px-5 py-6 shrink-0 flex items-center gap-4">
        <MicButton
          isRecording={isRecording}
          isDisabled={!isSupported || isBusy}
          onClick={handleMicToggle}
        />
        <div className="text-[11px] text-[#9ca3af] leading-tight max-w-[180px]">
          Click mic to start. Transcript appends every ~30s.
        </div>
      </div>

      {/* ── Info Box ────────────────────────────────────────────────────── */}
      <div className="px-5 mb-6 shrink-0">
        <div className="p-4 rounded-xl bg-[#1a2333]/40 border border-[#1f2937] relative overflow-hidden group">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500/0 via-blue-500/40 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-[11px] text-[#9ca3af] leading-relaxed">
            The transcript scrolls and appends new chunks every ~30 seconds while recording. 
            Use the mic button or <kbd className="bg-[#0b1220] px-1 rounded border border-[#1f2937] text-[9px]">Space</kbd> to start.
          </p>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="mx-3 mt-3 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20
                     border border-red-200 dark:border-red-800 shrink-0 flex items-start gap-2"
        >
          <svg className="w-3.5 h-3.5 text-red-500 shrink-0 mt-px" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">{error}</p>
        </div>
      )}

      {/* ── Transcript feed ──────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 pb-5 space-y-4"
      >
        {transcript.length === 0 && !isBusy ? (
          <div className="h-48 flex items-center justify-center animate-fade-up">
            <p className="text-[13px] text-[#4b5563] italic">
              No transcript yet — start the mic.
            </p>
          </div>
        ) : (
          <>
            {transcript.map((segment, idx) => (
              <div key={segment.id} className="animate-fade-up group" style={{ animationDelay: `${idx * 0.05}s` }}>
                <p className="text-[13px] text-[#e5e7eb] leading-relaxed">
                  {segment.text}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-[#4b5563] tabular-nums font-medium">
                    {new Date(segment.timestamp).toLocaleTimeString([], {
                      hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })}
                  </span>
                  <span className="text-[10px] text-[#4b5563] font-bold tracking-tight opacity-50">#{idx + 1}</span>
                </div>
              </div>
            ))}

            {/* Transcribing indicator */}
            {isBusy && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 px-3.5 py-2.5
                              border border-blue-100 dark:border-blue-800/50 animate-fade-in">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    Transcribing audio…
                  </span>
                </div>
              </div>
            )}

            {/* Invisible anchor for scrollIntoView */}
            <div ref={bottomRef} aria-hidden />
          </>
        )}
      </div>

    </div>
  );
};

export default TranscriptPanel;
