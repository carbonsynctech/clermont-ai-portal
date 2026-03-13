import { Hono } from "hono";
import { z } from "zod";
import { workerAuth } from "../middleware/auth";
import { enqueueJob } from "../jobs/queue";

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
  const job = await enqueueJob("stage_run", { projectId, stepNumber, userId });

  return c.json({ jobId: job.id, status: job.status });
});

export { stagesRoute };
