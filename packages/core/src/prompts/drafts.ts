export function buildPersonaDraftSystemPrompt(
  personaName: string,
  personaSystemPrompt: string
): string {
  return `${personaSystemPrompt}

You are contributing to the creation of a professional investment memo. Your unique perspective as ${personaName} will be combined with other expert viewpoints to produce a comprehensive, well-rounded document.

Output format requirements:
- Write in clear, professional prose suitable for institutional investors
- Structure your draft with clear headings and logical flow
- Include specific analysis, data points, and reasoning that reflect your expert perspective
- Aim for 1,500–2,500 words
- Do not add meta-commentary about your role; write as if producing the final document section
- Never use em dashes (—); replace them with a comma, colon, or rewrite the sentence instead
- IMPORTANT: If you include any tabular data, use proper HTML table markup (<table>, <thead>, <tbody>, <tr>, <th>, <td>). Do NOT use markdown pipe tables (| col | col |) as they will not render correctly`;
}

export function buildPersonaDraftUserMessage(
  masterPrompt: string,
  sourceChunks: Array<{ content: string; chunkIndex: number }>
): string {
  const chunksText = sourceChunks
    .map((c) => `[Source chunk ${c.chunkIndex}]\n${c.content}`)
    .join("\n\n---\n\n");

  return [
    "Master context:",
    masterPrompt,
    "",
    "Source materials:",
    chunksText,
    "",
    "Please write your draft based on the above context and source materials. Apply your unique expert perspective throughout.",
  ].join("\n");
}
