"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, XCircle } from "lucide-react";
import { useJobStatus } from "@/hooks/use-job-status";
import { useAnimatedStreamText } from "@/hooks/use-animated-stream-text";

// ─── Shared state hook ────────────────────────────────────────────────────────

export interface StepTriggerState {
  isRunning: boolean;
  isDispatching: boolean;
  phase: "dispatching" | "waiting" | "streaming" | "done" | null;
  showError: string | null;
  elapsedSeconds: number;
  partialOutput: string;
  outputRef: React.RefObject<HTMLPreElement | null>;
  handleRun: () => Promise<void>;
  handleReset: () => void;
}

export function useStepTrigger(
  projectId: string,
  stepNumber: number,
  currentStatus: string,
): StepTriggerState {
  const router = useRouter();

  // sessionStorage keys — stable per project+step
  const jobKey = `job-${projectId}-${stepNumber}`;
  const outputKey = `output-${projectId}-${stepNumber}`;

  // Restore jobId from sessionStorage so polling survives navigation
  // NOTE: Always init as null/"" to avoid hydration mismatch, then sync in useEffect
  const [jobId, setJobId] = useState<string | null>(null);

  // Restore last output so completed steps stay visible after navigation
  const [cachedOutput, setCachedOutput] = useState<string>("");

  // Hydration-safe: restore from sessionStorage after mount
  useEffect(() => {
    const storedJob = sessionStorage.getItem(jobKey);
    if (storedJob) setJobId(storedJob);
    const storedOutput = sessionStorage.getItem(outputKey);
    if (storedOutput) setCachedOutput(storedOutput);
  }, [jobKey, outputKey]);

  const [isDispatching, setIsDispatching] = useState(false);
  const [hasDispatched, setHasDispatched] = useState(false);
  const [hasAbandoned, setHasAbandoned] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const { status, isPolling, error: pollError, elapsedSeconds, partialOutput } =
    useJobStatus(jobId);
  const outputRef = useRef<HTMLPreElement | null>(null);

  const isFailed = status === "failed";
  const isDone = status === "completed" || isFailed;
  const serverRunning = currentStatus === "running" && !hasAbandoned;
  const isRunning = serverRunning || isDispatching || isPolling || (hasDispatched && !isDone);
  const showError = dispatchError ?? (isFailed ? (pollError ?? "Job failed. Please try again.") : null);

  // Prefer live partialOutput; fall back to last saved output
  const effectiveOutput = partialOutput || cachedOutput;

  const phase: StepTriggerState["phase"] = (() => {
    if (isDispatching) return "dispatching";
    if (hasDispatched || isPolling) {
      if (!isPolling && !effectiveOutput) return "dispatching";
      if (isPolling && !effectiveOutput) return "waiting";
      if (isPolling && effectiveOutput) return "streaming";
      if (!isPolling && effectiveOutput) return "done";
    }
    // Server reports running but local jobId was lost (navigated away and back)
    if (serverRunning) return "waiting";
    // Show persisted output for a previously-completed step
    if (effectiveOutput) return "done";
    return null;
  })();

  useEffect(() => {
    if (status === "completed") {
      // Persist the output before clearing the jobId
      if (partialOutput && typeof window !== "undefined") {
        sessionStorage.setItem(outputKey, partialOutput);
        setCachedOutput(partialOutput);
      }
      if (typeof window !== "undefined") sessionStorage.removeItem(jobKey);
      setHasDispatched(false);
      setHasAbandoned(false);
      router.refresh();
    }
  }, [status, router, partialOutput, jobKey, outputKey]);

  useEffect(() => {
    if (isFailed) {
      if (typeof window !== "undefined") sessionStorage.removeItem(jobKey);
      setHasDispatched(false);
    }
  }, [isFailed, jobKey]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [effectiveOutput]);

  function handleReset() {
    setJobId(null);
    if (typeof window !== "undefined") sessionStorage.removeItem(jobKey);
    setHasDispatched(false);
    setHasAbandoned(true);
    setDispatchError(null);
  }

  const handleRun = useCallback(async () => {
    // Clear previous cached output when re-running
    setCachedOutput("");
    if (typeof window !== "undefined") sessionStorage.removeItem(outputKey);

    setIsDispatching(true);
    setHasDispatched(true);
    setHasAbandoned(false);
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
      if (data.jobId) {
        setJobId(data.jobId);
        if (typeof window !== "undefined") sessionStorage.setItem(jobKey, data.jobId);
      }
    } catch {
      setDispatchError("Network error — is the worker running on port 3001?");
      setHasDispatched(false);
    } finally {
      setIsDispatching(false);
    }
  }, [projectId, stepNumber, jobKey, outputKey]);

  return { isRunning, isDispatching, phase, showError, elapsedSeconds, partialOutput: effectiveOutput, outputRef, handleRun, handleReset };
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// ─── Button-only (use inside flex rows) ──────────────────────────────────────

interface StepTriggerButtonProps {
  trigger: StepTriggerState;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  onBeforeRun?: () => Promise<void>;
}

export function StepTriggerButton({ trigger, label, disabled = false, disabledReason, variant = "default", onBeforeRun }: StepTriggerButtonProps) {
  const { isRunning, isDispatching, handleRun, handleReset } = trigger;

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={variant}
        onClick={async () => {
          if (onBeforeRun) await onBeforeRun();
          void handleRun();
        }}
        disabled={disabled || isRunning}
      >
        {isRunning ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Running…
          </>
        ) : (
          label
        )}
      </Button>

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

      {disabled && disabledReason && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}
    </div>
  );
}

// ─── Panel-only (use full-width below the button row) ────────────────────────

export function StepTriggerOutput({ trigger }: { trigger: StepTriggerState }) {
  const { phase, showError, elapsedSeconds, partialOutput, outputRef, handleRun } = trigger;
  const showRetryCta = showError?.includes("Job not found") ?? false;
  const isStreamingPhase = phase === "streaming" || phase === "waiting";
  const animatedOutput = useAnimatedStreamText(partialOutput, isStreamingPhase);

  if (!phase && !showError) return null;

  return (
    <div className="space-y-2">
      {showError && (
        <div className="flex items-center gap-2 rounded bg-destructive/10 px-2 py-1.5">
          <p className="text-xs text-destructive leading-relaxed">{showError}</p>
          {showRetryCta && (
            <Button
              type="button"
              size="xs"
              variant="destructive"
              className="ml-auto"
              onClick={() => void handleRun()}
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {phase && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/40 text-xs text-muted-foreground">
            {(phase === "dispatching" || phase === "waiting" || phase === "streaming") && (
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            )}
            <span>
              {phase === "dispatching" && "Sending job to worker…"}
              {phase === "waiting" && "AI is starting up…"}
              {phase === "streaming" && "AI is generating…"}
              {phase === "done" && "Generation complete"}
            </span>
            {(phase === "streaming" || phase === "waiting") && elapsedSeconds > 0 && (
              <span className="ml-auto tabular-nums">{formatElapsed(elapsedSeconds)}</span>
            )}
          </div>
          <pre
            ref={outputRef}
            className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto text-foreground/80"
          >
            {animatedOutput || (
              <span className="text-muted-foreground italic">
                {phase === "dispatching" ? "Connecting…" : "Waiting for first token…"}
              </span>
            )}
            {isStreamingPhase && (
              <span className="inline-block w-1.5 h-3.5 bg-primary/70 ml-0.5 animate-pulse align-text-bottom" />
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Combined (default — for steps that want everything self-contained) ───────

interface StepTriggerProps {
  projectId: string;
  stepNumber: number;
  label: string;
  currentStatus: string;
  disabled?: boolean;
  disabledReason?: string;
  onRunningChange?: (running: boolean) => void;
  hideButton?: boolean;
}

export function StepTrigger({
  projectId,
  stepNumber,
  label,
  currentStatus,
  disabled = false,
  disabledReason,
  onRunningChange,
  hideButton = false,
}: StepTriggerProps) {
  const trigger = useStepTrigger(projectId, stepNumber, currentStatus);

  useEffect(() => {
    onRunningChange?.(trigger.isRunning);
  }, [trigger.isRunning, onRunningChange]);

  return (
    <div className="space-y-3">
      {!hideButton && (
        <StepTriggerButton trigger={trigger} label={label} disabled={disabled} disabledReason={disabledReason} />
      )}
      <StepTriggerOutput trigger={trigger} />
    </div>
  );
}
