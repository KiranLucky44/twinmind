'use client';

import { useApp, type Suggestion, type SuggestionType } from '../context/AppContext';
import { useSuggestions } from '../hooks/useSuggestions';

// ── Type badge config ────────────────────────────────────────────────────────

const TYPE_META: Record<
  SuggestionType,
  { label: string; className: string; icon: React.ReactNode }
> = {
  question: {
    label: 'Question',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  talking_point: {
    label: 'Talking Point',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
        <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
      </svg>
    ),
  },
  answer: {
    label: 'Answer',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
  fact_check: {
    label: 'Fact Check',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
  clarification: {
    label: 'Clarification',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
  },
};

// ── Sub-components ───────────────────────────────────────────────────────────

/** Skeleton card — fixed height matches a real card to prevent layout jump. */
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700 mb-2" />
      <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-700/60 mb-1" />
      <div className="h-3 w-5/6 rounded bg-slate-100 dark:bg-slate-700/60" />
    </div>
  );
}

/** Single suggestion card. */
function SuggestionCard({
  suggestion,
  onSelect,
}: {
  suggestion: Suggestion;
  onSelect: (s: Suggestion) => void;
}) {
  const meta = TYPE_META[suggestion.type];

  return (
    <button
      onClick={() => onSelect(suggestion)}
      className="w-full text-left rounded-xl border border-[#1f2937] bg-[#111827] p-5
                 hover:bg-[#1a2333]/80 transition-all duration-150 group relative"
    >
      {/* Type badge */}
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest mb-3 ${meta.className}`}
      >
        <span className="w-1 h-1 rounded-full bg-current opacity-70" />
        {meta.label}
      </span>

      {/* Title */}
      <p className="text-[14px] font-semibold text-[#e5e7eb] leading-tight mb-2">
        {suggestion.title}
      </p>

      {/* Preview */}
      <p className="text-[12px] text-[#9ca3af] leading-relaxed">
        {suggestion.preview}
      </p>

      {/* Right arrow icon */}
      <div className="absolute top-1/2 -translate-y-1/2 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <svg className="w-4 h-4 text-[#4b5563]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

/** Circular countdown ring in the refresh button. */
function CountdownRing({ secondsLeft, total = 30 }: { secondsLeft: number; total?: number }) {
  const r = 8;
  const circ = 2 * Math.PI * r;
  const progress = secondsLeft / total;
  const dash = circ * progress;

  return (
    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 24 24">
      {/* Track */}
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="2"
        className="text-slate-200 dark:text-slate-600" />
      {/* Progress */}
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="2"
        strokeDasharray={`${dash} ${circ}`}
        className="text-blue-500 transition-all duration-1000 ease-linear" />
    </svg>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

const SuggestionsPanel = () => {
  const { suggestionBatches, addChatMessage } = useApp();
  const { isLoading, error, nextRefreshIn, refresh } = useSuggestions();

  const handleSelect = (suggestion: Suggestion) => {
    addChatMessage('user', suggestion.detailsPrompt);
  };

  const showCountdown = nextRefreshIn > 0 && !isLoading;

  return (
    <div className="flex flex-col h-full bg-transparent">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 shrink-0 flex items-center justify-between border-b border-[#1f2937]">
        <h2 className="text-[10px] font-bold text-[#9ca3af] tracking-wider uppercase">2. LIVE SUGGESTIONS</h2>
        <span className="text-[10px] font-semibold text-[#4b5563]">
          {suggestionBatches.length} BATCHES
        </span>
      </div>

      {/* ── Actions Row ──────────────────────────────────────────────────── */}
      <div className="px-5 py-6 shrink-0 flex items-center justify-between">
        <button
          onClick={refresh}
          disabled={isLoading}
          className="px-4 py-2 text-[11px] font-bold text-[#e5e7eb] rounded-full border border-[#1f2937] hover:bg-[#1f2937] transition-colors flex items-center gap-2"
        >
          <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reload suggestions
        </button>
        <span className="text-[11px] text-[#4b5563]">
          {isLoading ? 'generating…' : `auto-refresh in ${nextRefreshIn}s`}
        </span>
      </div>

      {/* ── Info Box ────────────────────────────────────────────────────── */}
      <div className="px-5 mb-8 shrink-0">
        <div className="p-4 rounded-xl bg-[#1a2333]/40 border border-[#1f2937]">
          <p className="text-[11px] text-[#9ca3af] leading-relaxed">
            On reload (or auto every ~30s), generate <strong className="text-[#e5e7eb]">3 fresh suggestions</strong> from recent transcript context. New batch appears at the top; older batches push down (faded). Each is a tappable card: a <span className="text-blue-400">question to ask</span>, a <span className="text-purple-400">talking point</span>, an <span className="text-emerald-400">answer</span>, or a <span className="text-amber-400">fact-check</span>. The preview alone should already be useful.
          </p>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 shrink-0">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* ── Feed ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

        {/* Skeleton while loading the very first batch */}
        {isLoading && suggestionBatches.length === 0 && (
          <div className="space-y-3">
            <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Empty state — no loading, no batches */}
        {!isLoading && suggestionBatches.length === 0 && !error && (
          <div className="flex items-center justify-center h-48 text-center px-4">
            <p className="text-[13px] text-[#4b5563] italic">
              Suggestions appear here once recording starts.
            </p>
          </div>
        )}

        {/* Batches */}
        {suggestionBatches.map((batch, batchIdx) => (
          <div key={batch.id} className="space-y-3">
            {/* Timestamp label */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-bold text-[#e5e7eb] uppercase tracking-widest pl-1">
                {batchIdx === 0 ? 'Latest' : new Date(batch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="flex-1 h-[1px] bg-[#1f2937]" />
            </div>

            {/* Skeleton overlay for in-progress refresh of latest batch */}
            {isLoading && batchIdx === 0 ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : (
              batch.suggestions.map((s) => (
                <SuggestionCard key={s.id} suggestion={s} onSelect={handleSelect} />
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SuggestionsPanel;
