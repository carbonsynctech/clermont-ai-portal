import { updateJob, getJob } from "./queue";
import { generateMasterPrompt } from "./handlers/generate-master-prompt";
import { suggestPersonas } from "./handlers/suggest-personas";
import type { StageRunPayload } from "@repo/core";

export async function runJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  updateJob(jobId, { status: "running", startedAt: new Date() });

  try {
    const payload = job.payload as StageRunPayload;
    const { projectId, stepNumber, userId } = payload;

    switch (stepNumber) {
      case 1:
        await generateMasterPrompt(projectId, userId);
        break;
      case 2:
        await suggestPersonas(projectId, userId);
        break;
      default:
        throw new Error(`Step ${stepNumber} handler not implemented yet`);
    }

    updateJob(jobId, { status: "completed", completedAt: new Date() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`Job ${jobId} failed:`, error);
    updateJob(jobId, { status: "failed", error, completedAt: new Date() });
  }
}
