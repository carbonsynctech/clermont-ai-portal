// Auto-generated via: supabase gen types typescript --project-id urgdvibncmnhzwjvfsbc
// Re-generate after schema changes: pnpm db:gen-types
//
// Manual edits will be overwritten on next generation.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at: string
          id: string
          input_tokens: number | null
          model_id: string | null
          output_tokens: number | null
          payload: Json | null
          project_id: string | null
          prompt_snapshot: string | null
          response_snapshot: string | null
          step_number: number | null
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          id?: string
          input_tokens?: number | null
          model_id?: string | null
          output_tokens?: number | null
          payload?: Json | null
          project_id?: string | null
          prompt_snapshot?: string | null
          response_snapshot?: string | null
          step_number?: number | null
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          id?: string
          input_tokens?: number | null
          model_id?: string | null
          output_tokens?: number | null
          payload?: Json | null
          project_id?: string | null
          prompt_snapshot?: string | null
          response_snapshot?: string | null
          step_number?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          partial_output: string | null
          payload: Json
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          partial_output?: string | null
          payload?: Json
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          partial_output?: string | null
          payload?: Json
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type?: string
        }
        Relationships: []
      }
      personas: {
        Row: {
          created_at: string
          description: string
          id: string
          is_selected: boolean
          name: string
          project_id: string | null
          selection_order: number | null
          source_urls: string[]
          system_prompt: string
          tags: string[]
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_selected?: boolean
          name: string
          project_id?: string | null
          selection_order?: number | null
          source_urls?: string[]
          system_prompt: string
          tags?: string[]
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_selected?: boolean
          name?: string
          project_id?: string | null
          selection_order?: number | null
          source_urls?: string[]
          system_prompt?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "personas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active_version_id: string | null
          brief_data: Json | null
          created_at: string
          current_stage: number
          deleted_at: string | null
          id: string
          master_prompt: string | null
          owner_id: string
          status: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at: string
        }
        Insert: {
          active_version_id?: string | null
          brief_data?: Json | null
          created_at?: string
          current_stage?: number
          deleted_at?: string | null
          id?: string
          master_prompt?: string | null
          owner_id: string
          status?: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at?: string
        }
        Update: {
          active_version_id?: string | null
          brief_data?: Json | null
          created_at?: string
          current_stage?: number
          deleted_at?: string | null
          id?: string
          master_prompt?: string | null
          owner_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      source_chunks: {
        Row: {
          char_count: number
          chunk_index: number
          content: string
          created_at: string
          estimated_tokens: number
          id: string
          keywords: string[]
          material_id: string
          source_page: number | null
          summary: string | null
        }
        Insert: {
          char_count: number
          chunk_index: number
          content: string
          created_at?: string
          estimated_tokens: number
          id?: string
          keywords?: string[]
          material_id: string
          source_page?: number | null
          summary?: string | null
        }
        Update: {
          char_count?: number
          chunk_index?: number
          content?: string
          created_at?: string
          estimated_tokens?: number
          id?: string
          keywords?: string[]
          material_id?: string
          source_page?: number | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_chunks_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "source_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      source_materials: {
        Row: {
          chunk_count: number
          extracted_metadata: Json | null
          file_size_bytes: number
          id: string
          material_type: Database["public"]["Enums"]["material_type"]
          mime_type: string
          nda_acknowledged: boolean
          original_filename: string
          project_id: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          chunk_count?: number
          extracted_metadata?: Json | null
          file_size_bytes: number
          id?: string
          material_type: Database["public"]["Enums"]["material_type"]
          mime_type: string
          nda_acknowledged?: boolean
          original_filename: string
          project_id: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          chunk_count?: number
          extracted_metadata?: Json | null
          file_size_bytes?: number
          id?: string
          material_type?: Database["public"]["Enums"]["material_type"]
          mime_type?: string
          nda_acknowledged?: boolean
          original_filename?: string
          project_id?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_materials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          project_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["stage_status"]
          step_name: string
          step_number: number
          updated_at: string
          worker_job_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          project_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          step_name: string
          step_number: number
          updated_at?: string
          worker_job_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          project_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          step_name?: string
          step_number?: number
          updated_at?: string
          worker_job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      style_guides: {
        Row: {
          condensed_rules_text: string | null
          cover_images: Json | null
          extracted_rules: Json | null
          id: string
          is_processed: boolean
          original_filename: string
          project_id: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          condensed_rules_text?: string | null
          cover_images?: Json | null
          extracted_rules?: Json | null
          id?: string
          is_processed?: boolean
          original_filename: string
          project_id: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          condensed_rules_text?: string | null
          cover_images?: Json | null
          extracted_rules?: Json | null
          id?: string
          is_processed?: boolean
          original_filename?: string
          project_id?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "style_guides_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_admin: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          is_admin?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          is_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      versions: {
        Row: {
          content: string
          created_at: string
          id: string
          internal_label: string
          is_client_visible: boolean
          is_sealed: boolean
          parent_version_id: string | null
          persona_id: string | null
          produced_by_step: number
          project_id: string
          version_type: Database["public"]["Enums"]["version_type"]
          word_count: number | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          internal_label: string
          is_client_visible?: boolean
          is_sealed?: boolean
          parent_version_id?: string | null
          persona_id?: string | null
          produced_by_step: number
          project_id: string
          version_type: Database["public"]["Enums"]["version_type"]
          word_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          internal_label?: string
          is_client_visible?: boolean
          is_sealed?: boolean
          parent_version_id?: string | null
          persona_id?: string | null
          produced_by_step?: number
          project_id?: string
          version_type?: Database["public"]["Enums"]["version_type"]
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      pgmq_archive: {
        Args: { msg_id: number; queue_name: string }
        Returns: boolean
      }
      pgmq_read: {
        Args: { batch_size: number; queue_name: string; sleep_seconds: number }
        Returns: Array<{
          msg_id: number;
          read_ct: number;
          enqueued_at: string;
          vt: string;
          message: Json;
        }>
      }
      pgmq_send: { Args: { msg: Json; queue_name: string }; Returns: number }
    }
    Enums: {
      audit_action:
        | "project_created"
        | "project_trashed"
        | "project_restored"
        | "project_purged"
        | "brief_submitted"
        | "master_prompt_edited"
        | "persona_selected"
        | "source_uploaded"
        | "source_deleted"
        | "nda_acknowledged"
        | "fact_check_approved"
        | "human_review_approved"
        | "human_review_revised"
        | "critique_selected"
        | "export_requested"
        | "agent_job_dispatched"
        | "agent_response_received"
        | "agent_job_failed"
        | "stage_started"
        | "stage_completed"
        | "stage_failed"
        | "version_created"
        | "version_sealed"
      job_status: "pending" | "running" | "completed" | "failed"
      material_type:
        | "financial_report"
        | "business_model"
        | "cv_biography"
        | "market_research"
        | "legal_document"
        | "other"
      project_status: "draft" | "active" | "paused" | "completed" | "archived"
      stage_status:
        | "pending"
        | "running"
        | "awaiting_human"
        | "completed"
        | "failed"
        | "skipped"
      version_type:
        | "persona_draft"
        | "synthesis"
        | "styled"
        | "fact_checked"
        | "final_styled"
        | "human_reviewed"
        | "red_report"
        | "final"
        | "exported_html"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ── Helper types ─────────────────────────────────────────────
type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never;
