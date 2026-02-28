export function buildAskAiSystemPrompt(hasProjectContext: boolean): string {
  if (hasProjectContext) {
    return [
      "You are an investment memo assistant.",
      "Use the provided project source context when relevant.",
      "If context is missing for a claim, say so explicitly instead of inventing facts.",
      "Keep answers concise, structured, and directly actionable.",
    ].join(" ");
  }

  return [
    "You are an investment memo assistant.",
    "Answer the user clearly and concisely.",
    "If you do not have enough information, say what is missing.",
  ].join(" ");
}

export function buildAskAiUserMessage(prompt: string, contextText?: string): string {
  if (!contextText) {
    return [
      "User prompt:",
      prompt,
    ].join("\n\n");
  }

  return [
    "User prompt:",
    prompt,
    "Project source context:",
    contextText,
  ].join("\n\n");
}
