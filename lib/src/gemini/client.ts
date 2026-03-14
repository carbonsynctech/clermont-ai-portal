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

/**
 * Strip markdown code fences that Gemini sometimes wraps around JSON.
 * Handles ```json, ```, and leading/trailing whitespace.
 */
function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

/**
 * Find the outermost balanced JSON object in a string by tracking brace depth.
 * Falls back to greedy regex if no balanced match is found.
 */
function extractJsonObject(text: string): string | null {
  const startIdx = text.indexOf("{");
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i]!;

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(startIdx, i + 1);
      }
    }
  }

  // If braces are unbalanced (truncated response), try greedy regex as fallback
  const greedy = text.match(/\{[\s\S]*\}/);
  return greedy ? greedy[0] : null;
}

/**
 * Attempt to repair common JSON issues produced by LLMs:
 * - Literal (unescaped) newlines inside string values
 * - Trailing commas before closing brackets
 */
function tryRepairJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // noop — proceed to repair attempts
  }

  // Attempt 1: Replace unescaped literal newlines inside JSON string values.
  // This targets newlines that appear between quote-delimited values.
  try {
    const repaired = raw.replace(
      /("(?:[^"\\]|\\.)*")|(\n)/g,
      (match, quoted: string | undefined) => (quoted ? quoted : "\\n"),
    );
    return JSON.parse(repaired) as unknown;
  } catch {
    // noop
  }

  // Attempt 2: Remove trailing commas
  try {
    const repaired = raw.replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(repaired) as unknown;
  } catch {
    // noop
  }

  // Attempt 3: Both repairs combined
  try {
    const repaired = raw
      .replace(
        /("(?:[^"\\]|\\.)*")|(\n)/g,
        (match, quoted: string | undefined) => (quoted ? quoted : "\\n"),
      )
      .replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(repaired) as unknown;
  } catch {
    // noop
  }

  return null;
}

/**
 * When JSON parsing completely fails, try to extract individual fields
 * from the raw Gemini text using regex patterns.
 */
function extractFieldsFromRawText(text: string, fallbackContent: string): FactCheckResult | null {
  // Try to find "verified": true/false
  const verifiedMatch = text.match(/"verified"\s*:\s*(true|false)/i);
  // Try to find "issues": [...]
  const issuesMatch = text.match(/"issues"\s*:\s*\[([\s\S]*?)\]/);

  if (!verifiedMatch && !issuesMatch) return null;

  const verified = verifiedMatch ? verifiedMatch[1] === "true" : false;
  const issues: string[] = [];

  if (issuesMatch && issuesMatch[1]) {
    const issueStrings = issuesMatch[1].match(/"([^"]+)"/g);
    if (issueStrings) {
      for (const s of issueStrings) {
        issues.push(s.replace(/^"|"$/g, ""));
      }
    }
  }

  // Try to extract correctedContent — everything between "correctedContent": " and the final "
  const correctedMatch = text.match(/"correctedContent"\s*:\s*"([\s\S]+)/);
  let correctedContent = fallbackContent;
  if (correctedMatch && correctedMatch[1]) {
    // Remove trailing "} and any leftover JSON structure
    const raw = correctedMatch[1].replace(/"\s*\}\s*$/, "").replace(/\\n/g, "\n").replace(/\\"/g, '"');
    if (raw.length > 100) {
      correctedContent = raw;
    }
  }

  return {
    verified,
    issues,
    findings: issues.map((issue, index) => ({
      id: `finding-${index + 1}`,
      issue,
      sources: [],
    })),
    correctedContent,
  };
}

function normalizeFactCheckResult(parsed: unknown, fallbackContent: string): FactCheckResult {
  if (!parsed || typeof parsed !== "object") {
    return {
      verified: true,
      issues: [],
      findings: [],
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
  private getApiKey(): string {
    const apiKey = process.env["GOOGLE_GEMINI_API_KEY"];
    if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY is not set");
    return apiKey;
  }

  async factCheck(
    content: string,
    claims: string[]
  ): Promise<FactCheckResult> {
    const ai = new GoogleGenAI({ apiKey: this.getApiKey() });

    const prompt = `You are a professional fact-checker for investment memos and financial content.

You must use web search/grounding to verify claims against reliable public sources.
Prioritize primary/official sources where possible (company filings, regulator/government sources, major datasets, reputable publications).
For each finding, include at least one source URL when available.

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

    const result = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
      config: {
        temperature: 0,
        tools: [{ googleSearch: {} }],
      } as Record<string, unknown>,
    });

    const textFromResponse = (() => {
      if (typeof result.text === "string") return result.text;
      const parts = result.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const partText = (part as Record<string, unknown>)["text"];
        if (typeof partText === "string" && partText.length > 0) {
          return partText;
        }
      }
      return "";
    })();

    if (!textFromResponse.trim()) {
      console.warn("[fact-check] Gemini returned empty response, using original content");
      return normalizeFactCheckResult(null, content);
    }

    // Step 1: Strip markdown code fences (```json ... ```)
    const cleaned = stripCodeFences(textFromResponse);

    // Step 2: Extract balanced JSON object (handles nested braces in correctedContent)
    const jsonStr = extractJsonObject(cleaned);
    if (!jsonStr) {
      // No JSON object found — try to extract fields from raw text
      console.warn("[fact-check] No JSON object found in Gemini response, attempting raw field extraction");
      const rawResult = extractFieldsFromRawText(cleaned, content);
      if (rawResult) return rawResult;
      return normalizeFactCheckResult(null, content);
    }

    // Step 3: Parse JSON with repair attempts for common LLM issues
    const parsed = tryRepairJson(jsonStr);
    if (parsed) {
      return normalizeFactCheckResult(parsed, content);
    }

    // Step 4: JSON parsing completely failed — try raw field extraction as last resort
    console.warn("[fact-check] JSON parsing failed after repair attempts, attempting raw field extraction");
    const rawResult = extractFieldsFromRawText(cleaned, content);
    if (rawResult) return rawResult;

    return normalizeFactCheckResult(null, content);
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
