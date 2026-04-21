'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { DEFAULT_SETTINGS, type AppSettings } from '../hooks/useSettings';

// ── Field helpers ────────────────────────────────────────────────────────────

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
    >
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
      {children}
    </p>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600
                 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm
                 placeholder-slate-400 dark:placeholder-slate-500 font-mono
                 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
    />
  );
}

function TextArea({
  id,
  value,
  onChange,
  rows = 5,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600
                 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs
                 placeholder-slate-400 dark:placeholder-slate-500 font-mono resize-y
                 focus:outline-none focus:ring-2 focus:ring-blue-500 transition leading-relaxed"
    />
  );
}

function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        if (!isNaN(n)) onChange(n);
      }}
      className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600
                 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm
                 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
    />
  );
}

// ── Section divider ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { settings, updateSettings, resetSettings } = useApp();

  // Local draft — only committed to context/localStorage on Save
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync draft when panel opens (pick up any external changes)
  useEffect(() => {
    if (open) {
      setDraft(settings);
      setSaved(false);
    }
  }, [open, settings]);

  // Focus trap: close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = () => {
    updateSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setDraft(DEFAULT_SETTINGS);
    resetSettings();
  };

  const maskedKey = draft.groqApiKey
    ? `gsk_••••••••${draft.groqApiKey.slice(-4)}`
    : '';

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 dark:bg-black/50 z-40 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <div
        ref={panelRef}
        id="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className={`
          fixed top-0 right-0 h-full w-full max-w-md z-50
          bg-white dark:bg-slate-900
          border-l border-slate-200 dark:border-slate-700
          shadow-2xl flex flex-col
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Settings</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">

          {/* ── API Key ─────────────────────────────────────────────────────── */}
          <Section title="Authentication">
            <div>
              <Label htmlFor="setting-api-key">Groq API Key</Label>
              <TextInput
                id="setting-api-key"
                type="password"
                value={draft.groqApiKey}
                onChange={(v) => set('groqApiKey', v)}
                placeholder="gsk_..."
              />
              {maskedKey && (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                  ✓ {maskedKey}
                </p>
              )}
              <Hint>
                Get your free key at{' '}
                <a
                  href="https://console.groq.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  console.groq.com
                </a>
                . Stored only in your browser — never sent to our servers.
              </Hint>
            </div>
          </Section>

          {/* ── Prompts ─────────────────────────────────────────────────────── */}
          <Section title="Prompts">
            <div>
              <Label htmlFor="setting-suggestions-prompt">Live Suggestions System Prompt</Label>
              <TextArea
                id="setting-suggestions-prompt"
                value={draft.suggestionsPrompt}
                onChange={(v) => set('suggestionsPrompt', v)}
                rows={8}
              />
              <Hint>Controls how the AI generates the 3 suggestion cards after each transcript update.</Hint>
            </div>

            <div>
              <Label htmlFor="setting-chat-prompt">Chat System Prompt</Label>
              <TextArea
                id="setting-chat-prompt"
                value={draft.chatPrompt}
                onChange={(v) => set('chatPrompt', v)}
                rows={7}
              />
              <Hint>Sets the AI's persona and behaviour in the chat panel.</Hint>
            </div>

            <div>
              <Label htmlFor="setting-detailed-prompt">Detailed Answer Prompt</Label>
              <TextArea
                id="setting-detailed-prompt"
                value={draft.detailedAnswerPrompt}
                onChange={(v) => set('detailedAnswerPrompt', v)}
                rows={3}
              />
              <Hint>Appended to the chat prompt when a suggestion card is clicked, asking for a thorough response.</Hint>
            </div>
          </Section>

          {/* ── Context windows ──────────────────────────────────────────────── */}
          <Section title="Context Window Sizes">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="setting-suggestion-lines">Suggestion transcript lines</Label>
                <NumberInput
                  id="setting-suggestion-lines"
                  value={draft.suggestionTranscriptLines}
                  onChange={(v) => set('suggestionTranscriptLines', v)}
                  min={5}
                  max={200}
                />
                <Hint>Lines of transcript sent to the suggestions API. Default: 30.</Hint>
              </div>

              <div>
                <Label htmlFor="setting-chat-lines">Chat transcript lines</Label>
                <NumberInput
                  id="setting-chat-lines"
                  value={draft.chatTranscriptLines}
                  onChange={(v) => set('chatTranscriptLines', v)}
                  min={5}
                  max={500}
                />
                <Hint>Lines of transcript used as chat context. Default: 50.</Hint>
              </div>
            </div>

            <div>
              <Label htmlFor="setting-refresh-seconds">Suggestions refresh interval (seconds)</Label>
              <NumberInput
                id="setting-refresh-seconds"
                value={draft.suggestionsRefreshSeconds}
                onChange={(v) => set('suggestionsRefreshSeconds', v)}
                min={10}
                max={300}
              />
              <Hint>How often the suggestions panel auto-refreshes. Default: 30s.</Hint>
            </div>
          </Section>
        </div>

        {/* ── Footer actions ───────────────────────────────────────────────── */}
        <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-4 flex gap-3 shrink-0 bg-slate-50 dark:bg-slate-800/60">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400
                       border border-slate-200 dark:border-slate-600 rounded-lg
                       hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Reset to defaults
          </button>

          <button
            onClick={handleSave}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              saved
                ? 'bg-emerald-500 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {saved ? '✓ Saved' : 'Save settings'}
          </button>
        </div>
      </div>
    </>
  );
}
