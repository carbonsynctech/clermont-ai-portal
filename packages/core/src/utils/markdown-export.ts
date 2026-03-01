function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(markdown: string): string {
  const escaped = escapeHtml(markdown);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function markdownToHtmlBody(markdown: string): string {
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      chunks.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      closeList();
      continue;
    }

    if (line.startsWith("### ")) {
      closeList();
      chunks.push(`<h3>${renderInline(line.slice(4))}</h3>`);
      continue;
    }

    if (line.startsWith("## ")) {
      closeList();
      chunks.push(`<h2>${renderInline(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith("# ")) {
      closeList();
      chunks.push(`<h1>${renderInline(line.slice(2))}</h1>`);
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        chunks.push("<ul>");
        inList = true;
      }
      chunks.push(`<li>${renderInline(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    chunks.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  return chunks.join("\n");
}

export function buildExportHtmlDocument(markdown: string, title: string): string {
  const safeTitle = escapeHtml(title || "Export");
  const body = markdownToHtmlBody(markdown);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root {
        color-scheme: light;
      }

      body {
        margin: 0;
        font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #111827;
        background: #ffffff;
      }

      main {
        max-width: 820px;
        margin: 0 auto;
        padding: 32px;
      }

      h1, h2, h3 {
        line-height: 1.3;
        margin: 1.2em 0 0.5em;
      }

      h1 { font-size: 1.8rem; }
      h2 { font-size: 1.4rem; }
      h3 { font-size: 1.2rem; }

      p {
        margin: 0.7em 0;
      }

      ul {
        margin: 0.7em 0 0.7em 1.25em;
        padding: 0;
      }

      li {
        margin: 0.3em 0;
      }

      code {
        background: #f3f4f6;
        border-radius: 4px;
        padding: 0.12em 0.3em;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 0.92em;
      }
    </style>
  </head>
  <body>
    <main>
      ${body}
    </main>
  </body>
</html>`;
}
