'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useSettings, type AppSettings } from '../hooks/useSettings';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
}

export type SuggestionType =
  | 'question'
  | 'talking_point'
  | 'answer'
  | 'fact_check'
  | 'clarification';

export interface Suggestion {
  id: string;
  type: SuggestionType;
  title: string;
  /** Short 1-2 line preview — useful even without expanding. */
  preview: string;
  /** Full prompt to send to the chat panel for an in-depth response. */
  detailsPrompt: string;
  /** UI icon — derived from `type` at render time. */
  icon: 'lightbulb' | 'star' | 'zap';
}

export interface SuggestionBatch {
  id: string;
  suggestions: Suggestion[];
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface AppContextType {
  // ── Session state ─────────────────────────────────────────────────────────
  transcript: TranscriptSegment[];
  suggestionBatches: SuggestionBatch[];
  chatMessages: ChatMessage[];
  isRecording: boolean;
  isTranscribing: boolean;
  meetingSummary: string;
  interimTranscript: string;

  // ── Settings (persisted to localStorage) ─────────────────────────────────
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;

  // ── Session actions ───────────────────────────────────────────────────────
  appendTranscript: (text: string) => void;
  addSuggestionBatch: (suggestions: Suggestion[]) => void;
  addChatMessage: (role: 'user' | 'assistant', content: string) => void;
  /** Appends `chunk` to the last assistant message in-place (for streaming). */
  appendToLastMessage: (chunk: string) => void;
  setIsRecording: (value: boolean) => void;
  setIsTranscribing: (value: boolean) => void;
  setMeetingSummary: (value: string | ((prev: string) => string)) => void;
  setInterimTranscript: (value: string) => void;
  resetSession: () => void;
  clearTranscript: () => void;
}

// ---------------------------------------------------------------------------
// Context + provider
// ---------------------------------------------------------------------------

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  // Settings — persisted
  const { settings, updateSettings, resetSettings } = useSettings();

  // Session state — ephemeral
  const [transcript, setTranscript] = React.useState<TranscriptSegment[]>([]);
  const [suggestionBatches, setSuggestionBatches] = React.useState<SuggestionBatch[]>([]);
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [isRecording, setIsRecording] = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const [meetingSummary, setMeetingSummary] = React.useState('');
  const [interimTranscript, setInterimTranscript] = React.useState('');

  const appendTranscript = React.useCallback((text: string) =>
    setTranscript((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, text, timestamp: Date.now() },
    ]), []);

  // ── Infinite Context Memory (Rolling RAG) ───────────────────────────────
  const summarizedCountRef = React.useRef(0);
  
  React.useEffect(() => {
    // When transcript grows 40 lines larger than what's summarized, summarize the oldest 20 unprocessed lines.
    if (transcript.length - summarizedCountRef.current > 40) {
      const linesToSummarize = transcript
        .slice(summarizedCountRef.current, summarizedCountRef.current + 20)
        .map(t => t.text);
        
      summarizedCountRef.current += 20;

      fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previousSummary: meetingSummary,
          newTranscript: linesToSummarize,
          apiKey: settings.groqApiKey,
        }),
      })
      .then(r => r.json())
      .then(d => {
        if (d.summary) setMeetingSummary(d.summary);
      })
      .catch(e => console.error('[RollingSummary failed]', e));
    }
  }, [transcript.length, meetingSummary, settings.groqApiKey]);

  const addSuggestionBatch = React.useCallback((suggestions: Suggestion[]) => {
    if (suggestions.length !== 3) {
      console.warn('SuggestionBatch must contain exactly 3 suggestions');
      return;
    }
    setSuggestionBatches((prev) => [
      { id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, suggestions, timestamp: Date.now() },
      ...prev,
    ]);
  }, []);

  const addChatMessage = React.useCallback((role: 'user' | 'assistant', content: string) =>
    setChatMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, role, content, timestamp: Date.now() },
    ]), []);

  const appendToLastMessage = React.useCallback((chunk: string) =>
    setChatMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== 'assistant') return prev;
      return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
    }), []);

  const resetSession = React.useCallback(() => {
    setTranscript([]);
    setSuggestionBatches([]);
    setChatMessages([]);
    setIsTranscribing(false);
    setIsRecording(false);
    setMeetingSummary('');
    setInterimTranscript('');
    summarizedCountRef.current = 0;
  }, []);

  const clearTranscript = React.useCallback(() => setTranscript([]), []);

  const value: AppContextType = {
    transcript,
    suggestionBatches,
    chatMessages,
    isRecording,
    isTranscribing,
    meetingSummary,
    interimTranscript,
    settings,
    updateSettings,
    resetSettings,
    appendTranscript,
    addSuggestionBatch,
    addChatMessage,
    appendToLastMessage,
    setIsRecording,
    setIsTranscribing,
    setMeetingSummary,
    setInterimTranscript,
    resetSession,
    clearTranscript,
  };

  // Expose for QA testing
  if (typeof window !== 'undefined') {
    (window as any).twinMindTest = {
      appendTranscript,
      addChatMessage,
      resetSession,
      setInterimTranscript,
    };
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
