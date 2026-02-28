import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const materialTypeEnum = pgEnum("material_type", [
  "financial_report",
  "business_model",
  "cv_biography",
  "market_research",
  "legal_document",
  "other",
]);

export const sourceMaterials = pgTable("source_materials", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  materialType: materialTypeEnum("material_type").notNull(),
  originalFilename: text("original_filename").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  chunkCount: integer("chunk_count").default(0).notNull(),
  ndaAcknowledged: boolean("nda_acknowledged").default(false).notNull(),
  extractedMetadata: jsonb("extracted_metadata"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SourceMaterial = typeof sourceMaterials.$inferSelect;
export type NewSourceMaterial = typeof sourceMaterials.$inferInsert;
