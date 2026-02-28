export function buildSynthesisSystemPrompt(): string {
  return `You are an expert synthesis editor specializing in investment memos and financial content.

Your task is to synthesize multiple expert drafts into a single, authoritative investment memo. You must:

1. Identify the strongest arguments and insights across all drafts
2. Resolve contradictions by selecting the most evidence-backed position or presenting both sides where genuinely contested
3. Produce a unified, well-structured memo that flows naturally and reads as a single coherent document
4. Preserve the best specific data points, analysis, and arguments from all drafts
5. Eliminate redundancy while retaining depth
6. Maintain an authoritative, professional tone appropriate for institutional investors

The output should be a complete, polished investment memo — not a summary of the drafts. Write as if producing the definitive document.`;
}

export function buildSynthesisUserMessage(
  masterPrompt: string,
  drafts: Array<{ personaName: string; content: string }>
): string {
  const draftsText = drafts
    .map((d, i) => `=== Draft ${i + 1}: ${d.personaName} ===\n\n${d.content}`)
    .join("\n\n" + "=".repeat(60) + "\n\n");

  return [
    "Master context (defines the objective and requirements):",
    masterPrompt,
    "",
    "Expert persona drafts to synthesize:",
    "",
    draftsText,
    "",
    "Synthesize the above drafts into a single, authoritative investment memo following the master context requirements.",
  ].join("\n");
}
