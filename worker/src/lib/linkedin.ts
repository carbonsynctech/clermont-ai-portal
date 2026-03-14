// ── Web search–based person lookup ──────────────────────────────────────────
//
// Replaces the old social-analyzer (OSINT) approach.
// Searches the web for a person's LinkedIn profile and professional info.
// Primary: Brave Search API (free 2000 queries/month — set BRAVE_SEARCH_API_KEY)
// Fallback: Google Custom Search (set GOOGLE_CSE_KEY + GOOGLE_CSE_CX) or basic DuckDuckGo

// ── Types ───────────────────────────────────────────────────────────────────

interface BraveWebResult {
  title?: string;
  description?: string;
  url?: string;
  extra_snippets?: string[];
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] };
  infobox?: {
    results?: Array<{
      title?: string;
      description?: string;
      long_desc?: string;
      attributes?: Array<{ label?: string; value?: string }>;
    }>;
  };
}

interface GoogleCseItem {
  title?: string;
  snippet?: string;
  link?: string;
  pagemap?: {
    metatags?: Array<Record<string, string>>;
  };
}

interface GoogleCseResponse {
  items?: GoogleCseItem[];
}

// ── Brave Search ────────────────────────────────────────────────────────────

async function searchBrave(query: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&text_decorations=false`,
      {
        headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as BraveSearchResponse;
    const parts: string[] = [];

    // Extract infobox if present (rich knowledge panel)
    const infobox = data.infobox?.results?.[0];
    if (infobox) {
      if (infobox.title) parts.push(`Name: ${infobox.title}`);
      if (infobox.description) parts.push(`Summary: ${infobox.description}`);
      if (infobox.long_desc) parts.push(`Details: ${infobox.long_desc}`);
      if (infobox.attributes) {
        for (const attr of infobox.attributes) {
          if (attr.label && attr.value) parts.push(`${attr.label}: ${attr.value}`);
        }
      }
    }

    // Extract web results
    const results = data.web?.results ?? [];
    for (const r of results) {
      const snippets: string[] = [];
      if (r.title) snippets.push(r.title);
      if (r.description) snippets.push(r.description);
      if (r.extra_snippets) snippets.push(...r.extra_snippets);
      if (snippets.length > 0) {
        parts.push(snippets.join(" — "));
      }
    }

    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}

// ── Google Custom Search ────────────────────────────────────────────────────

async function searchGoogleCse(query: string, apiKey: string, cx: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}&num=5`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as GoogleCseResponse;
    const items = data.items ?? [];
    const parts: string[] = [];

    for (const item of items) {
      const snippets: string[] = [];
      if (item.title) snippets.push(item.title);
      if (item.snippet) snippets.push(item.snippet);

      // Extract LinkedIn og:title / og:description from page metatags if available
      const meta = item.pagemap?.metatags?.[0];
      if (meta) {
        const ogTitle = meta["og:title"];
        const ogDesc = meta["og:description"];
        if (ogTitle && !snippets.includes(ogTitle)) snippets.push(ogTitle);
        if (ogDesc) snippets.push(ogDesc);
      }

      if (snippets.length > 0) {
        parts.push(snippets.join(" — "));
      }
    }

    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}

// ── DuckDuckGo Instant Answers (very limited but no key needed) ─────────────

async function searchDuckDuckGo(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&t=h_`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      Heading?: string;
      AbstractText?: string;
      RelatedTopics?: Array<{ Text?: string }>;
    };
    const parts: string[] = [];
    if (data.Heading) parts.push(`Name: ${data.Heading}`);
    if (data.AbstractText) parts.push(data.AbstractText);
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 3)) {
        if (topic.Text) parts.push(topic.Text);
      }
    }
    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}

// ── Main lookup function ────────────────────────────────────────────────────

/**
 * Search the web for a person's professional background.
 *
 * Runs up to 2 search queries for best results:
 *   1. LinkedIn-specific query (if URL provided)
 *   2. General professional profile query
 *
 * Search engine priority:
 *   Brave Search (BRAVE_SEARCH_API_KEY) > Google CSE (GOOGLE_CSE_KEY + GOOGLE_CSE_CX) > DuckDuckGo
 */
export async function lookupPerson(
  name: string,
  linkedinUrl?: string,
  _webSearchFallback = true,
): Promise<string | null> {
  const braveKey = process.env["BRAVE_SEARCH_API_KEY"];
  const googleKey = process.env["GOOGLE_CSE_KEY"];
  const googleCx = process.env["GOOGLE_CSE_CX"];

  // Build multiple query variations to maximize match chance
  const queries: string[] = [];

  if (linkedinUrl) {
    const handleMatch = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
    if (handleMatch) {
      const handle = handleMatch[1];
      // Try the handle directly as a search term + LinkedIn
      queries.push(`${handle} LinkedIn`);
      // Try the full URL in the query
      queries.push(`linkedin.com/in/${handle}`);
    }
  }

  // Clean the name — strip parenthetical parts for search
  // e.g. "Edward (Zehua) Zhang" → search both "Edward Zehua Zhang" and "Edward Zhang"
  const cleanName = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const nameVariants = new Set([name, cleanName]);
  // Also try without middle name/parenthetical
  const nameParts = cleanName.split(" ");
  if (nameParts.length > 2) {
    nameVariants.add(`${nameParts[0]} ${nameParts[nameParts.length - 1]}`);
  }

  for (const variant of nameVariants) {
    queries.push(`"${variant}" LinkedIn professional`);
  }

  // Deduplicate queries
  const uniqueQueries = [...new Set(queries)];

  const allResults: string[] = [];

  // Run a search function based on available API keys
  async function search(query: string): Promise<string | null> {
    if (braveKey) return searchBrave(query, braveKey);
    if (googleKey && googleCx) return searchGoogleCse(query, googleKey, googleCx);
    return searchDuckDuckGo(query);
  }

  // Run first query, check if results look relevant; if not, try more
  for (const query of uniqueQueries) {
    const result = await search(query);
    if (result) {
      allResults.push(result);
      // If we got results from a LinkedIn-specific query and they mention the person's name,
      // that's probably good enough — stop early
      if (allResults.length >= 2) break;
    }
  }

  if (allResults.length === 0) {
    return null;
  }

  // Deduplicate and combine results
  const combined = allResults.join("\n\n");
  return `Web search results for ${name}:\n${combined}`;
}

// Re-export for backward compatibility
export { searchBrave, searchDuckDuckGo };
