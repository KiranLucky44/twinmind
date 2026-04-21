import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Settings schema
// ---------------------------------------------------------------------------

export interface AppSettings {
  groqApiKey: string;

  // ── Prompt overrides ────────────────────────────────────────────────────
  /** System prompt injected into /api/suggestions */
  suggestionsPrompt: string;
  /** System prompt injected into /api/chat */
  chatPrompt: string;
  /** Extra instructions appended when a suggestion card is expanded */
  detailedAnswerPrompt: string;

  // ── Context window sizes ────────────────────────────────────────────────
  /** Max transcript lines sent to /api/suggestions */
  suggestionTranscriptLines: number;
  /** Max transcript lines sent to /api/chat */
  chatTranscriptLines: number;
  /** Suggestions auto-refresh interval in seconds */
  suggestionsRefreshSeconds: number;
}

// ---------------------------------------------------------------------------
// Defaults — shown in the UI and used when localStorage is empty
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: AppSettings = {
  groqApiKey: '',

  suggestionsPrompt: `You are an expert real-time conversation assistant embedded in a live-transcription interface.

Your task: analyse the most recent portion of a live conversation transcript and produce **exactly 3** context-aware suggestions that help the participants at this precise moment in time.

Each suggestion must have one of these types (choose whichever fits best):
  • question        – A follow-up question worth asking right now
  • talking_point   – An important topic worth exploring further
  • answer          – A concise answer or explanation to something raised
  • fact_check      – A claim that should be verified or corrected
  • clarification   – Something ambiguous that needs to be clarified

Output rules (CRITICAL):
1. Output ONLY a valid JSON array — no prose, no markdown fences, no extra text.
2. The array must contain EXACTLY 3 objects.
3. Each object must have: type, title, preview, detailsPrompt.
4. title ≤ 60 chars. preview ≤ 150 chars. detailsPrompt ≤ 250 chars.

Quality rules:
• Ground suggestions in the MOST RECENT content.
• Vary types so the 3 cards feel complementary.
• Never repeat previously shown suggestions.
• Previews must be immediately useful even if not clicked.`,

  chatPrompt: `You are an expert AI assistant embedded inside TwinMind, a live-transcription intelligence platform.
You help users understand, analyse, and act on their ongoing conversations in real time.

Your behaviour:
- Answer with depth and precision.
- Ground your answers in the transcript context when available.
- Be concise but complete. Use short paragraphs and bullet points where they aid clarity.
- When referencing the transcript, cite specific points (e.g. "As mentioned in point 4…").
- If the user's question is unclear, ask a clarifying question rather than guessing.
- Never fabricate transcript content that wasn't provided.`,

  detailedAnswerPrompt: `Provide a thorough, well-structured answer. Include relevant context from the transcript, concrete examples, and actionable takeaways. Use headings and bullet points where they improve clarity.`,

  suggestionTranscriptLines: 30,
  chatTranscriptLines: 50,
  suggestionsRefreshSeconds: 30,
};

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'twinmind_settings_v1';

function loadFromStorage(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // Merge with defaults so new fields added in future versions work correctly
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveToStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Quota exceeded or private browsing — fail silently
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseSettingsReturn {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Load from localStorage on first client render
  useEffect(() => {
    setSettings(loadFromStorage());
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveToStorage(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveToStorage(DEFAULT_SETTINGS);
  }, []);

  return { settings, updateSettings, resetSettings };
}
