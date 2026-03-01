/**
 * Builds a standalone styled HTML document for export.
 * Reuses the same template system as StyledDocumentPreview
 * so exports match the in-app preview.
 */

import { getDocumentCSS, DEFAULT_COLORS, type DocumentColors } from "@/components/projects/steps/document-template";
import { buildStyledPages, type BuildStyledPagesOptions } from "@/components/projects/steps/document-pages";

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
