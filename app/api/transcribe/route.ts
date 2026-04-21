import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — Groq hard limit

// ---------------------------------------------------------------------------
// Groq transcription helper
// ---------------------------------------------------------------------------

async function transcribeWithGroq(audio: File, apiKey: string): Promise<string> {
  const body = new FormData();
  body.append('file', audio);
  body.append('model', 'whisper-large-v3');
  body.append('response_format', 'json');

  const maxAttempts = 2;
  let attempts = 0;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message: string =
          payload?.error?.message ??
          payload?.message ??
          response.statusText;

        // Preserve the upstream HTTP status so the POST handler can relay it.
        const err = new Error(message) as Error & { status: number };
        err.status = response.status;
        throw err;
      }

      const result = await response.json();
      return (result.text as string | undefined) ?? '';
    } catch (err: any) {
      lastError = err;
      // Don't retry on client errors (4xx) unless it's a rate limit (429)
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }
      
      console.warn(`[Transcription] Attempt ${attempts} failed: ${err.message}`);
      if (attempts >= maxAttempts) throw lastError;
      
      // Small delay before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  throw lastError || new Error('Transcription failed after multiple attempts');
}

// ---------------------------------------------------------------------------
// POST /api/transcribe
//
// Accepts: multipart/form-data
//   audio   — required  File | Blob
//   apiKey  — optional  string  (alternative to x-groq-api-key header)
//
// Returns: { text: string }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // ── 1. Parse the multipart body ────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Request must be multipart/form-data.' },
        { status: 400 }
      );
    }

    // ── 2. Resolve the API key (header takes precedence over body field) ───
    const apiKey =
      request.headers.get('x-groq-api-key') ||
      (formData.get('apiKey') as string | null);

    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json(
        {
          error:
            'Groq API key is required. ' +
            'Pass it via the x-groq-api-key header or an apiKey field in the form body.',
        },
        { status: 401 }
      );
    }

    // ── 3. Validate the audio file ─────────────────────────────────────────
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided. Include it as the "audio" field.' },
        { status: 400 }
      );
    }

    if (audioFile.size === 0) {
      return NextResponse.json(
        { error: 'Audio file is empty.' },
        { status: 400 }
      );
    }

    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Audio file exceeds the 25 MB limit.' },
        { status: 413 }
      );
    }

    // ── 4. Transcribe ──────────────────────────────────────────────────────
    try {
      const text = await transcribeWithGroq(audioFile, apiKey.trim());
      return NextResponse.json({ text });
    } catch (err) {
      console.error('Groq Transcription Error:', err);
      throw err; // Re-throw to be caught by the outer catch block
    }

  } catch (error) {
    console.error('[/api/transcribe] Full Error:', error);

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    const upstreamStatus = (error as { status?: number }).status;

    // Relay Groq HTTP status codes where they make sense for the caller.
    if (upstreamStatus === 401) {
      return NextResponse.json(
        { error: 'Invalid Groq API key.' },
        { status: 401 }
      );
    }

    if (upstreamStatus === 429) {
      return NextResponse.json(
        { error: 'Groq rate limit reached.' },
        { status: 429 }
      );
    }

    if (upstreamStatus === 413) {
      return NextResponse.json(
        { error: 'Audio file too large.' },
        { status: 413 }
      );
    }

    // Default 500
    return NextResponse.json(
      { error: `Transcription error: ${message}` },
      { status: 500 }
    );
  }
}
