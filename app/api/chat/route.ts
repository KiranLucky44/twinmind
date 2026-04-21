import { NextRequest, NextResponse } from 'next/server';
import { formatTranscriptForAI, SHARED_AI_GROUNDING } from '../../lib/ai-utils';

export const runtime = 'edge';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_CASCADE = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface RequestBody {
  /** Full chat history (user + assistant turns, in order). */
  messages: ChatMessage[];
  /** Raw transcript lines — injected as system context. */
  transcript: string[];
  /** Custom system prompt override from user settings. */
  systemPrompt?: string;
  /** Extra instructions to append when answering suggestion card clicks. */
  detailedAnswerPrompt?: string;
  /** Optional key override (falls back to header). */
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(transcript: string[], basePrompt: string): string {
  const hasTranscript = transcript.length > 0;
  const transcriptSection = hasTranscript
    ? `\n\n## Live Conversation Transcript\nThe following is a real-time transcript of the ongoing conversation. Use it as primary context when answering:\n\n${formatTranscriptForAI(transcript)}`
    : '';
  return `${basePrompt}${transcriptSection}`;
}

// ---------------------------------------------------------------------------
// POST /api/chat
//
// Accepts: JSON { messages, transcript, apiKey? }
// Headers: x-groq-api-key   (takes precedence over body.apiKey)
//
// Returns: text/event-stream  — streaming SSE
//   Each event: data: <token>\n\n
//   Final event: data: [DONE]\n\n
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  // ── 2. API key ─────────────────────────────────────────────────────────────
  const apiKey = (request.headers.get('x-groq-api-key') || body.apiKey || '').trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Groq API key required. Provide via x-groq-api-key header or apiKey in body.' },
      { status: 401 }
    );
  }

  // ── 3. Validate messages ───────────────────────────────────────────────────
  const { messages = [], transcript = [], systemPrompt, detailedAnswerPrompt } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required and must not be empty.' }, { status: 400 });
  }

  // If a detailedAnswerPrompt was sent, append it to the last user message
  const enrichedMessages = detailedAnswerPrompt
    ? messages.map((m, i) =>
        i === messages.length - 1 && m.role === 'user'
          ? { ...m, content: `${m.content}\n\n[Instructions: ${detailedAnswerPrompt}]` }
          : m
      )
    : messages;

  const basePrompt = systemPrompt || `You are an expert AI assistant embedded inside TwinMind, a live-transcription intelligence platform.
Your role is to give users fast, accurate, well-formatted answers grounded in the live transcript.

## Response rules
- **Be precise.** Answer the question directly — no filler preamble.
- **Be concise.** Aim for ≤ 400 words unless depth is genuinely required.
- **Format clearly.** Use **bold** for key terms and bullet lists for clarity.
- **Ground in the transcript.** Always cite specifically using brackets, e.g., "As mentioned in [3]…". Do not use line numbers that weren't provided.
- **No hallucinations.** If the transcript doesn't cover it, say "The transcript doesn't mention this". Never invent facts.
- **Continuous context.** Reference earlier turns naturally when relevant.

${SHARED_AI_GROUNDING}`;

  // ── 4. Build Groq payload ──────────────────────────────────────────────────
  const systemMessage: ChatMessage = {
    role: 'system',
    content: buildSystemPrompt(transcript, basePrompt),
  };

  const groqPayload: any = {
    model: MODEL_CASCADE[0],
    stream: true,
    temperature: 0.3,   // Low temperature = faster, more deterministic, less hallucination
    top_p: 0.9,         // Tighten token distribution without fully greedy decoding
    max_tokens: 1024,   // Sufficient for a well-formed chat response; keep latency low
    messages: [systemMessage, ...enrichedMessages],
  };

  // ── 5. Call Groq (streaming) with Retries & Cascade ──────────────────────
  let groqResponse: Response | null = null;
  let modelIndex = 0;
  let lastErrorMsg = '';
  let lastStatus = 500;

  while (modelIndex < MODEL_CASCADE.length) {
    const currentModel = MODEL_CASCADE[modelIndex];
    // Update payload with current model in cascade
    groqPayload.model = currentModel;
    
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      try {
        groqResponse = await fetch(GROQ_CHAT_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(groqPayload),
        });
        
        if (groqResponse.ok) break; // Break attempt loop
        
        const err = await groqResponse.clone().json().catch(() => ({}));
        lastErrorMsg = err?.error?.message ?? err?.message ?? groqResponse.statusText;
        lastStatus = groqResponse.status;
        
        // Break out of attempt loop instantly if we hit rate limits (cascade triggers)
        if (lastStatus === 429 || lastStatus === 503) {
          console.warn(`[Chat ${currentModel}] Overloaded (${lastStatus}). Cascading...`);
          break;
        }
        
      } catch (err) {
        lastErrorMsg = err instanceof Error ? err.message : 'Network error';
        lastStatus = 502;
      }
    }
    
    if (groqResponse?.ok) break; // Break out of cascade wrapper
    modelIndex++;
  }

  if (!groqResponse?.ok) {
    return NextResponse.json({ error: lastErrorMsg || 'All models failed.' }, { status: lastStatus });
  }

  // ── 6. Pipe Groq SSE → client SSE ─────────────────────────────────────────
  // We parse Groq's `data: {...}` lines and re-emit just the token text,
  // so the client only needs to do: `data: <token>\n\n` or `data: [DONE]\n\n`.
  const groqBody = groqResponse.body;
  if (!groqBody) {
    return NextResponse.json({ error: 'Groq returned an empty response body.' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = groqBody.getReader();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last (possibly incomplete) line in the buffer
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;

            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              return;
            }

            try {
              const json = JSON.parse(payload);
              const token: string = json.choices?.[0]?.delta?.content ?? '';
              if (token) {
                // JSON-encode the token so embedded newlines/special chars
                // don't corrupt the SSE frame (data: <text>\n\n protocol).
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(token)}\n\n`)
                );
              }
            } catch {
              // Malformed JSON chunk — skip silently
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(encoder.encode(`data: [ERROR] ${msg}\n\n`));
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering if deployed
    },
  });
}
