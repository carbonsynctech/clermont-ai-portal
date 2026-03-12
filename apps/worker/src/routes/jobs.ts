import { Hono } from "hono";
import { z } from "zod";
import { workerAuth } from "../middleware/auth";
import { enqueueJob, getJob } from "../jobs/queue";
import { runJob } from "../jobs/runner";
import { db, versions, styleGuides } from "@repo/db";
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
    result: job.result,
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

const coverImagesSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  styleGuideId: z.string().uuid(),
});

jobsRoute.post("/generate-cover-images", async (c) => {
  const body = await c.req.json();
  const parsed = coverImagesSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const job = enqueueJob("cover_images", parsed.data);

  void runJob(job.id).catch((err: unknown) => {
    console.error(`Background cover-images job ${job.id} error:`, err);
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
    "Return your response in this EXACT format — keep the section headers verbatim:",
    "",
    "EXPLANATION: [One sentence explaining what you changed]",
    "",
    "ORIGINAL:",
    "[Copy the exact original paragraph(s) from the document verbatim — no changes]",
    "",
    "REPLACEMENT:",
    "[The rewritten paragraph(s). Wrap new or changed phrases in <mark>text</mark> tags]",
    "",
    "Rules:",
    "- Only rewrite the minimum necessary paragraph(s).",
    "- The ORIGINAL section must be copied verbatim from the document.",
    "- Keep tone, style, and formality consistent with the original.",
  ].join("\n");

  const job = enqueueJob("ask_ai", { prompt, userId });

  void runJob(job.id).catch((err: unknown) => {
    console.error(`Background job ${job.id} error:`, err);
  });

  return c.json({ jobId: job.id, status: job.status });
});

const styleEditFixSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  userMessage: z.string().trim().min(1).max(4000),
});

jobsRoute.post("/style-edit-fix", async (c) => {
  const body = await c.req.json();
  const parsed = styleEditFixSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const { projectId, userId, userMessage } = parsed.data;

  // Fetch latest synthesis version (Step 5 canonical source)
  const synthesisVersion = await db.query.versions.findFirst({
    where: and(eq(versions.projectId, projectId), eq(versions.versionType, "synthesis")),
    orderBy: [desc(versions.createdAt)],
  });

  if (!synthesisVersion) {
    return c.json({ error: "Synthesis version not found" }, 404);
  }

  // Optionally fetch condensed style rules for context
  const styleGuide = await db.query.styleGuides.findFirst({
    where: eq(styleGuides.projectId, projectId),
    orderBy: [desc(styleGuides.uploadedAt)],
  });

  const rulesContext = styleGuide?.condensedRulesText
    ? `\nStyle rules that were applied:\n---\n${styleGuide.condensedRulesText}\n---\n`
    : "";

  const prompt = [
    "You are an expert editor refining a synthesis draft.",
    "The document text should remain semantically identical unless the user asks for a rewrite.",
    rulesContext,
    "Here is the full synthesis document:",
    "---",
    synthesisVersion.content,
    "---",
    "",
    `The user wants: ${userMessage}`,
    "",
    "Return your response in this EXACT format — keep the section headers verbatim:",
    "",
    "EXPLANATION: [One sentence explaining what you changed]",
    "",
    "ORIGINAL:",
    "[Copy the exact original paragraph(s) from the document verbatim — no changes]",
    "",
    "REPLACEMENT:",
    "[The rewritten paragraph(s). Wrap new or changed phrases in <mark>text</mark> tags]",
    "",
    "Rules:",
    "- Only rewrite the minimum necessary paragraph(s).",
    "- The ORIGINAL section must be copied verbatim from the document.",
    "- Keep the document's existing style, tone, and formatting consistent.",
    "- Preserve all style guide conventions already applied.",
  ].join("\n");

  const job = enqueueJob("ask_ai", { prompt, userId });

  void runJob(job.id).catch((err: unknown) => {
    console.error(`Background job ${job.id} error:`, err);
  });

  return c.json({ jobId: job.id, status: job.status });
});

const finalStyleFixSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  userMessage: z.string().trim().min(1).max(4000),
});

jobsRoute.post("/final-style-fix", async (c) => {
  const body = await c.req.json();
  const parsed = finalStyleFixSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const { projectId, userId, userMessage } = parsed.data;

  const finalStyledVersion = await db.query.versions.findFirst({
    where: and(eq(versions.projectId, projectId), eq(versions.versionType, "final_styled")),
    orderBy: [desc(versions.createdAt)],
  });

  if (!finalStyledVersion) {
    return c.json({ error: "Final styled version not found" }, 404);
  }

  const styleGuide = await db.query.styleGuides.findFirst({
    where: eq(styleGuides.projectId, projectId),
    orderBy: [desc(styleGuides.uploadedAt)],
  });

  const rulesContext = styleGuide?.condensedRulesText
    ? `\nStyle rules that were applied:\n---\n${styleGuide.condensedRulesText}\n---\n`
    : "";

  const prompt = [
    "You are an expert editor refining a final investment memo.",
    "The document has been through a full style pass and represents the polished final version.",
    rulesContext,
    "Here is the full document:",
    "---",
    finalStyledVersion.content,
    "---",
    "",
    `The user wants: ${userMessage}`,
    "",
    "Return your response in this EXACT format — keep the section headers verbatim:",
    "",
    "EXPLANATION: [One sentence explaining what you changed]",
    "",
    "ORIGINAL:",
    "[Copy the exact original paragraph(s) from the document verbatim — no changes]",
    "",
    "REPLACEMENT:",
    "[The rewritten paragraph(s). Wrap new or changed phrases in <mark>text</mark> tags]",
    "",
    "Rules:",
    "- Only rewrite the minimum necessary paragraph(s).",
    "- The ORIGINAL section must be copied verbatim from the document.",
    "- Keep the polished, professional style and tone.",
    "- Preserve all style guide conventions already applied.",
  ].join("\n");

  const job = enqueueJob("ask_ai", { prompt, userId });

  void runJob(job.id).catch((err: unknown) => {
    console.error(`Background job ${job.id} error:`, err);
  });

  return c.json({ jobId: job.id, status: job.status });
});

export { jobsRoute };
