/**
 * Shared utilities for AI prompt construction and transcript processing.
 */

/**
 * Formats a list of transcript segments into a numbered block for AI context.
 * Example:
 * [1] Hey there
 * [2] How's it going?
 */
export function formatTranscriptForAI(transcript: string[]): string {
  if (!transcript || transcript.length === 0) return '(Empty transcript)';
  
  return transcript
    .map((line, i) => `[${i + 1}] ${line.trim()}`)
    .join('\n');
}

/**
 * Common system prompt requirements for all AI features (Chat & Suggestions).
 */
export const SHARED_AI_GROUNDING = `
QUALITY RULES:
- Use brackets to cite specific segments when possible, e.g., "As mentioned in [2]...".
- Prioritize information found in the most recent segments.
- If the transcript is insufficient to answer, prioritize asking for clarification over guessing.
`;
