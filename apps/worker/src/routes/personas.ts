import { Hono } from "hono";
import { z } from "zod";
import { workerAuth } from "../middleware/auth";
import { enqueueJob } from "../jobs/queue";
import { runJob } from "../jobs/runner";

const personasRoute = new Hono();

personasRoute.use("*", workerAuth);

const generatePersonaSchema = z.object({
  name: z.string().min(1),
  linkedinUrl: z.string().url().optional(),
  context: z.string().optional(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
});

personasRoute.post("/generate", async (c) => {
  const body = await c.req.json();
  const parsed = generatePersonaSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const job = enqueueJob("custom_persona", parsed.data);

  void runJob(job.id).catch((err: unknown) => {
    console.error(`Background persona job ${job.id} error:`, err);
  });

  return c.json({ jobId: job.id, status: job.status });
});

export { personasRoute };
