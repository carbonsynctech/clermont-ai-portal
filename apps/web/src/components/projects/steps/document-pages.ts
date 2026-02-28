/**
 * Builds the page array for the stylized document preview.
 *
 * Takes markdown content and project metadata, returns an ordered
 * array of page objects ready for rendering by StyledDocumentPreview.
 *
 * Page structure (matches the sample PDFs):
 *   1. Cover page
 *   2. Brand/mission intro page
 *   3. Abstract/overview intro page
 *   4. Confidentiality banner page
 *   5. Table of Contents
 *   6. Separator (empty)
 *   7+. Content pages (two-column)
 *   Last 4: Methodology, Disclosures, About, Back Cover
 */

import type { DocumentColors } from "./document-template";
import { DEFAULT_COLORS } from "./document-template";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PageType =
  | "cover"
  | "intro"
  | "intro-banner"
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

// ─── Markdown → HTML helpers ──────────────────────────────────────────────────

/** Minimal markdown-to-HTML for body paragraphs (no full parser needed). */
function mdToHtml(md: string): string {
  return md
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code>$1</code>")
    // Mark tags pass-through
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** Convert a block of markdown text to HTML paragraphs + lists. */
function blockToHtml(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inList: "ul" | "ol" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      if (inList !== "ul") {
        if (inList) html += `</${inList}>`;
        html += "<ul>";
        inList = "ul";
      }
      html += `<li>${mdToHtml(trimmed.replace(/^[-*+]\s/, ""))}</li>`;
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(trimmed)) {
      if (inList !== "ol") {
        if (inList) html += `</${inList}>`;
        html += "<ol>";
        inList = "ol";
      }
      html += `<li>${mdToHtml(trimmed.replace(/^\d+\.\s/, ""))}</li>`;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      if (inList) { html += `</${inList}>`; inList = null; }
      html += `<blockquote>${mdToHtml(trimmed.replace(/^>\s?/, ""))}</blockquote>`;
      continue;
    }

    // Empty line
    if (!trimmed) {
      if (inList) { html += `</${inList}>`; inList = null; }
      continue;
    }

    // Regular paragraph
    if (inList) { html += `</${inList}>`; inList = null; }
    html += `<p>${mdToHtml(trimmed)}</p>`;
  }

  if (inList) html += `</${inList}>`;
  return html;
}

// ─── Content parser ───────────────────────────────────────────────────────────

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

    // Skip H1 (title) — it goes on the cover
    if (line.match(/^#\s+/)) continue;

    currentSubBody.push(line);
  }

  flushSub();
  if (currentSection) sections.push(currentSection);

  return sections;
}

// ─── Page builders ────────────────────────────────────────────────────────────

function buildCoverPage(opts: {
  title: string;
  companyName?: string;
  dealType?: string;
  date: string;
  coverImageUrl?: string;
}): DocPage {
  const bgStyle = opts.coverImageUrl
    ? `background-image: url('${opts.coverImageUrl}');`
    : "";
  const imageClass = opts.coverImageUrl ? " has-image" : "";

  return {
    type: "cover",
    html: `
      <div class="doc-page page-cover${imageClass}" style="${bgStyle}">
        ${opts.coverImageUrl ? '<div class="cover-overlay"></div>' : ""}
        <div class="cover-content">
          <div class="cover-divider"></div>
          <div class="cover-label">${opts.dealType ?? "Investment Memo"}</div>
          <div class="cover-title">${escHtml(opts.title)}</div>
          ${opts.companyName ? `<div class="cover-subtitle">Prepared for ${escHtml(opts.companyName)}</div>` : ""}
          <div class="cover-meta">
            <div class="cover-meta-item">Date<span class="cover-meta-value">${escHtml(opts.date)}</span></div>
            ${opts.companyName ? `<div class="cover-meta-item">Client<span class="cover-meta-value">${escHtml(opts.companyName)}</span></div>` : ""}
            <div class="cover-meta-item">Classification<span class="cover-meta-value">Confidential</span></div>
          </div>
        </div>
      </div>
    `.trim(),
  };
}

function buildIntroPages(opts: {
  companyName?: string;
  title: string;
}): DocPage[] {
  const company = opts.companyName ?? "Our Firm";

  return [
    // Page 2: Brand / mission statement
    {
      type: "intro" as PageType,
      html: `
        <div class="doc-page page-intro">
          <div class="intro-icon">&#9670;</div>
          <div class="intro-heading">About This Report</div>
          <div class="intro-rule"></div>
          <div class="intro-body">
            <p>This document has been prepared by ${escHtml(company)} to provide a comprehensive
            analysis and informed perspective. The findings and recommendations contained herein
            are based on extensive research, expert consultation, and rigorous analytical frameworks.</p>
            <p style="margin-top: 3%;"><strong>Our methodology</strong> combines quantitative data analysis
            with qualitative expert assessment to deliver actionable insights for strategic decision-making.</p>
          </div>
        </div>
      `.trim(),
    },
    // Page 3: Abstract / overview
    {
      type: "intro" as PageType,
      html: `
        <div class="doc-page page-intro">
          <div class="intro-heading">Document Overview</div>
          <div class="intro-rule"></div>
          <div class="intro-body">
            <p><strong>${escHtml(opts.title)}</strong></p>
            <p style="margin-top: 3%;">This report presents a thorough examination of the subject matter,
            structured to guide the reader from foundational context through detailed analysis to
            actionable recommendations.</p>
            <p style="margin-top: 3%;">Each section has been reviewed by domain experts to ensure accuracy
            and relevance. The document follows institutional standards for investment-grade research.</p>
          </div>
        </div>
      `.trim(),
    },
    // Page 4: Confidentiality banner
    {
      type: "intro-banner" as PageType,
      html: `
        <div class="doc-page page-intro-banner">
          <div class="intro-heading">Confidential</div>
          <div class="intro-rule" style="background: rgba(255,255,255,0.3);"></div>
          <div class="intro-body">
            <p>This document contains proprietary information and is intended solely for the use of the
            intended recipient(s). Unauthorised distribution, reproduction, or disclosure of any part
            of this document is strictly prohibited.</p>
            <p style="margin-top: 3%;">By proceeding, the reader acknowledges that the contents of this
            report are confidential and agrees to abide by the terms of any applicable non-disclosure agreements.</p>
          </div>
        </div>
      `.trim(),
    },
  ];
}

function buildTocPage(sections: ContentSection[]): DocPage {
  // We start content pages after cover(1) + intro(3) + toc(1) + separator(1) = 7
  // So first content page is page 7
  const CONTENT_START_PAGE = 7;

  // Distribute sections across pages (rough estimate: ~800 chars per page)
  const items = sections.map((section, idx) => {
    const approxPage = CONTENT_START_PAGE + idx;
    return `
      <li class="toc-item">
        <span class="toc-title">${escHtml(section.heading)}</span>
        <span class="toc-dots"></span>
        <span class="toc-page">${approxPage}</span>
      </li>
    `;
  });

  return {
    type: "toc",
    html: `
      <div class="doc-page page-toc">
        <div class="toc-heading">Contents</div>
        <ul class="toc-list">
          ${items.join("")}
        </ul>
      </div>
    `.trim(),
  };
}

function buildSeparatorPage(): DocPage {
  return {
    type: "separator",
    html: `<div class="doc-page page-separator"></div>`,
  };
}

function buildContentPages(sections: ContentSection[], startPage: number): DocPage[] {
  const pages: DocPage[] = [];
  let currentPage = startPage;

  for (const section of sections) {
    // Build section HTML
    let sectionHtml = `<div class="content-header"><div class="section-heading">${escHtml(section.heading)}</div></div>`;
    sectionHtml += `<div class="content-columns">`;

    for (const sub of section.subSections) {
      if (sub.subHeading) {
        sectionHtml += `<h3>${escHtml(sub.subHeading)}</h3>`;
      }
      sectionHtml += blockToHtml(sub.body);
    }

    sectionHtml += `</div>`;

    pages.push({
      type: "content",
      html: `
        <div class="doc-page page-content">
          ${sectionHtml}
          <div class="page-number">${currentPage}</div>
        </div>
      `.trim(),
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
  const company = opts.companyName ?? "Our Firm";

  return [
    // Last-4: Methodology
    {
      type: "outro" as PageType,
      html: `
        <div class="doc-page page-outro">
          <div class="outro-heading">Methodology</div>
          <div class="outro-rule"></div>
          <div class="outro-body">
            <p>The analysis presented in this report was conducted using a multi-layered research
            methodology combining quantitative and qualitative approaches.</p>
            <p><strong>Data Sources:</strong> Primary research, industry databases, public filings,
            expert interviews, and proprietary analytical models.</p>
            <p><strong>Analytical Framework:</strong> Our assessment incorporates market sizing, competitive
            positioning analysis, financial modelling, risk assessment matrices, and scenario planning.</p>
            <p><strong>Review Process:</strong> This document has undergone multiple rounds of review by
            domain-specific experts, fact-checkers, and editorial staff to ensure accuracy and clarity.</p>
          </div>
        </div>
      `.trim(),
    },
    // Last-3: Disclosures
    {
      type: "outro" as PageType,
      html: `
        <div class="doc-page page-outro">
          <div class="outro-heading">Important Disclosures</div>
          <div class="outro-rule"></div>
          <div class="outro-body">
            <p>This report is provided for informational purposes only and does not constitute investment
            advice, a recommendation, or an offer to buy or sell any securities.</p>
            <p>Past performance is not indicative of future results. Projections and estimates are based
            on current market conditions and are subject to change without notice.</p>
            <p>${escHtml(company)} and its affiliates may hold positions in securities discussed in this
            report. Recipients should conduct their own due diligence before making any investment decisions.</p>
            <p>The information contained herein has been obtained from sources believed to be reliable, but
            no guarantee is made as to its accuracy or completeness.</p>
          </div>
        </div>
      `.trim(),
    },
    // Last-2: About
    {
      type: "outro" as PageType,
      html: `
        <div class="doc-page page-outro">
          <div class="outro-heading">About ${escHtml(company)}</div>
          <div class="outro-rule"></div>
          <div class="outro-body">
            <p>${escHtml(company)} delivers institutional-grade research and advisory services,
            combining advanced AI-powered analytical tools with deep domain expertise.</p>
            <p>Our team comprises experienced investment professionals, data scientists, and industry
            specialists dedicated to providing actionable intelligence for strategic decision-making.</p>
            <p>For more information about our research capabilities and service offerings, please
            contact your dedicated relationship manager.</p>
          </div>
        </div>
      `.trim(),
    },
    // Last-1: Back cover
    {
      type: "outro-back" as PageType,
      html: `
        <div class="doc-page page-outro-back">
          <div class="back-title">${escHtml(company)}</div>
          <div class="back-rule"></div>
          <div class="back-subtitle">Institutional Research &amp; Advisory</div>
          <div class="back-info">
            &copy; ${new Date().getFullYear()} ${escHtml(company)}. All rights reserved.<br/>
            This document is confidential and intended for authorised recipients only.
          </div>
        </div>
      `.trim(),
    },
  ];
}

// ─── Main export ──────────────────────────────────────────────────────────────

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
  void _colors; // Colors are applied via CSS, not used directly here

  const date = new Date().toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const sections = parseContentSections(opts.content);

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

  // 2-4. Intro pages
  pages.push(
    ...buildIntroPages({
      companyName: opts.companyName,
      title: opts.projectTitle,
    }),
  );

  // 5. Table of Contents
  pages.push(buildTocPage(sections));

  // 6. Separator
  pages.push(buildSeparatorPage());

  // 7+. Content pages
  const contentStartPage = 7;
  pages.push(...buildContentPages(sections, contentStartPage));

  // Outro pages (last 4)
  pages.push(
    ...buildOutroPages({
      companyName: opts.companyName,
      title: opts.projectTitle,
    }),
  );

  return pages;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
