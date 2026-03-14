import { updateJob, getJob } from "./queue";
import { generateMasterPrompt } from "./handlers/generate-master-prompt";
import { suggestPersonas } from "./handlers/suggest-personas";
import { generatePersonaDrafts } from "./handlers/generate-persona-drafts";
import { synthesize } from "./handlers/synthesize";
import { styleEdit } from "./handlers/style-edit";
import { factCheck } from "./handlers/fact-check";
import { extractAndChunk } from "./handlers/extract-and-chunk";
import { devilsAdvocate } from "./handlers/devils-advocate";
import { integrateCritiques } from "./handlers/integrate-critiques";
import { askAi } from "./handlers/ask-ai";
import { generateCustomPersona } from "./handlers/generate-custom-persona";
import { generateCoverImages } from "./handlers/generate-cover-images";
import { generateToc } from "./handlers/generate-toc";
import type { StageRunPayload, AskAiPayload } from "@repo/lib";
import type { CustomPersonaPayload } from "./handlers/generate-custom-persona";
import type { CoverImagesPayload } from "./handlers/generate-cover-images";
import type { GenerateTocPayload } from "./handlers/generate-toc";
import { createAdminClient } from "../lib/supabase-admin";

const POLL_INTERVAL_MS = 1000;
const CHUNK_THROTTLE_MS = 200;

export async function runJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await updateJob(jobId, { status: "running", startedAt: new Date() });

  // Throttled callback that appends each streamed token to the job's partialOutput field
  let pendingChunks = "";
  let lastFlush = 0;
  const flushChunks = async () => {
    if (!pendingChunks) return;
    const chunk = pendingChunks;
    pendingChunks = "";
    const current = (await getJob(jobId))?.partialOutput ?? "";
    await updateJob(jobId, { partialOutput: current + chunk });
    lastFlush = Date.now();
  };

  const onChunk = (chunk: string) => {
    pendingChunks += chunk;
    if (Date.now() - lastFlush >= CHUNK_THROTTLE_MS) {
      void flushChunks();
    }
  };

  try {
    if (job.type === "custom_persona") {
      const payload = job.payload as CustomPersonaPayload;
      const result = await generateCustomPersona(payload, onChunk);
      await flushChunks();
      await updateJob(jobId, { status: "completed", completedAt: new Date(), result });
      return;
    } else if (job.type === "cover_images") {
      const payload = job.payload as CoverImagesPayload;
      await generateCoverImages(payload);
    } else if (job.type === "extract_material") {
      const payload = job.payload as { materialId: string };
      await extractAndChunk(payload.materialId);
    } else if (job.type === "generate_toc") {
      const payload = job.payload as GenerateTocPayload;
      await generateToc(payload, onChunk);
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
        case 6:
          await factCheck(projectId, userId, onChunk);
          break;
        case 8:
          await devilsAdvocate(projectId, userId, onChunk);
          break;
        // Step 9 removed — Red Report is annex only, auto-skipped by devils-advocate handler
        case 11:
          await styleEdit(projectId, userId, onChunk);
          break;
        default:
          throw new Error(`Step ${stepNumber} handler not implemented yet`);
      }
    }

    await flushChunks();
    await updateJob(jobId, { status: "completed", completedAt: new Date() });
  } catch (err) {
    const fullError = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    console.error(`Job ${jobId} failed:`, fullError);
    await flushChunks();
    const userMessage = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { status: "failed", error: userMessage, completedAt: new Date() });

    // Reset any DB stage that got stuck in "running" so the UI doesn't hang permanently.
    const payload = job.payload as Partial<StageRunPayload>;
    if (payload.projectId && payload.stepNumber) {
      const supabase = createAdminClient();
      await supabase
        .from("stages")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("project_id", payload.projectId)
        .eq("step_number", payload.stepNumber)
        .then(() => undefined, () => undefined); // best-effort — don't mask the original error
    }
  }
}

/**
 * Poll PGMQ for new job messages, process each, then archive.
 * Call once after server starts.
 */
export function startQueueConsumer(): void {
  let running = true;

  async function poll() {
    while (running) {
      try {
        const supabase = createAdminClient();
        const { data: messages } = await supabase.rpc("pgmq_read", {
          queue_name: "jobs",
          sleep_seconds: 5,
          batch_size: 1,
        });

        if (messages && messages.length > 0) {
          for (const raw of messages) {
            const msg = raw as { msg_id: number; message: { job_id?: string } };
            const payload = msg.message;
            if (payload.job_id) {
              try {
                await runJob(payload.job_id);
              } catch (err) {
                console.error(`[queue-consumer] Job ${payload.job_id} failed:`, err);
              }
            }
            // Archive regardless of success/failure (job status is tracked in jobs table)
            await supabase.rpc("pgmq_archive", {
              queue_name: "jobs",
              msg_id: msg.msg_id,
            });
          }
        }
      } catch (err) {
        console.error("[queue-consumer] Poll error:", err);
      }

      // Brief pause before next poll
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  void poll();

  // Graceful shutdown
  process.on("SIGTERM", () => { running = false; });
  process.on("SIGINT", () => { running = false; });
}
