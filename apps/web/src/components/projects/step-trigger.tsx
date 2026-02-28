"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, XCircle } from "lucide-react";
import { useJobStatus } from "@/hooks/use-job-status";

interface StepTriggerProps {
  projectId: string;
  stepNumber: number;
  label: string;
  currentStatus: string;
  disabled?: boolean;
  disabledReason?: string;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function StepTrigger({
  projectId,
  stepNumber,
  label,
  currentStatus,
  disabled = false,
  disabledReason,
}: StepTriggerProps) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [hasDispatched, setHasDispatched] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const { status, isPolling, error: pollError, elapsedSeconds, partialOutput } =
    useJobStatus(jobId);
  const outputRef = useRef<HTMLPreElement>(null);

  const isFailed = status === "failed";
  const isDone = status === "completed" || isFailed;
  const isRunning =
    currentStatus === "running" ||
    isDispatching ||
    isPolling ||
    (hasDispatched && !isDone);
  const showError = dispatchError ?? (isFailed ? (pollError ?? "Job failed. Please try again.") : null);

  // Refresh server component once the job succeeds
  useEffect(() => {
    if (status === "completed") {
      setHasDispatched(false);
      router.refresh();
    }
  }, [status, router]);

  // Release the "stuck running" state when the job fails
  useEffect(() => {
    if (isFailed) setHasDispatched(false);
  }, [isFailed]);

  // Auto-scroll the output window as tokens stream in
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [partialOutput]);

  function handleReset() {
    setJobId(null);
    setHasDispatched(false);
    setDispatchError(null);
  }

  async function handleRun() {
    setIsDispatching(true);
    setHasDispatched(true);
    setDispatchError(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/stages/${stepNumber}/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setDispatchError(body.error ?? "Failed to start job");
        setHasDispatched(false);
        return;
      }

      const data = (await res.json()) as { jobId?: string };
      if (data.jobId) setJobId(data.jobId);
    } catch {
      setDispatchError("Network error — is the worker running?");
      setHasDispatched(false);
    } finally {
      setIsDispatching(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Action row */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => void handleRun()}
          disabled={disabled || isRunning}
          className="flex-1"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Running…{" "}
              {isPolling && elapsedSeconds > 0 && (
                <span className="ml-1 opacity-70">{formatElapsed(elapsedSeconds)}</span>
              )}
            </>
          ) : (
            label
          )}
        </Button>

        {/* Abandon button — only shown while a job is in flight */}
        {isRunning && !isDispatching && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleReset}
            className="gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive"
          >
            <XCircle className="h-4 w-4" />
            Abandon run
          </Button>
        )}
      </div>

      {/* Error */}
      {showError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5 leading-relaxed">
          {showError}
        </p>
      )}

      {/* Disabled hint */}
      {disabled && disabledReason && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}

      {/* Live streaming output */}
      {(isPolling || partialOutput) && (
        <div className="rounded-lg border bg-muted/40 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/60 text-xs text-muted-foreground">
            {isPolling && <Loader2 className="h-3 w-3 animate-spin" />}
            <span>
              {isPolling ? "AI is generating…" : "Generation complete"}
            </span>
            {isPolling && elapsedSeconds > 0 && (
              <span className="ml-auto">{formatElapsed(elapsedSeconds)}</span>
            )}
          </div>
          <pre
            ref={outputRef}
            className="p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto text-foreground/80"
          >
            {partialOutput || "Waiting for first token…"}
            {isPolling && (
              <span className="inline-block w-1.5 h-3.5 bg-primary/70 ml-0.5 animate-pulse align-text-bottom" />
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
