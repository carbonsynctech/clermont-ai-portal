CREATE TYPE "public"."project_status" AS ENUM('draft', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('pending', 'running', 'awaiting_human', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."version_type" AS ENUM('persona_draft', 'synthesis', 'styled', 'fact_checked', 'final_styled', 'human_reviewed', 'red_report', 'final', 'exported_html');--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('financial_report', 'business_model', 'cv_biography', 'market_research', 'legal_document', 'other');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('project_created', 'brief_submitted', 'persona_selected', 'source_uploaded', 'nda_acknowledged', 'human_review_approved', 'human_review_revised', 'critique_selected', 'export_requested', 'agent_job_dispatched', 'agent_response_received', 'agent_job_failed', 'stage_started', 'stage_completed', 'stage_failed', 'version_created', 'version_sealed');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"brief_data" jsonb,
	"master_prompt" text,
	"current_stage" integer DEFAULT 1 NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"active_version_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"step_name" text NOT NULL,
	"status" "stage_status" DEFAULT 'pending' NOT NULL,
	"worker_job_id" text,
	"error_message" text,
	"metadata" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_version_id" uuid,
	"produced_by_step" integer NOT NULL,
	"version_type" "version_type" NOT NULL,
	"persona_id" uuid,
	"internal_label" text NOT NULL,
	"content" text NOT NULL,
	"word_count" integer,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"is_sealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"system_prompt" text NOT NULL,
	"source_urls" text[] DEFAULT '{}' NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"selection_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"material_type" "material_type" NOT NULL,
	"original_filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"nda_acknowledged" boolean DEFAULT false NOT NULL,
	"extracted_metadata" jsonb,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"source_page" integer,
	"char_count" integer NOT NULL,
	"estimated_tokens" integer NOT NULL,
	"summary" text,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"extracted_rules" jsonb,
	"is_processed" boolean DEFAULT false NOT NULL,
	"condensed_rules_text" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"action" "audit_action" NOT NULL,
	"step_number" integer,
	"payload" jsonb,
	"prompt_snapshot" text,
	"response_snapshot" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"model_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_material_id_source_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."source_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_guides" ADD CONSTRAINT "style_guides_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;