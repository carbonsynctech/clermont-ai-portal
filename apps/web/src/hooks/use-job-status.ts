"use client";

import { useState, useEffect, useRef } from "react";
import type { WorkerJob } from "@/lib/worker-client";

type JobStatus = WorkerJob["status"] | "idle";

interface UseJobStatusResult {
  status: JobStatus;
  job: WorkerJob | null;
  isPolling: boolean;
  error: string | null;
  elapsedSeconds: number;
  partialOutput: string;
}

export function useJobStatus(jobId: string | null): UseJobStatusResult {
  const [status, setStatus] = useState<JobStatus>("idle");
  const [job, setJob] = useState<WorkerJob | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const consecutiveErrorsRef = useRef(0);

  useEffect(() => {
    if (!jobId) {
      setStatus("idle");
      setJob(null);
      setError(null);
      setIsPolling(false);
      setElapsedSeconds(0);
      return;
    }

    setIsPolling(true);
    consecutiveErrorsRef.current = 0;
    startTimeRef.current = Date.now();

    // Elapsed-time ticker
    timerRef.current = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    const stopPolling = (terminalError?: string) => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setIsPolling(false);
      if (terminalError) setError(terminalError);
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);

        // 404 = job was lost (worker restart) — treat as terminal
        if (res.status === 404) {
          stopPolling("Job not found — the worker may have restarted. Please try again.");
          setStatus("failed");
          return;
        }

        if (!res.ok) {
          consecutiveErrorsRef.current += 1;
          if (consecutiveErrorsRef.current >= 3) {
            stopPolling("Lost connection to worker after 3 attempts. Please check the worker is running.");
            setStatus("failed");
          } else {
            setError(`Poll error (attempt ${consecutiveErrorsRef.current}/3)…`);
          }
          return;
        }

        consecutiveErrorsRef.current = 0;
        const data = (await res.json()) as WorkerJob;
        setJob(data);
        setStatus(data.status);
        setError(data.error ?? null);

        if (data.status === "completed" || data.status === "failed") {
          stopPolling();
        }
      } catch {
        consecutiveErrorsRef.current += 1;
        if (consecutiveErrorsRef.current >= 3) {
          stopPolling("Network error — lost connection to worker. Please check the worker is running.");
          setStatus("failed");
        } else {
          setError(`Network error (attempt ${consecutiveErrorsRef.current}/3)…`);
        }
      }
    };

    void poll();
    intervalRef.current = setInterval(() => void poll(), 2000);

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setIsPolling(false);
    };
  }, [jobId]);

  const partialOutput = job?.partialOutput ?? "";

  return { status, job, isPolling, error, elapsedSeconds, partialOutput };
}
