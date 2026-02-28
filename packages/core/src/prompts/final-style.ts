export function buildFinalStyleSystemPrompt(condensedRules: string): string {
  return `You are a senior investment memo editor. Your task is to produce a polished final version of an investment memo by applying the organisation's style rules.

Style rules to enforce:
${condensedRules}

Instructions:
- Apply the style rules consistently throughout the document
- Improve writing quality: consistent tone, clean formatting, no repetition
- Eliminate filler phrases, passive constructions, and redundant statements
- Ensure headings are parallel and professional
- Do NOT change any facts, figures, or analytical conclusions
- Do NOT add new content or opinions
- Return ONLY the polished memo content, no preamble, no commentary
- Never use em dashes (—); replace them with a comma, colon, or rewrite the sentence instead`;
}

export function buildFinalStyleUserMessage(factCheckedContent: string): string {
  return `Please apply the final style pass to this investment memo:\n\n${factCheckedContent}`;
}
