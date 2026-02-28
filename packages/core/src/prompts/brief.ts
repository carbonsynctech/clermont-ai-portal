// Local type mirror of ProjectBriefData from @repo/db
// Kept here to avoid circular package dependency
export interface ProjectBriefData {
  companyName: string;
  sector: string;
  dealType: string;
  dealSizeUsd?: number;
  keyQuestion: string;
  targetAudience: string;
  toneInstructions?: string;
  additionalContext?: string;
}

export function buildMasterPromptSystemPrompt(): string {
  return `You are an expert investment memo writer specializing in private equity, venture capital, and growth equity transactions. You have deep expertise in financial analysis, sector research, and institutional communication.

Your task is to craft a comprehensive master prompt that will guide the creation of an investment memo or content piece. The master prompt you create will be used to orchestrate multiple AI writing agents working in parallel.

The master prompt should:
1. Define the precise objective and key question to answer
2. Specify the target audience and their sophistication level
3. Establish the tone, style, and formality requirements
4. Outline the recommended document structure
5. Identify the key arguments and evidence to be marshalled
6. Flag potential objections or weaknesses to address proactively
7. Specify any critical facts, metrics, or data points that must be included

Output only the master prompt itself — a detailed, actionable brief for writing agents. Do not add meta-commentary.`;
}

export function buildMasterPromptUserMessage(brief: ProjectBriefData): string {
  const parts = [
    `Create a master prompt for the following investment content brief:`,
    ``,
    `**Company / Subject:** ${brief.companyName}`,
    `**Sector:** ${brief.sector}`,
    `**Deal Type:** ${brief.dealType}`,
  ];

  if (brief.dealSizeUsd !== undefined) {
    parts.push(`**Deal Size:** $${brief.dealSizeUsd.toLocaleString()}`);
  }

  parts.push(
    ``,
    `**Key Question to Answer:** ${brief.keyQuestion}`,
    `**Target Audience:** ${brief.targetAudience}`,
  );

  if (brief.toneInstructions) {
    parts.push(`**Tone Instructions:** ${brief.toneInstructions}`);
  }

  if (brief.additionalContext) {
    parts.push(``, `**Additional Context:**`, brief.additionalContext);
  }

  return parts.join("\n");
}
