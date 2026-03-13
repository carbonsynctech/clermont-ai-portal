export interface ChunkForBudget {
  id: string;
  content: string;
  estimatedTokens: number;
  summary?: string | null;
  chunkIndex: number;
}

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "claude-sonnet-4-6": 200000,
  "claude-opus-4-6": 200000,
  "claude-haiku-4-5": 200000,
  "gpt-4o": 128000,
  "o3": 200000,
  "o4-mini": 200000,
};

const RESPONSE_RESERVE = 8192;
const SYSTEM_RESERVE = 4000;

export function getAvailableContextTokens(model: string): number {
  const contextWindow = MODEL_CONTEXT_WINDOWS[model] ?? 200000;
  return contextWindow - RESPONSE_RESERVE - SYSTEM_RESERVE;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.8);
}

export function selectChunksForBudget(
  chunks: ChunkForBudget[],
  budgetTokens: number,
  useSummaries = false
): ChunkForBudget[] {
  const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const selected: ChunkForBudget[] = [];
  let usedTokens = 0;

  for (const chunk of sorted) {
    const text = useSummaries && chunk.summary ? chunk.summary : chunk.content;
    const tokens = useSummaries && chunk.summary
      ? estimateTokens(chunk.summary)
      : chunk.estimatedTokens;

    if (usedTokens + tokens <= budgetTokens) {
      selected.push({ ...chunk, content: text });
      usedTokens += tokens;
    } else if (!useSummaries && chunk.summary) {
      // Try falling back to summary for this chunk
      const summaryTokens = estimateTokens(chunk.summary);
      if (usedTokens + summaryTokens <= budgetTokens) {
        selected.push({ ...chunk, content: chunk.summary });
        usedTokens += summaryTokens;
      }
    }
  }

  return selected;
}
