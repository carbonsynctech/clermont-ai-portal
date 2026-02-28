"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useJobStatus } from "@/hooks/use-job-status";

interface StepTriggerProps {
  projectId: string;
  stepNumber: number;
  label: string;
  currentStatus: string;
}

export function StepTrigger({ projectId, stepNumber, label, currentStatus }: StepTriggerProps) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const { status, isPolling, error: pollError } = useJobStatus(jobId);

  const isRunning = currentStatus === "running" || isDispatching || isPolling;
  const isDone = status === "completed";

  async function handleRun() {
    setIsDispatching(true);
    setDispatchError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/stages/${stepNumber}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setDispatchError(body.error ?? "Failed to start job");
        return;
      }

      const data = (await res.json()) as { jobId?: string };
      if (data.jobId) {
        setJobId(data.jobId);
      }
    } catch {
      setDispatchError("Network error. Please try again.");
    } finally {
      setIsDispatching(false);
    }
  }

  // Refresh page once job completes so server component re-fetches data
  if (isDone) {
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        onClick={() => void handleRun()}
        disabled={isRunning || isDone}
        className="w-full"
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
      {(dispatchError ?? pollError) && (
        <p className="text-xs text-destructive">{dispatchError ?? pollError}</p>
      )}
      {isPolling && (
        <p className="text-xs text-muted-foreground">Processing… this may take a moment.</p>
      )}
    </div>
  );
}
