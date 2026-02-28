/**
 * Document template styles for the stylized memo preview.
 *
 * Extracted from the sample PDFs:
 *   - PromptForge Wisdom Report v8.pdf
 *   - The Video Game Industry in 2025 report
 *
 * Structure:
 *   Page 1: Cover (full-bleed image + title overlay)
 *   Pages 2-4: Decorative intro pages (brand, abstract, confidentiality)
 *   Page 5: Table of Contents
 *   Page 6: Separator (empty)
 *   Pages 7+: Content (two-column layout with gold headings)
 *   Last 4 pages: Outro (methodology, disclosures, about, back cover)
 */

// ─── Color palette (matches style-guide-preview defaults) ─────────────────────

export interface DocumentColors {
  primary: string;   // Deep Navy  — #0F2A4A
  secondary: string; // Corp Blue  — #1A5276
  accent: string;    // Gold       — #C9A84C
  neutral: string;   // Charcoal   — #374151
  muted: string;     // Slate Gray — #9CA3AF
  surface: string;   // Off White  — #F8FAFC
}

export const DEFAULT_COLORS: DocumentColors = {
  primary: "#0F2A4A",
  secondary: "#1A5276",
  accent: "#C9A84C",
  neutral: "#374151",
  muted: "#9CA3AF",
  surface: "#F8FAFC",
};

// ─── CSS generator ────────────────────────────────────────────────────────────

export function getDocumentCSS(colors: DocumentColors = DEFAULT_COLORS): string {
  return `
/* ── Reset inside the preview scope ─────────────────────────────────────── */
.doc-preview * {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* ── A4 Page container ──────────────────────────────────────────────────── */
.doc-page {
  position: relative;
  width: 100%;
  aspect-ratio: 210 / 297;
  background: #ffffff;
  overflow: hidden;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: ${colors.neutral};
  font-size: 9px;
  line-height: 1.55;
}

/* ── Cover page ─────────────────────────────────────────────────────────── */
.page-cover {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 8%;
  background: ${colors.primary};
  color: #ffffff;
}
.page-cover.has-image {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
.page-cover .cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.65) 100%);
}
.page-cover .cover-content {
  position: relative;
  z-index: 1;
}
.page-cover .cover-label {
  font-size: 7px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${colors.accent};
  margin-bottom: 3%;
  font-weight: 500;
}
.page-cover .cover-title {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.15;
  margin-bottom: 3%;
  color: #ffffff;
}
.page-cover .cover-subtitle {
  font-size: 10px;
  line-height: 1.5;
  color: rgba(255,255,255,0.8);
  max-width: 75%;
}
.page-cover .cover-meta {
  margin-top: 6%;
  display: flex;
  gap: 10%;
}
.page-cover .cover-meta-item {
  font-size: 7px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(255,255,255,0.6);
}
.page-cover .cover-meta-value {
  display: block;
  font-size: 8.5px;
  color: rgba(255,255,255,0.9);
  margin-top: 2px;
  letter-spacing: normal;
  text-transform: none;
}
.page-cover .cover-divider {
  width: 50px;
  height: 2px;
  background: ${colors.accent};
  margin-bottom: 4%;
}

/* ── Intro pages (2–4) ──────────────────────────────────────────────────── */
.page-intro {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 12% 10%;
  text-align: center;
}
.page-intro .intro-rule {
  width: 60px;
  height: 2px;
  background: ${colors.accent};
  margin: 5% auto;
}
.page-intro .intro-heading {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 16px;
  font-weight: 700;
  color: ${colors.primary};
  margin-bottom: 4%;
  letter-spacing: -0.01em;
}
.page-intro .intro-body {
  font-size: 9px;
  line-height: 1.7;
  color: ${colors.neutral};
  max-width: 80%;
  margin: 0 auto;
}
.page-intro .intro-body strong {
  font-weight: 600;
  color: ${colors.primary};
}
.page-intro .intro-icon {
  font-size: 32px;
  color: ${colors.accent};
  margin-bottom: 4%;
  opacity: 0.7;
}
.page-intro-banner {
  background: ${colors.primary};
  color: #fff;
  padding: 12% 10%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}
.page-intro-banner .intro-heading {
  color: #ffffff;
}
.page-intro-banner .intro-body {
  color: rgba(255,255,255,0.85);
}

/* ── Table of Contents page ─────────────────────────────────────────────── */
.page-toc {
  padding: 10% 10% 8%;
  display: flex;
  flex-direction: column;
}
.page-toc .toc-heading {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px;
  font-weight: 700;
  color: ${colors.primary};
  margin-bottom: 8%;
  text-align: center;
  letter-spacing: -0.01em;
}
.page-toc .toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
}
.page-toc .toc-item {
  display: flex;
  align-items: baseline;
  padding: 1.2% 0;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.page-toc .toc-title {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
  font-weight: 600;
  color: ${colors.accent};
  white-space: nowrap;
}
.page-toc .toc-dots {
  flex: 1;
  border-bottom: 1px dotted ${colors.muted};
  margin: 0 6px;
  min-width: 20px;
  position: relative;
  top: -3px;
}
.page-toc .toc-page {
  font-size: 9px;
  color: ${colors.neutral};
  font-weight: 500;
  min-width: 18px;
  text-align: right;
}

/* ── Separator (empty page) ─────────────────────────────────────────────── */
.page-separator {
  background: #ffffff;
}

/* ── Content pages ──────────────────────────────────────────────────────── */
.page-content {
  padding: 7% 7% 10%;
  display: flex;
  flex-direction: column;
}
.page-content .content-header {
  margin-bottom: 4%;
}
.page-content .section-heading {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 15px;
  font-weight: 700;
  color: ${colors.accent};
  line-height: 1.2;
  margin-bottom: 2%;
  padding-bottom: 1.5%;
  border-bottom: 1.5px solid ${colors.accent};
}
.page-content .section-subheading {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11px;
  font-weight: 600;
  color: ${colors.primary};
  line-height: 1.3;
  margin-top: 3%;
  margin-bottom: 1.5%;
}
.page-content .content-columns {
  column-count: 2;
  column-gap: 5%;
  column-rule: 1px solid rgba(0,0,0,0.06);
  flex: 1;
}
.page-content .content-columns p {
  font-size: 8.5px;
  line-height: 1.6;
  margin-bottom: 1.8%;
  text-align: justify;
  hyphens: auto;
  color: ${colors.neutral};
}
.page-content .content-columns p:first-child {
  margin-top: 0;
}
.page-content .content-columns strong {
  font-weight: 600;
  color: ${colors.primary};
}
.page-content .content-columns em {
  font-style: italic;
}
.page-content .content-columns ul,
.page-content .content-columns ol {
  font-size: 8.5px;
  line-height: 1.6;
  margin-bottom: 1.8%;
  padding-left: 4%;
  color: ${colors.neutral};
}
.page-content .content-columns li {
  margin-bottom: 0.5%;
}
.page-content .content-columns h3 {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10px;
  font-weight: 600;
  color: ${colors.primary};
  margin-top: 2.5%;
  margin-bottom: 1%;
  break-after: avoid;
  column-span: none;
}
.page-content .content-columns blockquote {
  border-left: 2px solid ${colors.accent};
  padding-left: 3%;
  margin: 2% 0;
  font-style: italic;
  color: ${colors.muted};
  font-size: 8.5px;
}
.page-content .content-columns mark {
  background: rgba(201, 168, 76, 0.15);
  color: ${colors.primary};
  padding: 0 2px;
  border-radius: 2px;
}

/* Page number */
.page-number {
  position: absolute;
  bottom: 4%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 7px;
  color: ${colors.muted};
  letter-spacing: 0.05em;
}

/* ── Outro pages ────────────────────────────────────────────────────────── */
.page-outro {
  padding: 10%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.page-outro .outro-heading {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 14px;
  font-weight: 700;
  color: ${colors.primary};
  margin-bottom: 4%;
}
.page-outro .outro-rule {
  width: 50px;
  height: 2px;
  background: ${colors.accent};
  margin-bottom: 4%;
}
.page-outro .outro-body {
  font-size: 8.5px;
  line-height: 1.7;
  color: ${colors.neutral};
}
.page-outro .outro-body p {
  margin-bottom: 2%;
}
.page-outro .outro-body strong {
  font-weight: 600;
  color: ${colors.primary};
}
.page-outro-back {
  background: ${colors.primary};
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 12%;
}
.page-outro-back .back-title {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 2%;
}
.page-outro-back .back-subtitle {
  font-size: 9px;
  color: rgba(255,255,255,0.7);
  max-width: 60%;
}
.page-outro-back .back-rule {
  width: 50px;
  height: 2px;
  background: ${colors.accent};
  margin: 5% auto;
}
.page-outro-back .back-info {
  font-size: 7.5px;
  color: rgba(255,255,255,0.5);
  margin-top: 3%;
}
  `.trim();
}
