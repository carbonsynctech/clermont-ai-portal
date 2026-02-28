import { PDFParse } from "pdf-parse";
import { db, sourceMaterials, sourceChunks } from "@repo/db";
import { eq } from "drizzle-orm";
import { chunkText } from "@repo/core";
import { createAdminClient } from "../../lib/supabase-admin";

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
  } else {
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
}
