"use client";

import { useState } from "react";
import { Loader2, Copy, Check } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
  isStreaming?: boolean;
  isError?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render text with <mark> tags as branded purple highlights. */
export function renderWithMarks(text: string) {
  if (!text.includes("<mark>")) {
    return <span className="text-sm leading-relaxed whitespace-pre-wrap">{text}</span>;
  }
  const parts = text.split(/(<mark>[\s\S]*?<\/mark>)/g);
  return (
    <span className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith("<mark>") && part.endsWith("</mark>")) {
          return (
            <mark
              key={i}
              className="bg-primary/15 text-primary dark:bg-primary/30 dark:text-primary-foreground rounded-sm px-0.5 not-italic"
            >
              {part.slice(6, -7)}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/** Parse EXPLANATION / ORIGINAL / REPLACEMENT sections from AI response. */
export function parseFixResponse(raw: string): { explanation: string; replacement: string } | null {
  const expl = raw.match(/EXPLANATION:\s*([\s\S]+?)(?=\n\n?ORIGINAL:|\n\n?REPLACEMENT:|$)/)?.[1]?.trim();
  const repl = raw.match(/REPLACEMENT:\s*([\s\S]+?)$/)?.[1]?.trim();
  if (!repl) return null;
  return { explanation: expl ?? "", replacement: repl };
}

/** Replace the ORIGINAL paragraph in docContent with the REPLACEMENT (which may contain <mark> tags). */
export function applyFixToDocument(docContent: string, raw: string): string {
  const orig = raw.match(/ORIGINAL:\s*([\s\S]+?)\s*(?=\n+REPLACEMENT:)/)?.[1]?.trim();
  const repl = raw.match(/REPLACEMENT:\s*([\s\S]+)/)?.[1]?.trim();
  if (!orig || !repl) return docContent;

  const spliceIn = (doc: string, needle: string, replacement: string): string => {
    const idx = doc.indexOf(needle);
    if (idx === -1) return doc;
    return doc.slice(0, idx) + replacement + doc.slice(idx + needle.length);
  };

  // 1. Exact match
  if (docContent.includes(orig)) {
    return spliceIn(docContent, orig, repl);
  }

  // 2. Normalized-whitespace match
  const norm = (s: string) => s.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  const normDoc = norm(docContent);
  const normOrig = norm(orig);
  if (normDoc.includes(normOrig)) {
    return spliceIn(normDoc, normOrig, repl);
  }

  // 3. Fuzzy paragraph match
  const keywords = (s: string): Set<string> => new Set(s.toLowerCase().match(/\b[a-z]{5,}\b/g) ?? []);
  const origKw = keywords(orig);
  if (origKw.size === 0) return docContent;

  const paras = docContent.split(/\n{2,}/);
  let bestScore = 0;
  let bestIdx = -1;
  for (let i = 0; i < paras.length; i++) {
    const paraKw = keywords(paras[i]!);
    const overlap = [...origKw].filter(w => paraKw.has(w)).length;
    const score = overlap / origKw.size;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }

  if (bestIdx !== -1 && bestScore >= 0.55) {
    paras[bestIdx] = repl;
    return paras.join("\n\n");
  }

  return docContent;
}

/** Render the AI chat bubble content. Parses structured format when complete. */
export function AssistantContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  if (!content) {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
        <Loader2 className="size-3.5 animate-spin" />
        Thinking…
      </span>
    );
  }

  if (isStreaming) {
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>;
  }

  const parsed = parseFixResponse(content);
  if (parsed) {
    return (
      <div className="space-y-2">
        {parsed.explanation && (
          <p className="text-sm leading-relaxed text-muted-foreground italic">{parsed.explanation}</p>
        )}
        <div className="border-l-2 border-primary/40 pl-3">
          {renderWithMarks(parsed.replacement)}
        </div>
      </div>
    );
  }

  return <div>{renderWithMarks(content)}</div>;
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const plain = text.replace(/<\/?mark>/g, "");
    await navigator.clipboard.writeText(plain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={() => void handleCopy()}
      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy replacement"}
    </button>
  );
}
