-- ============================================================
-- Clermont AI Portal – Source-of-truth DDL
-- Run against Supabase SQL Editor for schema changes.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgmq" WITH SCHEMA "pgmq";

-- ============================================================
-- Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('draft','active','paused','completed','archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE stage_status AS ENUM ('pending','running','awaiting_human','completed','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE version_type AS ENUM ('persona_draft','synthesis','styled','fact_checked','final_styled','human_reviewed','red_report','final','exported_html');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE material_type AS ENUM ('financial_report','business_model','cv_biography','market_research','legal_document','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    -- Human actions
    'project_created','project_trashed','project_restored','project_purged',
    'brief_submitted','master_prompt_edited','persona_selected',
    'source_uploaded','source_deleted','nda_acknowledged',
    'fact_check_approved','human_review_approved','human_review_revised',
    'critique_selected','export_requested',
    -- AI actions
    'agent_job_dispatched','agent_response_received','agent_job_failed',
    -- System actions
    'stage_started','stage_completed','stage_failed',
    'version_created','version_sealed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('pending','running','completed','failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY,                             -- from auth.users
  email         text NOT NULL UNIQUE,
  display_name  text,
  avatar_url    text,
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             text NOT NULL,
  brief_data        jsonb,
  master_prompt     text,
  current_stage     integer NOT NULL DEFAULT 1,
  status            project_status NOT NULL DEFAULT 'draft',
  active_version_id uuid,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_number     integer NOT NULL,
  step_name       text NOT NULL,
  status          stage_status NOT NULL DEFAULT 'pending',
  worker_job_id   text,
  error_message   text,
  metadata        jsonb,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_version_id uuid,
  produced_by_step  integer NOT NULL,
  version_type      version_type NOT NULL,
  persona_id        uuid,
  internal_label    text NOT NULL,
  content           text NOT NULL,
  word_count        integer,
  is_client_visible boolean NOT NULL DEFAULT false,
  is_sealed         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,   -- nullable for global library
  name            text NOT NULL,
  description     text NOT NULL,
  system_prompt   text NOT NULL,
  source_urls     text[] NOT NULL DEFAULT '{}',
  tags            text[] NOT NULL DEFAULT '{}',
  is_selected     boolean NOT NULL DEFAULT false,
  selection_order integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_materials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_type       material_type NOT NULL,
  original_filename   text NOT NULL,
  storage_path        text NOT NULL,
  mime_type           text NOT NULL,
  file_size_bytes     integer NOT NULL,
  chunk_count         integer NOT NULL DEFAULT 0,
  nda_acknowledged    boolean NOT NULL DEFAULT false,
  extracted_metadata  jsonb,
  uploaded_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_chunks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id       uuid NOT NULL REFERENCES source_materials(id) ON DELETE CASCADE,
  chunk_index       integer NOT NULL,
  content           text NOT NULL,
  source_page       integer,
  char_count        integer NOT NULL,
  estimated_tokens  integer NOT NULL,
  summary           text,
  keywords          text[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS style_guides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_filename   text NOT NULL,
  storage_path        text NOT NULL,
  extracted_rules     jsonb,
  is_processed        boolean NOT NULL DEFAULT false,
  condensed_rules_text text,
  cover_images        jsonb,
  uploaded_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid,
  user_id           uuid,
  action            audit_action NOT NULL,
  step_number       integer,
  payload           jsonb,
  prompt_snapshot   text,
  response_snapshot text,
  input_tokens      integer,
  output_tokens     integer,
  model_id          text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PGMQ Jobs table (persistent job queue)
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}',
  status        job_status NOT NULL DEFAULT 'pending',
  error         text,
  partial_output text,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

-- Create the PGMQ queue (idempotent)
SELECT pgmq.create('jobs');

-- ============================================================
-- RPC wrappers for PGMQ (called via supabase.rpc())
-- ============================================================
CREATE OR REPLACE FUNCTION pgmq_send(queue_name text, msg jsonb)
RETURNS bigint AS $$
  SELECT pgmq.send(queue_name, msg);
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION pgmq_read(queue_name text, sleep_seconds integer, batch_size integer)
RETURNS SETOF pgmq.message_record AS $$
  SELECT * FROM pgmq.read(queue_name, sleep_seconds, batch_size);
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION pgmq_archive(queue_name text, msg_id bigint)
RETURNS boolean AS $$
  SELECT pgmq.archive(queue_name, msg_id);
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- users: can only read/update own record
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (id = auth.uid());

-- projects: owner has full access
CREATE POLICY "projects_all_own" ON projects
  FOR ALL USING (owner_id = auth.uid());

-- stages: access via project ownership
CREATE POLICY "stages_all_via_project" ON stages
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- versions: access via project ownership
CREATE POLICY "versions_all_via_project" ON versions
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- personas: access via project ownership
CREATE POLICY "personas_all_via_project" ON personas
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- source_materials: access via project ownership
CREATE POLICY "source_materials_all_via_project" ON source_materials
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- source_chunks: access via material -> project ownership
CREATE POLICY "source_chunks_all_via_material" ON source_chunks
  FOR ALL USING (
    material_id IN (
      SELECT sm.id FROM source_materials sm
      JOIN projects p ON p.id = sm.project_id
      WHERE p.owner_id = auth.uid()
    )
  );

-- style_guides: access via project ownership
CREATE POLICY "style_guides_all_via_project" ON style_guides
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- audit_logs: users can only view their own logs
CREATE POLICY "audit_logs_select_own" ON audit_logs
  FOR SELECT USING (user_id = auth.uid());

-- jobs: no direct user access (service role only)
CREATE POLICY "jobs_service_only" ON jobs
  FOR ALL USING (false);

-- ============================================================
-- Auth trigger: sync Supabase auth.users -> public.users
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
