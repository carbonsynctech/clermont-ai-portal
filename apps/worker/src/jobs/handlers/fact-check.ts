import { db, projects, stages, versions, auditLogs } from "@repo/db";
import { claude, gemini } from "@repo/core";
import { eq, and } from "drizzle-orm";

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

export async function factCheck(projectId: string, userId: string): Promise<void> {
  // 1. Fetch project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) throw new Error(`Project ${projectId} not found`);

  // 2. Update stage to running
  await db
    .update(stages)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 8)));

  const startedAt = Date.now();

  // 3. Fetch latest styled version (activeVersionId or latest styled)
  let styledContent: string;
  if (project.activeVersionId) {
    const activeVersion = await db.query.versions.findFirst({
      where: eq(versions.id, project.activeVersionId),
    });
    styledContent = activeVersion?.content ?? "";
  } else {
    const latestStyled = await db.query.versions.findFirst({
      where: and(
        eq(versions.projectId, projectId),
        eq(versions.versionType, "styled")
      ),
      orderBy: (v, { desc }) => [desc(v.createdAt)],
    });
    styledContent = latestStyled?.content ?? "";
  }

  if (!styledContent) {
    throw new Error(`Project ${projectId} has no styled version to fact-check`);
  }

  // 4. Extract factual claims via Claude
  const claimsResult = await claude.call({
    system: "Extract all specific factual claims (numbers, dates, names, statistics, percentages, financial figures) from the provided content. Return a JSON array of strings — one claim per item. Return ONLY the JSON array, no other text.",
    messages: [{ role: "user", content: styledContent }],
    maxTokens: 2048,
  });

  let claims: string[] = [];
  try {
    const jsonMatch = claimsResult.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      claims = JSON.parse(jsonMatch[0]) as string[];
    }
  } catch {
    // If parsing fails, proceed with an empty claims list — Gemini will still review the full text
    claims = [];
  }

  // 5. Call Gemini fact-check
  const geminiResult = await gemini.factCheck(styledContent, claims);

  const durationMs = Date.now() - startedAt;

  // 6. Insert fact-checked version
  const issueCount = geminiResult.issues.length;
  const [newVersion] = await db
    .insert(versions)
    .values({
      projectId,
      producedByStep: 8,
      versionType: "fact_checked",
      internalLabel: `Fact-Checked V3${issueCount > 0 ? ` (${issueCount} issue${issueCount !== 1 ? "s" : ""} found)` : ""}`,
      content: geminiResult.correctedContent,
      wordCount: countWords(geminiResult.correctedContent),
      isClientVisible: false,
    })
    .returning();

  if (!newVersion) throw new Error("Failed to insert fact-checked version");

  // 7. Update activeVersionId
  await db
    .update(projects)
    .set({ activeVersionId: newVersion.id, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // 8. Audit log
  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 8,
    modelId: "gemini-2.0-flash",
    payload: {
      durationMs,
      issueCount,
      verified: geminiResult.verified,
      claimsChecked: claims.length,
    },
  });

  // 9. Update stage to completed
  await db
    .update(stages)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: { durationMs },
    })
    .where(and(eq(stages.projectId, projectId), eq(stages.stepNumber, 8)));

  // 10. Advance project to stage 9
  await db
    .update(projects)
    .set({ currentStage: 9, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
