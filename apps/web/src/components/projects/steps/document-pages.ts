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

/** Convert a block of markdown text to HTML paragraphs + lists. */
function blockToHtml(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inList: "ul" | "ol" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^[-*+]\s/.test(trimmed)) {
      if (inList !== "ul") {
        if (inList) html += `</${inList}>`;
        html += "<ul>";
        inList = "ul";
      }
      html += `<li>${mdToHtml(trimmed.replace(/^[-*+]\s/, ""))}</li>`;
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      if (inList !== "ol") {
        if (inList) html += `</${inList}>`;
        html += "<ol>";
        inList = "ol";
      }
      html += `<li>${mdToHtml(trimmed.replace(/^\d+\.\s/, ""))}</li>`;
      continue;
    }

    if (trimmed.startsWith(">")) {
      if (inList) { html += `</${inList}>`; inList = null; }
      html += `<blockquote>${mdToHtml(trimmed.replace(/^>\s?/, ""))}</blockquote>`;
      continue;
    }

    if (!trimmed) {
      if (inList) { html += `</${inList}>`; inList = null; }
      continue;
    }

    // Skip markdown horizontal rules (---, ***, ___)
    if (/^[-*_]{3,}$/.test(trimmed)) {
      if (inList) { html += `</${inList}>`; inList = null; }
      continue;
    }

    if (inList) { html += `</${inList}>`; inList = null; }
    html += `<p>${mdToHtml(trimmed)}</p>`;
  }

  if (inList) html += `</${inList}>`;
  return html;
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

    if (h2Match) {
      flushSub();
      if (currentSection) sections.push(currentSection);
      currentSection = { heading: h2Match[1]!, subSections: [] };
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

function sanitizeMarkdownForPreview(markdown: string): string {
  const lines = markdown.split("\n");

  const filtered = lines
    .map((line) => line.replace(/\u00a0/g, " "))
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;

      // Drop XML-like control tags and injected meta wrappers
      if (/^<\/?[a-zA-Z][^>]*>/.test(trimmed)) return false;

      // Drop common noise lines seen in draft/system outputs
      if (/^contents$/i.test(trimmed)) return false;
      if (/^document\s+note\s*:/i.test(trimmed)) return false;
      if (/^copyright\b/i.test(trimmed)) return false;
      if (/^[a-z]+\s+\d{4}\s+copyright\b/i.test(trimmed)) return false;
      if (/^rules\s*:/i.test(trimmed)) return false;

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

function buildContentPages(markdown: string, sections: ContentSection[], startPage: number): DocPage[] {
  const pages: DocPage[] = [];
  let currentPage = startPage;
  const firstHeading = sections[0]?.heading ?? "Summary";

  const blocks: string[] = [];

  if (sections.length > 0) {
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex]!;
      if (sectionIndex > 0) {
        blocks.push(`<h2>${escHtml(section.heading)}</h2>`);
      }

      for (const sub of section.subSections) {
        if (sub.subHeading) {
          blocks.push(`<h3>${escHtml(sub.subHeading)}</h3>`);
        }

        const html = blockToHtml(sub.body).trim();
        if (html) blocks.push(html);
      }
    }
  } else {
    const paragraphs = markdown
      .split(/\n\s*\n+/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);

    for (const paragraph of paragraphs) {
      const html = blockToHtml(paragraph).trim();
      if (html) blocks.push(html);
    }
  }

  if (blocks.length === 0) {
    blocks.push("<p></p>");
  }

  const pageChunks: string[] = [];
  let currentChunk = "";

  for (const block of blocks) {
    const chunkBudget = pageChunks.length === 0 ? 3000 : 3600;
    if (currentChunk.length > 0 && currentChunk.length + block.length > chunkBudget) {
      pageChunks.push(currentChunk);
      currentChunk = block;
    } else {
      currentChunk += block;
    }
  }

  if (currentChunk.length > 0) {
    pageChunks.push(currentChunk);
  }

  for (let i = 0; i < pageChunks.length; i++) {
    const chunk = pageChunks[i]!;

    pages.push({
      type: "content",
      html: `
<div class="doc-page page-content page-content-flow">
  ${i === 0 ? `<div class="flow-page-title">${escHtml(firstHeading)}</div>` : ""}
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
