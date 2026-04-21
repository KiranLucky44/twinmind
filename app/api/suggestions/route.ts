import { NextRequest, NextResponse } from 'next/server';
import type { SuggestionType } from '../../context/AppContext';
import { formatTranscriptForAI, SHARED_AI_GROUNDING } from '../../lib/ai-utils';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

/** How many recent transcript lines to include in the prompt. */
const MAX_TRANSCRIPT_LINES = 30;

// ---------------------------------------------------------------------------
// Types (API boundary — intentionally separate from the UI model)
// ---------------------------------------------------------------------------

/** Shape returned by the LLM (before we attach id / icon). */
interface RawSuggestion {
  type: SuggestionType;
  title: string;
  preview: string;
  detailsPrompt: string;
}

interface RequestBody {
  /** Raw text lines from the live transcript (newest last). */
  transcript: string[];
  /** Titles of previously shown suggestions — used to avoid repetition. */
  previousTitles?: string[];
  /** Custom system prompt override from user settings. */
  systemPrompt?: string;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `\
You are an expert real-time conversation assistant embedded in a live-transcription interface.

Your task: analyse the most recent portion of a live conversation transcript and produce **exactly 3** context-aware suggestions that help the participants at this precise moment in time.

Each suggestion must have one of these types (choose whichever fits best):
  • question        – A follow-up question worth asking right now
  • talking_point   – An important topic worth exploring further
  • answer          – A concise answer or explanation to something raised
  • fact_check      – A claim that should be verified or corrected
  • clarification   – Something ambiguous that needs to be clarified

Output rules (CRITICAL):
1. Output ONLY a valid JSON array — no prose, no markdown fences, no extra text whatsoever.
2. The array must contain EXACTLY 3 objects.
3. Each object must have all four fields: type, title, preview, detailsPrompt.
4. type      — one of the five types listed above.
5. title     — concise and specific, ≤ 60 characters, no generic phrasing.
6. preview   — 1-2 sentences that are immediately useful even if never clicked, ≤ 150 characters.
7. detailsPrompt — a complete, self-contained prompt a user could send to a chat AI to get a thorough answer, ≤ 250 characters.

${SHARED_AI_GROUNDING}

Example output (DO NOT copy — generate based on the actual transcript):
[
  {"type":"question","title":"Clarify the rollout timeline","preview":"The team mentioned Q3 but the budget isn't locked yet — is the timeline realistic?","detailsPrompt":"Given the Q3 deadline and unconfirmed budget, what specific risks could delay the rollout and how should they be mitigated?"},
  {"type":"fact_check","title":"Verify the 40% churn figure","preview":"The 40% churn statistic cited lacks a source — industry average is closer to 25%.","detailsPrompt":"What is the actual industry average customer churn rate for B2B SaaS, and how does 40% compare?"},
  {"type":"talking_point","title":"Team capacity gap","preview":"Three engineers are on PTO during the proposed crunch window — capacity hasn't been addressed.","detailsPrompt":"How should a team plan for a product launch when 30% of engineers are unavailable during the critical phase?"}
]`;

function buildUserMessage(
  transcript: string[],
  previousTitles: string[],
): string {
  const recentLines = formatTranscriptForAI(transcript.slice(-MAX_TRANSCRIPT_LINES));

  const avoidSection =
    previousTitles.length > 0
      ? `\nPreviously shown suggestions (DO NOT repeat or closely paraphrase):\n${previousTitles.map((t) => `- ${t}`).join('\n')}\n`
      : '';

  return `Recent transcript (newest at the bottom):\n${recentLines}${avoidSection}\nGenerate exactly 3 suggestions now.`;
}

// ---------------------------------------------------------------------------
// Groq call
// ---------------------------------------------------------------------------

async function fetchSuggestions(
  transcript: string[],
  previousTitles: string[],
  apiKey: string,
  systemPrompt: string,
): Promise<RawSuggestion[]> {
  const response = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildUserMessage(transcript, previousTitles) },
      ],
      temperature: 0.4, // Lower temperature for more consistent JSON structure
      max_tokens: 1024,
      // Force JSON output — prevents the model from wrapping in markdown.
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message: string =
      payload?.error?.message ?? payload?.message ?? response.statusText;
    const err = new Error(message) as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const raw: string = data.choices?.[0]?.message?.content ?? '';

  // The model may wrap the array in a top-level object key when
  // response_format is json_object. Handle both shapes:
  //   [{ ... }]                      ← bare array
  //   { "suggestions": [{ ... }] }   ← wrapped object
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Model returned non-JSON content: ${raw.slice(0, 200)}`);
  }

  const suggestions: unknown = Array.isArray(parsed)
    ? parsed
    : (parsed as Record<string, unknown>).suggestions ??
      Object.values(parsed as Record<string, unknown>).find(Array.isArray);

  if (!Array.isArray(suggestions)) {
    throw new Error(`Could not locate suggestions array in model output.`);
  }

  return suggestions as RawSuggestion[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set<string>([
  'question',
  'talking_point',
  'answer',
  'fact_check',
  'clarification',
]);

function validate(suggestions: RawSuggestion[]): string | null {
  if (suggestions.length !== 3) {
    return `Expected exactly 3 suggestions, got ${suggestions.length}.`;
  }
  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    if (!VALID_TYPES.has(s.type)) return `Suggestion ${i}: invalid type "${s.type}".`;
    if (typeof s.title !== 'string' || !s.title.trim()) return `Suggestion ${i}: missing title.`;
    if (typeof s.preview !== 'string' || !s.preview.trim()) return `Suggestion ${i}: missing preview.`;
    if (typeof s.detailsPrompt !== 'string' || !s.detailsPrompt.trim()) return `Suggestion ${i}: missing detailsPrompt.`;
  }
  return null;
}

// Map suggestion type → icon for the UI layer.
function iconFor(type: SuggestionType): 'lightbulb' | 'star' | 'zap' {
  switch (type) {
    case 'question':      return 'lightbulb';
    case 'talking_point': return 'star';
    case 'answer':        return 'zap';
    case 'fact_check':    return 'zap';
    case 'clarification': return 'lightbulb';
  }
}

// ---------------------------------------------------------------------------
// POST /api/suggestions
//
// Body (JSON): { transcript: string[], previousTitles?: string[] }
// Headers:     x-groq-api-key: <key>   OR   body.apiKey: <key>
//
// Returns: { suggestions: Suggestion[] }  — exactly 3 items
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // ── 1. Parse body ───────────────────────────────────────────────────────
    let body: RequestBody & { apiKey?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body must be valid JSON.' },
        { status: 400 }
      );
    }

    // ── 2. Resolve API key ──────────────────────────────────────────────────
    const apiKey =
      request.headers.get('x-groq-api-key') || body.apiKey;

    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json(
        {
          error:
            'Groq API key is required. ' +
            'Pass it via the x-groq-api-key header or an apiKey field in the request body.',
        },
        { status: 401 }
      );
    }

    // ── 3. Validate inputs ──────────────────────────────────────────────────
    const { transcript, previousTitles = [], systemPrompt } = body;

    if (!Array.isArray(transcript) || transcript.length === 0) {
      return NextResponse.json(
        { error: 'transcript must be a non-empty array of strings.' },
        { status: 400 }
      );
    }

    // ── 4. Call Groq with retries ───────────────────────────────────────────
    let raw: RawSuggestion[] = [];
    let validationError: string | null = null;
    let attempts = 0;
    const maxRetries = 2;

    while (attempts < maxRetries) {
      attempts++;
      try {
        raw = await fetchSuggestions(
          transcript,
          previousTitles,
          apiKey.trim(),
          systemPrompt || SYSTEM_PROMPT,
        );

        validationError = validate(raw);
        if (!validationError) break; // Success!

        console.warn(`[Suggestions] Attempt ${attempts} failed validation: ${validationError}`);
      } catch (err) {
        // If it's an API error (401, 429), don't retry, just throw
        if ((err as any).status) throw err;
        
        validationError = err instanceof Error ? err.message : 'Unknown error';
        console.warn(`[Suggestions] Attempt ${attempts} hit error: ${validationError}`);
      }
    }

    // ── 5. Check if all attempts failed ─────────────────────────────────────
    if (validationError) {
      console.error('[/api/suggestions] all retries failed:', validationError);
      return NextResponse.json(
        { error: `Model output invalid after ${maxRetries} attempts: ${validationError}` },
        { status: 500 }
      );
    }

    // ── 6. Attach id + icon and return ──────────────────────────────────────
    const suggestions = raw.map((s, i) => ({
      id: `${Date.now()}-${i}`,
      type: s.type,
      title: s.title.trim(),
      preview: s.preview.trim(),
      detailsPrompt: s.detailsPrompt.trim(),
      icon: iconFor(s.type),
    }));

    return NextResponse.json({ suggestions });

  } catch (error) {
    console.error('[/api/suggestions]', error);

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    const upstreamStatus = (error as { status?: number }).status;

    if (upstreamStatus === 401) {
      return NextResponse.json(
        { error: 'Invalid or expired Groq API key.' },
        { status: 401 }
      );
    }
    if (upstreamStatus === 429) {
      return NextResponse.json(
        { error: 'Groq rate limit reached. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: `Suggestions failed: ${message}` },
      { status: 500 }
    );
  }
}
