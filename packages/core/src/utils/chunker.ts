const CHARS_PER_TOKEN = 3.8;
const DEFAULT_CHUNK_TOKENS = 1500;
const DEFAULT_OVERLAP_TOKENS = 150;

export interface TextChunk {
  chunkIndex: number;
  content: string;
  charCount: number;
  estimatedTokens: number;
  sourcePage?: number;
}

export function chunkText(
  text: string,
  chunkTokens = DEFAULT_CHUNK_TOKENS,
  overlapTokens = DEFAULT_OVERLAP_TOKENS
): TextChunk[] {
  const chunkChars = Math.floor(chunkTokens * CHARS_PER_TOKEN);
  const overlapChars = Math.floor(overlapTokens * CHARS_PER_TOKEN);

  // Split into sentences on ". " or "\n" boundaries
  const sentencePattern = /(?<=[.!?])\s+|\n+/;
  const rawSentences = text.split(sentencePattern);

  // Filter empty strings
  const sentences = rawSentences.filter((s) => s.trim().length > 0);

  const chunks: TextChunk[] = [];
  let sentenceIndex = 0;
  let chunkIndex = 0;

  while (sentenceIndex < sentences.length) {
    let currentChunk = "";
    let charsUsed = 0;

    // Add sentences until we hit the chunk limit
    let i = sentenceIndex;
    while (i < sentences.length) {
      const sentence = sentences[i] ?? "";
      const addition = currentChunk.length === 0 ? sentence : " " + sentence;
      if (charsUsed + addition.length > chunkChars && currentChunk.length > 0) {
        break;
      }
      currentChunk += addition;
      charsUsed += addition.length;
      i++;
    }

    // If we didn't advance at all (single sentence longer than chunk), force include it
    if (i === sentenceIndex) {
      const sentence = sentences[sentenceIndex] ?? "";
      currentChunk = sentence;
      charsUsed = sentence.length;
      i = sentenceIndex + 1;
    }

    chunks.push({
      chunkIndex,
      content: currentChunk.trim(),
      charCount: currentChunk.trim().length,
      estimatedTokens: Math.ceil(currentChunk.length / CHARS_PER_TOKEN),
    });

    chunkIndex++;

    // Advance with overlap: back up by overlapChars worth of sentences
    let overlapCharsRemaining = overlapChars;
    let overlapStart = i - 1;
    while (overlapStart > sentenceIndex && overlapCharsRemaining > 0) {
      const s = sentences[overlapStart] ?? "";
      overlapCharsRemaining -= s.length;
      if (overlapCharsRemaining > 0) overlapStart--;
    }

    sentenceIndex = Math.max(i > sentenceIndex + 1 ? overlapStart : i, sentenceIndex + 1);
  }

  return chunks;
}
