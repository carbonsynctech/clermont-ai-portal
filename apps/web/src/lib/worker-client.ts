const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:3001";
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";

async function workerFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": WORKER_SECRET,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker error ${res.status}: ${text}`);
  }

  return res.json() as Promise<unknown>;
}

export interface WorkerJob {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export const workerClient = {
  runStage: async (stepNumber: number, projectId: string, payload?: unknown) =>
    workerFetch(`/stages/${stepNumber}/run`, {
      method: "POST",
      body: JSON.stringify({ projectId, stepNumber, payload }),
    }) as Promise<{ jobId: string; status: string }>,

  getJobStatus: async (jobId: string) =>
    workerFetch(`/jobs/${jobId}`) as Promise<WorkerJob>,
};
