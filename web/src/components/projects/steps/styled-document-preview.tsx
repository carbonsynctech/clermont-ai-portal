"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDocumentCSS, type DocumentColors, DEFAULT_COLORS } from "./document-template";
import { buildStyledPages, type BuildStyledPagesOptions } from "./document-pages";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StyledDocumentPreviewProps {
  /** The markdown content from the styled version */
  content: string;
  projectTitle: string;
  companyName?: string;
  dealType?: string;
  coverImageUrl?: string;
  colors?: DocumentColors;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StyledDocumentPreview({
  content,
  projectTitle,
  companyName,
  dealType,
  coverImageUrl,
  colors = DEFAULT_COLORS,
}: StyledDocumentPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Observe container width for scaling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Build pages from content
  const pages = useMemo(() => {
    const opts: BuildStyledPagesOptions = {
      content,
      projectTitle,
      companyName,
      dealType,
      coverImageUrl,
      colors,
    };
    return buildStyledPages(opts);
  }, [content, projectTitle, companyName, dealType, coverImageUrl, colors]);

  // Generate scoped CSS
  const css = useMemo(() => getDocumentCSS(colors), [colors]);

  // Scale factor: A4 is 210mm ≈ 794px at 96dpi. We scale pages to fit the container.
  const A4_WIDTH_PX = 794;
  const scale = containerWidth > 0 ? containerWidth / A4_WIDTH_PX : 1;

  return (
    <div ref={containerRef} className="doc-preview w-full">
      {/* Inject scoped styles */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="flex flex-col items-center gap-4 py-4 px-2">
          {pages.map((page, idx) => (
            <div
              key={idx}
              className="shadow-lg ring-1 ring-black/5 rounded-sm overflow-hidden"
              style={{
                width: `${A4_WIDTH_PX}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top center",
                // Maintain proper spacing when scaled
                marginBottom: `${(scale - 1) * A4_WIDTH_PX * (297 / 210)}px`,
              }}
            >
              <div dangerouslySetInnerHTML={{ __html: page.html }} />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
