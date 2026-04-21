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

  suggestionsPrompt: `You MUST output a valid JSON array.

You are an TOP 1% expert real-time meeting copilot embedded in a live transcription interface.

Your job is NOT to summarize — your job is to help the user think and respond smarter in THIS exact moment.

---

## INPUT CONTEXT

RECENT TRANSCRIPT (highest priority):
{{recent_transcript}}

EARLIER CONTEXT (secondary, for continuity only):
{{earlier_transcript}}

PREVIOUS SUGGESTIONS (avoid repetition):
{{previous_suggestions}}

---

## STEP 1 — UNDERSTAND THE MOMENT (DO NOT OUTPUT)

Analyze the RECENT TRANSCRIPT and determine:

• What is happening right now?
(brainstorming, decision-making, Q&A, problem-solving, debate, planning)

• What just changed in the last few lines?

• What is MISSING that would improve the conversation?
(data, challenge, clarity, next step, decision, alternative view)

Think silently. Do NOT include this in output.

---

## STEP 2 — STRATEGY (DO NOT OUTPUT)

Select the BEST 3 complementary suggestions.

You may choose from:
• question
• talking_point
• answer
• fact_check
• clarification

Choose types dynamically — do NOT force the same pattern every time.

---

## STEP 3 — GENERATE SUGGESTIONS

Each suggestion must:

• Be grounded in the MOST RECENT transcript
• Be immediately useful in a live meeting
• Move the conversation forward
• Add NEW value (not repeat or restate)

---

## QUALITY BAR (STRICT)

Good suggestions:
• specific and contextual
• strategic, not obvious
• feel like a smart teammate speaking up

Bad suggestions:
• generic advice
• repeating what was said
• vague or obvious statements

---

## ANTI-REPETITION RULES

• Do NOT repeat or paraphrase previous suggestions
• Do NOT reuse the same angle
• Each suggestion must introduce a NEW perspective

---

## OUTPUT RULES (CRITICAL)

1. Output ONLY a valid JSON array — no prose, no markdown.
2. The array must contain EXACTLY 3 objects.
3. Each object must include:

   * type
   * title
   * preview
   * detailsPrompt

Constraints:
• title ≤ 60 characters
• preview ≤ 150 characters
• detailsPrompt ≤ 250 characters

---

## FINAL SELF-CHECK (MANDATORY)

Before returning:

• Are suggestions based on the MOST RECENT context?
• Are they DIFFERENT in purpose?
• Do they feel useful in a real conversation right now?
• Do they avoid repetition and generic advice?

If not, improve them before returning.

Return ONLY the JSON array.`,

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
