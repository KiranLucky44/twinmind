'use client';

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useLayoutEffect,
  memo,
} from 'react';
import { useApp, ChatMessage } from '../context/AppContext';

// ── Markdown-lite renderer ───────────────────────────────────────────────────
// Handles **bold**, `code`, and line breaks without pulling in a full library.
function renderContent(text: string) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, li) => {
    // Split on **bold** and `code` markers
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <div key={`line-${li}`} className="min-h-[1.5em]">
        {parts.map((part, pi) => {
          const key = `part-${li}-${pi}`;
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={key} className="font-bold">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code
                key={key}
                className="px-1 py-0.5 rounded bg-[#0b1220] text-[#e5e7eb] border border-[#1f2937] font-mono text-[10px]"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          return <span key={key}>{part}</span>;
        })}
      </div>
    );
  });
}

// ── Typing cursor ────────────────────────────────────────────────────────────
function TypingCursor() {
  return (
    <span
      className="inline-block w-0.5 h-3.5 bg-blue-500 ml-0.5 align-middle animate-cursor"
      aria-hidden
    />
  );
}

// ── Dot loader (before first token arrives) ──────────────────────────────────
function DotLoader() {
  return (
    <div className="flex justify-start">
      <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-bl-sm max-w-xs">
        <div className="flex gap-1.5 items-center">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ role }: { role: 'user' | 'assistant' }) {
  if (role === 'user') {
    return (
      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shrink-0">
      <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 12.094A5.973 5.973 0 004 15v1H1v-1a3 3 0 013.75-2.906z" />
      </svg>
    </div>
  );
}

// ── Chat Message Item (Memoized) ──────────────────────────────────────────────
const ChatMessageItem = memo(({ 
  message, 
  isStreaming, 
  isLast 
}: { 
  message: ChatMessage; 
  isStreaming: boolean; 
  isLast: boolean 
}) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex flex-col gap-2 ${isLast && !isUser ? '' : 'animate-fade-up'}`}>
      <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex flex-col gap-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`px-4 py-3 rounded-xl text-[13px] leading-relaxed shadow-sm ${
            isUser ? 'bg-[#3b82f6] text-white' : 'bg-[#1a2333]/60 text-[#e5e7eb] border border-[#1f2937]'
          }`}>
            {isUser ? message.content : (
              <>
                {renderContent(message.content)}
                {isLast && isStreaming && <TypingCursor />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ChatMessageItem.displayName = 'ChatMessageItem';

// ── Main panel ───────────────────────────────────────────────────────────────

const ChatPanel = () => {
  const {
    chatMessages,
    transcript,
    addChatMessage,
    appendToLastMessage,
    settings,
    meetingSummary,
  } = useApp();

  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showDots, setShowDots] = useState(false); // true only before first token

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Track whether user has manually scrolled up (don't hijack their scroll)
  const userScrolledUp = useRef(false);
  const prevScrollTop = useRef(0);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  // Instant, synchronous scroll for streaming performance.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrolledUp.current) return;
    
    // We direct assign scrollTop here. Since we've disabled CSS smooth-scroll,
    // this will perfectly "stick" the bottom of the content to the viewport
    // as it grows, without any visual vibration or lagging.
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, isStreaming]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      if (el.scrollTop < prevScrollTop.current && !atBottom) {
        userScrolledUp.current = true;
      } else if (atBottom) {
        userScrolledUp.current = false;
      }
      prevScrollTop.current = el.scrollTop;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Streaming send ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isStreaming) return;

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Build full message thread BEFORE any state mutations so we don't
      // capture stale intermediate state. Manually append the new user turn.
      const historyMessages = [
        ...chatMessages.filter((m) => m.content !== ''), // exclude seeded empty bubbles
        { role: 'user' as const, content: userText },
      ].map(({ role, content }) => ({ role, content }));

      // 1. We no longer call addChatMessage('user') here because 
      // the message has already been added to the state to trigger this flow.

      // 2. Seed empty assistant bubble — streaming will fill it token by token
      addChatMessage('assistant', '');
      userScrolledUp.current = false;

      setIsStreaming(true);
      setShowDots(true);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-groq-api-key': settings.groqApiKey,
          },
          body: JSON.stringify({
            messages: historyMessages,
            transcript: transcript.map((s) => s.text).slice(-settings.chatTranscriptLines),
            systemPrompt: meetingSummary
              ? `${settings.chatPrompt}\n\nBACKGROUND MEMORY (Use this to understand context outside the immediate transcript):\n${meetingSummary}`
              : settings.chatPrompt,
            detailedAnswerPrompt: settings.detailedAnswerPrompt || undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${response.status}`);
        }

        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let firstToken = true;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let combinedTokens = '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') break;
            if (payload.startsWith('[ERROR]')) {
              throw new Error(payload.slice(7).trim());
            }

            // Route JSON-encodes tokens to carry embedded newlines safely.
            let token = '';
            try {
              // Attempt to parse properly formatted JSON payload
              token = JSON.parse(payload) as string;
            } catch {
              // Resilience: If payload is [DONE] or a non-JSON fragment, skip or fallback
              if (payload === '[DONE]') break;
              token = payload; 
            }

            if (firstToken) {
              setShowDots(false);
              firstToken = false;
            }
            if (token) combinedTokens += token;
          }
          
          if (combinedTokens) {
             appendToLastMessage(combinedTokens);
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        // Replace the empty assistant bubble with the error
        appendToLastMessage(`⚠️ ${msg}`);
      } finally {
        setIsStreaming(false);
        setShowDots(false);
        inputRef.current?.focus();
      }
    },
    [
      isStreaming,
      chatMessages,
      transcript,
      settings,
      addChatMessage,
      appendToLastMessage,
    ]
  );

  // ── Watch for suggestion-triggered messages ────────────────────────────────
  // When SuggestionsPanel adds a user message via addChatMessage, we need to
  // fire sendMessage for that content. We detect it by watching chatMessages
  // for a new user message while not currently streaming.
  const lastProcessedId = useRef<string | null>(null);

  useEffect(() => {
    if (isStreaming) return;
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') return;
    if (lastMsg.id === lastProcessedId.current) return;
    // Only auto-fire for messages that arrived without a following assistant msg
    const hasFollowUp =
      chatMessages.length >= 2 &&
      chatMessages[chatMessages.length - 1].role === 'assistant';
    if (hasFollowUp) return;

    lastProcessedId.current = lastMsg.id;
    sendMessage(lastMsg.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages]);

  // ── Manual input send ──────────────────────────────────────────────────────
  const handleManualSend = () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue('');
    addChatMessage('user', text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleManualSend();
    }
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  const isEmpty = chatMessages.length === 0 && !showDots;

  return (
    <div className="flex flex-col h-full bg-transparent">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 shrink-0 flex items-center justify-between border-b border-[#1f2937] backdrop-blur-md bg-[#0b1220]/80 sticky top-0 z-20">
        <h2 className="text-[10px] font-bold text-[#9ca3af] tracking-widest uppercase">3. CHAT (DETAILED ANSWERS)</h2>
        <span className="text-[10px] font-bold text-[#4b5563]">
          SESSION-ONLY
        </span>
      </div>

      {/* ── Info Box ────────────────────────────────────────────────────── */}
      <div className="px-5 py-6 shrink-0">
        <div className="p-4 rounded-xl bg-[#1a2333]/40 border border-[#1f2937] relative overflow-hidden group">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500/0 via-blue-500/40 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-[11px] text-[#9ca3af] leading-relaxed font-medium">
            Clicking a suggestion adds it to this chat and streams a detailed answer. One continuous chat per session — no login, no persistence.
          </p>
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-5"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center pt-8 h-48 text-center px-4">
            <p className="text-[13px] text-[#4b5563] italic">
              Click a suggestion or type a question below.
            </p>
          </div>
        ) : (
          <>
            {chatMessages.map((message, idx) => {
              const isLast = idx === chatMessages.length - 1;
              if (message.role === 'assistant' && message.content === '' && showDots) return null;

              return (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  isStreaming={isStreaming && isLast && !showDots}
                  isLast={isLast}
                />
              );
            })}

            {/* Dot loader — shown before first streaming token */}
            {showDots && <DotLoader />}
          </>
        )}
      </div>

      {/* ── Input ────────────────────────────────────────────────────────── */}
      <div className="p-4 shrink-0 border-t border-[#1f2937] backdrop-blur-md bg-[#0b1220]/40">
        <div className="flex gap-2 items-center bg-[#1a2333] rounded-xl p-1.5 border border-[#1f2937] focus-within:border-blue-500/50 transition-colors shadow-lg">
          <input
            ref={inputRef}
            id="chat-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'AI is responding…' : 'Ask anything…'}
            disabled={isStreaming}
            className="flex-1 bg-transparent border-none text-[#e5e7eb] text-[13px] px-3 py-1.5 focus:ring-0 focus:outline-none placeholder-[#4b5563]"
          />
          <button
            id="chat-send-button"
            onClick={handleManualSend}
            disabled={!inputValue.trim() || isStreaming}
            className="px-5 py-2 bg-[#3b82f6] hover:bg-blue-500 text-white rounded-lg font-bold text-[12px] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-500/10"
          >
            {isStreaming ? 'Wait...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
