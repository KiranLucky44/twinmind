import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SUMMARIZE_MODEL = 'llama-3.1-8b-instant'; // Use tiny model for speed and low cost

interface RequestBody {
  apiKey?: string;
  previousSummary: string;
  newTranscript: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    
    const apiKey = request.headers.get('x-groq-api-key') || body.apiKey;
    if (!apiKey) {
      return NextResponse.json({ error: 'Groq API key required' }, { status: 401 });
    }

    const { previousSummary, newTranscript } = body;
    if (!Array.isArray(newTranscript) || newTranscript.length === 0) {
      return NextResponse.json({ summary: previousSummary }); // Nothing new to summarize
    }

    const systemPrompt = `You are an expert meeting summarizer. 
Your task is to merge the "Previous Memory" with the "New Transcript" into a single, cohesive, highly-dense summary.
- Keep the summary under 3 paragraphs.
- Focus strictly on facts, agreed points, raised questions, and context.
- Output ONLY the new summary text. No preamble, no markdown formatting.`;

    const userPrompt = `
PREVIOUS MEMORY:
${previousSummary || '(No previous memory. This is the start of the meeting.)'}

NEW TRANSCRIPT SEGMENT:
${newTranscript.map((t) => `- ${t}`).join('\n')}

Generate the updated memory summary now.`;

    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SUMMARIZE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2, // Low temp for strictly factual merging
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || response.statusText);
    }

    const data = await response.json();
    const newSummary = data.choices?.[0]?.message?.content?.trim() ?? previousSummary;

    return NextResponse.json({ summary: newSummary });
  } catch (error) {
    console.error('[/api/summarize failed]', error);
    return NextResponse.json(
      { error: 'Failed to generate rolling summary.' },
      { status: 500 }
    );
  }
}
