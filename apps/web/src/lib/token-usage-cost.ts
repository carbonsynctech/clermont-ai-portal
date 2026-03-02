const DEFAULT_MODEL_PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-pro+google-search": { input: 1.25, output: 10 },
};

interface TokenUsageRow {
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

interface ModelUsageSummary {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  isPriced: boolean;
}

export interface TokenUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  pricedInputTokens: number;
  pricedOutputTokens: number;
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
  models: ModelUsageSummary[];
}

function parseEnvPricing(): Record<string, { input: number; output: number }> {
  const raw = process.env["AI_MODEL_PRICING_USD_PER_MILLION_JSON"];
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const pricing: Record<string, { input: number; output: number }> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      const input = record["input"];
      const output = record["output"];
      if (typeof input !== "number" || typeof output !== "number") continue;
      pricing[key] = { input, output };
    }

    return pricing;
  } catch {
    return {};
  }
}

function resolveModelRate(
  modelId: string,
  envPricing: Record<string, { input: number; output: number }>,
): { input: number; output: number } | null {
  if (envPricing[modelId]) {
    return envPricing[modelId];
  }

  if (DEFAULT_MODEL_PRICING_USD_PER_MILLION[modelId]) {
    return DEFAULT_MODEL_PRICING_USD_PER_MILLION[modelId];
  }

  if (modelId.startsWith("claude-opus")) return { input: 15, output: 75 };
  if (modelId.startsWith("claude-sonnet")) return { input: 3, output: 15 };
  if (modelId.startsWith("claude-haiku")) return { input: 1, output: 5 };
  if (modelId.startsWith("gemini-2.5-pro")) return { input: 1.25, output: 10 };

  return null;
}

function toNonNegativeInt(value: number | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value > 0 ? Math.floor(value) : 0;
}

export function summarizeTokenUsage(rows: TokenUsageRow[]): TokenUsageSummary {
  const envPricing = parseEnvPricing();
  const modelMap = new Map<string, { inputTokens: number; outputTokens: number }>();

  for (const row of rows) {
    const modelId = row.modelId ?? "unknown";
    const inputTokens = toNonNegativeInt(row.inputTokens);
    const outputTokens = toNonNegativeInt(row.outputTokens);

    const existing = modelMap.get(modelId);
    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
    } else {
      modelMap.set(modelId, { inputTokens, outputTokens });
    }
  }

  const models: ModelUsageSummary[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let estimatedCostUsd = 0;
  let pricedInputTokens = 0;
  let pricedOutputTokens = 0;

  for (const [modelId, tokens] of modelMap.entries()) {
    totalInputTokens += tokens.inputTokens;
    totalOutputTokens += tokens.outputTokens;

    const modelRate = resolveModelRate(modelId, envPricing);
    const isPriced = modelRate !== null;
    const modelCost = modelRate
      ? (tokens.inputTokens / 1_000_000) * modelRate.input +
        (tokens.outputTokens / 1_000_000) * modelRate.output
      : 0;

    if (isPriced) {
      pricedInputTokens += tokens.inputTokens;
      pricedOutputTokens += tokens.outputTokens;
      estimatedCostUsd += modelCost;
    }

    models.push({
      modelId,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      totalTokens: tokens.inputTokens + tokens.outputTokens,
      estimatedCostUsd: modelCost,
      isPriced,
    });
  }

  models.sort((a, b) => b.totalTokens - a.totalTokens);

  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    estimatedCostUsd,
    pricedInputTokens,
    pricedOutputTokens,
    unpricedInputTokens: totalInputTokens - pricedInputTokens,
    unpricedOutputTokens: totalOutputTokens - pricedOutputTokens,
    models,
  };
}
