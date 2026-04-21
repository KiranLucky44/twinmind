# TwinMind — AI Conversation Intelligence

> Real-time transcription, context-aware suggestions, and an AI chat assistant — all running from a single Next.js app with no backend infrastructure.

---

## Overview

TwinMind is a conversation intelligence platform that listens to live audio, transcribes it using Groq's Whisper model, and continuously surfaces AI-generated suggestions relevant to the current moment in the conversation. Users can click any suggestion to get a detailed answer, or open a free-form chat grounded in the full transcript context.

**Key capabilities:**

| Feature | Details |
|---|---|
| 🎙️ Live transcription | Browser MediaRecorder → Groq Whisper Large V3 |
| 💡 Real-time suggestions | 3 context-aware cards refreshed every 30 s via GPT-OSS 120B |
| 💬 Streaming AI chat | SSE-streamed responses, token-by-token rendering |
| ⚙️ Configurable | All prompts, context windows, and the API key editable in Settings |
| 📥 Export | One-click JSON export with timestamps for every data type |

---

## Architecture

### High-level flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (React)                         │
│                                                                 │
│  ┌────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │ Transcript │   │  Suggestions     │   │   Chat Panel     │  │
│  │  Panel     │   │  Panel           │   │                  │  │
│  │            │   │                  │   │  StreamingBubble │  │
│  │ MicButton  │   │  SuggestionCards │   │  TypingCursor    │  │
│  │ AudioChunks│   │  SkeletonLoaders │   │  DotLoader       │  │
│  └─────┬──────┘   └────────┬─────────┘   └───────┬──────────┘  │
│        │                   │                     │             │
│        │         ┌─────────┴──────────────────────┤            │
│        │         │       AppContext (React)        │            │
│        │         │  transcript · suggestionBatches │            │
│        │         │  chatMessages · settings        │            │
│        │         └─────────┬──────────────────────┘            │
└────────┼─────────────────── ┼ ────────────────────────────────--┘
         │                   │
         ▼                   ▼
┌────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│ POST           │  │ POST            │  │ POST                │
│ /api/transcribe│  │ /api/suggestions│  │ /api/chat           │
│                │  │                 │  │                     │
│ multipart/form │  │ JSON body       │  │ JSON body           │
│ → Groq Whisper │  │ → Groq 120B     │  │ → Groq 120B (SSE)   │
└────────────────┘  └─────────────────┘  └─────────────────────┘
         │                   │                     │
         └───────────────────┴─────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Groq Cloud    │
                    │                 │
                    │ whisper-large-v3│
                    │ gpt-oss-120b    │
                    └─────────────────┘
```

### Directory structure

```
app/
├── api/
│   ├── transcribe/route.ts   # Whisper transcription endpoint
│   ├── suggestions/route.ts  # Suggestion generation endpoint
│   └── chat/route.ts         # Streaming chat endpoint (SSE)
│
├── components/
│   ├── TranscriptPanel.tsx   # Mic button, live scroll, status
│   ├── SuggestionsPanel.tsx  # Cards, skeletons, countdown ring
│   ├── ChatPanel.tsx         # Streaming messages, markdown-lite render
│   ├── TopBar.tsx            # Export button, API key badge
│   └── SettingsPanel.tsx     # Slide-in drawer, all settings
│
├── context/
│   └── AppContext.tsx         # Global state (transcript, batches, chat, settings)
│
├── hooks/
│   ├── useAudioRecorder.ts   # MediaRecorder, chunk slicing, Blob handling
│   ├── useSuggestions.ts     # 30 s auto-refresh, countdown timer, fetch logic
│   ├── useSettings.ts        # localStorage persistence, typed defaults
│   └── useExport.ts          # JSON document builder + browser download
│
├── globals.css               # Design tokens, scrollbars, animations
├── layout.tsx                # Root layout with AppProvider + TopBar
└── page.tsx                  # Three-column panel layout
```

### Data flow — transcription

```
1. useAudioRecorder slices mic audio into 30 s Blob chunks
2. Each chunk is sent as multipart/form-data to /api/transcribe
3. /api/transcribe forwards it to Groq whisper-large-v3
4. Transcribed text is appended to AppContext.transcript[]
5. useSuggestions detects new lines → triggers a refresh if threshold met
```

### Data flow — suggestions

```
1. useSuggestions fires every 30 s (configurable) or on manual refresh
2. Sends the last N transcript lines + previousTitles (dedup guard) to /api/suggestions
3. /api/suggestions calls Groq gpt-oss-120b with response_format: json_object
4. Returns exactly 3 validated suggestions (type · title · preview · detailsPrompt)
5. addSuggestionBatch() prepends the new batch in AppContext
6. SuggestionsPanel renders it above previous batches without layout jump
```

### Data flow — chat (streaming)

```
1. User types a message OR clicks a suggestion card
2. ChatPanel seeds an empty assistant bubble, then POST /api/chat
3. /api/chat builds [system + transcript] + full message history → Groq 120B (stream: true)
4. Groq returns SSE: data: {choices:[{delta:{content:"..."}}]}
5. Route parses deltas, JSON-encodes each token, re-emits: data: "<token>"\n\n
6. ChatPanel reads chunks via ReadableStream.getReader(), JSON.parses each token
7. appendToLastMessage(token) patches the assistant bubble in-place → no jump
```

---

## Prompt Engineering Strategy

### Suggestions prompt

The suggestions system prompt is designed around four principles:

**1. Strict output contract**
The model is told to emit *only* a JSON array — no prose, no markdown fences. The route uses `response_format: { type: 'json_object' }` to enforce this at the API level, and the route validates the output shape (exactly 3 items, all required fields present, type must be one of 5 known values) before returning.

**2. Type taxonomy**
Five suggestion types are defined, each targeting a different need:

| Type | Intent |
|---|---|
| `question` | What should be asked right now |
| `talking_point` | Topic worth exploring further |
| `answer` | Direct answer to something raised |
| `fact_check` | Claim that should be verified |
| `clarification` | Something ambiguous that needs unpacking |

The prompt instructs the model to *vary types intelligently* — three cards of the same type feel redundant.

**3. Recency bias**
The transcript is sent newest-last with `[N]` index markers. The prompt explicitly instructs: *"Ground suggestions in the MOST RECENT content — don't surface stale topics."* Only the last `suggestionTranscriptLines` (default 30) are sent.

**4. Anti-repetition**
All previously shown suggestion titles are sent as a `previousTitles` block. The prompt says: *"Never repeat or closely paraphrase any previously shown suggestion."* This prevents the model from re-surfacing the same insight across refresh cycles.

**Preview quality rule**
Previews must be *immediately useful even if not clicked* — not "click to learn more" filler. This is a hard constraint in the prompt to ensure every card delivers value at a glance.

### Chat prompt

The chat system prompt is structured around three goals:

**Precision over verbosity** — `temperature: 0.3`, `top_p: 0.9`, `max_tokens: 1024`. Lower temperature produces more deterministic, factually grounded responses with lower latency.

**Anti-hallucination explicit fallbacks** — instead of vague "never fabricate", the prompt provides literal safe scripts:
- *"The transcript doesn't mention this"*
- *"I'm not certain — here's what I do know: …"*

This gives the model a concrete path that isn't guessing.

**Transcript citation** — the model is instructed to reference transcript line numbers (`[3]`) when making assertions grounded in the transcript. This makes responses verifiable and builds trust.

**Detailed answer mode** — when a suggestion card is clicked, `detailedAnswerPrompt` is appended inline to the last user message as `[Instructions: ...]`. This avoids sending a separate system turn and keeps the message structure clean.

---

## Tradeoffs

| Decision | Tradeoff | Rationale |
|---|---|---|
| **Client-side API key** | Key stored in browser localStorage, not server env | Avoids requiring any server configuration for demo/assignment; user controls their own key |
| **SSE streaming over WebSocket** | One-directional, slightly higher per-request overhead | Simpler to implement in Next.js App Router with no additional WS server |
| **30 s auto-refresh** | Suggestions may lag slightly behind conversation | Balances API cost with responsiveness; configurable down to 10 s in Settings |
| **JSON-encoded SSE tokens** | Tiny overhead per token | Required to safely carry `\n` characters in tokens without breaking SSE frame parsing |
| **`appendToLastMessage` patch** | Slightly more complex than appending new messages | Eliminates layout jump during streaming — the DOM node never changes, only its text content |
| **No database** | Session data lost on page refresh | Entirely in-memory state is appropriate for a real-time session tool; export covers persistence |
| **Validate suggestions server-side** | Extra latency if model output is invalid | Prevents malformed data from reaching the UI; model retry is not implemented (fails fast) |
| **`response_format: json_object`** | Groq only guarantees JSON, not the exact schema | Paired with server-side validation + typed parsing to catch bad outputs before they reach the UI |
| **Tailwind CSS v4** | Less documentation than v3 | Significantly fewer class collisions and smaller CSS bundle than v3 |

---

## Setup Instructions

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | v18+ (tested on v24.5.0) |
| npm | v9+ |
| Groq API key | Free at [console.groq.com](https://console.groq.com) |

The app has **zero other infrastructure dependencies** — no Docker, no database, no Redis.

### 1. Clone and install

```bash
git clone <repository-url>
cd twinmind-assignment
npm install
```

### 2. Environment variables

No `.env` file is required. The Groq API key is entered at runtime through the Settings panel in the UI — it is stored in `localStorage` and passed via the `x-groq-api-key` request header.

> **Why no `.env`?**  
> The assignment requires the key to be user-provided at runtime so reviewers can supply their own key without modifying any files.

---

## Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**First-time setup (30 seconds):**

1. Click the **⚙️ settings icon** (top-right) or the amber **"Add API key"** badge
2. Paste your Groq API key (`gsk_...`)
3. Click **Save settings**
4. Press **Space** or click the blue mic button to start recording

**Keyboard shortcut:** `Space` toggles recording from anywhere in the app (except when typing in an input).

### What you'll see

```
┌────────────────┬──────────────────┬──────────────────────┐
│  Transcript    │   Suggestions    │       Chat           │
│                │                  │                      │
│  Live audio    │  3 AI cards      │  Type or click a     │
│  transcription │  refresh every   │  card for detailed   │
│  with segment  │  30 seconds      │  streaming response  │
│  timestamps    │                  │                      │
└────────────────┴──────────────────┴──────────────────────┘
```

---

## Deployment

### Vercel (recommended — zero config)

```bash
npm install -g vercel
vercel
```

Vercel automatically detects Next.js and configures build settings. No environment variables need to be set — the API key is supplied by the user at runtime.

**One-click deploy:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

### Other platforms (Docker / Railway / Render)

```bash
# Build production bundle
npm run build

# Start production server (port 3000)
npm run start
```

**Dockerfile (minimal):**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

> Enable Next.js standalone output by adding `output: 'standalone'` to `next.config.ts` for the Docker build.

### Important deployment notes

- **No server-side secrets required** — the app has no `.env` dependencies
- **Microphone access requires HTTPS** — browsers block `getUserMedia` on plain HTTP. Vercel provides HTTPS automatically; for custom domains ensure TLS is configured
- **Groq rate limits** — the free tier allows ~30 requests/minute. Set `suggestionsRefreshSeconds` to 60+ in Settings if you hit `429` errors

---

## API Reference

### `POST /api/transcribe`

Transcribes an audio blob using Groq Whisper Large V3.

| | |
|---|---|
| **Content-Type** | `multipart/form-data` |
| **Auth** | `x-groq-api-key: gsk_...` header OR `apiKey` form field |
| **Body** | `audio` (Blob/File) |
| **Returns** | `{ text: string }` — empty string for silence, never an error |

### `POST /api/suggestions`

Generates exactly 3 context-aware suggestions from the live transcript.

| | |
|---|---|
| **Content-Type** | `application/json` |
| **Auth** | `x-groq-api-key: gsk_...` header |
| **Body** | `{ transcript: string[], previousTitles?: string[], systemPrompt?: string }` |
| **Returns** | `{ suggestions: Suggestion[] }` — always 3 items |

### `POST /api/chat`

Streams a detailed AI response grounded in transcript context.

| | |
|---|---|
| **Content-Type** | `application/json` |
| **Auth** | `x-groq-api-key: gsk_...` header |
| **Body** | `{ messages: ChatMessage[], transcript: string[], systemPrompt?: string, detailedAnswerPrompt?: string }` |
| **Returns** | `text/event-stream` — `data: "<json-encoded-token>"\n\n` per token, `data: [DONE]\n\n` at end |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router) |
| Language | TypeScript 5 |
| UI | React 19 |
| Styling | Tailwind CSS v4 |
| Font | Geist Sans / Geist Mono (Vercel) |
| AI / Transcription | Groq Cloud — `whisper-large-v3`, `openai/gpt-oss-120b` |
| Streaming | Native `ReadableStream` + SSE (no library) |
| State | React Context + `useReducer`-style hooks |
| Persistence | `localStorage` (settings only) |
| Build | Turbopack (Next.js dev), SWC (production) |
