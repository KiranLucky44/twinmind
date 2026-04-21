'use client';

import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useExport } from '../hooks/useExport';
import SettingsPanel from './SettingsPanel';

const TopBar = () => {
  const [exportState, setExportState] = useState<'idle' | 'done'>('idle');
  const [showSettings, setShowSettings] = useState(false);

  const { resetSession, settings, transcript, chatMessages } = useApp();
  const { exportSession } = useExport();

  const isEmpty = transcript.length === 0 && chatMessages.length === 0;

  const handleExport = () => {
    exportSession();
    setExportState('done');
    setTimeout(() => setExportState('idle'), 2000);
  };

  const maskedKey = settings.groqApiKey
    ? `gsk_••••••••${settings.groqApiKey.slice(-4)}`
    : null;

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 bg-[#0b1220] border-b border-[#1f2937] sticky top-0 z-30 select-none">

        {/* Left Side: Mockup Title */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-[#e5e7eb] tracking-wide">
            TwinMind — Live Suggestions Web App (Reference Mockup)
          </span>
        </div>

        {/* Right Side: Mockup Metadata + Actions */}
        <div className="flex items-center gap-6">
          <span className="hidden lg:inline text-[10px] text-[#6b7280] font-medium tracking-tight">
            3-column layout · Transcript · Live Suggestions · Chat
          </span>

          <div className="flex items-center gap-2">
            {/* API key indicator */}
            {maskedKey ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                {maskedKey}
              </span>
            ) : null}

            {/* Settings Icon */}
            <button
              id="settings-button"
              onClick={() => setShowSettings(true)}
              className="p-1.5 text-[#9ca3af] hover:text-[#e5e7eb] hover:bg-[#1f2937] rounded transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            <button
              id="export-button"
              onClick={handleExport}
              disabled={isEmpty || exportState === 'done'}
              className={`px-3 py-1 rounded text-[10px] font-semibold transition-all ${
                exportState === 'done'
                  ? 'bg-emerald-600 text-white'
                  : isEmpty
                  ? 'bg-[#1a2333] text-[#4b5563] cursor-not-allowed'
                  : 'bg-[#3b82f6] text-white hover:bg-blue-500'
              }`}
            >
              {exportState === 'done' ? 'Exported ✓' : 'Export'}
            </button>

            <button
              onClick={resetSession}
              className="px-3 py-1 text-[#9ca3af] bg-[#1a2333] hover:bg-[#1f2937] hover:text-[#e5e7eb] rounded text-[10px] font-semibold transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
    </>
  );
};

export default TopBar;
