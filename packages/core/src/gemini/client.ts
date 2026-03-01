import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-pro";
const IMAGE_MODEL = process.env["NANO_BANANA_MODEL"] ?? "gemini-2.5-flash-image";

export interface FactCheckSource {
  documentName: string | null;
  pageNumber: number | null;
  url?: string | null;
  evidence?: string | null;
}

export interface FactCheckFinding {
  id: string;
  issue: string;
  incorrectText?: string | null;
  correctedText?: string | null;
  sources?: FactCheckSource[];
}

export interface FactCheckResult {
  verified: boolean;
  issues: string[];
  findings: FactCheckFinding[];
  correctedContent: string;
}

function parseSources(input: unknown): FactCheckSource[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((source): FactCheckSource | null => {
      if (!source || typeof source !== "object") return null;
      const record = source as Record<string, unknown>;
      const documentName =
        typeof record["documentName"] === "string"
          ? record["documentName"]
          : typeof record["sourceName"] === "string"
            ? record["sourceName"]
            : null;
      const pageRaw = record["pageNumber"];
      const pageNumber = typeof pageRaw === "number" && Number.isFinite(pageRaw)
        ? pageRaw
        : typeof pageRaw === "string" && Number.isFinite(Number(pageRaw))
          ? Number(pageRaw)
          : null;
      const url = typeof record["url"] === "string" ? record["url"] : null;
      const evidence = typeof record["evidence"] === "string" ? record["evidence"] : null;

      return {
        documentName,
        pageNumber,
        url,
        evidence,
      };
    })
    .filter((source): source is FactCheckSource => source !== null);
}

function parseFindings(input: unknown): FactCheckFinding[] {
  if (!Array.isArray(input)) return [];

  const findings: FactCheckFinding[] = [];
  for (const [index, finding] of input.entries()) {
    if (!finding || typeof finding !== "object") continue;
    const record = finding as Record<string, unknown>;
    const issue = typeof record["issue"] === "string" ? record["issue"] : null;
    if (!issue) continue;

    const id = typeof record["id"] === "string" && record["id"].length > 0
      ? record["id"]
      : `finding-${index + 1}`;
    findings.push({
      id,
      issue,
      incorrectText: typeof record["incorrectText"] === "string" ? record["incorrectText"] : null,
      correctedText: typeof record["correctedText"] === "string" ? record["correctedText"] : null,
      sources: parseSources(record["sources"]),
    });
  }

  return findings;
}

function normalizeFactCheckResult(parsed: unknown, fallbackContent: string): FactCheckResult {
  if (!parsed || typeof parsed !== "object") {
    return {
      verified: false,
      issues: ["Failed to parse fact-check response"],
      findings: [
        {
          id: "finding-1",
          issue: "Failed to parse fact-check response",
          sources: [],
        },
      ],
      correctedContent: fallbackContent,
    };
  }

  const record = parsed as Record<string, unknown>;
  const findings = parseFindings(record["findings"]);
  const parsedIssues = Array.isArray(record["issues"])
    ? record["issues"].filter((issue): issue is string => typeof issue === "string")
    : [];
  const issues = parsedIssues.length > 0 ? parsedIssues : findings.map((finding) => finding.issue);

  const normalizedFindings = findings.length > 0
    ? findings
    : issues.map((issue, index) => ({
        id: `finding-${index + 1}`,
        issue,
        sources: [],
      }));

  return {
    verified: Boolean(record["verified"]),
    issues,
    findings: normalizedFindings,
    correctedContent:
      typeof record["correctedContent"] === "string" && record["correctedContent"].length > 0
        ? record["correctedContent"]
        : fallbackContent,
  };
}

class GeminiClient {
  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (this.client) {
      return this.client;
    }

    const apiKey = process.env["GOOGLE_GEMINI_API_KEY"];
    if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY is not set");
    this.client = new GoogleGenerativeAI(apiKey);
    return this.client;
  }

  async factCheck(
    content: string,
    claims: string[]
  ): Promise<FactCheckResult> {
    const model = this.getClient().getGenerativeModel({ model: DEFAULT_MODEL });

    const prompt = `You are a professional fact-checker for investment memos and financial content.

  You MUST preserve the original markdown structure in correctedContent.
  Rules for correctedContent:
  - Keep headings, subheadings, list markers, numbering, tables, blockquotes, links, emphasis, and line breaks.
  - Keep section order unchanged.
  - Only modify text that is factually incorrect.
  - Do not rewrite style, tone, or formatting.
  - Do not convert markdown to plain text.
  - If no factual corrections are needed, return the original markdown content unchanged.

Review the following content and verify these specific claims:
${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}

CONTENT TO FACT-CHECK:
${content}

Respond with a JSON object in this exact format:
{
  "verified": boolean,
  "issues": ["list of factual issues found"],
  "findings": [
    {
      "id": "short-stable-id",
      "issue": "concise issue summary",
      "incorrectText": "optional exact problematic text",
      "correctedText": "optional corrected text",
      "sources": [
        {
          "documentName": "source document name if known, otherwise null",
          "pageNumber": 12,
          "url": "optional URL if available",
          "evidence": "optional evidence quote"
        }
      ]
    }
  ],
  "correctedContent": "the full content with corrections applied"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return normalizeFactCheckResult(null, content);
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      return normalizeFactCheckResult(parsed, content);
    } catch {
      return normalizeFactCheckResult(null, content);
    }
  }

  /**
   * Generate up to 4 cover images using the Nano Banana (Gemini image) model.
   * Returns an array of { imageData: base64 string, mimeType } — or null for any
   * individual image that fails.
   */
  async generateImages(
    prompts: string[],
    aspectRatio = "2:3",
  ): Promise<Array<{ imageData: string; mimeType: string } | null>> {
    const apiKey = process.env["GOOGLE_GEMINI_API_KEY"];
    if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY is not set");

    const ai = new GoogleGenAI({ apiKey });

    const results = await Promise.all(
      prompts.map(async (prompt): Promise<{ imageData: string; mimeType: string } | null> => {
        try {
          const response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: prompt,
            config: {
              responseModalities: ["IMAGE"],
              imageConfig: { aspectRatio } as Record<string, unknown>,
            } as Record<string, unknown>,
          });

          const parts = response.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            const inlineData = (part as Record<string, unknown>).inlineData as
              | { data: string; mimeType: string }
              | undefined;
            if (inlineData?.data) {
              return { imageData: inlineData.data, mimeType: inlineData.mimeType ?? "image/png" };
            }
          }
          return null;
        } catch (err) {
          console.error("[gemini] Image generation failed for prompt:", err);
          return null;
        }
      }),
    );

    return results;
  }
}

export const gemini = new GeminiClient();
