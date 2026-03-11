/**
 * Builds the page array for the stylized document preview.
 *
 * Takes markdown content and project metadata, returns an ordered
 * array of page objects ready for rendering by StyledDocumentPreview.
 *
 * Page structure (matches the sample PDFs):
 *   1. Cover page
 *   2. Intro A   About (navy left panel)
 *   3. Intro B   Overview (structured white grid)
 *   4. Intro C   Confidentiality (full dark)
 *   5. Table of Contents
 *   6. Separator (empty)
 *   7+. Content pages (two-column)
 *   Last 4: Methodology, Disclosures, About, Back Cover
 */

import type { DocumentColors } from "./document-template";
import { DEFAULT_COLORS } from "./document-template";

//  Types 

export type PageType =
  | "cover"
  | "intro-a"
  | "intro-b"
  | "intro-c"
  | "toc"
  | "separator"
  | "content"
  | "outro"
  | "outro-back";

export interface DocPage {
  type: PageType;
  html: string;
  /** Page number to display (undefined = no page number, e.g. cover/intro) */
  pageNumber?: number;
}

interface ContentSection {
  heading: string;
  subSections: { subHeading?: string; body: string }[];
}

//  Markdown  HTML helpers 

/** Minimal markdown-to-HTML for body paragraphs (no full parser needed). */
function mdToHtml(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** Detect whether a line is a markdown table row (starts and ends with |). */
function isTableRow(line: string): boolean {
  return /^\|.+\|$/.test(line.trim());
}

/** Detect whether a line is a markdown table separator (e.g. |---|---|). */
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
  // Strip outer pipes, split by |, and check every cell is only dashes/colons/spaces
  const cells = trimmed.slice(1, -1).split("|");
  return cells.length > 0 && cells.every((c) => /^[\s:?-]+$/.test(c));
}

/** Parse a contiguous block of markdown table lines into an HTML <table>. */
function tableLinesToHtml(tableLines: string[]): string {
  const rows = tableLines.filter((l) => !isTableSeparator(l));
  if (rows.length === 0) return "";

  let html = '<table class="md-table">';

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i]!
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

    const tag = i === 0 ? "th" : "td";
    const rowHtml = cells.map((c) => `<${tag}>${mdToHtml(c)}</${tag}>`).join("");

    if (i === 0) {
      html += `<thead><tr>${rowHtml}</tr></thead><tbody>`;
    } else {
      html += `<tr>${rowHtml}</tr>`;
    }
  }

  html += "</tbody></table>";
  return html;
}

/** Convert a block of markdown text to HTML paragraphs + lists + tables. */
function blockToHtml(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inList: "ul" | "ol" | null = null;

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();

    // Pass through HTML table tags directly (from LLM outputting HTML tables)
    if (/^<\/?(table|thead|tbody|tfoot|tr|th|td)\b/i.test(trimmed)) {
      if (inList) { html += `</${inList}>`; inList = null; }
      html += lines[i]!;
      i++;
      continue;
    }

    // Detect markdown table: collect consecutive table rows
    if (isTableRow(trimmed)) {
      if (inList) { html += `</${inList}>`; inList = null; }
      const tableLines: string[] = [];
      while (i < lines.length && (isTableRow(lines[i]!.trim()) || isTableSeparator(lines[i]!.trim()))) {
        tableLines.push(lines[i]!);
        i++;
      }
      html += tableLinesToHtml(tableLines);
      continue;
    }

    if (/^[-*+]\s/.test(trimmed)) {
      if (inList !== "ul") {
        if (inList) html += `</${inList}>`;
        html += "<ul>";
        inList = "ul";
      }
      html += `<li>${mdToHtml(trimmed.replace(/^[-*+]\s/, ""))}</li>`;
      i++;
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      if (inList !== "ol") {
        if (inList) html += `</${inList}>`;
        html += "<ol>";
        inList = "ol";
      }
      html += `<li>${mdToHtml(trimmed.replace(/^\d+\.\s/, ""))}</li>`;
      i++;
      continue;
    }

    if (trimmed.startsWith(">")) {
      if (inList) { html += `</${inList}>`; inList = null; }
      html += `<blockquote>${mdToHtml(trimmed.replace(/^>\s?/, ""))}</blockquote>`;
      i++;
      continue;
    }

    if (!trimmed) {
      if (inList) { html += `</${inList}>`; inList = null; }
      i++;
      continue;
    }

    if (/^\*\*[^*]{4,140}\*\*:?$/.test(trimmed)) {
      if (inList) { html += `</${inList}>`; inList = null; }
      const headingText = trimmed
        .replace(/^\*\*/, "")
        .replace(/\*\*:?$/, "")
        .trim();
      html += `<h3>${mdToHtml(headingText)}</h3>`;
      i++;
      continue;
    }

    if (/^[A-Z][^.!?]{4,140}:$/.test(trimmed)) {
      if (inList) { html += `</${inList}>`; inList = null; }
      html += `<h3>${mdToHtml(trimmed.slice(0, -1))}</h3>`;
      i++;
      continue;
    }

    // Skip markdown horizontal rules (---, ***, ___)
    if (/^[-*_]{3,}$/.test(trimmed)) {
      if (inList) { html += `</${inList}>`; inList = null; }
      i++;
      continue;
    }

    if (inList) { html += `</${inList}>`; inList = null; }
    html += `<p>${mdToHtml(trimmed)}</p>`;
    i++;
  }

  if (inList) html += `</${inList}>`;
  return html;
}

/**
 * Splits rendered HTML into atomic flow blocks so pagination can break
 * between paragraphs/headings/lists instead of clipping one giant block.
 */
function splitFlowHtmlBlocks(html: string): string[] {
  const matches = html.match(/<(h2|h3|p|ul|ol|blockquote|table)\b[^>]*>[\s\S]*?<\/\1>/gi);
  if (!matches) return html.trim() ? [html.trim()] : [];
  return matches.map((block) => block.trim()).filter((block) => block.length > 0);
}

//  Content parser 

/** Parse markdown content into sections split on ## headings. */
function parseContentSections(markdown: string): ContentSection[] {
  const lines = markdown.split("\n");
  const sections: ContentSection[] = [];
  let currentSection: ContentSection | null = null;
  let currentSubBody: string[] = [];
  let currentSubHeading: string | undefined;

  function flushSub() {
    if (currentSection && currentSubBody.length > 0) {
      currentSection.subSections.push({
        subHeading: currentSubHeading,
        body: currentSubBody.join("\n"),
      });
    }
    currentSubBody = [];
    currentSubHeading = undefined;
  }

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)/);
    const h3Match = line.match(/^###\s+(.+)/);
    // Recognize "Section N: Title" as H2 heading
    const sectionMatch = line.match(/^(?:section|part)\s+\d+\s*[:\-–]\s*(.+)$/i);

    if (h2Match) {
      flushSub();
      if (currentSection) sections.push(currentSection);
      // Strip leading "Section N:" prefix from ## headings too
      const cleanedH2 = h2Match[1]!.replace(/^(?:section|part)\s+\d+\s*[:\-–]\s*/i, "").trim();
      currentSection = { heading: cleanedH2 || h2Match[1]!, subSections: [] };
      continue;
    }

    if (sectionMatch && !h2Match) {
      flushSub();
      if (currentSection) sections.push(currentSection);
      currentSection = { heading: sectionMatch[1]!.trim(), subSections: [] };
      continue;
    }

    if (h3Match) {
      flushSub();
      currentSubHeading = h3Match[1]!;
      continue;
    }

    // Skip H1 (title)  it goes on the cover
    if (line.match(/^#\s+/)) continue;

    currentSubBody.push(line);
  }

  flushSub();
  if (currentSection) sections.push(currentSection);

  return sections;
}

/** Style-guide rule label patterns that should never appear in document content. */
const STYLE_RULE_LABELS = [
  "tone", "voice", "headers?(?:\\s+and\\s+subheaders?)?", "callout\\s+labels?",
  "lists?(?:\\s+and\\s+bullets?)?", "numbered\\s+lists?", "footnote\\s+citations?",
  "data\\s+presentation", "exhibit\\s+placeholders?", "prohibited\\s+language",
  "sentence\\s+structure", "paragraph\\s+structure", "vocabulary",
  "formatting", "citations?", "style\\s+rules?",
];
const STYLE_RULE_RE = new RegExp(
  `^(?:[-*•]\\s*)?(?:${STYLE_RULE_LABELS.join("|")})\\s*:`,
  "i",
);

/**
 * Detects and removes contiguous blocks of style-guide rules that were
 * accidentally stored in version content (e.g. when XML parsing failed on
 * the Step 7 Claude response).
 */
function stripStyleRulesBlocks(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  const kept: string[] = [];

  for (const para of paragraphs) {
    const lines = para
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      kept.push(para);
      continue;
    }

    // Count how many lines in this paragraph look like style-rule bullets
    const ruleLineCount = lines.filter((l) => STYLE_RULE_RE.test(l)).length;

    // If ≥ 3 style-rule lines OR the majority of lines are rules, drop the block
    if (ruleLineCount >= 3 || (ruleLineCount > 0 && ruleLineCount >= lines.length * 0.6)) {
      continue; // skip entire paragraph block
    }

    kept.push(para);
  }

  return kept.join("\n\n");
}

/** Boilerplate noise patterns that appear before the real content. */
const BOILERPLATE_LINE_PATTERNS: RegExp[] = [
  // Document title repeated in all-caps or title case
  /^[A-Z][A-Z\s]{8,}$/,
  // Subtitles like "Strategic Briefing for Decision-Makers"
  /^(?:strategic|confidential|prepared|briefing|for\s+(?:decision|internal|senior))\b/i,
  // Date lines like "January 2026"
  /^(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i,
  // Confidentiality / permission notices
  /^no\s+part\s+of\s+this\s+document/i,
  /^whilst\s+every\s+care/i,
  /^this\s+document\s+is\s+(?:confidential|proprietary)/i,
  /^(?:confidential|private|proprietary)\s*[.—:]/i,
  // Standalone "Section N: ..." lines that look like a TOC listing
  /^section\s+\d+\s*[:\-–]\s*.+$/i,
  // Explicit synthesis header boilerplate
  /^strategic\s+briefing\s+for\s+decision\s+makers$/i,
  /^prepared\s+by\s+the\s+global\s+games\s+research\s*&\s*strategy\s+practice$/i,
];

const NORMALIZED_BOILERPLATE_DENYLIST = [
  "strategic briefing for decision makers",
  "prepared by the global games research strategy practice",
  "prepared by the global games research and strategy practice",
  "document note",
  "contents",
  "table of contents",
  "copyright",
  "all rights reserved",
];

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNormalizedBoilerplate(line: string): boolean {
  const normalized = normalizeForComparison(line);
  if (!normalized) return false;

  return NORMALIZED_BOILERPLATE_DENYLIST.some((entry) =>
    normalized === entry || normalized.startsWith(`${entry} `),
  );
}

/**
 * Strips boilerplate preamble blocks that appear before the real
 * analytical content (title repetition, subtitle, date, confidentiality,
 * inline section-list TOC).
 */
function stripBoilerplateBlocks(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  const kept: string[] = [];
  let foundRealContent = false;

  for (const para of paragraphs) {
    const lines = para
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      kept.push(para);
      continue;
    }

    // Once we've seen a markdown heading (## or ###), everything after is real content
    if (lines.some((l) => /^#{1,3}\s+/.test(l))) {
      foundRealContent = true;
    }

    // Also treat "Section N:" as real content when it's a heading (parsed into sections later)
    if (lines.some((l) => /^section\s+\d+\s*[:\-–]/i.test(l)) && foundRealContent) {
      kept.push(para);
      continue;
    }

    if (!foundRealContent) {
      // Check if the majority of lines in this block match boilerplate patterns
      const boilerplateCount = lines.filter((l) =>
        BOILERPLATE_LINE_PATTERNS.some((re) => re.test(l)) || isNormalizedBoilerplate(l),
      ).length;

      if (boilerplateCount >= lines.length * 0.5 && boilerplateCount >= 1) {
        continue; // drop this paragraph
      }

      // A block of consecutive "Section N: ..." lines is a TOC listing, drop it
      const sectionListCount = lines.filter((l) =>
        /^section\s+\d+\s*[:\-–]\s*.+$/i.test(l),
      ).length;
      if (sectionListCount >= 3) {
        continue; // drop section list TOC
      }
    }

    // After first real content block, mark as found
    if (lines.length > 0) foundRealContent = true;
    kept.push(para);
  }

  return kept.join("\n\n");
}

function sanitizeMarkdownForPreview(markdown: string): string {
  // 1. Extract <edited_draft> content if present
  const editedDraftMatch = markdown.match(/<edited_draft\b[^>]*>([\s\S]*?)<\/edited_draft>/i);
  let source = editedDraftMatch?.[1]?.trim() ? editedDraftMatch[1].trim() : markdown;

  // 2. Strip <rules>...</rules> blocks if present
  source = source.replace(/<rules\b[^>]*>[\s\S]*?<\/rules>/gi, "");

  // 2b. Strip synthesis boilerplate document note blocks
  source = source.replace(
    /document\s+note\s*:[\s\S]*?(?=\n\s*\n|\n\s*(?:section|part)\s+\d+\s*[:\-–]|\n\s*##\s+|$)/gi,
    "",
  );

  // 3. Strip accidentally-inlined style-rules paragraphs
  source = stripStyleRulesBlocks(source);

  // 4. Strip boilerplate preamble blocks (title repeat, subtitle, date, confidentiality, section list)
  source = stripBoilerplateBlocks(source);

  const lines = source.split("\n");

  const filtered = lines
    .map((line) => line.replace(/\u00a0/g, " "))
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      const normalized = normalizeForComparison(trimmed);
      if (!trimmed) return true;

      // Drop XML-like control tags and injected meta wrappers, but preserve HTML table tags
      const HTML_TABLE_TAG_RE = /^<\/?(table|thead|tbody|tfoot|tr|th|td)\b/i;
      if (/^<\/?[a-zA-Z][^>]*>/.test(trimmed) && !HTML_TABLE_TAG_RE.test(trimmed)) return false;

      // Drop common noise lines seen in draft/system outputs
      if (/^contents$/i.test(trimmed)) return false;
      if (/^document\s+note\s*:/i.test(trimmed)) return false;
      if (/^strategic\s+briefing\s+for\s+decision\s+makers$/i.test(trimmed)) return false;
      if (/^prepared\s+by\s+the\s+global\s+games\s+research\s*&\s*strategy\s+practice$/i.test(trimmed)) return false;
      if (/^copyright\b/i.test(trimmed)) return false;
      if (/^[a-z]+\s+\d{4}\s+copyright\b/i.test(trimmed)) return false;
      if (/^rules\s*:/i.test(trimmed)) return false;
      if (isNormalizedBoilerplate(trimmed)) return false;
      if (/^section\s+\d+\s*[:\-–]/i.test(trimmed) && normalized.length < 160) return false;

      return true;
    });

  return filtered.join("\n").trim();
}

function isLikelyNoiseTocTitle(title: string): boolean {
  const normalized = title.toLowerCase();

  if (normalized.includes("<") || normalized.includes(">")) return true;
  if (normalized.includes("copyright")) return true;
  if (normalized.startsWith("document note")) return true;
  if (normalized === "contents") return true;
  if (normalized.startsWith("rules")) return true;
  if (normalized.startsWith("editeddraft")) return true;

  return false;
}

function tocDedupKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-–—:;,.'"()\[\]/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeTocTitles(titles: string[], max = 10): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const title of titles) {
    const key = tocDedupKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(title);
    if (result.length >= max) break;
  }

  return result;
}

function normaliseTocTitle(input: string): string | null {
  const stripped = input
    .replace(/^[#\-*+>\d.\s]+/, "")
    .replace(/^section\s+\d+\s*[:\-]\s*/i, "")
    .replace(/[*_`~\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (isLikelyNoiseTocTitle(stripped)) return null;
  if (stripped.length < 8) return null;
  if (stripped.length <= 78) return stripped;
  return `${stripped.slice(0, 75).trimEnd()}...`;
}

function deriveTocTitles(markdown: string, sections: ContentSection[]): string[] {
  const lines = markdown.split("\n").map((line) => line.trim()).filter(Boolean);

  const fromSectionLabels = lines
    .map((line) => {
      const sectionMatch = line.match(/^section\s+\d+\s*[:\-]\s*(.+)$/i);
      if (sectionMatch?.[1]) return sectionMatch[1];
      return null;
    })
    .filter((entry): entry is string => !!entry)
    .map((entry) => normaliseTocTitle(entry))
    .filter((entry): entry is string => !!entry);

  if (fromSectionLabels.length > 0) {
    return dedupeTocTitles(fromSectionLabels, 10);
  }

  const fromHeadings = markdown
    .split("\n")
    .map((line) => line.match(/^##+\s+(.+)/)?.[1] ?? null)
    .filter((entry): entry is string => !!entry)
    .map((entry) => normaliseTocTitle(entry))
    .filter((entry): entry is string => !!entry);

  if (fromHeadings.length > 0) {
    return dedupeTocTitles(fromHeadings, 10);
  }

  const blocks = markdown
    .replace(/^#\s+.+$/gm, "")
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.replace(/\n+/g, " ").trim())
    .filter((chunk) => chunk.length > 0);

  const fromParagraphs: string[] = [];
  for (const block of blocks) {
    const firstSentence = block.split(/[.!?](?:\s|$)/)[0] ?? "";
    const candidate = normaliseTocTitle(firstSentence);
    if (candidate) fromParagraphs.push(candidate);
    if (fromParagraphs.length >= 10) break;
  }

  if (fromParagraphs.length > 0) {
    return dedupeTocTitles(fromParagraphs, 10);
  }

  const fallbackFromSections = sections
    .map((section) => normaliseTocTitle(section.heading))
    .filter((entry): entry is string => !!entry);

  return dedupeTocTitles(fallbackFromSections, 10);
}

//  Page builders 

function buildCoverPage(opts: {
  title: string;
  companyName?: string;
  dealType?: string;
  date: string;
  coverImageUrl?: string;
}): DocPage {
  const imageStyle = opts.coverImageUrl
    ? `style="background-image: url('${opts.coverImageUrl}');" `
    : "";

  // Full-page cover image background
  const bgFill = opts.coverImageUrl
    ? `<div class="cover-image-fill" ${imageStyle}></div>`
    : "";

  // Top ~1/3 black header band with Clermont logo + white title, overlaid on top of the cover image
  const topBand = `
    <div style="
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 490px;
      background: #000000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 40px 80px;
      z-index: 2;
    ">
      <img
        src="/clermont-logo.png"
        alt="Clermont Group"
        style="height: 130px; width: auto; object-fit: contain;"
      />
      <p style="
        font-family: 'Gill Sans MT Light', 'Gill Sans Light', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
        font-size: 42px;
        font-weight: 300;
        color: #ffffff;
        text-align: center;
        line-height: 1.3;
        letter-spacing: 0.01em;
        margin: 0;
        max-width: 600px;
      ">${escHtml(opts.title)}</p>
    </div>`;

  return {
    type: "cover",
    html: `<div class="doc-page page-cover">${bgFill}${topBand}</div>`,
  };
}

function buildIntroPages(opts: {
  companyName?: string;
  title: string;
}): DocPage[] {
  void opts;

  return [
    // Page 2: solid tan/gold colour block
    {
      type: "intro-a" as PageType,
      html: `<div class="doc-page page-solid-tan"></div>`,
    },
    // Page 3: static full-page image
    {
      type: "intro-c" as PageType,
      html: `<div class="doc-page page-static-image" style="background-image: url('/step7-page4.jpg');"></div>`,
    },
  ];
}

function buildTocPage(markdown: string, sections: ContentSection[]): DocPage {
  // Content pages start after: cover(1) + intro(2) + toc(1) + separator(1) = page 6
  const CONTENT_START_PAGE = 6;
  const tocTitles = deriveTocTitles(markdown, sections);

  const items = tocTitles.map((title, idx) => {
    const approxPage = CONTENT_START_PAGE + idx;
    return `
    <li class="toc-item">
      <span class="toc-title">${escHtml(title)}</span>
      <span class="toc-page-num">${approxPage}</span>
    </li>`;
  });

  return {
    type: "toc",
    html: `
<div class="doc-page page-toc">
  <div class="toc-top-rule"></div>
  <div class="toc-heading">Contents</div>
  <ul class="toc-list">
    ${items.join("")}
  </ul>
</div>`.trim(),
  };
}

function buildSeparatorPage(): DocPage {
  return {
    type: "separator",
    html: `<div class="doc-page page-separator"></div>`,
  };
}

function buildContentPages(
  markdown: string,
  sections: ContentSection[],
  startPage: number,
): DocPage[] {
  const pages: DocPage[] = [];
  let currentPage = startPage;
  const isHeadingBlock = (block: string): boolean => {
    const trimmed = block.trim();
    return /^<h[23][^>]*>[\s\S]*<\/h[23]>$/.test(trimmed);
  };
  const isSectionHeadingBlock = (block: string): boolean => {
    const trimmed = block.trim();
    return /^<h2[^>]*>[\s\S]*<\/h2>$/.test(trimmed);
  };
  const extractSectionHeadingText = (block: string): string | null => {
    const match = block.trim().match(/^<h2[^>]*>([\s\S]*?)<\/h2>$/);
    if (!match?.[1]) return null;
    return match[1]
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
  };

  /**
   * Estimate the number of visual lines a block will occupy in a single column.
   *
   * Page metrics (from the CSS):
   *   - Page width:  794px, padding: 88px each side → content width = 618px
   *   - Column gap:  44px → single column width ≈ (618 - 44) / 2 = 287px
   *   - Body font:   13px Georgia, line-height 1.55 → ~20px per line
   *   - Heading h3:  15px, line-height 1.35 → ~20px per line (+margins ~18px)
   *   - Heading h2:  18px, line-height 1.3 → ~23px per line (+margins ~18px)
   *   - Paragraph bottom margin: 9px ≈ 0.45 lines
   *   - Approx chars per column line: ~42 (Georgia 13px in 287px)
   */
  const CHARS_PER_LINE = 42;
  const PARAGRAPH_MARGIN_LINES = 0.42;
  const HEADING_MARGIN_LINES = 1.6; // top + bottom margins

  const estimateBlockLines = (block: string): number => {
    const textOnly = block.replace(/<[^>]*>/g, "").trim();
    if (!textOnly) return 0;

    if (isHeadingBlock(block)) {
      const headingLines = Math.ceil(textOnly.length / (CHARS_PER_LINE * 0.8)); // headings are wider font
      return headingLines + HEADING_MARGIN_LINES;
    }

    // Tables: span both columns via column-span:all, so vertical space
    // costs 2× in the dual-column line budget.
    // Each row ≈ 27px (11.5px font * 1.45 line-height + 10px padding),
    // table margins ≈ 28px (12px top + 16px bottom),
    // one text line ≈ 20px (13px * 1.55).
    const trMatches = block.match(/<tr>/gi);
    if (trMatches && /^<table\b/i.test(block.trim())) {
      const rowCount = trMatches.length;
      const ROW_HEIGHT_PX = 27;
      const TABLE_MARGIN_PX = 28;
      const LINE_HEIGHT_PX = 20;
      const tablePixelHeight = rowCount * ROW_HEIGHT_PX + TABLE_MARGIN_PX;
      // column-span:all removes height from both columns → 2× cost
      return (tablePixelHeight / LINE_HEIGHT_PX) * 2;
    }

    // Count list items — each gets its own line(s) plus spacing
    const liMatches = block.match(/<li>/g);
    if (liMatches) {
      const itemTexts = block.split(/<li>/).slice(1).map((s) => s.replace(/<[^>]*>/g, "").trim());
      let total = 0;
      for (const itemText of itemTexts) {
        total += Math.ceil(itemText.length / CHARS_PER_LINE) + 0.35; // li margin
      }
      return total + 0.5; // list margin
    }

    // Regular paragraph
    const lines = Math.ceil(textOnly.length / CHARS_PER_LINE);
    return lines + PARAGRAPH_MARGIN_LINES;
  };

  const allBlocks: string[] = [];

  if (sections.length > 0) {
    for (const section of sections) {
      const heading = section.heading.trim();
      if (heading) {
        allBlocks.push(`<h2>${escHtml(heading)}</h2>`);
      }

      for (const sub of section.subSections) {
        if (sub.subHeading) {
          allBlocks.push(`<h3>${escHtml(sub.subHeading)}</h3>`);
        }

        const html = blockToHtml(sub.body).trim();
        if (!html) continue;
        const flowBlocks = splitFlowHtmlBlocks(html);
        if (flowBlocks.length > 0) {
          allBlocks.push(...flowBlocks);
        }
      }
    }
  } else {
    const paragraphs = markdown
      .split(/\n\s*\n+/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);

    allBlocks.push("<h2>Summary</h2>");
    for (const paragraph of paragraphs) {
      const html = blockToHtml(paragraph).trim();
      if (!html) continue;
      const flowBlocks = splitFlowHtmlBlocks(html);
      if (flowBlocks.length > 0) {
        allBlocks.push(...flowBlocks);
      }
    }
  }

  const contentBlocks = allBlocks.filter((block) => block.replace(/<[^>]*>/g, "").trim().length > 0);
  if (contentBlocks.length === 0) return pages;

  const firstPageLines = 84;
  const subsequentPageLines = 96;

  const pageChunkBlocks: string[][] = [];
  let currentBlocks: string[] = [];
  let currentLines = 0;

  for (const block of contentBlocks) {
    const blockLines = estimateBlockLines(block);
    const pageLimit = pageChunkBlocks.length === 0 ? firstPageLines : subsequentPageLines;
    const wouldExceed = currentLines > 0 && currentLines + blockLines > pageLimit;

    if (wouldExceed) {
      const lastBlock = currentBlocks.at(-1);

      if (lastBlock && isHeadingBlock(lastBlock) && currentBlocks.length > 1) {
        const movedHeading = currentBlocks.pop();
        pageChunkBlocks.push([...currentBlocks]);
        currentBlocks = movedHeading ? [movedHeading, block] : [block];
        currentLines = currentBlocks.reduce((sum, candidate) => sum + estimateBlockLines(candidate), 0);
        continue;
      }

      pageChunkBlocks.push([...currentBlocks]);
      currentBlocks = [block];
      currentLines = blockLines;
      continue;
    }

    currentBlocks.push(block);
    currentLines += blockLines;
  }

  if (currentBlocks.length > 0) {
    pageChunkBlocks.push([...currentBlocks]);
  }

  for (let i = 0; i < pageChunkBlocks.length - 1; i++) {
    const pageLimit = i === 0 ? firstPageLines : subsequentPageLines;
    const minTarget = Math.floor(pageLimit * 0.94);
    const current = pageChunkBlocks[i]!;
    const next = pageChunkBlocks[i + 1]!;

    let currentLinesNow = current.reduce((sum, block) => sum + estimateBlockLines(block), 0);

    while (next.length > 0 && currentLinesNow < minTarget) {
      const candidate = next[0]!;
      const nextCandidate = next[1];

      if (isSectionHeadingBlock(candidate)) {
        const headingBodyCandidate = nextCandidate;
        if (!headingBodyCandidate) break;

        const headingLines = estimateBlockLines(candidate);
        const bodyLines = estimateBlockLines(headingBodyCandidate);
        const combinedProjectedLines = currentLinesNow + headingLines + bodyLines;

        if (combinedProjectedLines > pageLimit) break;

        current.push(candidate, headingBodyCandidate);
        next.shift();
        next.shift();
        currentLinesNow = combinedProjectedLines;
        continue;
      }
      if (isHeadingBlock(candidate) && !nextCandidate) break;

      const candidateLines = estimateBlockLines(candidate);
      const projectedLines = currentLinesNow + candidateLines;
      if (projectedLines > pageLimit) break;

      current.push(candidate);
      next.shift();
      currentLinesNow = projectedLines;
    }
  }

  const normalizedChunks = pageChunkBlocks.filter((chunk) => chunk.length > 0);
  for (let i = 0; i < normalizedChunks.length - 1; i++) {
    const current = normalizedChunks[i]!;
    const next = normalizedChunks[i + 1]!;
    const currentIsHeadingOnly = current.every((block) => isHeadingBlock(block));
    if (!currentIsHeadingOnly) continue;

    normalizedChunks[i + 1] = [...current, ...next];
    normalizedChunks[i] = [];
  }

  for (const chunkBlocksRaw of normalizedChunks.filter((chunk) => chunk.length > 0)) {
    const chunkBlocks = [...chunkBlocksRaw];
    let pageHeading: string | null = null;

    const firstBlock = chunkBlocks[0];
    if (firstBlock && isSectionHeadingBlock(firstBlock)) {
      pageHeading = extractSectionHeadingText(firstBlock);
      chunkBlocks.shift();
    }

    const chunk = chunkBlocks.join("");
    pages.push({
      type: "content",
      html: `
<div class="doc-page page-content page-content-flow">
  ${pageHeading ? `<div class="flow-page-title">${escHtml(pageHeading)}</div>` : ""}
  <div class="flow-columns">
    ${chunk}
  </div>
  <div class="page-number">${currentPage}</div>
</div>`.trim(),
      pageNumber: currentPage,
    });

    currentPage++;
  }

  return pages;
}

function buildOutroPages(opts: {
  companyName?: string;
  title: string;
}): DocPage[] {
  void opts;

  return [
    // Fifth-last: white page with centered note
    {
      type: "outro" as PageType,
      html: `<div class="doc-page page-trailing-blank"><span>This page is intentionally left blank</span></div>`,
    },
    // Fourth-last: white page with centered note
    {
      type: "outro" as PageType,
      html: `<div class="doc-page page-trailing-blank"><span>This page is intentionally left blank</span></div>`,
    },
    // Third-last: white page with centered note
    {
      type: "outro" as PageType,
      html: `<div class="doc-page page-trailing-blank"><span>This page is intentionally left blank</span></div>`,
    },
    // Second-last: full #D0B38B
    {
      type: "outro" as PageType,
      html: `<div class="doc-page page-trailing-tan"></div>`,
    },
    // Last: full #000000
    {
      type: "outro-back" as PageType,
      html: `<div class="doc-page page-trailing-black"></div>`,
    },
  ];
}

//  Main export 

export interface BuildStyledPagesOptions {
  content: string;
  projectTitle: string;
  companyName?: string;
  dealType?: string;
  coverImageUrl?: string;
  colors?: DocumentColors;
  paginationSafetyLevel?: number;
}

export function buildStyledPages(opts: BuildStyledPagesOptions): DocPage[] {
  const _colors = opts.colors ?? DEFAULT_COLORS;
  void _colors; // Colors are applied via CSS variables, not used directly here
  const sanitizedContent = sanitizeMarkdownForPreview(opts.content);

  const date = new Date().toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const sections = parseContentSections(sanitizedContent);

  const pages: DocPage[] = [];

  // 1. Cover
  pages.push(
    buildCoverPage({
      title: opts.projectTitle,
      companyName: opts.companyName,
      dealType: opts.dealType,
      date,
      coverImageUrl: opts.coverImageUrl,
    }),
  );

  // 2-3. Intro pages
  pages.push(
    ...buildIntroPages({
      companyName: opts.companyName,
      title: opts.projectTitle,
    }),
  );

  // 5. Table of Contents
  pages.push(buildTocPage(sanitizedContent, sections));

  // 6. Separator
  pages.push(buildSeparatorPage());

  // 6+. Content pages (start at printed page 6)
  const contentStartPage = 6;
  pages.push(...buildContentPages(sanitizedContent, sections, contentStartPage));

  // Outro pages (last 5)
  pages.push(
    ...buildOutroPages({
      companyName: opts.companyName,
      title: opts.projectTitle,
    }),
  );

  return pages;
}

//  Utility 

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
