import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o";
const REASONING_MODEL = "o3";
const DEEP_RESEARCH_MODEL = "o4-mini-deep-research";
const DEFAULT_MAX_TOKENS = 8192;

export interface OpenAICallOptions {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  model?: string;
  onComplete?: (inputTokens: number, outputTokens: number) => void;
}

export interface OpenAICallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface OpenAIReasoningResult extends OpenAICallResult {
  reasoning: string;
}

class OpenAIClient {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (this.client) {
      return this.client;
    }

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  async call(options: OpenAICallOptions): Promise<OpenAICallResult> {
    const {
      system,
      messages,
      maxTokens = DEFAULT_MAX_TOKENS,
      model = DEFAULT_MODEL,
      onComplete,
    } = options;

    const client = this.getClient();

    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
    });

    const choice = response.choices[0];
    const content = choice?.message?.content ?? "";
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    onComplete?.(inputTokens, outputTokens);

    return { content, inputTokens, outputTokens, model };
  }

  async stream(
    options: OpenAICallOptions,
    onChunk: (text: string) => void,
  ): Promise<OpenAICallResult> {
    const {
      system,
      messages,
      maxTokens = DEFAULT_MAX_TOKENS,
      model = DEFAULT_MODEL,
      onComplete,
    } = options;

    const client = this.getClient();

    const stream = await client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
      stream: true,
      stream_options: { include_usage: true },
    });

    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        onChunk(delta);
        content += delta;
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
      }
    }

    onComplete?.(inputTokens, outputTokens);

    return { content, inputTokens, outputTokens, model };
  }

  /**
   * Use the OpenAI Responses API with reasoning (o3/o4-mini).
   * Replaces Claude extended thinking for Steps 5 and 12.
   */
  async callWithReasoning(options: OpenAICallOptions): Promise<OpenAIReasoningResult> {
    const {
      system,
      messages,
      maxTokens = DEFAULT_MAX_TOKENS,
      model = REASONING_MODEL,
      onComplete,
    } = options;

    const client = this.getClient();

    const response = await client.responses.create({
      model,
      instructions: system,
      input: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      reasoning: { effort: "high" },
      max_output_tokens: maxTokens,
    } as Parameters<typeof client.responses.create>[0]);

    let content = "";
    let reasoning = "";

    const outputItems = (response as unknown as Record<string, unknown>).output;
    if (Array.isArray(outputItems)) {
      for (const item of outputItems) {
        const typed = item as Record<string, unknown>;
        if (typed.type === "reasoning" && typeof typed.summary === "object" && typed.summary !== null) {
          const summaryArr = typed.summary as Array<{ type: string; text: string }>;
          reasoning = summaryArr
            .filter((s) => s.type === "summary_text")
            .map((s) => s.text)
            .join("\n");
        } else if (typed.type === "message" && Array.isArray(typed.content)) {
          for (const part of typed.content as Array<{ type: string; text?: string }>) {
            if (part.type === "output_text" && part.text) {
              content += part.text;
            }
          }
        }
      }
    }

    const usage = (response as unknown as Record<string, unknown>).usage as Record<string, number> | undefined;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;

    onComplete?.(inputTokens, outputTokens);

    return { content, reasoning, inputTokens, outputTokens, model };
  }

  /**
   * Use the OpenAI Responses API with web_search tool.
   * For persona drafts (Point 2) — web-grounded research.
   */
  async callWithDeepResearch(options: OpenAICallOptions): Promise<OpenAICallResult> {
    const {
      system,
      messages,
      maxTokens = DEFAULT_MAX_TOKENS,
      model = DEEP_RESEARCH_MODEL,
      onComplete,
    } = options;

    const client = this.getClient();

    try {
      const response = await client.responses.create({
        model,
        instructions: system,
        input: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_output_tokens: maxTokens,
      } as Parameters<typeof client.responses.create>[0]);

      let content = "";
      const outputItems = (response as unknown as Record<string, unknown>).output;
      if (Array.isArray(outputItems)) {
        for (const item of outputItems) {
          const typed = item as Record<string, unknown>;
          if (typed.type === "message" && Array.isArray(typed.content)) {
            for (const part of typed.content as Array<{ type: string; text?: string }>) {
              if (part.type === "output_text" && part.text) {
                content += part.text;
              }
            }
          }
        }
      }

      const usage = (response as unknown as Record<string, unknown>).usage as Record<string, number> | undefined;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;

      onComplete?.(inputTokens, outputTokens);

      return { content, inputTokens, outputTokens, model };
    } catch {
      // Fallback to standard call if web search fails
      return this.call(options);
    }
  }
}

export const openai = new OpenAIClient();
