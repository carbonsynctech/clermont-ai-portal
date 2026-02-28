import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODEL = "gemini-2.0-flash";

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
  ): Promise<{ verified: boolean; issues: string[]; correctedContent: string }> {
    const model = this.getClient().getGenerativeModel({ model: DEFAULT_MODEL });

    const prompt = `You are a professional fact-checker for investment memos and financial content.

Review the following content and verify these specific claims:
${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}

CONTENT TO FACT-CHECK:
${content}

Respond with a JSON object in this exact format:
{
  "verified": boolean,
  "issues": ["list of factual issues found"],
  "correctedContent": "the full content with corrections applied"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { verified: false, issues: ["Failed to parse fact-check response"], correctedContent: content };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      verified: boolean;
      issues: string[];
      correctedContent: string;
    };
    return parsed;
  }
}

export const gemini = new GeminiClient();
