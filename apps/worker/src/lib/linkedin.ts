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

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractLinkedInSlug(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m?.[1] ?? null;
}

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
  const slug = linkedinUrl ? extractLinkedInSlug(linkedinUrl) : null;
  // Include the LinkedIn slug in the query to help disambiguate common names
  const query = slug
    ? `${name} ${slug} professional`
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

interface LinkedInProfile {
  name?: string;
  headline?: string;
  about?: string;
  location?: string;
  experiences?: Array<{
    title?: string;
    company?: string;
    date_range?: string;
    description?: string;
  }>;
  educations?: Array<{
    institution?: string;
    degree?: string;
  }>;
  skills?: string[];
}

function formatLinkedInProfile(profile: LinkedInProfile): string {
  const parts: string[] = [];

  if (profile.name) parts.push(`Name: ${profile.name}`);
  if (profile.headline) parts.push(`Headline: ${profile.headline}`);
  if (profile.location) parts.push(`Location: ${profile.location}`);
  if (profile.about) parts.push(`About: ${profile.about}`);

  if (profile.experiences && profile.experiences.length > 0) {
    const lines = profile.experiences.map((e) => {
      const tokens: string[] = [];
      if (e.title) tokens.push(e.title);
      if (e.company) tokens.push(`at ${e.company}`);
      if (e.date_range) tokens.push(`(${e.date_range})`);
      return tokens.join(" ");
    });
    parts.push(`Experience:\n${lines.map((l) => `  - ${l}`).join("\n")}`);
  }

  if (profile.educations && profile.educations.length > 0) {
    const lines = profile.educations.map((e) => {
      const tokens: string[] = [];
      if (e.degree) tokens.push(e.degree);
      if (e.institution) tokens.push(`— ${e.institution}`);
      return tokens.join(" ");
    });
    parts.push(`Education:\n${lines.map((l) => `  - ${l}`).join("\n")}`);
  }

  if (profile.skills && profile.skills.length > 0) {
    parts.push(`Skills: ${profile.skills.join(", ")}`);
  }

  return parts.join("\n");
}

/**
 * Scrape a LinkedIn profile via the Python linkedin_scraper library.
 * Returns formatted profile text, or null if:
 *   - LINKEDIN_USER / LINKEDIN_PASSWORD env vars are not set
 *   - The Python script fails or times out
 */
export async function scrapeLinkedIn(url: string): Promise<string | null> {
  const email = process.env["LINKEDIN_USER"] ?? process.env["LINKEDIN_EMAIL"];
  const password = process.env["LINKEDIN_PASSWORD"];
  if (!email || !password) return null;

  // scripts/ lives alongside the worker app root (apps/worker/scripts/)
  const scriptPath = path.resolve(process.cwd(), "scripts", "linkedin_fetch.py");

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn("python3", [scriptPath, url], {
      env: { ...process.env },
    });

    const timeout = setTimeout(() => {
      proc.kill();
      console.warn("[linkedin] Scrape timed out after 60s");
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
        console.warn(`[linkedin] Scrape failed (exit ${code ?? "?"}):\n${stderr.trim()}`);
        resolve(null);
        return;
      }
      try {
        const profile = JSON.parse(stdout.trim()) as LinkedInProfile;
        resolve(formatLinkedInProfile(profile));
      } catch {
        console.warn("[linkedin] Failed to parse JSON output:", stdout.slice(0, 200));
        resolve(null);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      console.warn("[linkedin] Failed to spawn python3:", err.message);
      resolve(null);
    });
  });
}
