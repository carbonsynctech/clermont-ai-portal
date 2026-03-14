"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { Persona } from "@repo/db";

interface PersonaDrawerProps {
  persona: Persona | null;
  onClose: () => void;
}

export function PersonaDrawer({
  persona,
  onClose,
}: PersonaDrawerProps) {
  return (
    <Sheet open={!!persona} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="w-full sm:max-w-xl overflow-y-auto">
        {persona && (
          <>
            <SheetHeader className="mb-4">
              <div className="space-y-1">
                <SheetTitle className="text-base leading-snug">{persona.name}</SheetTitle>
                {persona.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {persona.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-sm h-5 px-1.5">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                </div>
              <SheetDescription className="text-sm text-foreground/80 leading-relaxed text-left">
                {persona.description}
              </SheetDescription>
            </SheetHeader>

            {persona.source_urls.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {persona.source_urls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
                  >
                    <Link className="h-3 w-3" />
                    {url.replace(/^https?:\/\//, "").slice(0, 50)}
                  </a>
                ))}
              </div>
            )}

            <div className="px-4 pb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                System Prompt
              </p>
              <div className="rounded-xl border bg-muted/30 p-4
                prose prose-sm dark:prose-invert max-w-none text-foreground
                [&_p]:leading-7 [&_p:not(:first-child)]:mt-3
                [&_ul]:my-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ul>li]:mt-1
                [&_ol]:my-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol>li]:mt-1
                [&_strong]:font-semibold
                [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {persona.system_prompt}
                </ReactMarkdown>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
