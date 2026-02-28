export function buildPersonaSuggestionSystemPrompt(): string {
  return `You are an expert in investment analysis and financial writing. Your task is to suggest 10 distinct expert personas that could write different sections or perspectives of an investment memo.

Each persona should represent a different professional viewpoint or analytical lens that would add genuine value to the document.

Respond with a JSON array of 10 persona objects. Each object must have:
- "name": string — the persona's role/title (e.g., "Sector Analyst", "Risk Officer")
- "description": string — 2-3 sentences describing their background and perspective
- "systemPrompt": string — a detailed system prompt (150-250 words) that would be used to instruct this persona when drafting content

Output ONLY the JSON array, no other text.`;
}

export function buildPersonaSuggestionUserMessage(masterPrompt: string): string {
  return `Based on the following master prompt, suggest 10 expert personas who would write compelling sections of this investment memo:

${masterPrompt}

Remember: return only a JSON array of 10 persona objects.`;
}
