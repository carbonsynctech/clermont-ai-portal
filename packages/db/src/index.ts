// Re-export generated Supabase types
export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "./database.types";

// Re-export hand-written JSONB interfaces
export type {
  ProjectBriefData,
  FactCheckSource,
  FactCheckFinding,
  StageMetadata,
  StyleGuideRules,
  CoverImageEntry,
  CoverImagesData,
} from "./json-types";

// ── Row aliases (convenience) ────────────────────────────────
import type { Tables } from "./database.types";

export type AuditLog = Tables<"audit_logs">;
export type Job = Tables<"jobs">;
export type Persona = Tables<"personas">;
export type Project = Tables<"projects">;
export type SourceChunk = Tables<"source_chunks">;
export type SourceMaterial = Tables<"source_materials">;
export type Stage = Tables<"stages">;
export type StyleGuide = Tables<"style_guides">;
export type User = Tables<"users">;
export type Version = Tables<"versions">;
