-- ============================================================
-- RLS Policies for Clermont AI Portal
-- Run this in Supabase SQL Editor after running db:migrate
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- users: users can only read/update their own record
-- ============================================================
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (id = auth.uid());

-- ============================================================
-- projects: owner has full access
-- ============================================================
CREATE POLICY "projects_all_own" ON projects
  FOR ALL USING (owner_id = auth.uid());

-- ============================================================
-- stages: access via project ownership
-- ============================================================
CREATE POLICY "stages_all_via_project" ON stages
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- versions: access via project ownership
-- ============================================================
CREATE POLICY "versions_all_via_project" ON versions
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- personas: access via project ownership
-- ============================================================
CREATE POLICY "personas_all_via_project" ON personas
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- source_materials: access via project ownership
-- ============================================================
CREATE POLICY "source_materials_all_via_project" ON source_materials
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- source_chunks: access via material -> project ownership
-- ============================================================
CREATE POLICY "source_chunks_all_via_material" ON source_chunks
  FOR ALL USING (
    material_id IN (
      SELECT sm.id FROM source_materials sm
      JOIN projects p ON p.id = sm.project_id
      WHERE p.owner_id = auth.uid()
    )
  );

-- ============================================================
-- style_guides: access via project ownership
-- ============================================================
CREATE POLICY "style_guides_all_via_project" ON style_guides
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- audit_logs: users can only view their own logs
-- ============================================================
CREATE POLICY "audit_logs_select_own" ON audit_logs
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- Auth trigger: sync Supabase auth.users -> public.users
-- =========================
===================================
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
