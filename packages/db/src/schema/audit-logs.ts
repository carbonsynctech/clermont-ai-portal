import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

export const auditActionEnum = pgEnum("audit_action", [
  // Human actions
  "project_created",
  "project_trashed",
  "project_restored",
  "project_purged",
  "brief_submitted",
  "persona_selected",
  "source_uploaded",
  "nda_acknowledged",
  "fact_check_approved",
  "human_review_approved",
  "human_review_revised",
  "critique_selected",
  "export_requested",
  // AI actions
  "agent_job_dispatched",
  "agent_response_received",
  "agent_job_failed",
  // System actions
  "stage_started",
  "stage_completed",
  "stage_failed",
  "version_created",
  "version_sealed",
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id"),
  userId: uuid("user_id"),
  action: auditActionEnum("action").notNull(),
  stepNumber: integer("step_number"),
  payload: jsonb("payload"),
  promptSnapshot: text("prompt_snapshot"),
  responseSnapshot: text("response_snapshot"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  modelId: text("model_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
