import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

export interface StyleGuideRules {
  toneRules: string[];
  formattingRules: string[];
  vocabularyRules: string[];
  structureRules: string[];
  prohibitions: string[];
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
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StyleGuide = typeof styleGuides.$inferSelect;
export type NewStyleGuide = typeof styleGuides.$inferInsert;
