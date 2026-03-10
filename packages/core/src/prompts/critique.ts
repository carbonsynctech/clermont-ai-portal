export function buildDevilsAdvocateSystemPrompt(): string {
  return `You are an adversarial investment analyst. Your job is to stress-test an investment memo by identifying its most significant weaknesses, gaps, and risks that the authors may have overlooked or underplayed.

Generate up to 8 specific, numbered critiques. It is valid to return zero critiques when the memo is already robust and no material weaknesses are found.

If there are no meaningful critiques, return EXACTLY:
NO_CRITIQUES

If critiques exist, format each critique EXACTLY as follows:
[N]. [Critique Title]
[2–3 sentence explanation of the weakness or challenge, with specific reference to the memo's claims or omissions.]

Be rigorous, direct, and specific. Avoid generic platitudes. Never use em dashes (—); use a comma, colon, or rewrite the sentence instead.`;
}

export function buildDevilsAdvocateUserMessage(memoContent: string, masterPrompt: string): string {
  return `Investment thesis context:
${masterPrompt}

Investment memo to critique:
${memoContent}

Generate critiques.`;
}

export function parseCritiques(
  redReportContent: string
): Array<{ id: number; title: string; detail: string }> {
  const critiques: Array<{ id: number; title: string; detail: string }> = [];
  const content = redReportContent.trim();
  if (!content || content === "NO_CRITIQUES") return critiques;

  // Step 1: Find all numbered item headers at start of lines.
  // Handles: "1. Title", "**1. Title**", "## 1. Title", "1) Title"
  const headerRegex = /^\s*(?:\*{1,2}|#{1,3}\s*)?(\d+)[.)]\s+(.+)/gm;
  const headers: Array<{ id: number; title: string; matchEnd: number; index: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(content)) !== null) {
    headers.push({
      index: match.index,
      id: parseInt(match[1] ?? "0", 10),
      title: (match[2] ?? "").replace(/\*{1,2}/g, "").trim(),
      matchEnd: match.index + match[0].length,
    });
  }

  // Step 2: Extract detail as all text between this header and the next (or end of string).
  // This avoids lazy quantifier + multiline $ issues that truncate multi-line details.
  for (let i = 0; i < headers.length; i++) {
    const current = headers[i]!;
    const nextIndex = i + 1 < headers.length ? headers[i + 1]!.index : content.length;
    const detail = content.slice(current.matchEnd, nextIndex).trim();

    if (current.title && detail) {
      critiques.push({ id: current.id, title: current.title, detail });
    }
  }

  return critiques;
}

export function buildCritiqueIntegrationSystemPrompt(): string {
  return `You are an expert investment memo writer tasked with strengthening a document by integrating specific critique points. You have deep expertise in private equity and investment analysis.

Your task:
- Carefully read the memo and the selected critiques
- Integrate the insights from each critique to strengthen the document
- Add missing analysis, address gaps, and temper overconfident claims where appropriate
- Maintain the memo's professional tone and factual accuracy
- Do NOT simply append a rebuttal section — weave improvements throughout the document
- Return the complete, improved investment memo

Use extended reasoning to ensure each critique is thoughtfully addressed. Never use em dashes (—); use a comma, colon, or rewrite the sentence instead.

IMPORTANT: Any tabular data MUST use HTML table markup (<table>, <thead>, <tbody>, <tr>, <th>, <td>). Never use markdown pipe tables (| col | col |) as they render as raw text.`;
}

export function buildCritiqueIntegrationUserMessage(
  memoContent: string,
  selectedCritiques: string[]
): string {
  const critiquesList = selectedCritiques
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n\n");

  return `Investment memo to improve:
${memoContent}

Selected critiques to address:
${critiquesList}

Please integrate these critiques to produce a strengthened investment memo.`;
}
