import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";

export interface StyleGuideRules {
  toneRules: string[];
  formattingRules: string[];
  vocabularyRules: string[];
  structureRules: string[];
  prohibitions: string[];
}

export interface CoverImageEntry {
  storagePath: string;
  style: "corporate" | "modern" | "minimal" | "bold";
  prompt: string;
  mimeType: string;
}

export interface CoverImagesData {
  images: CoverImageEntry[];
  selectedStyle: "corporate" | "modern" | "minimal" | "bold" | null;
  generatedAt: string; // ISO timestamp
}

export const styleGuides = pgTable("style_guides", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  originalFilename: text("original_filename").notNull(),
  storagePath: text("storage_path").notNull(),
  extractedRules: jsonb("extracted_rules").$type<StyleGuideRules>(),
  isProcessed: boolean("is_processed").default(false).notNull(),
  condensedRulesText: text("condensed_rules_text"),
  coverImages: jsonb("cover_images").$type<CoverImagesData>(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StyleGuide = typeof styleGuides.$inferSelect;
export type NewStyleGuide = typeof styleGuides.$inferInsert;
