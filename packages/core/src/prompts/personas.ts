// packages/core/src/prompts/personas.ts
export function buildPersonaSuggestionSystemPrompt(): string {
  return `You are an expert in investment analysis and financial writing. Your task is to suggest 10 distinct expert personas that could write different sections or perspectives of an investment memo.

Each persona should represent a different professional viewpoint or analytical lens that would add genuine value to the document.

Respond with a JSON array of 10 persona objects. Each object must have:
- "name": string — the persona's role/title (e.g., "Sector Analyst", "Risk Officer")
- "description": string — 2-3 sentences describing their background and perspective
- "systemPrompt": string — a detailed system prompt (150-250 words) that would be used to instruct this persona when drafting content
- "tags": string[] — one or more category tags from: Technology, Finance, Healthcare, Strategy, Legal, Operations, Other

Output ONLY the JSON array, no other text.`;
}

export function buildPersonaSuggestionUserMessage(masterPrompt: string): string {
  return `Based on the following master prompt, suggest 10 expert personas who would write compelling sections of this investment memo:

${masterPrompt}

Remember: return only a JSON array of 10 persona objects, each with name, description, systemPrompt, and tags.`;
}

export function buildCustomPersonaSystemPrompt(): string {
  return `You are an expert at creating detailed expert persona profiles for use in AI-assisted document generation.

Given a person's name and/or LinkedIn URL and optional context, generate a rich expert persona profile.

The persona name MUST follow the format: "Full Name (Role, Organisation)" — e.g. "Ray Dalio (Macro Investor, Bridgewater Associates)" or "Satya Nadella (CEO, Microsoft)".

If only a name is given without a URL, use your knowledge of that public figure. If a URL is given, use any context clues from the URL path to inform the persona.

Respond with a single JSON object with:
- "name": string — "Full Name (Role, Organisation)" format
- "description": string — 2-3 sentences on their background, philosophy, and perspective
- "systemPrompt": string — 200-300 words instructing this persona how to write; capture their communication style, analytical lens, and priorities
- "tags": string[] — one or more from: Technology, Finance, Healthcare, Strategy, Legal, Operations, Other

Output ONLY the JSON object, no other text.`;
}

export function buildCustomPersonaUserMessage(opts: {
  name: string;
  linkedinUrl?: string;
  context?: string;
}): string {
  const parts: string[] = [];
  if (opts.linkedinUrl) parts.push(`LinkedIn URL: ${opts.linkedinUrl}`);
  parts.push(`Name / description: ${opts.name}`);
  if (opts.context) parts.push(`Additional context: ${opts.context}`);
  return parts.join("\n");
}
