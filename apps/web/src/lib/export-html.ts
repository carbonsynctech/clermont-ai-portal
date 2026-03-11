/**
 * Builds a standalone styled HTML document for export.
 * Reuses the same template system as StyledDocumentPreview
 * so exports match the in-app preview.
 */

import { getDocumentCSS, DEFAULT_COLORS, type DocumentColors } from "@/components/projects/steps/document-template";
import { buildStyledPages, type BuildStyledPagesOptions } from "@/components/projects/steps/document-pages";
import {
  sanitizeMarkdownForPreview,
  parseContentSections,
  blockToHtml,
} from "@/components/projects/steps/document-pages";

export interface ExportHtmlOptions {
  content: string;
  projectTitle: string;
  companyName?: string;
  dealType?: string;
  coverImageUrl?: string;
  colors?: DocumentColors;
  assetBaseUrl?: string;
}

/**
 * Produce a self-contained HTML file that looks like the paginated preview.
 * Decorative-only pages (solid tan, static image, trailing blanks) are stripped.
 * Cover keeps its title text but drops background images that can't resolve externally.
 */
export function buildStyledExportHtml(opts: ExportHtmlOptions): string {
  const colors = opts.colors ?? DEFAULT_COLORS;

  const pages = buildStyledPages({
    content: opts.content,
    projectTitle: opts.projectTitle,
    companyName: opts.companyName,
    dealType: opts.dealType,
    coverImageUrl: opts.coverImageUrl,
    colors,
  } satisfies BuildStyledPagesOptions);

  // Keep cover, TOC, separator, content, and meaningful outro pages.
  // Drop only purely decorative/trailing filler pages.
  const exportPages = pages.filter((page) => {
    if (page.html.includes("page-solid-tan")) return false;
    if (page.html.includes("page-trailing-blank")) return false;
    if (page.html.includes("page-trailing-tan")) return false;
    if (page.html.includes("page-trailing-black")) return false;
    return true;
  });

  const assetBaseUrl = normaliseAssetBaseUrl(opts.assetBaseUrl);

  // Preserve image markup and rewrite relative asset URLs to absolute URLs.
  const pagesHtml = exportPages
    .map((page) => {
      let html = page.html;

      // `src="/asset.png"` -> `src="https://host/asset.png"`
      html = html.replace(/src=(['"])\/([^'"]+)\1/g, (_m, quote: string, path: string) => {
        if (!assetBaseUrl) return `src=${quote}/${path}${quote}`;
        return `src=${quote}${assetBaseUrl}/${path}${quote}`;
      });

      // `url('/asset.png')` / `url("/asset.png")` / `url(/asset.png)` -> absolute URL
      html = html.replace(/url\((['"]?)\/([^'"\)]+)\1\)/g, (_m, quote: string, path: string) => {
        if (!assetBaseUrl) return `url(${quote}/${path}${quote})`;
        return `url(${quote}${assetBaseUrl}/${path}${quote})`;
      });

      return html;
    })
    .join("\n\n");

  const css = getDocumentCSS(colors);
  const title = escapeHtml(opts.projectTitle || "Export");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    @media print {
      body { margin: 0; }
      .doc-page { page-break-after: always; }
      .doc-page:last-child { page-break-after: auto; }
    }

    body {
      margin: 0;
      padding: 0;
      background: #e5e7eb;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      padding: 24px 0;
      font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
    }

    @media print {
      body {
        background: white;
        padding: 0;
        gap: 0;
      }
    }

    .doc-preview .doc-page {
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    }

    @media print {
      .doc-preview .doc-page {
        box-shadow: none;
      }
    }

    /* Scoped template CSS */
    ${css}
  </style>
</head>
<body>
  <div class="doc-preview">
    ${pagesHtml}
  </div>
</body>
</html>`;
}

/**
 * Produce a CSS-flow-based HTML document for PDF export via Puppeteer.
 * Unlike the paginated preview, this uses native CSS @page + break rules
 * so the browser handles pagination — no content can be clipped.
 */
export function buildFlowingPdfHtml(opts: ExportHtmlOptions): string {
  const sanitized = sanitizeMarkdownForPreview(opts.content);
  const sections = parseContentSections(sanitized);
  const title = escapeHtml(opts.projectTitle || "Export");
  const assetBaseUrl = normaliseAssetBaseUrl(opts.assetBaseUrl);

  const date = new Date().toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build body HTML from sections
  let bodyHtml = "";

  // Title block
  bodyHtml += `<div class="title-block">`;
  bodyHtml += `<h1>${title}</h1>`;
  if (opts.companyName) {
    bodyHtml += `<p class="meta">${escapeHtml(opts.companyName)}</p>`;
  }
  if (opts.dealType) {
    bodyHtml += `<p class="meta">${escapeHtml(opts.dealType)}</p>`;
  }
  bodyHtml += `<p class="meta">${escapeHtml(date)}</p>`;
  bodyHtml += `</div>`;

  if (sections.length > 0) {
    let isFirst = true;
    for (const section of sections) {
      const heading = section.heading.trim();
      if (heading) {
        const cls = isFirst ? ' class="first-section"' : "";
        bodyHtml += `<h2${cls}>${escapeHtml(heading)}</h2>`;
        isFirst = false;
      }
      for (const sub of section.subSections) {
        if (sub.subHeading) {
          bodyHtml += `<h3>${escapeHtml(sub.subHeading)}</h3>`;
        }
        const html = blockToHtml(sub.body).trim();
        if (html) bodyHtml += html;
      }
    }
  } else {
    // Fallback: render as paragraphs
    const paragraphs = sanitized
      .split(/\n\s*\n+/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);

    for (const paragraph of paragraphs) {
      const html = blockToHtml(paragraph).trim();
      if (html) bodyHtml += html;
    }
  }

  // Rewrite relative asset URLs to absolute
  if (assetBaseUrl) {
    bodyHtml = bodyHtml.replace(
      /src=(['"])\/([^'"]+)\1/g,
      (_m, quote: string, path: string) => `src=${quote}${assetBaseUrl}/${path}${quote}`,
    );
    bodyHtml = bodyHtml.replace(
      /url\((['"]?)\/([^'"\)]+)\1\)/g,
      (_m, quote: string, path: string) => `url(${quote}${assetBaseUrl}/${path}${quote})`,
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page {
      size: A4;
      margin: 22mm 28mm;
    }

    body {
      font-family: Georgia, serif;
      font-size: 13px;
      line-height: 1.65;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }

    h1 {
      font-size: 28px;
      color: #2c3e6b;
      margin-bottom: 6px;
      line-height: 1.3;
    }

    h2 {
      font-size: 18px;
      color: #2c3e6b;
      break-before: page;
      page-break-before: always;
      margin-top: 0;
      margin-bottom: 10px;
      line-height: 1.3;
    }

    h2.first-section {
      break-before: avoid;
      page-break-before: avoid;
    }

    h3 {
      font-size: 14px;
      color: #2c3e6b;
      break-after: avoid;
      page-break-after: avoid;
      margin-bottom: 4px;
      line-height: 1.35;
    }

    p {
      orphans: 3;
      widows: 3;
      margin-bottom: 8px;
    }

    ul, ol {
      orphans: 3;
      widows: 3;
      margin-bottom: 8px;
      padding-left: 20px;
    }

    li {
      margin-bottom: 3px;
    }

    blockquote {
      border-left: 3px solid #D0B38B;
      margin: 8px 0;
      padding: 4px 12px;
      color: #444;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      break-inside: avoid;
      page-break-inside: avoid;
      margin: 14px 0 20px;
      font-size: 11.5px;
      line-height: 1.45;
    }

    thead tr {
      background: #2c3e6b;
      color: white;
    }

    th {
      padding: 7px 10px;
      text-align: left;
      font-weight: 600;
    }

    td {
      padding: 6px 10px;
      border-bottom: 1px solid #ddd;
    }

    tr:nth-child(even) td {
      background: #f5f5f5;
    }

    .title-block {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #D0B38B;
    }

    .title-block .meta {
      font-size: 14px;
      color: #555;
      margin-bottom: 4px;
    }

    strong {
      color: #2c3e6b;
    }

    a {
      color: #2c3e6b;
      text-decoration: underline;
    }

    code {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      background: #f0f0f0;
      padding: 1px 4px;
      border-radius: 2px;
    }

    mark {
      background: #fef3cd;
      padding: 1px 2px;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

function normaliseAssetBaseUrl(input?: string): string | undefined {
  if (!input) return undefined;
  return input.replace(/\/+$/, "");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
