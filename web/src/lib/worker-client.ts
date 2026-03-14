const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:3001";
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";

async function workerFetch(path: string, init?: RequestInit) {
  const url = `${WORKER_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": WORKER_SECRET,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[workerFetch] Error ${res.status}: ${text.slice(0, 200)}`);
    throw new Error(`Worker error ${res.status}: ${text}`);
  }

  const data = await res.json() as unknown;
  return data;
}

export interface WorkerJob {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
  /** Accumulated AI output streamed in real-time during generation */
  partialOutput?: string;
  createdAt: string;
  updatedAt: string;
}

export const workerClient = {
  runStage: async (
    stepNumber: number,
    projectId: string,
    userId: string,
    payload?: unknown,
  ) =>
    workerFetch(`/stages/${stepNumber}/run`, {
      method: "POST",
      body: JSON.stringify({ projectId, stepNumber, userId, payload }),
    }) as Promise<{ jobId: string; status: string }>,

  getJobStatus: async (jobId: string) =>
    workerFetch(`/jobs/${jobId}`) as Promise<WorkerJob>,

  extractMaterial: async (materialId: string, projectId: string) =>
    workerFetch("/jobs/extract-material", {
      method: "POST",
      body: JSON.stringify({ materialId, projectId }),
    }) as Promise<{ jobId: string; status: string }>,

  runAskAi: async (prompt: string, userId: string, projectId?: string) =>
    workerFetch("/jobs/ask-ai", {
      method: "POST",
      body: JSON.stringify({ prompt, userId, projectId }),
    }) as Promise<{ jobId: string; status: string }>,

  generatePersona: async (opts: {
    name: string;
    context?: string;
    projectId: string;
    userId: string;
  }) =>
    workerFetch("/personas/generate", {
      method: "POST",
      body: JSON.stringify(opts),
    }) as Promise<{ jobId: string; status: string }>,

  fixSynthesis: async (projectId: string, userId: string, userMessage: string) =>
    workerFetch("/jobs/synthesis-fix", {
      method: "POST",
      body: JSON.stringify({ projectId, userId, userMessage }),
    }) as Promise<{ jobId: string; status: string }>,

  fixStyleEdit: async (projectId: string, userId: string, userMessage: string) =>
    workerFetch("/jobs/style-edit-fix", {
      method: "POST",
      body: JSON.stringify({ projectId, userId, userMessage }),
    }) as Promise<{ jobId: string; status: string }>,

  fixFinalStyle: async (projectId: string, userId: string, userMessage: string) =>
    workerFetch("/jobs/final-style-fix", {
      method: "POST",
      body: JSON.stringify({ projectId, userId, userMessage }),
    }) as Promise<{ jobId: string; status: string }>,

  generateToc: async (projectId: string, userId: string) =>
    workerFetch("/jobs/generate-toc", {
      method: "POST",
      body: JSON.stringify({ projectId, userId }),
    }) as Promise<{ jobId: string; status: string }>,

  generateCoverImages: async (projectId: string, userId: string, styleGuideId: string) =>
    workerFetch("/jobs/generate-cover-images", {
      method: "POST",
      body: JSON.stringify({ projectId, userId, styleGuideId }),
    }) as Promise<{ jobId: string; status: string }>,

  // PDF export is proxied through /api/projects/[id]/export to keep WORKER_SECRET server-side
  getPdfDownloadPath: (projectId: string) => `/api/projects/${projectId}/export`,
};
