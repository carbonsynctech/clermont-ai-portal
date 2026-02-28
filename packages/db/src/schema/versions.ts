import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const versionTypeEnum = pgEnum("version_type", [
  "persona_draft",
  "synthesis",
  "styled",
  "fact_checked",
  "final_styled",
  "human_reviewed",
  "red_report",
  "final",
  "exported_html",
]);

export const versions = pgTable("versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  parentVersionId: uuid("parent_version_id"),
  producedByStep: integer("produced_by_step").notNull(),
  versionType: versionTypeEnum("version_type").notNull(),
  personaId: uuid("persona_id"),
  internalLabel: text("internal_label").notNull(),
  content: text("content").notNull(),
  wordCount: integer("word_count"),
  isClientVisible: boolean("is_client_visible").default(false).notNull(),
  isSealed: boolean("is_sealed").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Version = typeof versions.$inferSelect;
export type NewVersion = typeof versions.$inferInsert;
