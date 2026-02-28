import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { sourceMaterials } from "./source-materials.js";

export const sourceChunks = pgTable("source_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  materialId: uuid("material_id")
    .notNull()
    .references(() => sourceMaterials.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  sourcePage: integer("source_page"),
  charCount: integer("char_count").notNull(),
  estimatedTokens: integer("estimated_tokens").notNull(),
  summary: text("summary"),
  keywords: text("keywords").array().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SourceChunk = typeof sourceChunks.$inferSelect;
export type NewSourceChunk = typeof sourceChunks.$inferInsert;
