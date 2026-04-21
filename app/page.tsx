import TranscriptPanel from './components/TranscriptPanel';
import SuggestionsPanel from './components/SuggestionsPanel';
import ChatPanel from './components/ChatPanel';

export default function Home() {
  return (
    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 h-full overflow-hidden bg-[#0b1220]">
      {/* Column 1: Mic & Transcript */}
      <div className="flex flex-col min-h-0 bg-[#111827] rounded-xl border border-[#1f2937] shadow-sm overflow-hidden">
        <TranscriptPanel />
      </div>

      {/* Column 2: Live Suggestions */}
      <div className="flex flex-col min-h-0 bg-[#111827] rounded-xl border border-[#1f2937] shadow-sm overflow-hidden">
        <SuggestionsPanel />
      </div>

      {/* Column 3: Chat */}
      <div className="flex flex-col min-h-0 bg-[#111827] rounded-xl border border-[#1f2937] shadow-sm overflow-hidden">
        <ChatPanel />
      </div>
    </div>
  );
}
