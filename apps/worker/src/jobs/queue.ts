import type { Job } from "@repo/core";
import type { Json } from "@repo/db";
import { createAdminClient } from "../lib/supabase-admin";

/**
 * Enqueue a job: insert a row in the `jobs` table and send a PGMQ message.
 * Returns a lightweight Job object for the HTTP response.
 */
export async function enqueueJob<T>(type: string, payload: T): Promise<Job<T>> {
  const supabase = createAdminClient();

  // 1. Insert job row
  const { data: row, error } = await supabase
    .from("jobs")
    .insert({ type, payload: payload as unknown as Json })
    .select()
    .single();

  if (error || !row) {
    throw new Error(`Failed to enqueue job: ${error?.message ?? "no row returned"}`);
  }

  // 2. Send PGMQ message with the job id
  await supabase.rpc("pgmq_send", {
    queue_name: "jobs",
    msg: { job_id: row.id } as unknown as Json,
  });

  return {
    id: row.id,
    type: row.type,
    payload: row.payload as T,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

/** Fetch a job by id from the DB. */
export async function getJob(id: string): Promise<Job | undefined> {
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("jobs")
    .select()
    .eq("id", id)
    .single();

  if (!row) return undefined;

  return toJob(row);
}

function toJob(row: {
  id: string;
  type: string;
  payload: Json;
  status: "pending" | "running" | "completed" | "failed";
  error: string | null;
  partial_output: string | null;
  result: Json | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}): Job {
  const job: Job = {
    id: row.id,
    type: row.type,
    payload: row.payload,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
  if (row.error !== null) job.error = row.error;
  if (row.partial_output !== null) job.partialOutput = row.partial_output;
  if (row.result !== null) job.result = row.result;
  if (row.started_at !== null) job.startedAt = new Date(row.started_at);
  if (row.completed_at !== null) job.completedAt = new Date(row.completed_at);
  return job;
}

/** Patch a job row in the DB. */
export async function updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
  const supabase = createAdminClient();

  const patch: Record<string, unknown> = {};
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.error !== undefined) patch.error = updates.error;
  if (updates.partialOutput !== undefined) patch.partial_output = updates.partialOutput;
  if (updates.result !== undefined) patch.result = updates.result as unknown as Json;
  if (updates.startedAt !== undefined) patch.started_at = updates.startedAt.toISOString();
  if (updates.completedAt !== undefined) patch.completed_at = updates.completedAt.toISOString();

  const { data: row } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (!row) return undefined;

  return toJob(row);
}
