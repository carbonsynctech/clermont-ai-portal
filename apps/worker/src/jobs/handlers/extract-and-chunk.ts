import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { parse as csvParse } from "csv-parse/sync";
import { db, sourceMaterials, sourceChunks, auditLogs } from "@repo/db";
import { eq } from "drizzle-orm";
import { chunkText, claude } from "@repo/core";
import { createAdminClient } from "../../lib/supabase-admin";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SUMMARY_BATCH_SIZE = 10;

export async function extractAndChunk(materialId: string): Promise<void> {
  // 1. Fetch source_material row
  const material = await db.query.sourceMaterials.findFirst({
    where: eq(sourceMaterials.id, materialId),
  });

  if (!material) throw new Error(`Source material ${materialId} not found`);

  // 2. Download file from Supabase Storage
  const adminSupabase = createAdminClient();
  const { data: fileData, error } = await adminSupabase.storage
    .from("source-materials")
    .download(material.storagePath);

  if (error ?? !fileData) {
    throw new Error(`Failed to download material ${materialId}: ${String(error?.message)}`);
  }

  // 3. Convert to Buffer
  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 4. Extract text
  let text: string;
  if (material.mimeType === "application/pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    text = result.text;
    await parser.destroy();
  } else if (
    material.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (material.mimeType === "text/csv") {
    // Parse CSV into rows, then format as readable text
    const raw = buffer.toString("utf-8");
    const records = csvParse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as Record<string, string>[];
    if (records.length === 0) {
      text = raw; // fallback to raw text if parsing fails
    } else {
      const headers = Object.keys(records[0] as Record<string, string>);
      const lines = records.map((row) =>
        headers.map((h) => `${h}: ${row[h] ?? ""}`).join(" | "),
      );
      text = `Columns: ${headers.join(", ")}\n\n${lines.join("\n")}`;
    }
  } else {
    // Plain text fallback
    text = buffer.toString("utf-8");
  }

  if (!text.trim()) {
    throw new Error(`No text extracted from material ${materialId}`);
  }

  // 5. Chunk the text
  const chunks = chunkText(text);

  // 6. Batch-insert source_chunks rows
  if (chunks.length > 0) {
    const chunkRows = chunks.map((chunk) => ({
      materialId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      charCount: chunk.charCount,
      estimatedTokens: chunk.estimatedTokens,
      sourcePage: chunk.sourcePage ?? null,
    }));

    // Insert in batches of 100 to avoid query size limits
    const batchSize = 100;
    for (let i = 0; i < chunkRows.length; i += batchSize) {
      await db.insert(sourceChunks).values(chunkRows.slice(i, i + batchSize));
    }
  }

  // 7. Update chunkCount on source_material
  await db
    .update(sourceMaterials)
    .set({ chunkCount: chunks.length })
    .where(eq(sourceMaterials.id, materialId));

  console.log(`Extracted ${chunks.length} chunks from material ${materialId}`);

  // 8. Summarize each chunk with Claude Haiku so selectChunksForBudget() can
  //    fall back to summaries when the full source material exceeds the token budget.
  if (chunks.length > 0) {
    const insertedChunks = await db.query.sourceChunks.findMany({
      where: eq(sourceChunks.materialId, materialId),
      orderBy: (c, { asc }) => [asc(c.chunkIndex)],
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let i = 0; i < insertedChunks.length; i += SUMMARY_BATCH_SIZE) {
      const batch = insertedChunks.slice(i, i + SUMMARY_BATCH_SIZE);
      await Promise.all(
        batch.map(async (chunk) => {
          try {
            const result = await claude.call({
              model: HAIKU_MODEL,
              system:
                "You are a concise summarizer. Summarize the provided excerpt in 2-3 sentences, preserving key facts, names, numbers, and claims.",
              messages: [{ role: "user", content: chunk.content }],
              maxTokens: 150,
            });
            await db
              .update(sourceChunks)
              .set({ summary: result.content.trim() })
              .where(eq(sourceChunks.id, chunk.id));
            totalInputTokens += result.inputTokens;
            totalOutputTokens += result.outputTokens;
          } catch (err) {
            console.warn(
              `Failed to summarize chunk ${chunk.id} (index ${chunk.chunkIndex}):`,
              err,
            );
          }
        }),
      );
    }

    await db.insert(auditLogs).values({
      projectId: material.projectId,
      action: "agent_response_received",
      stepNumber: 3,
      modelId: HAIKU_MODEL,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      payload: { materialId, chunkCount: insertedChunks.length, summarizationComplete: true },
    });

    console.log(`Summarized ${insertedChunks.length} chunks from material ${materialId}`);
  }
}
