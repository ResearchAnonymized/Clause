export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_events: {
        Row: {
          agent_name: string
          created_at: string
          id: string
          message: string
          model: string | null
          run_id: string
          status: string
          workspace_id: string
        }
        Insert: {
          agent_name: string
          created_at?: string
          id?: string
          message: string
          model?: string | null
          run_id: string
          status?: string
          workspace_id: string
        }
        Update: {
          agent_name?: string
          created_at?: string
          id?: string
          message?: string
          model?: string | null
          run_id?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_schedules: {
        Row: {
          cadence: string
          created_at: string
          created_by: string | null
          criteria_set_id: string
          enabled: boolean
          id: string
          last_run_at: string | null
          name: string
          next_run_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cadence: string
          created_at?: string
          created_by?: string | null
          criteria_set_id: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name: string
          next_run_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cadence?: string
          created_at?: string
          created_by?: string | null
          criteria_set_id?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name?: string
          next_run_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_schedules_criteria_set_id_fkey"
            columns: ["criteria_set_id"]
            isOneToOne: false
            referencedRelation: "criteria_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_schedules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_checklist_items: {
        Row: {
          agent_answer: string
          agent_confidence: number | null
          agent_evidence: string | null
          agent_justification: string | null
          agent_recommended_action: string | null
          agent_severity: string | null
          analyzer_version: number | null
          category: string | null
          chunker_version: number | null
          clause_ref: string | null
          created_at: string
          criterion_id: string | null
          criterion_name: string
          evidence_chunk_ids: string[] | null
          extractor_version: number | null
          flagged: boolean
          grounded: boolean | null
          id: string
          ord: number
          retrieval_debug: Json | null
          reviewer_answer: string | null
          reviewer_comment: string | null
          reviewer_evidence_override: string | null
          reviewer_severity: string | null
          run_id: string
          status: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          agent_answer?: string
          agent_confidence?: number | null
          agent_evidence?: string | null
          agent_justification?: string | null
          agent_recommended_action?: string | null
          agent_severity?: string | null
          analyzer_version?: number | null
          category?: string | null
          chunker_version?: number | null
          clause_ref?: string | null
          created_at?: string
          criterion_id?: string | null
          criterion_name: string
          evidence_chunk_ids?: string[] | null
          extractor_version?: number | null
          flagged?: boolean
          grounded?: boolean | null
          id?: string
          ord?: number
          retrieval_debug?: Json | null
          reviewer_answer?: string | null
          reviewer_comment?: string | null
          reviewer_evidence_override?: string | null
          reviewer_severity?: string | null
          run_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          agent_answer?: string
          agent_confidence?: number | null
          agent_evidence?: string | null
          agent_justification?: string | null
          agent_recommended_action?: string | null
          agent_severity?: string | null
          analyzer_version?: number | null
          category?: string | null
          chunker_version?: number | null
          clause_ref?: string | null
          created_at?: string
          criterion_id?: string | null
          criterion_name?: string
          evidence_chunk_ids?: string[] | null
          extractor_version?: number | null
          flagged?: boolean
          grounded?: boolean | null
          id?: string
          ord?: number
          retrieval_debug?: Json | null
          reviewer_answer?: string | null
          reviewer_comment?: string | null
          reviewer_evidence_override?: string | null
          reviewer_severity?: string | null
          run_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_checklist_items_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_checklist_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_checklist_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      criteria: {
        Row: {
          active_variant_index: number
          category: string
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          model: string
          name: string
          prompt: string
          prompt_variants: Json
          set_id: string
          severity_default: string
          sort_order: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          active_variant_index?: number
          category: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          model?: string
          name: string
          prompt: string
          prompt_variants?: Json
          set_id: string
          severity_default?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          active_variant_index?: number
          category?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          model?: string
          name?: string
          prompt?: string
          prompt_variants?: Json
          set_id?: string
          severity_default?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "criteria_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "criteria_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "criteria_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      criteria_sets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "criteria_sets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_approvals: {
        Row: {
          approver_id: string | null
          approver_name: string
          comment: string | null
          decision_id: string
          id: string
          role: string
          signature: string
          signed_at: string
          workspace_id: string
        }
        Insert: {
          approver_id?: string | null
          approver_name: string
          comment?: string | null
          decision_id: string
          id?: string
          role?: string
          signature: string
          signed_at?: string
          workspace_id: string
        }
        Update: {
          approver_id?: string | null
          approver_name?: string
          comment?: string | null
          decision_id?: string
          id?: string
          role?: string
          signature?: string
          signed_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_approvals_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          created_at: string
          created_by: string | null
          doc_sha256: string | null
          finalised_at: string | null
          id: string
          rationale: string | null
          report_sha256: string | null
          required_approvals: number
          run_id: string
          signer_ip: string | null
          signer_user_agent: string | null
          source_docs_sha256: string | null
          status: string
          updated_at: string
          verdict: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_sha256?: string | null
          finalised_at?: string | null
          id?: string
          rationale?: string | null
          report_sha256?: string | null
          required_approvals?: number
          run_id: string
          signer_ip?: string | null
          signer_user_agent?: string | null
          source_docs_sha256?: string | null
          status?: string
          updated_at?: string
          verdict: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_sha256?: string | null
          finalised_at?: string | null
          id?: string
          rationale?: string | null
          report_sha256?: string | null
          required_approvals?: number
          run_id?: string
          signer_ip?: string | null
          signer_user_agent?: string | null
          source_docs_sha256?: string | null
          status?: string
          updated_at?: string
          verdict?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_chunks: {
        Row: {
          chunker_version: number | null
          created_at: string
          document_id: string
          embedding: string | null
          extractor_version: number | null
          id: string
          ord: number
          role: string
          run_id: string
          text: string
          token_count: number | null
          workspace_id: string
        }
        Insert: {
          chunker_version?: number | null
          created_at?: string
          document_id: string
          embedding?: string | null
          extractor_version?: number | null
          id?: string
          ord: number
          role: string
          run_id: string
          text: string
          token_count?: number | null
          workspace_id: string
        }
        Update: {
          chunker_version?: number | null
          created_at?: string
          document_id?: string
          embedding?: string | null
          extractor_version?: number | null
          id?: string
          ord?: number
          role?: string
          run_id?: string
          text?: string
          token_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "run_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_chunks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_chunks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          context: Json
          created_at: string
          id: string
          level: string
          message: string
          source: string
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message: string
          source: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message?: string
          source?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      findings: {
        Row: {
          agent_name: string | null
          analyzer_version: number | null
          category: string
          chunker_version: number | null
          clause_ref: string | null
          confidence: number | null
          created_at: string
          criterion_id: string | null
          criterion_name: string
          evidence_chunk_ids: string[] | null
          evidence_quote: string | null
          extractor_version: number | null
          grounded: boolean | null
          id: string
          justification: string
          model: string | null
          produced_at: string | null
          prompt_variant: number | null
          recommended_action: string | null
          retrieval_debug: Json | null
          run_id: string
          severity: string
          superseded_at: string | null
          supersedes_id: string | null
          workspace_id: string
        }
        Insert: {
          agent_name?: string | null
          analyzer_version?: number | null
          category: string
          chunker_version?: number | null
          clause_ref?: string | null
          confidence?: number | null
          created_at?: string
          criterion_id?: string | null
          criterion_name: string
          evidence_chunk_ids?: string[] | null
          evidence_quote?: string | null
          extractor_version?: number | null
          grounded?: boolean | null
          id?: string
          justification: string
          model?: string | null
          produced_at?: string | null
          prompt_variant?: number | null
          recommended_action?: string | null
          retrieval_debug?: Json | null
          run_id: string
          severity: string
          superseded_at?: string | null
          supersedes_id?: string | null
          workspace_id: string
        }
        Update: {
          agent_name?: string | null
          analyzer_version?: number | null
          category?: string
          chunker_version?: number | null
          clause_ref?: string | null
          confidence?: number | null
          created_at?: string
          criterion_id?: string | null
          criterion_name?: string
          evidence_chunk_ids?: string[] | null
          evidence_quote?: string | null
          extractor_version?: number | null
          grounded?: boolean | null
          id?: string
          justification?: string
          model?: string | null
          produced_at?: string | null
          prompt_variant?: number | null
          recommended_action?: string | null
          retrieval_debug?: Json | null
          run_id?: string
          severity?: string
          superseded_at?: string | null
          supersedes_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiation_items: {
        Row: {
          ask: string
          category: string | null
          created_at: string
          created_by: string | null
          criterion_name: string | null
          finding_id: string | null
          id: string
          notes: string | null
          priority: string
          run_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ask: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          criterion_name?: string | null
          finding_id?: string | null
          id?: string
          notes?: string | null
          priority?: string
          run_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ask?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          criterion_name?: string | null
          finding_id?: string | null
          id?: string
          notes?: string | null
          priority?: string
          run_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_items_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_workspace_id: string | null
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_workspace_id?: string | null
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_workspace_id?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_workspace_id_fkey"
            columns: ["current_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          key: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          key: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      report_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          last_viewer_ip: string | null
          max_views: number | null
          revoked_at: string | null
          run_id: string
          token: string
          view_count: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          last_viewer_ip?: string | null
          max_views?: number | null
          revoked_at?: string | null
          run_id: string
          token: string
          view_count?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          last_viewer_ip?: string | null
          max_views?: number | null
          revoked_at?: string | null
          run_id?: string
          token?: string
          view_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      run_documents: {
        Row: {
          created_at: string
          extracted_text: string | null
          extractor_version: number | null
          filename: string
          id: string
          mime_type: string | null
          num_chunks: number | null
          parsed_at: string | null
          parsed_text: string | null
          role: string
          run_id: string
          size_bytes: number | null
          storage_path: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          extracted_text?: string | null
          extractor_version?: number | null
          filename: string
          id?: string
          mime_type?: string | null
          num_chunks?: number | null
          parsed_at?: string | null
          parsed_text?: string | null
          role: string
          run_id: string
          size_bytes?: number | null
          storage_path?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          extracted_text?: string | null
          extractor_version?: number | null
          filename?: string
          id?: string
          mime_type?: string | null
          num_chunks?: number | null
          parsed_at?: string | null
          parsed_text?: string | null
          role?: string
          run_id?: string
          size_bytes?: number | null
          storage_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_documents_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          auditor_ref: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          criteria_set_id: string | null
          critical_count: number
          id: string
          ok_count: number
          review_frequency: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_name: string | null
          reviewer_title: string | null
          signature_statement: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          summary: string | null
          title: string
          token_usage: Json | null
          updated_at: string
          warning_count: number
          worker_version: string | null
          workspace_id: string
        }
        Insert: {
          auditor_ref?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          criteria_set_id?: string | null
          critical_count?: number
          id?: string
          ok_count?: number
          review_frequency?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_name?: string | null
          reviewer_title?: string | null
          signature_statement?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          summary?: string | null
          title: string
          token_usage?: Json | null
          updated_at?: string
          warning_count?: number
          worker_version?: string | null
          workspace_id: string
        }
        Update: {
          auditor_ref?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          criteria_set_id?: string | null
          critical_count?: number
          id?: string
          ok_count?: number
          review_frequency?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_name?: string | null
          reviewer_title?: string | null
          signature_statement?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          summary?: string | null
          title?: string
          token_usage?: Json | null
          updated_at?: string
          warning_count?: number
          worker_version?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_criteria_set_id_fkey"
            columns: ["criteria_set_id"]
            isOneToOne: false
            referencedRelation: "criteria_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          agent_prompts: Json
          created_at: string
          id: string
          llm_config: Json
          name: string
          owner_id: string
          slack_webhook_url: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          agent_prompts?: Json
          created_at?: string
          id?: string
          llm_config?: Json
          name: string
          owner_id: string
          slack_webhook_url?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          agent_prompts?: Json
          created_at?: string
          id?: string
          llm_config?: Json
          name?: string
          owner_id?: string
          slack_webhook_url?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          _bucket: string
          _key: string
          _limit: number
          _window_seconds: number
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      log_audit_event: {
        Args: {
          _action: string
          _details?: Json
          _entity_id: string
          _entity_label: string
          _entity_type: string
          _workspace_id: string
        }
        Returns: undefined
      }
      match_doc_chunks: {
        Args: {
          _match_count?: number
          _query_embedding: string
          _role: string
          _run_id: string
        }
        Returns: {
          document_id: string
          id: string
          ord: number
          similarity: number
          text: string
        }[]
      }
      reap_stuck_runs: { Args: never; Returns: number }
      set_current_workspace: {
        Args: { _workspace_id: string }
        Returns: undefined
      }
      verify_decision_hash: {
        Args: { _hash: string }
        Returns: {
          signed_at: string
          signer_name: string
          signer_role: string
          verdict: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "reviewer" | "viewer"
      run_status: "queued" | "running" | "completed" | "failed"
      workspace_role: "owner" | "admin" | "reviewer" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "reviewer", "viewer"],
      run_status: ["queued", "running", "completed", "failed"],
      workspace_role: ["owner", "admin", "reviewer", "viewer"],
    },
  },
} as const
