import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const stageStatusEnum = pgEnum("stage_status", [
  "pending",
  "running",
  "awaiting_human",
  "completed",
  "failed",
  "skipped",
]);

export interface FactCheckSource {
  documentName: string | null;
  pageNumber: number | null;
  url?: string | null;
  evidence?: string | null;
}

export interface FactCheckFinding {
  id: string;
  issue: string;
  incorrectText?: string | null;
  correctedText?: string | null;
  sources?: FactCheckSource[];
}

export interface StageMetadata {
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  factCheckIssues?: string[];
  factCheckFindings?: FactCheckFinding[];
  factCheckApprovedFindingIds?: string[];
  factCheckApprovedIssues?: string[];
  factCheckAppliedCorrections?: number;
  factCheckRevisedVersionId?: string;
  reviewDraftContent?: string;
  reviewDraftSavedAt?: string;
  reviewNotes?: string;
  selectedCritiquesCount?: number;
  devilsAdvocateDraft?: {
    critiques: Array<{
      id: number;
      title: string;
      detail: string;
      isCustom?: boolean;
    }>;
    selectedIds: number[];
    selectedCritiques: string[];
    savedAt: string;
  };
}

export const stages = pgTable("stages", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  stepName: text("step_name").notNull(),
  status: stageStatusEnum("status").default("pending").notNull(),
  workerJobId: text("worker_job_id"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<StageMetadata>(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Stage = typeof stages.$inferSelect;
export type NewStage = typeof stages.$inferInsert;
