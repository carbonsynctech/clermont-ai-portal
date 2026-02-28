/**
 * Document template styles for the stylized memo preview.
 *
 * Design extracted from "The Video Game Industry in 2025" sample PDF:
 *   - Gold headings:  #966E32
 *   - Body text:      #404040
 *   - Gray muted:     #8C8C8C
 *   - Dark navy bg:   #0F2A4A (brand primary)
 *
 * Page structure:
 *   1. Cover (full-bleed image/navy + title overlay)
 *   2. Intro A - About (navy left-panel layout)
 *   3. Intro B - Overview (white structured grid)
 *   4. Intro C - Confidentiality (full dark)
 *   5. Table of Contents (gold heading + dot-leader list)
 *   6. Separator (empty white)
 *   7+. Content pages (two-column, gold H2, page number at bottom)
 *   Last 4: Methodology, Disclosures, About, Back Cover
 */

export interface DocumentColors {
  primary: string;   // Deep Navy   #0F2A4A
  secondary: string; // Corp Blue   #1A5276
  accent: string;    // Gold        #966E32
  neutral: string;   // Dark Gray   #404040
  muted: string;     // Gray        #8C8C8C
  surface: string;   // Off White   #F8FAFC
}

export const DEFAULT_COLORS: DocumentColors = {
  primary: "#0F2A4A",
  secondary: "#1A5276",
  accent: "#966E32",
  neutral: "#404040",
  muted: "#8C8C8C",
  surface: "#F8FAFC",
};

export function getDocumentCSS(colors: DocumentColors = DEFAULT_COLORS): string {
  return `
@font-face {
  font-family: 'Gill Sans MT Light';
  src: url('/gill-sans-mt-light.ttf') format('truetype');
  font-weight: 300;
  font-style: normal;
}

/* Reset */
.doc-preview * { box-sizing: border-box; margin: 0; padding: 0; }

/* A4 page shell - 794px x 1123px */
.doc-page {
  position: relative;
  width: 794px;
  height: 1123px;
  background: #ffffff;
  overflow: hidden;
  font-family: 'Gill Sans MT Light', 'Gill Sans Light', 'Gill Sans MT Light', 'Gill Sans Light', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
  color: ${colors.neutral};
  font-size: 13px;
  line-height: 1.55;
}

/*  Cover page - image only, no overlay */
.page-cover {
  background: ${colors.primary};
}
.page-cover .cover-image-fill {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* Solid tan/gold page (#D2B38C) */
.page-solid-tan {
  background: #D2B38C;
}

/*  Intro A  navy left panel  */
.page-intro-a { display: flex; flex-direction: row; }
.page-intro-a .intro-panel {
  width: 220px; background: ${colors.primary}; flex-shrink: 0;
  display: flex; flex-direction: column; justify-content: flex-end;
  padding: 52px 32px;
}
.page-intro-a .intro-panel-eyebrow {
  font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase;
  color: ${colors.accent}; margin-bottom: 10px;
}
.page-intro-a .intro-panel-title {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px; font-weight: 700; color: #ffffff;
  line-height: 1.25; margin-bottom: 16px;
}
.page-intro-a .intro-panel-rule { width: 36px; height: 2px; background: ${colors.accent}; }
.page-intro-a .intro-body-area {
  flex: 1; padding: 72px 56px 72px 52px;
  display: flex; flex-direction: column; justify-content: center;
}
.page-intro-a .intro-body-area h3 {
  font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
  color: ${colors.accent}; margin-bottom: 14px; font-weight: 600;
}
.page-intro-a .intro-body-area p {
  font-size: 12px; line-height: 1.75; color: ${colors.neutral}; margin-bottom: 16px;
}
.page-intro-a .intro-body-area p:last-child { margin-bottom: 0; }
.page-intro-a .intro-body-rule { width: 40px; height: 2px; background: ${colors.accent}; margin: 18px 0; }

/*  Intro B  structured white grid  */
.page-intro-b { padding: 80px 80px 60px; display: flex; flex-direction: column; }
.page-intro-b .introB-top-rule { width: 100%; height: 4px; background: ${colors.accent}; margin-bottom: 48px; }
.page-intro-b .introB-heading {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 24px; font-weight: 700; color: ${colors.primary};
  margin-bottom: 36px; letter-spacing: -0.01em;
}
.page-intro-b .introB-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 36px 48px; flex: 1;
}
.page-intro-b .introB-cell-label {
  font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase;
  color: ${colors.accent}; margin-bottom: 8px; font-weight: 600;
}
.page-intro-b .introB-cell-text { font-size: 11.5px; line-height: 1.72; color: ${colors.neutral}; }

/*  Intro C  full dark confidentiality  */
.page-intro-c {
  background: ${colors.primary};
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  text-align: center; padding: 80px;
}
.page-intro-c .introC-icon { font-size: 38px; color: ${colors.accent}; margin-bottom: 28px; opacity: 0.8; }
.page-intro-c .introC-heading {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 22px; font-weight: 700; color: #ffffff;
  margin-bottom: 18px; letter-spacing: -0.01em;
}
.page-intro-c .introC-rule { width: 48px; height: 2px; background: ${colors.accent}; margin: 0 auto 24px; }
.page-intro-c .introC-body { font-size: 12px; line-height: 1.75; color: rgba(255,255,255,0.72); max-width: 500px; }
.page-intro-c .introC-body p { margin-bottom: 14px; }
.page-intro-c .introC-body p:last-child { margin-bottom: 0; }

/* Page 4 static full-image */
.page-static-image {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/*  Table of Contents  */
.page-toc { padding: 240px 140px 120px; display: flex; flex-direction: column; }
.page-toc .toc-top-rule { display: none; }
.page-toc .toc-heading {
  font-family: 'Gill Sans MT Light', 'Gill Sans Light', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
  font-size: 46px; font-weight: 400; color: ${colors.accent};
  margin-bottom: 110px; letter-spacing: 0.01em; text-align: center;
}
.page-toc .toc-list { list-style: none; margin: 0; padding: 0; }
.page-toc .toc-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  padding: 8px 0;
}
.page-toc .toc-num,
.page-toc .toc-dots { display: none; }
.page-toc .toc-title {
  font-size: 16px;
  line-height: 1.5;
  color: #6f6f6f;
  flex: 1;
}
.page-toc .toc-page-num {
  font-size: 16px;
  line-height: 1.5;
  color: #6f6f6f;
  min-width: 24px;
  text-align: right;
  flex-shrink: 0;
}

/*  Separator (empty page)  */
.page-separator { background: #ffffff; }

/*  Content pages  */
.page-content { padding: 52px 72px 60px; display: flex; flex-direction: column; }
.page-content .content-top-rule { width: 100%; height: 4px; background: ${colors.accent}; margin-bottom: 20px; flex-shrink: 0; }
.page-content .section-heading {
  font-family: 'Gill Sans MT Light', 'Gill Sans Light', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
  font-size: 26px; font-weight: 400; color: ${colors.accent};
  line-height: 1.2; margin-bottom: 6px; flex-shrink: 0; letter-spacing: 0.01em;
}
.page-content .section-sub-label {
  font-size: 12px; font-weight: 600; color: ${colors.accent};
  margin-bottom: 22px; flex-shrink: 0;
}
.page-content .content-columns {
  flex: 1;
  column-count: 2;
  column-gap: 40px;
  column-rule: 1px solid rgba(0,0,0,0.06);
  overflow: hidden;
}
.page-content .content-columns p {
  font-size: 12px; line-height: 1.65; color: ${colors.neutral};
  margin-bottom: 10px; text-align: justify; hyphens: auto;
}
.page-content .content-columns strong { font-weight: 700; color: ${colors.primary}; }
.page-content .content-columns em { font-style: italic; }
.page-content .content-columns h3 {
  font-family: 'Gill Sans MT Light', 'Gill Sans Light', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
  font-size: 13px; font-weight: 700; color: ${colors.accent};
  margin-top: 16px; margin-bottom: 6px; break-after: avoid;
}
.page-content .content-columns ul,
.page-content .content-columns ol {
  font-size: 12px; line-height: 1.65; color: ${colors.neutral};
  padding-left: 18px; margin-bottom: 10px;
}
.page-content .content-columns li { margin-bottom: 4px; }
.page-content .content-columns blockquote {
  border-left: 2px solid ${colors.accent}; padding-left: 12px;
  margin: 10px 0; font-style: italic; color: ${colors.muted}; font-size: 11.5px;
}
.page-content .content-columns code {
  font-family: 'Courier New', monospace; font-size: 10.5px;
  background: rgba(150,110,50,0.08); padding: 1px 4px; border-radius: 3px;
}
.page-content .content-columns mark {
  background: rgba(150,110,50,0.12); color: ${colors.primary};
  padding: 0 3px; border-radius: 2px;
}

/* Flow layout used from page 7 onward */
.page-content.page-content-flow {
  padding: 72px 88px 64px;
  background: #ffffff;
}
.page-content.page-content-flow .flow-page-title {
  font-family: 'Gill Sans MT Light', 'Gill Sans Light', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
  font-size: 28px;
  line-height: 1.15;
  font-weight: 400;
  color: ${colors.accent};
  text-align: center;
  margin: 0 0 34px;
}
.page-content.page-content-flow .flow-columns {
  flex: 1;
  column-count: 2;
  column-gap: 44px;
  column-fill: auto;
  overflow: hidden;
}
.page-content.page-content-flow .flow-columns p,
.page-content.page-content-flow .flow-columns li {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 13px;
  line-height: 1.55;
  color: #4a4a4a;
  margin-bottom: 9px;
  text-align: left;
  hyphens: auto;
}
.page-content.page-content-flow .flow-columns h2 {
  font-family: 'Gill Sans MT Light', 'Gill Sans Light', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
  font-size: 18px;
  line-height: 1.3;
  font-weight: 500;
  color: ${colors.accent};
  margin: 10px 0 8px;
  break-after: avoid-column;
}
.page-content.page-content-flow .flow-columns h3 {
  font-family: 'Gill Sans MT Light', 'Gill Sans Light', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
  font-size: 15px;
  line-height: 1.35;
  font-weight: 600;
  color: ${colors.accent};
  margin: 10px 0 8px;
  break-after: avoid-column;
}
.page-content.page-content-flow .flow-columns ol,
.page-content.page-content-flow .flow-columns ul {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 13px;
  line-height: 1.55;
  color: #4a4a4a;
  padding-left: 18px;
  margin-bottom: 8px;
}
.page-content.page-content-flow .flow-columns li {
  margin-bottom: 7px;
}
.page-content.page-content-flow .flow-columns strong {
  font-weight: 700;
  color: #3f3f3f;
}

/* Page number */
.page-number {
  position: absolute; bottom: 26px; left: 0; right: 0;
  text-align: center; font-size: 10px; color: ${colors.muted};
  letter-spacing: 0.06em;
}

/* Trailing pages */
.page-trailing-blank {
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-trailing-blank span {
  font-size: 13px;
  color: #9ca3af;
  text-align: center;
}
.page-trailing-tan {
  background: #D0B38B;
}
.page-trailing-black {
  background: #000000;
}

/*  Outro pages  */
.page-outro { padding: 80px 96px 64px; display: flex; flex-direction: column; }
.page-outro .outro-top-rule { width: 100%; height: 4px; background: ${colors.accent}; margin-bottom: 48px; }
.page-outro .outro-heading {
  font-family: 'Gill Sans MT Light', 'Gill Sans Light', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
  font-size: 24px; font-weight: 400; color: ${colors.accent}; margin-bottom: 28px;
}
.page-outro .outro-body { font-size: 12px; line-height: 1.75; color: ${colors.neutral}; max-width: 560px; }
.page-outro .outro-body p { margin-bottom: 14px; }
.page-outro .outro-body p:last-child { margin-bottom: 0; }
.page-outro .outro-body strong { font-weight: 700; color: ${colors.primary}; }

/* Back cover */
.page-outro-back { background: ${colors.primary}; display: flex; flex-direction: column; }
.page-outro-back .back-top-rule { width: 100%; height: 6px; background: ${colors.accent}; flex-shrink: 0; }
.page-outro-back .back-inner {
  flex: 1; display: flex; flex-direction: column;
  justify-content: center; align-items: center; text-align: center; padding: 80px;
}
.page-outro-back .back-eyebrow {
  font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase;
  color: ${colors.accent}; margin-bottom: 14px;
}
.page-outro-back .back-rule { width: 48px; height: 2px; background: ${colors.accent}; margin: 0 auto 20px; }
.page-outro-back .back-title {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 26px; font-weight: 700; color: #ffffff;
  margin-bottom: 12px; letter-spacing: -0.01em;
}
.page-outro-back .back-subtitle { font-size: 11px; color: rgba(255,255,255,0.58); max-width: 380px; line-height: 1.6; margin-bottom: 32px; }
.page-outro-back .back-info { font-size: 9.5px; color: rgba(255,255,255,0.35); line-height: 1.6; }
  `.trim();
}
