import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, type Suggestion } from '../context/AppContext';

/** Minimum transcript lines needed to bother calling the API. */
const MIN_TRANSCRIPT_LINES = 1;

interface UseSuggestionsReturn {
  isLoading: boolean;
  error: string | null;
  /** Seconds until the next auto-refresh (0 when not running). */
  nextRefreshIn: number;
  refresh: () => void;
}

export function useSuggestions(): UseSuggestionsReturn {
  const { transcript, suggestionBatches, addSuggestionBatch, settings, meetingSummary } = useApp();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(0);

  // Stable refs so the interval closure always sees the latest values
  const transcriptRef = useRef(transcript);
  const batchesRef = useRef(suggestionBatches);
  const settingsRef = useRef(settings);
  const isLoadingRef = useRef(false);

  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { batchesRef.current = suggestionBatches; }, [suggestionBatches]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const meetingSummaryRef = useRef(meetingSummary);
  useEffect(() => { meetingSummaryRef.current = meetingSummary; }, [meetingSummary]);

  // ── Core fetch ────────────────────────────────────────────────────────────

  const fetchSuggestions = useCallback(async () => {
    if (isLoadingRef.current) return;
    const { groqApiKey, suggestionsPrompt, suggestionTranscriptLines } = settingsRef.current;
    const apiKey = groqApiKey.trim();
    if (!apiKey) {
      setError('Add your Groq API key in Settings to enable suggestions.');
      return;
    }

    const lines = transcriptRef.current.map((s) => s.text);
    if (lines.length < MIN_TRANSCRIPT_LINES) return;

    const previousTitles = batchesRef.current
      .flatMap((b) => b.suggestions.map((s) => s.title));

    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-groq-api-key': apiKey,
        },
        body: JSON.stringify({
          transcript: lines.slice(-suggestionTranscriptLines),
          previousTitles,
          systemPrompt: meetingSummaryRef.current 
            ? `${suggestionsPrompt}\n\nBACKGROUND MEMORY (Use this to answer questions about earlier parts of the meeting):\n${meetingSummaryRef.current}`
            : suggestionsPrompt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      const suggestions: Suggestion[] = data.suggestions;

      if (!Array.isArray(suggestions) || suggestions.length !== 3) {
        throw new Error('API returned an unexpected number of suggestions.');
      }

      addSuggestionBatch(suggestions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [addSuggestionBatch]);

  // ── Auto-refresh (30 s interval + countdown ticker) ───────────────────────

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsLeftRef = useRef(settingsRef.current.suggestionsRefreshSeconds);

  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (tickRef.current) clearInterval(tickRef.current);

    const intervalMs = settingsRef.current.suggestionsRefreshSeconds * 1000;
    secondsLeftRef.current = settingsRef.current.suggestionsRefreshSeconds;
    setNextRefreshIn(secondsLeftRef.current);

    tickRef.current = setInterval(() => {
      secondsLeftRef.current = Math.max(0, secondsLeftRef.current - 1);
      setNextRefreshIn(secondsLeftRef.current);
    }, 1000);

    intervalRef.current = setInterval(() => {
      secondsLeftRef.current = settingsRef.current.suggestionsRefreshSeconds;
      setNextRefreshIn(secondsLeftRef.current);
      fetchSuggestions();
    }, intervalMs);
  }, [fetchSuggestions]);

  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    setNextRefreshIn(0);
  }, []);

  // ── Lifecycle: start/stop timer based on transcript and settings ──────────
  
  const timerStarted = useRef(false);
  const refreshInterval = settings.suggestionsRefreshSeconds;
  const hasEnoughTranscript = transcript.length >= MIN_TRANSCRIPT_LINES;

  useEffect(() => {
    if (hasEnoughTranscript) {
      // Fetch immediately if this is the first time we have enough content
      if (!timerStarted.current) {
        timerStarted.current = true;
        fetchSuggestions();
      }
      // (Re)start the auto-refresh logic with the current interval
      startAutoRefresh();
    } else {
      stopAutoRefresh();
      timerStarted.current = false;
    }
  }, [hasEnoughTranscript, refreshInterval, fetchSuggestions, startAutoRefresh, stopAutoRefresh]);

  // Clean up on unmount
  useEffect(() => {
    return () => stopAutoRefresh();
  }, [stopAutoRefresh]);

  // ── Manual refresh ────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    // If user manually refreshes, we ignore the local MIN_TRANSCRIPT_LINES check 
    // and just try to fetch whatever is there, as long as there is *something*.
    if (transcriptRef.current.length > 0) {
      fetchSuggestions();
      // Reset the countdown so the timer doesn't fire again too soon.
      if (intervalRef.current) startAutoRefresh();
    }
  }, [fetchSuggestions, startAutoRefresh]);

  return { isLoading, error, nextRefreshIn, refresh };
}
