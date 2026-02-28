import { Hono } from "hono";
import { z } from "zod";
import { workerAuth } from "../middleware/auth";
import { enqueueJob, getJob } from "../jobs/queue";
import { runJob } from "../jobs/runner";

const jobsRoute = new Hono();

jobsRoute.use("*", workerAuth);

jobsRoute.get("/:id", (c) => {
  const id = c.req.param("id");
  const job = getJob(id);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json({
    id: job.id,
    type: job.type,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  });
});

const extractMaterialSchema = z.object({
  materialId: z.string().uuid(),
  projectId: z.string().uuid(),
});

jobsRoute.post("/extract-material", async (c) => {
  const body = await c.req.json();
  const parsed = extractMaterialSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const { materialId } = parsed.data;
  const job = enqueueJob("extract_material", { materialId });

  void runJob(job.id).catch((err: unknown) => {
    console.error(`Background job ${job.id} error:`, err);
  });

  return c.json({ jobId: job.id, status: job.status });
});

export { jobsRoute };
