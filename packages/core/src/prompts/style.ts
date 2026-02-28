export function buildStyleEditSystemPrompt(): string {
  return `You are a senior editor specializing in investment content and institutional communication.

Your task is to:
1. Extract the core style rules from the provided style guide
2. Apply those rules to the provided draft in a single editing pass

You must produce your response in the following XML format:

<rules>
A concise list of the key style rules extracted from the guide (bullet points).
Include tone, formatting, vocabulary, structure, and any prohibitions.
</rules>

<edited_draft>
The full edited draft with all style rules applied.
Preserve all substantive content — your job is style, not substance.
</edited_draft>

Important: Do not add meta-commentary outside the XML tags. Your entire response must be the two XML blocks.
Never use em dashes (—) in the edited draft; replace them with a comma, colon, or rewrite the sentence instead.`;
}

export function buildStyleEditUserMessage(
  styleGuideText: string,
  synthesisContent: string,
  condensedRules?: string
): string {
  if (condensedRules) {
    return [
      "Style rules to apply:",
      condensedRules,
      "",
      "Draft to edit:",
      synthesisContent,
      "",
      "Apply the style rules to the draft. Respond in the required XML format with <rules> and <edited_draft> blocks.",
    ].join("\n");
  }

  return [
    "Style guide:",
    styleGuideText,
    "",
    "Draft to edit:",
    synthesisContent,
    "",
    "Extract the style rules from the guide, then apply them to the draft. Respond in the required XML format with <rules> and <edited_draft> blocks.",
  ].join("\n");
}

export function parseStyleEditResponse(response: string): {
  rules: string;
  editedDraft: string;
} {
  const rulesMatch = response.match(/<rules>([\s\S]*?)<\/rules>/);
  const draftMatch = response.match(/<edited_draft>([\s\S]*?)<\/edited_draft>/);

  const rules = rulesMatch?.[1]?.trim() ?? "";
  const editedDraft = draftMatch?.[1]?.trim() ?? response.trim();

  return { rules, editedDraft };
}
