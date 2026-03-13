import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 8192;
const THINKING_BUDGET_TOKENS = 10000;

export interface ClaudeCallOptions {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  model?: string;
  onComplete?: (inputTokens: number, outputTokens: number) => void;
}

export interface ClaudeCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface ClaudeThinkingResult extends ClaudeCallResult {
  thinking: string;
}

class ClaudeClient {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (this.client) {
      return this.client;
    }

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    this.client = new Anthropic({ apiKey });
    return this.client;
  }

  async call(options: ClaudeCallOptions): Promise<ClaudeCallResult> {
    const {
      system,
      messages,
      maxTokens = DEFAULT_MAX_TOKENS,
      model = DEFAULT_MODEL,
      onComplete,
    } = options;

    const client = this.getClient();

    const response = (await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      stream: false,
    })) as Anthropic.Message;

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    onComplete?.(inputTokens, outputTokens);

    return { content, inputTokens, outputTokens, model };
  }

  async stream(
    options: ClaudeCallOptions,
    onChunk: (text: string) => void,
  ): Promise<ClaudeCallResult> {
    const {
      system,
      messages,
      maxTokens = DEFAULT_MAX_TOKENS,
      model = DEFAULT_MODEL,
      onComplete,
    } = options;

    const client = this.getClient();

    // Use raw stream: true — SDK 0.36.x has Stream<Item> without high-level helpers
    type RawEvent = {
      type: string;
      delta?: { type: string; text?: string };
      message?: { usage?: { input_tokens: number } };
      usage?: { output_tokens: number };
    };

    const rawStream = (await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      stream: true,
    })) as AsyncIterable<RawEvent>;

    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of rawStream) {
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta" &&
        event.delta.text
      ) {
        onChunk(event.delta.text);
        content += event.delta.text;
      } else if (event.type === "message_start" && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens;
      } else if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens;
      }
    }

    onComplete?.(inputTokens, outputTokens);

    return { content, inputTokens, outputTokens, model };
  }

  async callWithThinking(options: ClaudeCallOptions): Promise<ClaudeThinkingResult> {
    const {
      system,
      messages,
      maxTokens = DEFAULT_MAX_TOKENS + THINKING_BUDGET_TOKENS,
      model = DEFAULT_MODEL,
      onComplete,
    } = options;

    const client = this.getClient();

    const response = (await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      stream: false,
      thinking: {
        type: "enabled",
        budget_tokens: THINKING_BUDGET_TOKENS,
      },
    } as Parameters<typeof client.messages.create>[0])) as Anthropic.Message;

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    let thinking = "";
    let content = "";

    for (const block of response.content as Array<{ type: string; text?: string; thinking?: string }>) {
      if (block.type === "thinking" && block.thinking) {
        thinking = block.thinking;
      } else if (block.type === "text" && block.text) {
        content += block.text;
      }
    }

    onComplete?.(inputTokens, outputTokens);

    return { content, thinking, inputTokens, outputTokens, model };
  }

  async streamWithThinking(
    options: ClaudeCallOptions,
    onChunk: (text: string) => void,
  ): Promise<ClaudeThinkingResult> {
    const {
      system,
      messages,
      maxTokens = DEFAULT_MAX_TOKENS + THINKING_BUDGET_TOKENS,
      model = DEFAULT_MODEL,
      onComplete,
    } = options;

    const client = this.getClient();

    type RawEvent = {
      type: string;
      delta?: { type: string; text?: string; thinking?: string };
      message?: { usage?: { input_tokens: number } };
      usage?: { output_tokens: number };
    };

    const rawStream = (await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      stream: true,
      thinking: {
        type: "enabled",
        budget_tokens: THINKING_BUDGET_TOKENS,
      },
    } as Parameters<typeof client.messages.create>[0])) as AsyncIterable<RawEvent>;

    let content = "";
    let thinking = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of rawStream) {
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta" &&
        event.delta.text
      ) {
        onChunk(event.delta.text);
        content += event.delta.text;
      } else if (
        event.type === "content_block_delta" &&
        event.delta?.type === "thinking_delta" &&
        event.delta.thinking
      ) {
        thinking += event.delta.thinking;
      } else if (event.type === "message_start" && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens;
      } else if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens;
      }
    }

    onComplete?.(inputTokens, outputTokens);

    return { content, thinking, inputTokens, outputTokens, model };
  }
}

export const claude = new ClaudeClient();
