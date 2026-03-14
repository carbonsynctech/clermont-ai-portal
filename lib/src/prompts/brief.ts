// Local type mirror of ProjectBriefData from @repo/db
// Kept here to avoid circular package dependency
export interface ProjectBriefData {
  // Core (all doc types)
  documentType?: string;
  keyQuestion: string;
  targetAudience: string;
  tonePreset?: string;
  toneInstructions?: string;
  additionalContext?: string;
  // Investment Memorandum (legacy)
  companyName?: string;
  sector?: string;
  dealType?: string;
  dealSizeUsd?: number;
  // Other doc-type specific (all optional)
  organizationName?: string;
  industry?: string;
  strategicFocus?: string;
  timeHorizon?: string;
  policyDomain?: string;
  jurisdiction?: string;
  topicArea?: string;
  targetIndustry?: string;
  researchDomain?: string;
  topicInitiative?: string;
  decisionType?: string;
  initiativeName?: string;
  budgetRange?: string;
  businessUnit?: string;
  systemProductName?: string;
  techStack?: string;
  specType?: string;
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
    `Create a master prompt for the following document brief:`,
    ``,
  ];

  if (brief.documentType) parts.push(`**Document Type:** ${brief.documentType}`);

  // Subject / entity
  const subject = brief.companyName ?? brief.organizationName ?? brief.systemProductName ?? null;
  if (subject) parts.push(`**Subject:** ${subject}`);

  // Investment Memorandum specific
  if (brief.sector) parts.push(`**Sector:** ${brief.sector}`);
  if (brief.dealType) parts.push(`**Deal Type:** ${brief.dealType}`);
  if (brief.dealSizeUsd !== undefined) parts.push(`**Deal Size:** $${brief.dealSizeUsd.toLocaleString()}`);

  // Strategy Playbook
  if (brief.industry) parts.push(`**Industry:** ${brief.industry}`);
  if (brief.strategicFocus) parts.push(`**Strategic Focus:** ${brief.strategicFocus}`);
  if (brief.timeHorizon) parts.push(`**Time Horizon:** ${brief.timeHorizon}`);

  // Policy Document
  if (brief.policyDomain) parts.push(`**Policy Domain:** ${brief.policyDomain}`);
  if (brief.jurisdiction) parts.push(`**Jurisdiction:** ${brief.jurisdiction}`);

  // Whitepaper / Research
  if (brief.topicArea) parts.push(`**Topic Area:** ${brief.topicArea}`);
  if (brief.targetIndustry) parts.push(`**Target Industry:** ${brief.targetIndustry}`);
  if (brief.researchDomain) parts.push(`**Research Domain:** ${brief.researchDomain}`);

  // Executive Summary / Business Case
  if (brief.topicInitiative) parts.push(`**Topic / Initiative:** ${brief.topicInitiative}`);
  if (brief.decisionType) parts.push(`**Decision Type:** ${brief.decisionType}`);
  if (brief.initiativeName) parts.push(`**Initiative Name:** ${brief.initiativeName}`);
  if (brief.budgetRange) parts.push(`**Budget Range:** ${brief.budgetRange}`);
  if (brief.businessUnit) parts.push(`**Business Unit:** ${brief.businessUnit}`);

  // Technical Specification
  if (brief.techStack) parts.push(`**Technology Stack:** ${brief.techStack}`);
  if (brief.specType) parts.push(`**Specification Type:** ${brief.specType}`);

  parts.push(
    ``,
    `**Key Question / Objective:** ${brief.keyQuestion}`,
    `**Target Audience:** ${brief.targetAudience}`,
  );

  const tone = brief.tonePreset === "Other"
    ? brief.toneInstructions
    : (brief.tonePreset ?? brief.toneInstructions);
  if (tone) parts.push(`**Tone:** ${tone}`);

  if (brief.additionalContext) {
    parts.push(``, `**Additional Context:**`, brief.additionalContext);
  }

  return parts.join("\n");
}
