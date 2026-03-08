import { spawn } from "child_process";
import path from "path";

// ── Web search types ──────────────────────────────────────────────────────────

interface BraveWebResult {
  title?: string;
  description?: string;
  url?: string;
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] };
}

interface DuckDuckGoResponse {
  Heading?: string;
  AbstractText?: string;
  AbstractSource?: string;
}

// ── Person lookup types ───────────────────────────────────────────────────────

export interface PersonLookupResult {
  found: boolean;
  name?: string;
  headline?: string;
  summary?: string;
  platforms?: Array<{
    platform: string;
    url: string;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function searchBrave(query: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as BraveSearchResponse;
    const snippets = (data.web?.results ?? [])
      .filter((r) => r.title ?? r.description)
      .map((r) => [r.title, r.description].filter(Boolean).join(": "))
      .slice(0, 5);

    return snippets.length > 0 ? snippets.join("\n") : null;
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&t=h_`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as DuckDuckGoResponse;
    const parts: string[] = [];
    if (data.Heading) parts.push(`Name: ${data.Heading}`);
    if (data.AbstractText) parts.push(data.AbstractText);
    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}

/**
 * Search the web for a person's professional background.
 * Uses Brave Search if BRAVE_SEARCH_API_KEY is set, otherwise DuckDuckGo (no key needed).
 * Returns labelled search snippets, or null if nothing useful was found.
 */
export async function searchForPerson(
  name: string,
  linkedinUrl?: string,
): Promise<string | null> {
  const query = linkedinUrl
    ? `${name} LinkedIn professional`
    : `${name} professional profile`;

  const braveKey = process.env["BRAVE_SEARCH_API_KEY"];
  if (braveKey) {
    const result = await searchBrave(query, braveKey);
    if (result) return `Web search results:\n${result}`;
  }

  const ddgResult = await searchDuckDuckGo(query);
  if (ddgResult) return `Web search results:\n${ddgResult}`;

  return null;
}

/**
 * Format a PersonLookupResult into human-readable text for AI consumption.
 */
function formatPersonLookup(result: PersonLookupResult): string {
  const parts: string[] = [];

  if (result.name) parts.push(`Name: ${result.name}`);
  if (result.headline) parts.push(`Headline: ${result.headline}`);
  if (result.summary) parts.push(`Summary: ${result.summary}`);

  if (result.platforms && result.platforms.length > 0) {
    const platformList = result.platforms
      .map((p) => `  - ${p.platform}: ${p.url}`)
      .join("\n");
    parts.push(`Social Profiles:\n${platformList}`);
  }

  return parts.join("\n");
}

/**
 * Lookup a person's public profile via social-analyzer (OSINT).
 * No credentials required.
 *
 * Returns formatted profile text, or null if:
 *   - The Python script fails or times out
 *   - No results found
 *
 * If webSearchFallback is true (default), will automatically fall back to
 * web search if OSINT lookup returns no results.
 */
export async function lookupPerson(
  name: string,
  linkedinUrl?: string,
  webSearchFallback = true,
): Promise<string | null> {
  // scripts/ lives alongside the worker app root (apps/worker/scripts/)
  const scriptPath = path.resolve(process.cwd(), "scripts", "linkedin_fetch.py");

  // Build arguments for Python script
  const args = [scriptPath, name];
  if (linkedinUrl) {
    args.push("--linkedin-url", linkedinUrl);
  }

  const osintResult = await new Promise<PersonLookupResult | null>((resolve) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn("python3", args, {
      env: { ...process.env },
    });

    const timeout = setTimeout(() => {
      proc.kill();
      console.warn("[person-lookup] OSINT lookup timed out after 60s");
      resolve(null);
    }, 60_000);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.warn(`[person-lookup] Script failed (exit ${code ?? "?"}):\n${stderr.trim()}`);
        resolve(null);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim()) as PersonLookupResult;
        resolve(result);
      } catch {
        console.warn("[person-lookup] Failed to parse JSON output:", stdout.slice(0, 200));
        resolve(null);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      console.warn("[person-lookup] Failed to spawn python3:", err.message);
      resolve(null);
    });
  });

  // If OSINT found results, format and return
  if (osintResult?.found) {
    return `OSINT profile data:\n${formatPersonLookup(osintResult)}`;
  }

  // Fall back to web search if enabled
  if (webSearchFallback) {
    console.log("[person-lookup] OSINT returned no results, falling back to web search");
    return searchForPerson(name, linkedinUrl);
  }

  return null;
}
