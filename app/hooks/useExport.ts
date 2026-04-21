import { useCallback } from 'react';
import { useApp } from '../context/AppContext';

// ---------------------------------------------------------------------------
// Export document shape
// ---------------------------------------------------------------------------

interface ExportedSegment {
  index: number;
  timestamp: string;   // ISO-8601
  text: string;
}

interface ExportedSuggestion {
  type: string;
  title: string;
  preview: string;
  detailsPrompt: string;
}

interface ExportedBatch {
  batchIndex: number;
  timestamp: string;
  suggestions: ExportedSuggestion[];
}

interface ExportedMessage {
  index: number;
  role: 'user' | 'assistant';
  timestamp: string;
  content: string;
}

interface ExportDocument {
  exportedAt: string;
  version: string;
  summary: {
    transcriptSegments: number;
    suggestionBatches: number;
    chatMessages: number;
    durationMinutes: number | null;
  };
  transcript: ExportedSegment[];
  suggestionBatches: ExportedBatch[];
  chat: ExportedMessage[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toISO(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Calculates session duration from transcript first → last segment.
 * Returns null if fewer than 2 segments exist.
 */
function sessionDurationMinutes(
  first: number | undefined,
  last: number | undefined,
): number | null {
  if (first == null || last == null || first === last) return null;
  return Math.round(((last - first) / 60_000) * 10) / 10; // 1 decimal place
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExport() {
  const { transcript, suggestionBatches, chatMessages } = useApp();

  const exportSession = useCallback(() => {
    const now = new Date();

    // ── Build transcript ─────────────────────────────────────────────────────
    const exportedTranscript: ExportedSegment[] = transcript.map((seg, i) => ({
      index: i + 1,
      timestamp: toISO(seg.timestamp),
      text: seg.text,
    }));

    // ── Build suggestion batches (most-recent first, matching UI order) ───────
    const exportedBatches: ExportedBatch[] = suggestionBatches.map((batch, i) => ({
      batchIndex: i + 1,
      timestamp: toISO(batch.timestamp),
      suggestions: batch.suggestions.map((s) => ({
        type: s.type,
        title: s.title,
        preview: s.preview,
        detailsPrompt: s.detailsPrompt,
      })),
    }));

    // ── Build chat ───────────────────────────────────────────────────────────
    const exportedChat: ExportedMessage[] = chatMessages
      .filter((m) => m.content.trim() !== '') // skip seeded empty assistant bubbles
      .map((msg, i) => ({
        index: i + 1,
        role: msg.role,
        timestamp: toISO(msg.timestamp),
        content: msg.content,
      }));

    // ── Duration ─────────────────────────────────────────────────────────────
    const firstTs = transcript[0]?.timestamp;
    const lastTs = transcript[transcript.length - 1]?.timestamp;

    // ── Assemble document ────────────────────────────────────────────────────
    const doc: ExportDocument = {
      exportedAt: now.toISOString(),
      version: '1.0',
      summary: {
        transcriptSegments: exportedTranscript.length,
        suggestionBatches: exportedBatches.length,
        chatMessages: exportedChat.length,
        durationMinutes: sessionDurationMinutes(firstTs, lastTs),
      },
      transcript: exportedTranscript,
      suggestionBatches: exportedBatches,
      chat: exportedChat,
    };

    // ── Trigger download ─────────────────────────────────────────────────────
    const json = JSON.stringify(doc, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const filename = `twinmind-session-${now.toISOString().slice(0, 19).replace(/:/g, '-')}.json`;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();

    // Revoke after a tick to let the browser initiate the download
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [transcript, suggestionBatches, chatMessages]);

  return { exportSession };
}
