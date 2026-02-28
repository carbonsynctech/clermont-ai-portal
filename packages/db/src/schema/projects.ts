import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
]);

export interface ProjectBriefData {
  companyName: string;
  sector: string;
  dealType: string;
  dealSizeUsd?: number;
  keyQuestion: string;
  targetAudience: string;
  toneInstructions?: string;
  additionalContext?: string;
}

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  briefData: jsonb("brief_data").$type<ProjectBriefData>(),
  masterPrompt: text("master_prompt"),
  currentStage: integer("current_stage").default(1).notNull(),
  status: projectStatusEnum("status").default("draft").notNull(),
  activeVersionId: uuid("active_version_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
