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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      coc_file_pool: {
        Row: {
          id: string
          site_id: string
          file_name: string
          file_url: string
          file_size: number | null
          detected_cert_no: string | null
          detected_kind: string | null
          status: string
          assigned_subsection_id: string | null
          assigned_document_id: string | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id: string
          file_name: string
          file_url: string
          file_size?: number | null
          detected_cert_no?: string | null
          detected_kind?: string | null
          status?: string
          assigned_subsection_id?: string | null
          assigned_document_id?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          file_name?: string
          file_url?: string
          file_size?: number | null
          detected_cert_no?: string | null
          detected_kind?: string | null
          status?: string
          assigned_subsection_id?: string | null
          assigned_document_id?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coc_file_pool_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      coc_import_batches: {
        Row: {
          id: string
          site_id: string
          uploaded_by: string | null
          schedule_file_name: string | null
          verification_file_name: string | null
          certs_imported: number | null
          shops_imported: number | null
          matched_count: number | null
          unmatched_count: number | null
          created_at: string
        }
        Insert: {
          id?: string
          site_id: string
          uploaded_by?: string | null
          schedule_file_name?: string | null
          verification_file_name?: string | null
          certs_imported?: number | null
          shops_imported?: number | null
          matched_count?: number | null
          unmatched_count?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          uploaded_by?: string | null
          schedule_file_name?: string | null
          verification_file_name?: string | null
          certs_imported?: number | null
          shops_imported?: number | null
          matched_count?: number | null
          unmatched_count?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coc_import_batches_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      coc_db_schedule: {
        Row: {
          id: string
          site_id: string
          subsection_id: string | null
          import_batch_id: string | null
          shop_no_raw: string | null
          trading_name: string | null
          coc_required: string | null
          initial_cert_nos: string | null
          supplementary_cert_nos: string | null
          unclear: string | null
          supp_to_initial_ref: string | null
          files_count: number | null
          status: string | null
          notes: string | null
          match_status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          site_id: string
          subsection_id?: string | null
          import_batch_id?: string | null
          shop_no_raw?: string | null
          trading_name?: string | null
          coc_required?: string | null
          initial_cert_nos?: string | null
          supplementary_cert_nos?: string | null
          unclear?: string | null
          supp_to_initial_ref?: string | null
          files_count?: number | null
          status?: string | null
          notes?: string | null
          match_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          subsection_id?: string | null
          import_batch_id?: string | null
          shop_no_raw?: string | null
          trading_name?: string | null
          coc_required?: string | null
          initial_cert_nos?: string | null
          supplementary_cert_nos?: string | null
          unclear?: string | null
          supp_to_initial_ref?: string | null
          files_count?: number | null
          status?: string | null
          notes?: string | null
          match_status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coc_db_schedule_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coc_db_schedule_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coc_db_schedule_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "coc_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      coc_certificates: {
        Row: {
          id: string
          site_id: string
          subsection_id: string | null
          import_batch_id: string | null
          shop_no_raw: string | null
          cert_no: string | null
          cert_no_norm: string | null
          cert_type: string | null
          doc_type: string | null
          clause_9_2: string | null
          supp_to_init: string | null
          issued_date: string | null
          location: string | null
          confidence: string | null
          source_file: string | null
          verdict: string | null
          reasons: string | null
          rules: Json
          coc_document_id: string | null
          eval_document_id: string | null
          notes: string | null
          match_status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          site_id: string
          subsection_id?: string | null
          import_batch_id?: string | null
          shop_no_raw?: string | null
          cert_no?: string | null
          cert_no_norm?: string | null
          cert_type?: string | null
          doc_type?: string | null
          clause_9_2?: string | null
          supp_to_init?: string | null
          issued_date?: string | null
          location?: string | null
          confidence?: string | null
          source_file?: string | null
          verdict?: string | null
          reasons?: string | null
          rules?: Json
          coc_document_id?: string | null
          eval_document_id?: string | null
          notes?: string | null
          match_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          site_id?: string
          subsection_id?: string | null
          import_batch_id?: string | null
          shop_no_raw?: string | null
          cert_no?: string | null
          cert_no_norm?: string | null
          cert_type?: string | null
          doc_type?: string | null
          clause_9_2?: string | null
          supp_to_init?: string | null
          issued_date?: string | null
          location?: string | null
          confidence?: string | null
          source_file?: string | null
          verdict?: string | null
          reasons?: string | null
          rules?: Json
          coc_document_id?: string | null
          eval_document_id?: string | null
          notes?: string | null
          match_status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coc_certificates_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coc_certificates_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coc_certificates_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "coc_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      access_link_visitors: {
        Row: {
          access_link_id: string | null
          accessed_at: string
          email: string
          first_name: string
          id: string
          ip_address: string | null
          last_name: string
          phone: string
          role: string
          user_agent: string | null
        }
        Insert: {
          access_link_id?: string | null
          accessed_at?: string
          email: string
          first_name: string
          id?: string
          ip_address?: string | null
          last_name: string
          phone: string
          role: string
          user_agent?: string | null
        }
        Update: {
          access_link_id?: string | null
          accessed_at?: string
          email?: string
          first_name?: string
          id?: string
          ip_address?: string | null
          last_name?: string
          phone?: string
          role?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_link_visitors_access_link_id_fkey"
            columns: ["access_link_id"]
            isOneToOne: false
            referencedRelation: "client_access_links"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          details: string | null
          id: string
          user_email: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          id?: string
          user_email: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          id?: string
          user_email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      api_access_tokens: {
        Row: {
          access_token: string
          client_id: string
          created_at: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          refresh_expires_at: string | null
          refresh_token: string | null
          scopes: string[] | null
        }
        Insert: {
          access_token?: string
          client_id: string
          created_at?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          refresh_expires_at?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
        }
        Update: {
          access_token?: string
          client_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          refresh_expires_at?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "api_access_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      api_clients: {
        Row: {
          client_id: string
          client_secret: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          redirect_uris: string[] | null
          scopes: string[] | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string
          client_secret?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          redirect_uris?: string[] | null
          scopes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          client_secret?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          redirect_uris?: string[] | null
          scopes?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      api_request_logs: {
        Row: {
          client_id: string | null
          created_at: string | null
          endpoint: string
          id: string
          ip_address: string | null
          method: string
          request_params: Json | null
          status_code: number | null
          user_agent: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          ip_address?: string | null
          method: string
          request_params?: Json | null
          status_code?: number | null
          user_agent?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          ip_address?: string | null
          method?: string
          request_params?: Json | null
          status_code?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_events: {
        Row: {
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json
          occurred_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          occurred_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          occurred_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          created_at: string | null
          created_by: string | null
          end_date: string | null
          event_type: string | null
          id: string
          priority: string | null
          site_id: string | null
          site_name: string
          start_date: string
          status: string | null
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          event_type?: string | null
          id?: string
          priority?: string | null
          site_id?: string | null
          site_name: string
          start_date: string
          status?: string | null
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          event_type?: string | null
          id?: string
          priority?: string | null
          site_id?: string | null
          site_name?: string
          start_date?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      client_access_links: {
        Row: {
          access_count: number
          access_token: string
          client_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          label: string | null
          last_accessed_at: string | null
          link_type: string
          site_id: string | null
          subsection_id: string | null
        }
        Insert: {
          access_count?: number
          access_token?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          last_accessed_at?: string | null
          link_type?: string
          site_id?: string | null
          subsection_id?: string | null
        }
        Update: {
          access_count?: number
          access_token?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          last_accessed_at?: string | null
          link_type?: string
          site_id?: string | null
          subsection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_access_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_links_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_links_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company_name: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          firebase_id: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          primary_contact_email: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          firebase_id?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          primary_contact_email?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          firebase_id?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          primary_contact_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      compliance_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      compliance_settings_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          key: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          key: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          key?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
        }
        Relationships: []
      }
      contractor_coc_uploads: {
        Row: {
          contractor_email: string | null
          file_name: string | null
          file_url: string
          id: string
          legend_card_id: string | null
          notes: string | null
          project_id: string
          section_name: string
          site_id: string | null
          status: string
          submitted_at: string | null
          subsection_id: string | null
        }
        Insert: {
          contractor_email?: string | null
          file_name?: string | null
          file_url: string
          id?: string
          legend_card_id?: string | null
          notes?: string | null
          project_id: string
          section_name: string
          site_id?: string | null
          status?: string
          submitted_at?: string | null
          subsection_id?: string | null
        }
        Update: {
          contractor_email?: string | null
          file_name?: string | null
          file_url?: string
          id?: string
          legend_card_id?: string | null
          notes?: string | null
          project_id?: string
          section_name?: string
          site_id?: string | null
          status?: string
          submitted_at?: string | null
          subsection_id?: string | null
        }
        Relationships: []
      }
      document_categories: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          order_index: number
          subsection_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          order_index?: number
          subsection_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          order_index?: number
          subsection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_categories_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      file_sync_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          file_name: string
          file_path: string
          id: string
          service: string
          status: string
          sync_type: string
          synced_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          file_name: string
          file_path: string
          id?: string
          service: string
          status?: string
          sync_type: string
          synced_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          file_name?: string
          file_path?: string
          id?: string
          service?: string
          status?: string
          sync_type?: string
          synced_at?: string | null
        }
        Relationships: []
      }
      floor_plan_pin_comments: {
        Row: {
          comment: string
          created_at: string | null
          id: string
          pin_id: string
          updated_at: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          comment: string
          created_at?: string | null
          id?: string
          pin_id: string
          updated_at?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          comment?: string
          created_at?: string | null
          id?: string
          pin_id?: string
          updated_at?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "floor_plan_pin_comments_pin_id_fkey"
            columns: ["pin_id"]
            isOneToOne: false
            referencedRelation: "floor_plan_pins"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_plan_pins: {
        Row: {
          assigned_contractor: string | null
          created_at: string | null
          created_by: string | null
          detailed_description: string | null
          due_date: string | null
          edit_history: Json | null
          floor_plan_id: string
          id: string
          last_modified_at: string | null
          last_modified_by: string | null
          notes: string | null
          package: string | null
          photo_url: string | null
          pin_number: number
          pin_type: string
          priority: string | null
          rectification_notes: string | null
          rectification_photo_url: string | null
          rectified_at: string | null
          rectified_by: string | null
          stakeholders: string | null
          status: string
          title: string | null
          updated_at: string | null
          x_position: number
          y_position: number
        }
        Insert: {
          assigned_contractor?: string | null
          created_at?: string | null
          created_by?: string | null
          detailed_description?: string | null
          due_date?: string | null
          edit_history?: Json | null
          floor_plan_id: string
          id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          notes?: string | null
          package?: string | null
          photo_url?: string | null
          pin_number: number
          pin_type: string
          priority?: string | null
          rectification_notes?: string | null
          rectification_photo_url?: string | null
          rectified_at?: string | null
          rectified_by?: string | null
          stakeholders?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
          x_position: number
          y_position: number
        }
        Update: {
          assigned_contractor?: string | null
          created_at?: string | null
          created_by?: string | null
          detailed_description?: string | null
          due_date?: string | null
          edit_history?: Json | null
          floor_plan_id?: string
          id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          notes?: string | null
          package?: string | null
          photo_url?: string | null
          pin_number?: number
          pin_type?: string
          priority?: string | null
          rectification_notes?: string | null
          rectification_photo_url?: string | null
          rectified_at?: string | null
          rectified_by?: string | null
          stakeholders?: string | null
          status?: string
          title?: string | null
          updated_at?: string | null
          x_position?: number
          y_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "floor_plan_pins_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "subsection_floor_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_items: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          item_name: string
          notes: string | null
          status: string | null
          subsection_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          item_name: string
          notes?: string | null
          status?: string | null
          subsection_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          item_name?: string
          notes?: string | null
          status?: string | null
          subsection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "inspection_subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_relink_audit: {
        Row: {
          attempted_firebase_key: string | null
          attempted_shop_number: string | null
          created_at: string
          id: string
          inspection_id: string
          match_count: number
          resolution: string
          resolved_subsection_id: string | null
          site_id: string | null
        }
        Insert: {
          attempted_firebase_key?: string | null
          attempted_shop_number?: string | null
          created_at?: string
          id?: string
          inspection_id: string
          match_count?: number
          resolution: string
          resolved_subsection_id?: string | null
          site_id?: string | null
        }
        Update: {
          attempted_firebase_key?: string | null
          attempted_shop_number?: string | null
          created_at?: string
          id?: string
          inspection_id?: string
          match_count?: number
          resolution?: string
          resolved_subsection_id?: string | null
          site_id?: string | null
        }
        Relationships: []
      }
      inspection_subsections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          inspection_id: string
          name: string
          order_index: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          inspection_id: string
          name: string
          order_index?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          inspection_id?: string
          name?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "inspection_subsections_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_subsections_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "my_unresolved_orphans"
            referencedColumns: ["inspection_id"]
          },
        ]
      }
      inspection_templates: {
        Row: {
          category: string
          cover_page: Json | null
          created_at: string
          description: string | null
          id: string
          name: string
          pages_count: number | null
          sections: Json | null
          sections_count: number | null
          tenants: Json | null
          updated_at: string
        }
        Insert: {
          category: string
          cover_page?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          pages_count?: number | null
          sections?: Json | null
          sections_count?: number | null
          tenants?: Json | null
          updated_at?: string
        }
        Update: {
          category?: string
          cover_page?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          pages_count?: number | null
          sections?: Json | null
          sections_count?: number | null
          tenants?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      inspections: {
        Row: {
          assigned_to: string[] | null
          client_rep: string | null
          consultant: string | null
          contractor: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          firebase_id: string | null
          id: string
          inspection_date: string | null
          inspector_id: string | null
          inspector_name: string | null
          json_data: Json | null
          location: string | null
          priority: string | null
          project_name: string | null
          qr_code_url: string | null
          quality_rating: number | null
          shop_name: string | null
          shop_number: string | null
          site_id: string
          status: string
          subsection_id: string | null
          template_id: string | null
          testing_party: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string[] | null
          client_rep?: string | null
          consultant?: string | null
          contractor?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          firebase_id?: string | null
          id?: string
          inspection_date?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          json_data?: Json | null
          location?: string | null
          priority?: string | null
          project_name?: string | null
          qr_code_url?: string | null
          quality_rating?: number | null
          shop_name?: string | null
          shop_number?: string | null
          site_id: string
          status?: string
          subsection_id?: string | null
          template_id?: string | null
          testing_party?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string[] | null
          client_rep?: string | null
          consultant?: string | null
          contractor?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          firebase_id?: string | null
          id?: string
          inspection_date?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          json_data?: Json | null
          location?: string | null
          priority?: string | null
          project_name?: string | null
          qr_code_url?: string | null
          quality_rating?: number | null
          shop_name?: string | null
          shop_number?: string | null
          site_id?: string
          status?: string
          subsection_id?: string | null
          template_id?: string | null
          testing_party?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections_snap_20260421: {
        Row: {
          assigned_to: string[] | null
          client_rep: string | null
          consultant: string | null
          contractor: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          firebase_id: string | null
          id: string | null
          inspection_date: string | null
          inspector_id: string | null
          inspector_name: string | null
          json_data: Json | null
          location: string | null
          priority: string | null
          project_name: string | null
          qr_code_url: string | null
          quality_rating: number | null
          shop_name: string | null
          shop_number: string | null
          site_id: string | null
          status: string | null
          subsection_id: string | null
          template_id: string | null
          testing_party: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string[] | null
          client_rep?: string | null
          consultant?: string | null
          contractor?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          firebase_id?: string | null
          id?: string | null
          inspection_date?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          json_data?: Json | null
          location?: string | null
          priority?: string | null
          project_name?: string | null
          qr_code_url?: string | null
          quality_rating?: number | null
          shop_name?: string | null
          shop_number?: string | null
          site_id?: string | null
          status?: string | null
          subsection_id?: string | null
          template_id?: string | null
          testing_party?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string[] | null
          client_rep?: string | null
          consultant?: string | null
          contractor?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          firebase_id?: string | null
          id?: string | null
          inspection_date?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          json_data?: Json | null
          location?: string | null
          priority?: string | null
          project_name?: string | null
          qr_code_url?: string | null
          quality_rating?: number | null
          shop_name?: string | null
          shop_number?: string | null
          site_id?: string | null
          status?: string | null
          subsection_id?: string | null
          template_id?: string | null
          testing_party?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      inspections_snap_20260422_pre_relink: {
        Row: {
          assigned_to: string[] | null
          client_rep: string | null
          consultant: string | null
          contractor: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          firebase_id: string | null
          id: string | null
          inspection_date: string | null
          inspector_id: string | null
          inspector_name: string | null
          json_data: Json | null
          location: string | null
          priority: string | null
          project_name: string | null
          qr_code_url: string | null
          quality_rating: number | null
          shop_name: string | null
          shop_number: string | null
          site_id: string | null
          status: string | null
          subsection_id: string | null
          template_id: string | null
          testing_party: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string[] | null
          client_rep?: string | null
          consultant?: string | null
          contractor?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          firebase_id?: string | null
          id?: string | null
          inspection_date?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          json_data?: Json | null
          location?: string | null
          priority?: string | null
          project_name?: string | null
          qr_code_url?: string | null
          quality_rating?: number | null
          shop_name?: string | null
          shop_number?: string | null
          site_id?: string | null
          status?: string | null
          subsection_id?: string | null
          template_id?: string | null
          testing_party?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string[] | null
          client_rep?: string | null
          consultant?: string | null
          contractor?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          firebase_id?: string | null
          id?: string | null
          inspection_date?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          json_data?: Json | null
          location?: string | null
          priority?: string | null
          project_name?: string | null
          qr_code_url?: string | null
          quality_rating?: number | null
          shop_name?: string | null
          shop_number?: string | null
          site_id?: string | null
          status?: string | null
          subsection_id?: string | null
          template_id?: string | null
          testing_party?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      offline_photos: {
        Row: {
          captured_at: string
          captured_by: string
          context_id: string
          context_type: string
          created_at: string
          file_name: string
          file_size: number
          id: string
          latitude: number | null
          longitude: number | null
          mime_type: string
          notes: string | null
          photo_type: string
          secondary_context_id: string | null
          storage_path: string
        }
        Insert: {
          captured_at?: string
          captured_by: string
          context_id: string
          context_type: string
          created_at?: string
          file_name: string
          file_size: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          mime_type: string
          notes?: string | null
          photo_type: string
          secondary_context_id?: string | null
          storage_path: string
        }
        Update: {
          captured_at?: string
          captured_by?: string
          context_id?: string
          context_type?: string
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          mime_type?: string
          notes?: string | null
          photo_type?: string
          secondary_context_id?: string | null
          storage_path?: string
        }
        Relationships: []
      }
      offline_photos_snap_20260421: {
        Row: {
          captured_at: string | null
          captured_by: string | null
          context_id: string | null
          context_type: string | null
          created_at: string | null
          file_name: string | null
          file_size: number | null
          id: string | null
          latitude: number | null
          longitude: number | null
          mime_type: string | null
          notes: string | null
          photo_type: string | null
          secondary_context_id: string | null
          storage_path: string | null
        }
        Insert: {
          captured_at?: string | null
          captured_by?: string | null
          context_id?: string | null
          context_type?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string | null
          latitude?: number | null
          longitude?: number | null
          mime_type?: string | null
          notes?: string | null
          photo_type?: string | null
          secondary_context_id?: string | null
          storage_path?: string | null
        }
        Update: {
          captured_at?: string | null
          captured_by?: string | null
          context_id?: string | null
          context_type?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string | null
          latitude?: number | null
          longitude?: number | null
          mime_type?: string | null
          notes?: string | null
          photo_type?: string | null
          secondary_context_id?: string | null
          storage_path?: string | null
        }
        Relationships: []
      }
      pdf_report_templates: {
        Row: {
          created_at: string
          created_by: string | null
          customization: Json
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          report_type: string
          sections: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customization?: Json
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          report_type: string
          sections?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customization?: Json
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          report_type?: string
          sections?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pending_user_invites: {
        Row: {
          created_at: string
          email: string
          firebase_id: string | null
          full_name: string | null
          id: string
          invited_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          firebase_id?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          firebase_id?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          company: string | null
          country: string | null
          created_at: string
          department: string | null
          email: string
          full_name: string | null
          id: string
          job_title: string | null
          onboarding_completed: boolean | null
          phone: string | null
          postal_code: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email: string
          full_name?: string | null
          id: string
          job_title?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          postal_code?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          postal_code?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qr_codes: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          qr_code_url: string
          site_id: string | null
          subsection_id: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          qr_code_url: string
          site_id?: string | null
          subsection_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          qr_code_url?: string
          site_id?: string | null
          subsection_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scans: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          scanned_at: string
          scanned_by: string | null
          subsection_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          scanned_at?: string
          scanned_by?: string | null
          subsection_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          scanned_at?: string
          scanned_by?: string | null
          subsection_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_scans_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          inspection_id: string | null
          metadata: Json | null
          report_type: string
          site_id: string | null
          subsection_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          inspection_id?: string | null
          metadata?: Json | null
          report_type: string
          site_id?: string | null
          subsection_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          inspection_id?: string | null
          metadata?: Json | null
          report_type?: string
          site_id?: string | null
          subsection_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "my_unresolved_orphans"
            referencedColumns: ["inspection_id"]
          },
          {
            foreignKeyName: "reports_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      schematic_blocks: {
        Row: {
          block_identifier: string
          block_name: string | null
          created_at: string
          height: number | null
          id: string
          is_auto_matched: boolean | null
          page_number: number
          schematic_id: string
          subsection_id: string | null
          updated_at: string
          width: number | null
          x_position: number
          y_position: number
        }
        Insert: {
          block_identifier: string
          block_name?: string | null
          created_at?: string
          height?: number | null
          id?: string
          is_auto_matched?: boolean | null
          page_number?: number
          schematic_id: string
          subsection_id?: string | null
          updated_at?: string
          width?: number | null
          x_position: number
          y_position: number
        }
        Update: {
          block_identifier?: string
          block_name?: string | null
          created_at?: string
          height?: number | null
          id?: string
          is_auto_matched?: boolean | null
          page_number?: number
          schematic_id?: string
          subsection_id?: string | null
          updated_at?: string
          width?: number | null
          x_position?: number
          y_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "schematic_blocks_schematic_id_fkey"
            columns: ["schematic_id"]
            isOneToOne: false
            referencedRelation: "site_schematics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schematic_blocks_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          auto_logout_enabled: boolean | null
          auto_logout_time: string | null
          company_logo_url: string | null
          company_name: string | null
          created_at: string | null
          id: string
          login_hero_image_url: string | null
          primary_color: string | null
          qr_base_url: string | null
          updated_at: string | null
        }
        Insert: {
          auto_logout_enabled?: boolean | null
          auto_logout_time?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          login_hero_image_url?: string | null
          primary_color?: string | null
          qr_base_url?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_logout_enabled?: boolean | null
          auto_logout_time?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          login_hero_image_url?: string | null
          primary_color?: string | null
          qr_base_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      site_assets: {
        Row: {
          asset_category: Database["public"]["Enums"]["asset_category"]
          breaker_size: string | null
          comments: string | null
          created_at: string
          created_by: string | null
          ct_ratio: string | null
          id: string
          import_batch_id: string | null
          last_meter_read_old: string | null
          mbus_gateway_index: string | null
          meter_serial_number: string | null
          meter_type: string | null
          old_meter_serial_number: string | null
          premises_id: string
          reading_at_commissioning: string | null
          site_id: string
          tag: string | null
          trade_as: string | null
          updated_at: string
        }
        Insert: {
          asset_category?: Database["public"]["Enums"]["asset_category"]
          breaker_size?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          ct_ratio?: string | null
          id?: string
          import_batch_id?: string | null
          last_meter_read_old?: string | null
          mbus_gateway_index?: string | null
          meter_serial_number?: string | null
          meter_type?: string | null
          old_meter_serial_number?: string | null
          premises_id: string
          reading_at_commissioning?: string | null
          site_id: string
          tag?: string | null
          trade_as?: string | null
          updated_at?: string
        }
        Update: {
          asset_category?: Database["public"]["Enums"]["asset_category"]
          breaker_size?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          ct_ratio?: string | null
          id?: string
          import_batch_id?: string | null
          last_meter_read_old?: string | null
          mbus_gateway_index?: string | null
          meter_serial_number?: string | null
          meter_type?: string | null
          old_meter_serial_number?: string | null
          premises_id?: string
          reading_at_commissioning?: string | null
          site_id?: string
          tag?: string | null
          trade_as?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_assets_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_document_categories: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          order_index: number
          site_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          order_index?: number
          site_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          order_index?: number
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_document_categories_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_documents: {
        Row: {
          category: string
          category_id: string | null
          created_at: string
          file_count: number | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          site_id: string
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
        }
        Insert: {
          category: string
          category_id?: string | null
          created_at?: string
          file_count?: number | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          site_id: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          category_id?: string | null
          created_at?: string
          file_count?: number | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          site_id?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "site_document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_marking_checklist: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string | null
          id: string
          is_checked: boolean | null
          item_id: string
          item_name: string
          notes: string | null
          section_name: string
          site_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string | null
          id?: string
          is_checked?: boolean | null
          item_id: string
          item_name: string
          notes?: string | null
          section_name: string
          site_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string | null
          id?: string
          is_checked?: boolean | null
          item_id?: string
          item_name?: string
          notes?: string | null
          section_name?: string
          site_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_marking_checklist_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_schematics: {
        Row: {
          calibrated_height: number | null
          calibrated_width: number | null
          created_at: string
          detected_regions: Json | null
          detection_status: string | null
          file_name: string
          file_url: string
          id: string
          is_calibrated: boolean | null
          regions_detected_at: string | null
          site_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          calibrated_height?: number | null
          calibrated_width?: number | null
          created_at?: string
          detected_regions?: Json | null
          detection_status?: string | null
          file_name: string
          file_url: string
          id?: string
          is_calibrated?: boolean | null
          regions_detected_at?: string | null
          site_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          calibrated_height?: number | null
          calibrated_width?: number | null
          created_at?: string
          detected_regions?: Json | null
          detection_status?: string | null
          file_name?: string
          file_url?: string
          id?: string
          is_calibrated?: boolean | null
          regions_detected_at?: string | null
          site_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_schematics_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          client_id: string
          client_logo_url: string | null
          consultant_company: string | null
          consultant_contact: string | null
          consultant_name: string | null
          created_at: string
          created_by: string | null
          firebase_id: string | null
          id: string
          name: string
          nominated_max_demand: string | null
          site_image_url: string | null
          site_type: string | null
          supply_authority: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_id: string
          client_logo_url?: string | null
          consultant_company?: string | null
          consultant_contact?: string | null
          consultant_name?: string | null
          created_at?: string
          created_by?: string | null
          firebase_id?: string | null
          id?: string
          name: string
          nominated_max_demand?: string | null
          site_image_url?: string | null
          site_type?: string | null
          supply_authority?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_id?: string
          client_logo_url?: string | null
          consultant_company?: string | null
          consultant_contact?: string | null
          consultant_name?: string | null
          created_at?: string
          created_by?: string | null
          firebase_id?: string | null
          id?: string
          name?: string
          nominated_max_demand?: string | null
          site_image_url?: string | null
          site_type?: string | null
          supply_authority?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      snags: {
        Row: {
          assignee: string | null
          attachment_urls: string[] | null
          closeout_photo_url: string | null
          coc_validation_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          estimated_cost: number | null
          id: string
          inspection_id: string | null
          notes: string | null
          photos: Json | null
          project_id: string | null
          rectification_notes: string | null
          rectification_photos: Json | null
          rectified_at: string | null
          rectified_by: string | null
          risk_level: string | null
          sign_off_requested_at: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          snag_type: string
          status: string
          subsection_id: string
          title: string
          trade: string | null
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          attachment_urls?: string[] | null
          closeout_photo_url?: string | null
          coc_validation_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          inspection_id?: string | null
          notes?: string | null
          photos?: Json | null
          project_id?: string | null
          rectification_notes?: string | null
          rectification_photos?: Json | null
          rectified_at?: string | null
          rectified_by?: string | null
          risk_level?: string | null
          sign_off_requested_at?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          snag_type?: string
          status?: string
          subsection_id: string
          title: string
          trade?: string | null
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          attachment_urls?: string[] | null
          closeout_photo_url?: string | null
          coc_validation_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          inspection_id?: string | null
          notes?: string | null
          photos?: Json | null
          project_id?: string | null
          rectification_notes?: string | null
          rectification_photos?: Json | null
          rectified_at?: string | null
          rectified_by?: string | null
          risk_level?: string | null
          sign_off_requested_at?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          snag_type?: string
          status?: string
          subsection_id?: string
          title?: string
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "snags_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snags_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "my_unresolved_orphans"
            referencedColumns: ["inspection_id"]
          },
          {
            foreignKeyName: "snags_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      subsection_documents: {
        Row: {
          category_id: string
          coc_expiry_date: string | null
          coc_issue_date: string | null
          coc_number: string | null
          coc_status: string | null
          coc_type: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          parent_document_id: string | null
          subsection_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category_id: string
          coc_expiry_date?: string | null
          coc_issue_date?: string | null
          coc_number?: string | null
          coc_status?: string | null
          coc_type?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          parent_document_id?: string | null
          subsection_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category_id?: string
          coc_expiry_date?: string | null
          coc_issue_date?: string | null
          coc_number?: string | null
          coc_status?: string | null
          coc_type?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          parent_document_id?: string | null
          subsection_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subsection_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsection_documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "subsection_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsection_documents_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      subsection_floor_plans: {
        Row: {
          created_at: string | null
          file_name: string
          file_url: string
          id: string
          subsection_id: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_url: string
          id?: string
          subsection_id: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_url?: string
          id?: string
          subsection_id?: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subsection_floor_plans_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      subsections: {
        Row: {
          category: string | null
          coc_expiry_date: string | null
          coc_failure_reasons: string | null
          coc_issue_date: string | null
          coc_number: string | null
          coc_reviewed_at: string | null
          coc_reviewed_by: string | null
          coc_status: string | null
          coc_type: string | null
          created_at: string
          ct_ratio: string | null
          deleted_at: string | null
          description: string | null
          firebase_id: string | null
          id: string
          inspection_template_id: string | null
          installation_score: number | null
          installation_status: string | null
          is_coc_required: boolean | null
          is_compliant: boolean | null
          meter_serial_number: string | null
          metering_status: string | null
          name: string
          qr_code_url: string | null
          site_id: string
          tenant_name: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          coc_expiry_date?: string | null
          coc_failure_reasons?: string | null
          coc_issue_date?: string | null
          coc_number?: string | null
          coc_reviewed_at?: string | null
          coc_reviewed_by?: string | null
          coc_status?: string | null
          coc_type?: string | null
          created_at?: string
          ct_ratio?: string | null
          deleted_at?: string | null
          description?: string | null
          firebase_id?: string | null
          id?: string
          inspection_template_id?: string | null
          installation_score?: number | null
          installation_status?: string | null
          is_coc_required?: boolean | null
          is_compliant?: boolean | null
          meter_serial_number?: string | null
          metering_status?: string | null
          name: string
          qr_code_url?: string | null
          site_id: string
          tenant_name?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          coc_expiry_date?: string | null
          coc_failure_reasons?: string | null
          coc_issue_date?: string | null
          coc_number?: string | null
          coc_reviewed_at?: string | null
          coc_reviewed_by?: string | null
          coc_status?: string | null
          coc_type?: string | null
          created_at?: string
          ct_ratio?: string | null
          deleted_at?: string | null
          description?: string | null
          firebase_id?: string | null
          id?: string
          inspection_template_id?: string | null
          installation_score?: number | null
          installation_status?: string | null
          is_coc_required?: boolean | null
          is_compliant?: boolean | null
          meter_serial_number?: string | null
          metering_status?: string | null
          name?: string
          qr_code_url?: string | null
          site_id?: string
          tenant_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subsections_inspection_template_id_fkey"
            columns: ["inspection_template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      subsections_snap_20260421: {
        Row: {
          category: string | null
          coc_issue_date: string | null
          coc_number: string | null
          coc_status: string | null
          coc_type: string | null
          created_at: string | null
          ct_ratio: string | null
          description: string | null
          firebase_id: string | null
          id: string | null
          inspection_template_id: string | null
          is_coc_required: boolean | null
          is_compliant: boolean | null
          meter_serial_number: string | null
          metering_status: string | null
          name: string | null
          qr_code_url: string | null
          site_id: string | null
          tenant_name: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          coc_issue_date?: string | null
          coc_number?: string | null
          coc_status?: string | null
          coc_type?: string | null
          created_at?: string | null
          ct_ratio?: string | null
          description?: string | null
          firebase_id?: string | null
          id?: string | null
          inspection_template_id?: string | null
          is_coc_required?: boolean | null
          is_compliant?: boolean | null
          meter_serial_number?: string | null
          metering_status?: string | null
          name?: string | null
          qr_code_url?: string | null
          site_id?: string | null
          tenant_name?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          coc_issue_date?: string | null
          coc_number?: string | null
          coc_status?: string | null
          coc_type?: string | null
          created_at?: string | null
          ct_ratio?: string | null
          description?: string | null
          firebase_id?: string | null
          id?: string | null
          inspection_template_id?: string | null
          is_coc_required?: boolean | null
          is_compliant?: boolean | null
          meter_serial_number?: string | null
          metering_status?: string | null
          name?: string | null
          qr_code_url?: string | null
          site_id?: string | null
          tenant_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      temp_import: {
        Row: {
          data: Json | null
          id: number
          imported_at: string | null
          imported_by: string | null
        }
        Insert: {
          data?: Json | null
          id?: number
          imported_at?: string | null
          imported_by?: string | null
        }
        Update: {
          data?: Json | null
          id?: number
          imported_at?: string | null
          imported_by?: string | null
        }
        Relationships: []
      }
      user_clients: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_policy_overrides: {
        Row: {
          condition: string | null
          created_at: string | null
          created_by: string | null
          id: string
          operation: string
          permission_type: string
          reason: string | null
          table_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          condition?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          operation: string
          permission_type: string
          reason?: string | null
          table_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          condition?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          operation?: string
          permission_type?: string
          reason?: string | null
          table_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sites: {
        Row: {
          created_at: string | null
          id: string
          site_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          site_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sites_history: {
        Row: {
          action: string
          id: string
          notes: string | null
          performed_at: string
          performed_by: string | null
          site_id: string
          user_id: string
        }
        Insert: {
          action: string
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          site_id: string
          user_id: string
        }
        Update: {
          action?: string
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          site_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_storage_connections: {
        Row: {
          access_token: string | null
          account_email: string | null
          auto_backup_enabled: boolean | null
          connected_at: string | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          provider: string
          refresh_token: string | null
          sync_enabled: boolean | null
          token_expiry: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_email?: string | null
          auto_backup_enabled?: boolean | null
          connected_at?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          refresh_token?: string | null
          sync_enabled?: boolean | null
          token_expiry?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_email?: string | null
          auto_backup_enabled?: boolean | null
          connected_at?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          sync_enabled?: boolean | null
          token_expiry?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      inspection_orphan_summary: {
        Row: {
          buckets: string[] | null
          inspection_id: string | null
          inspection_title: string | null
          ok_count: number | null
          orphan_count: number | null
          orphan_pct: number | null
          subsection_id: string | null
          total_photo_refs: number | null
        }
        Relationships: []
      }
      inspection_photo_refs: {
        Row: {
          bucket: string | null
          exists_in_storage: boolean | null
          inspection_id: string | null
          inspection_title: string | null
          object_path: string | null
          photo_url: string | null
          subsection_id: string | null
        }
        Relationships: []
      }
      my_unresolved_orphans: {
        Row: {
          best_guess: Json | null
          candidate_subsections: Json | null
          created_at: string | null
          inspection_id: string | null
          inspection_status: string | null
          inspection_title: string | null
          shop_name_orphan: string | null
          shop_number_orphan: string | null
          site_id: string | null
          site_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      orphan_photo_refs: {
        Row: {
          bucket: string | null
          exists_in_storage: boolean | null
          inspection_id: string | null
          inspection_title: string | null
          object_path: string | null
          photo_url: string | null
          subsection_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _share_link: {
        Args: { p_token: string }
        Returns: {
          access_count: number
          access_token: string
          client_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          label: string | null
          last_accessed_at: string | null
          link_type: string
          site_id: string | null
          subsection_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "client_access_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_subsection_recompute: {
        Args: { p_subsection_id: string }
        Returns: undefined
      }
      archive_my_orphan: {
        Args: { p_inspection_id: string; p_reason?: string }
        Returns: undefined
      }
      audit_orphan_photo_refs: {
        Args: never
        Returns: {
          bucket: string
          exists_in_storage: boolean
          inspection_id: string
          inspection_title: string
          object_path: string
          photo_url: string
          subsection_id: string
        }[]
      }
      classify_field_status: { Args: { p_raw: Json }; Returns: string }
      cleanup_old_pending_invites: { Args: never; Returns: number }
      contractor_has_site_access: {
        Args: { _site_id: string; _user_id: string }
        Returns: boolean
      }
      debug_site_health_snapshot: {
        Args: { p_site_id: string }
        Returns: {
          inspections_count: number
          name: string
          open_physical: number
          score: number
          status: string
          subsection_id: string
        }[]
      }
      get_compliance_setting_bool: {
        Args: { p_default: boolean; p_key: string }
        Returns: boolean
      }
      get_compliance_setting_numeric: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      get_compliance_settings: {
        Args: never
        Returns: {
          description: string
          key: string
          updated_at: string
          value: Json
        }[]
      }
      get_pending_verifications: {
        Args: { user_uuid: string }
        Returns: {
          description: string
          id: string
          resolved_at: string
          title: string
          type: string
        }[]
      }
      get_public_portfolio: { Args: { p_token: string }; Returns: Json }
      get_public_site_review: {
        Args: { p_site_id: string; p_token: string }
        Returns: Json
      }
      get_public_subsection: {
        Args: { p_subsection_id: string }
        Returns: Json
      }
      get_public_subsection_review: {
        Args: { p_subsection_id: string; p_token: string }
        Returns: Json
      }
      get_rls_policies_for_role: {
        Args: { role_name: string }
        Returns: {
          command: string
          policy_name: string
          table_name: string
          using_expression: string
          with_check_expression: string
        }[]
      }
      get_user_client_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      normalize_shop_key: { Args: { _input: string }; Returns: string }
      prune_orphan_photo_urls: {
        Args: { input: Json; orphans: string[] }
        Returns: Json
      }
      recompute_subsection_installation_status: {
        Args: { p_subsection_id: string }
        Returns: {
          open_physical: number
          passed_items: number
          score: number
          status: string
          total_answered: number
        }[]
      }
      resolve_inspection_subsection: {
        Args: { _json: Json; _site_id: string }
        Returns: {
          firebase_key: string
          match_count: number
          resolved_id: string
          shop_number: string
        }[]
      }
      resolve_my_orphan: {
        Args: { p_inspection_id: string; p_subsection_id: string }
        Returns: undefined
      }
      rollup_subsection_coc_status: {
        Args: { p_subsection_id: string }
        Returns: undefined
      }
      set_compliance_setting: {
        Args: {
          p_changed_by?: string
          p_key: string
          p_reason?: string
          p_value: Json
        }
        Returns: {
          rows_recomputed: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      validate_access_link: {
        Args: { token: string }
        Returns: {
          client_id: string
          is_valid: boolean
          link_id: string
          link_type: string
          site_id: string
          subsection_id: string
        }[]
      }
      validate_api_token: {
        Args: { token: string }
        Returns: {
          client_id: string
          is_valid: boolean
          scopes: string[]
        }[]
      }
      validate_inspection_templates: {
        Args: never
        Returns: {
          issue_description: string
          issue_type: string
          template_id: string
          template_name: string
        }[]
      }
    }
    Enums: {
      app_role: "Admin" | "User" | "Contractor" | "Moderator" | "Client"
      asset_category: "electrical_meter" | "water_meter" | "equipment" | "other"
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
      app_role: ["Admin", "User", "Contractor", "Moderator", "Client"],
      asset_category: ["electrical_meter", "water_meter", "equipment", "other"],
    },
  },
} as const
