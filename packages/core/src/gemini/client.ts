import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-pro";
const IMAGE_MODEL = process.env["NANO_BANANA_MODEL"] ?? "gemini-2.5-flash-image";

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
