"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Chat, type ChatMessage } from "@/components/ui/chat";
import { useJobStatus } from "@/hooks/use-job-status";

interface AskAiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function extractProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([0-9a-f-]{36})(?:\/|$)/i);
  return match?.[1] ?? null;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function AskAiDialog({ open, onOpenChange }: AskAiDialogProps) {
  const pathname = usePathname();
  const projectId = React.useMemo(() => extractProjectId(pathname), [pathname]);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [activeAssistantMessageId, setActiveAssistantMessageId] = React.useState<string | null>(null);
  const [isDispatching, setIsDispatching] = React.useState(false);
  const [dispatchError, setDispatchError] = React.useState<string | null>(null);

  const { status, isPolling, error: pollError, elapsedSeconds, partialOutput } = useJobStatus(jobId);

  const isRunning = isDispatching || isPolling;
  const showError = dispatchError ?? (status === "failed" ? (pollError ?? "Job failed. Please try again.") : null);

  const updateMessage = React.useCallback((messageId: string, content: string) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content,
            }
          : message,
      ),
    );
  }, []);

  React.useEffect(() => {
    if (!activeAssistantMessageId) {
      return;
    }

    updateMessage(activeAssistantMessageId, partialOutput);
  }, [activeAssistantMessageId, partialOutput, updateMessage]);

  React.useEffect(() => {
    if (!activeAssistantMessageId) {
      return;
    }

    if (status === "completed") {
      const finalOutput = partialOutput.trim().length > 0 ? partialOutput : "No response returned.";
      updateMessage(activeAssistantMessageId, finalOutput);
      setActiveAssistantMessageId(null);
      setJobId(null);
    }

    if (status === "failed") {
      updateMessage(activeAssistantMessageId, showError ?? "Job failed. Please try again.");
      setActiveAssistantMessageId(null);
      setJobId(null);
    }
  }, [activeAssistantMessageId, partialOutput, showError, status, updateMessage]);

  React.useEffect(() => {
    if (!open) {
      setInput("");
      setMessages([]);
      setJobId(null);
      setActiveAssistantMessageId(null);
      setDispatchError(null);
      setIsDispatching(false);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextPrompt = input.trim();
    if (!nextPrompt) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: nextPrompt,
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);
    setInput("");

    setDispatchError(null);
    setJobId(null);
    setActiveAssistantMessageId(assistantMessage.id);
    setIsDispatching(true);

    try {
      const response = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt, projectId }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setDispatchError(body.error ?? "Failed to start Ask AI job");
        return;
      }

      const body = (await response.json()) as { jobId?: string };
      if (!body.jobId) {
        setDispatchError("Missing job ID from Ask AI response");
        updateMessage(assistantMessage.id, "Missing job ID from Ask AI response");
        setActiveAssistantMessageId(null);
        return;
      }

      setJobId(body.jobId);
    } catch {
      setDispatchError("Network error — is the worker running on port 3001?");
      updateMessage(assistantMessage.id, "Network error — is the worker running on port 3001?");
      setActiveAssistantMessageId(null);
    } finally {
      setIsDispatching(false);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
  }

  function handleStop() {
    if (!activeAssistantMessageId) {
      setJobId(null);
      return;
    }

    const stoppedContent = partialOutput.trim().length > 0
      ? `${partialOutput}\n\n_Stopped by user._`
      : "_Stopped by user._";

    updateMessage(activeAssistantMessageId, stoppedContent);
    setActiveAssistantMessageId(null);
    setJobId(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Ask AI
          </DialogTitle>
          <DialogDescription>
            Ask a question and stream a live response.
            {projectId ? " Using current project context." : " No project context on this page."}
          </DialogDescription>
        </DialogHeader>

        <Chat
          messages={messages}
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isGenerating={isRunning}
          stop={handleStop}
          error={showError}
          elapsedLabel={isRunning && elapsedSeconds > 0 ? formatElapsed(elapsedSeconds) : null}
          emptyState="Ask a question to start. Responses will stream into this chat."
        />
      </DialogContent>
    </Dialog>
  );
}
