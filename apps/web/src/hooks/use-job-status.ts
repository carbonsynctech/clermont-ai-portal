"use client";

import { useState, useEffect, useRef } from "react";
import type { WorkerJob } from "@/lib/worker-client";

type JobStatus = WorkerJob["status"] | "idle";

interface UseJobStatusResult {
  status: JobStatus;
  job: WorkerJob | null;
  isPolling: boolean;
  error: string | null;
}

export function useJobStatus(jobId: string | null): UseJobStatusResult {
  const [status, setStatus] = useState<JobStatus>("idle");
  const [job, setJob] = useState<WorkerJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) {
      setStatus("idle");
      setJob(null);
      setError(null);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) {
          setError("Failed to fetch job status");
          return;
        }
        const data = (await res.json()) as WorkerJob;
        setJob(data);
        setStatus(data.status);

        if (data.status === "completed" || data.status === "failed") {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch {
        setError("Network error while polling job status");
      }
    };

    void poll();
    intervalRef.current = setInterval(() => void poll(), 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId]);

  const isPolling = intervalRef.current !== null;

  return { status, job, isPolling, error };
}
