import { Hono } from "hono";
import { z } from "zod";
import { workerAuth } from "../middleware/auth";
import { enqueueJob } from "../jobs/queue";
import { runJob } from "../jobs/runner";

const stagesRoute = new Hono();

stagesRoute.use("*", workerAuth);

const runStageSchema = z.object({
  projectId: z.string().uuid(),
  stepNumber: z.number().int().min(1).max(12),
  userId: z.string().uuid(),
});

stagesRoute.post("/:step/run", async (c) => {
  const body = await c.req.json();
  const parsed = runStageSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const { projectId, stepNumber, userId } = parsed.data;
  const job = enqueueJob("stage_run", { projectId, stepNumber, userId });

  // Run async — fire and forget, client polls job status
  void runJob(job.id).catch((err: unknown) => {
    console.error(`Background job ${job.id} error:`, err);
  });

  return c.json({ jobId: job.id, status: job.status });
});

export { stagesRoute };
