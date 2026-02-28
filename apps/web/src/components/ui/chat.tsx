"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Loader2, Sparkles, User } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

interface ChatProps {
  messages: ChatMessage[]
  input: string
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  isGenerating: boolean
  stop: () => void
  placeholder?: string
  emptyState?: string
  error?: string | null
  elapsedLabel?: string | null
  className?: string
}

const MARKDOWN_TYPOGRAPHY_CLASSNAME =
  "text-sm text-foreground [&_h1]:scroll-m-20 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:tracking-tight [&_h1]:lg:text-3xl " +
  "[&_h2]:scroll-m-20 [&_h2]:border-b [&_h2]:pb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:first:mt-0 " +
  "[&_h3]:scroll-m-20 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight " +
  "[&_h4]:scroll-m-20 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:tracking-tight " +
  "[&_p]:leading-7 [&_p:not(:first-child)]:mt-4 " +
  "[&_ul]:my-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul>li]:mt-1 " +
  "[&_ol]:my-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol>li]:mt-1 " +
  "[&_blockquote]:mt-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-6 [&_blockquote]:italic " +
  "[&_code]:relative [&_code]:rounded [&_code]:bg-muted [&_code]:px-[0.3rem] [&_code]:py-[0.2rem] [&_code]:font-mono [&_code]:text-xs " +
  "[&_pre]:mt-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted [&_pre]:p-4 " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold " +
  "[&_table]:w-full [&_table]:my-4 [&_tr]:m-0 [&_tr]:border-t [&_tr]:p-0 [&_tr:nth-child(even)]:bg-muted " +
  "[&_th]:border [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold " +
  "[&_td]:border [&_td]:px-4 [&_td]:py-2 [&_td]:text-left [&_hr]:my-4 [&_hr]:border [&_hr]:border-muted-foreground/20"

export function Chat({
  messages,
  input,
  handleInputChange,
  handleSubmit,
  isGenerating,
  stop,
  placeholder = "Ask anything about your memo, sources, or next steps...",
  emptyState = "Start the conversation by asking AI a question.",
  error,
  elapsedLabel,
  className,
}: ChatProps) {
  const bottomRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages])

  return (
    <div className={cn("flex h-[65vh] min-h-[520px] flex-col rounded-md border bg-card", className)}>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {messages.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">{emptyState}</p>
          ) : null}

          {messages.map((message) => {
            const isAssistant = message.role === "assistant"
            return (
              <div key={message.id} className={cn("flex gap-2", isAssistant ? "justify-start" : "justify-end")}>
                {isAssistant ? (
                  <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <Sparkles className="size-3.5" />
                  </span>
                ) : null}

                <div
                  className={cn(
                    "max-w-[90%] rounded-lg border px-3 py-2",
                    isAssistant
                      ? "bg-background text-foreground"
                      : "border-primary/30 bg-primary/10 text-foreground",
                  )}
                >
                  {isAssistant ? (
                    <div className={MARKDOWN_TYPOGRAPHY_CLASSNAME}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content || "_Generating response..._"}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>

                {!isAssistant ? (
                  <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <User className="size-3.5" />
                  </span>
                ) : null}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        {error ? (
          <p className="mb-2 rounded px-2 py-1.5 text-xs leading-relaxed text-destructive bg-destructive/10">{error}</p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            value={input}
            onChange={handleInputChange}
            placeholder={placeholder}
            className="min-h-20 max-h-40 resize-y"
            disabled={isGenerating}
          />

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground tabular-nums">{elapsedLabel ?? ""}</div>
            <div className="flex items-center gap-2">
              {isGenerating ? (
                <Button type="button" size="sm" variant="outline" onClick={stop}>
                  Stop
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={isGenerating || input.trim().length === 0}>
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Send"
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
