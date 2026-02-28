import type { Job, JobStatus } from "@repo/core";
import { randomUUID } from "crypto";

// Phase 1: in-memory queue. Phase 2: swap to BullMQ without changing the interface.
const jobs = new Map<string, Job>();

export function enqueueJob<T>(type: string, payload: T): Job<T> {
  const job: Job<T> = {
    id: randomUUID(),
    type,
    payload,
    status: "pending" as JobStatus,
    createdAt: new Date(),
  };
  jobs.set(job.id, job as Job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, updates: Partial<Job>): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  const updated = { ...job, ...updates } as Job;
  jobs.set(id, updated);
  return updated;
}
