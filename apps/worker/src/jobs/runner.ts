import { updateJob, getJob } from "./queue";
import { generateMasterPrompt } from "./handlers/generate-master-prompt";
import { suggestPersonas } from "./handlers/suggest-personas";
import { generatePersonaDrafts } from "./handlers/generate-persona-drafts";
import { synthesize } from "./handlers/synthesize";
import { styleEdit } from "./handlers/style-edit";
import { factCheck } from "./handlers/fact-check";
import { extractAndChunk } from "./handlers/extract-and-chunk";
import { finalStylePass } from "./handlers/final-style-pass";
import { devilsAdvocate } from "./handlers/devils-advocate";
import { integrateCritiques } from "./handlers/integrate-critiques";
import { askAi } from "./handlers/ask-ai";
import { generateCustomPersona } from "./handlers/generate-custom-persona";
import { generateCoverImages } from "./handlers/generate-cover-images";
import type { StageRunPayload, AskAiPayload } from "@repo/core";
import type { CustomPersonaPayload } from "./handlers/generate-custom-persona";
import type { CoverImagesPayload } from "./handlers/generate-cover-images";
import { db, stages } from "@repo/db";
import { and, eq } from "drizzle-orm";

export async function runJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  updateJob(jobId, { status: "running", startedAt: new Date() });

  // Callback that appends each streamed token to the job's partialOutput field,
  // so the web client can display it in real-time via polling.
  const onChunk = (chunk: string) => {
    const current = getJob(jobId)?.partialOutput ?? "";
    updateJob(jobId, { partialOutput: current + chunk });
  };

  try {
    if (job.type === "custom_persona") {
      const payload = job.payload as CustomPersonaPayload;
      const result = await generateCustomPersona(payload, onChunk);
      updateJob(jobId, { status: "completed", completedAt: new Date(), result });
      return;
    } else if (job.type === "cover_images") {
      const payload = job.payload as CoverImagesPayload;
      await generateCoverImages(payload);
    } else if (job.type === "extract_material") {
      const payload = job.payload as { materialId: string };
      await extractAndChunk(payload.materialId);
    } else if (job.type === "ask_ai") {
      const payload = job.payload as AskAiPayload;
      await askAi(payload, onChunk);
    } else {
      const payload = job.payload as StageRunPayload;
      const { projectId, stepNumber, userId } = payload;

      switch (stepNumber) {
        case 1:
          await generateMasterPrompt(projectId, userId, onChunk);
          break;
        case 2:
          await suggestPersonas(projectId, userId, onChunk);
          break;
        case 4:
          await generatePersonaDrafts(projectId, userId, onChunk);
          break;
        case 5:
          await synthesize(projectId, userId, onChunk);
          break;
        case 7:
          await styleEdit(projectId, userId, onChunk);
          break;
        case 8:
          await factCheck(projectId, userId, onChunk);
          break;
        case 9:
          await finalStylePass(projectId, userId, onChunk);
          break;
        case 11:
          await devilsAdvocate(projectId, userId, onChunk);
          break;
        case 12:
          await integrateCritiques(projectId, userId, onChunk);
          break;
        default:
          throw new Error(`Step ${stepNumber} handler not implemented yet`);
      }
    }

    updateJob(jobId, { status: "completed", completedAt: new Date() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`Job ${jobId} failed:`, error);
    updateJob(jobId, { status: "failed", error, completedAt: new Date() });

    // Reset any DB stage that got stuck in "running" so the UI doesn't hang permanently.
    const payload = job.payload as Partial<StageRunPayload>;
    if (payload.projectId && payload.stepNumber) {
      await db
        .update(stages)
        .set({ status: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(stages.projectId, payload.projectId),
            eq(stages.stepNumber, payload.stepNumber),
          ),
        )
        .catch(() => undefined); // best-effort — don't mask the original error
    }
  }
}
