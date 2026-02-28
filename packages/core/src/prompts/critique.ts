export function buildDevilsAdvocateSystemPrompt(): string {
  return `You are an adversarial investment analyst. Your job is to stress-test an investment memo by identifying its most significant weaknesses, gaps, and risks that the authors may have overlooked or underplayed.

Generate 5–8 specific, numbered critiques. Each critique must be actionable and directly grounded in the memo's content.

Format each critique EXACTLY as follows:
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
  const regex = /^(\d+)\.\s+(.+?)\n([\s\S]+?)(?=^\d+\.|$)/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(redReportContent)) !== null) {
    const id = parseInt(match[1] ?? "0", 10);
    const title = (match[2] ?? "").trim();
    const detail = (match[3] ?? "").trim();
    if (title && detail) {
      critiques.push({ id, title, detail });
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

Use extended reasoning to ensure each critique is thoughtfully addressed. Never use em dashes (—); use a comma, colon, or rewrite the sentence instead.`;
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
