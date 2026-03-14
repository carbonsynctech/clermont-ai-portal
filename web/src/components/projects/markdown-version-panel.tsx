"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface MarkdownVersionPanelProps {
  title: string;
  content: string;
  wordCount?: number;
}

export function MarkdownVersionPanel({ title, content, wordCount }: MarkdownVersionPanelProps) {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-base text-foreground">{title}</h3>
        <span className="text-sm text-muted-foreground">
          {wordCount?.toLocaleString() ?? "?"} words
        </span>
      </div>

      <div
        className="prose prose-sm dark:prose-invert max-w-none text-foreground
          [&_h1]:scroll-m-20 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:tracking-tight
          [&_h2]:scroll-m-20 [&_h2]:border-b [&_h2]:pb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:first:mt-0
          [&_h3]:scroll-m-20 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight
          [&_h4]:scroll-m-20 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:tracking-tight
          [&_p]:leading-7 [&_p:not(:first-child)]:mt-4
          [&_ul]:my-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul>li]:mt-1
          [&_ol]:my-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol>li]:mt-1
          [&_blockquote]:mt-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-6 [&_blockquote]:italic
          [&_strong]:font-semibold
          [&_table]:w-full [&_table]:my-4 [&_tr]:m-0 [&_tr]:border-t [&_tr]:p-0 [&_tr:nth-child(even)]:bg-muted
          [&_th]:border [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold
          [&_td]:border [&_td]:px-4 [&_td]:py-2 [&_td]:text-left
          [&_hr]:my-4 [&_hr]:border [&_hr]:border-muted-foreground/20
          [&_mark]:bg-primary/15 [&_mark]:text-primary [&_mark]:dark:bg-primary/30 [&_mark]:dark:text-white [&_mark]:rounded-sm [&_mark]:px-0.5 [&_mark]:not-italic"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
