import { Hono } from "hono";
import { z } from "zod";
import { workerAuth } from "../middleware/auth";
import { enqueueJob, getJob } from "../jobs/queue";
import { runJob } from "../jobs/runner";
import { db, versions } from "@repo/db";
import { and, eq, desc } from "drizzle-orm";

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
    partialOutput: job.partialOutput,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  });
});

const extractMaterialSchema = z.object({
  materialId: z.string().uuid(),
  projectId: z.string().uuid(),
});

const askAiSchema = z.object({
  prompt: z.string().trim().min(1).max(20000),
  userId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
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

jobsRoute.post("/ask-ai", async (c) => {
  const body = await c.req.json();
  const parsed = askAiSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const job = enqueueJob("ask_ai", parsed.data);

  void runJob(job.id).catch((err: unknown) => {
    console.error(`Background job ${job.id} error:`, err);
  });

  return c.json({ jobId: job.id, status: job.status });
});

const synthesisFixSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  userMessage: z.string().trim().min(1).max(4000),
});

jobsRoute.post("/synthesis-fix", async (c) => {
  const body = await c.req.json();
  const parsed = synthesisFixSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const { projectId, userId, userMessage } = parsed.data;

  const synthesisVersion = await db.query.versions.findFirst({
    where: and(eq(versions.projectId, projectId), eq(versions.versionType, "synthesis")),
    orderBy: [desc(versions.createdAt)],
  });

  if (!synthesisVersion) {
    return c.json({ error: "Synthesis version not found" }, 404);
  }

  const prompt = [
    "You are an expert editor helping to refine a synthesised investment memo.",
    "",
    "Here is the full synthesis document:",
    "---",
    synthesisVersion.content,
    "---",
    "",
    `The user wants: ${userMessage}`,
    "",
    "Instructions:",
    "1. Identify the relevant paragraph(s) to change based on the user's request.",
    "2. Rewrite ONLY those paragraph(s) to address the issue.",
    "3. Wrap any new or significantly changed phrases in <mark>text</mark> tags.",
    "4. Return ONLY the replacement paragraph(s) — not the full document.",
    "5. Begin with one sentence explaining what you changed.",
    "Keep the tone, style, and level of formality consistent with the original.",
  ].join("\n");

  const job = enqueueJob("ask_ai", { prompt, userId });

  void runJob(job.id).catch((err: unknown) => {
    console.error(`Background job ${job.id} error:`, err);
  });

  return c.json({ jobId: job.id, status: job.status });
});

export { jobsRoute };
