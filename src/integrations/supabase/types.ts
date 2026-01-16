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
      calendar_events: {
        Row: {
          created_at: string | null
          end_date: string | null
          event_type: string | null
          id: string
          priority: string | null
          site_name: string
          start_date: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          event_type?: string | null
          id?: string
          priority?: string | null
          site_name: string
          start_date: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          event_type?: string | null
          id?: string
          priority?: string | null
          site_name?: string
          start_date?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
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
      coc_extractions: {
        Row: {
          confidence: string | null
          created_at: string
          document_id: string
          extracted_at: string
          extracted_by: string | null
          extracted_data: Json
          extraction_method: string | null
          extraction_notes: string | null
          id: string
          subsection_id: string
          updated_at: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          document_id: string
          extracted_at?: string
          extracted_by?: string | null
          extracted_data?: Json
          extraction_method?: string | null
          extraction_notes?: string | null
          id?: string
          subsection_id: string
          updated_at?: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          document_id?: string
          extracted_at?: string
          extracted_by?: string | null
          extracted_data?: Json
          extraction_method?: string | null
          extraction_notes?: string | null
          id?: string
          subsection_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coc_extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "subsection_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coc_extractions_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      coc_validation_settings: {
        Row: {
          ai_confidence_threshold_percent: number
          ai_model: string
          ai_temperature: number
          auto_fail_earth_resistance_threshold: boolean
          auto_fail_future_dated: boolean
          auto_fail_invalid_certificate: boolean
          auto_fail_missing_initial_ref: boolean
          auto_fail_missing_signature: boolean
          certificate_date_validation_enabled: boolean
          coc_expiry_commercial_years: number
          coc_expiry_domestic_years: number
          created_at: string
          earth_continuity_check_enabled: boolean
          earth_continuity_max_ohms: number
          hierarchy_check_enabled: boolean
          id: string
          insulation_resistance_check_enabled: boolean
          insulation_resistance_min_mohms: number
          mandatory_failures_for_fail: number
          protective_conductor_check_enabled: boolean
          rcd_function_check_enabled: boolean
          rcd_trip_1x_max_ms: number
          rcd_trip_5x_max_ms: number
          rcd_trip_max_ms: number
          safety_critical_failures_for_fail: number
          signature_check_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_confidence_threshold_percent?: number
          ai_model?: string
          ai_temperature?: number
          auto_fail_earth_resistance_threshold?: boolean
          auto_fail_future_dated?: boolean
          auto_fail_invalid_certificate?: boolean
          auto_fail_missing_initial_ref?: boolean
          auto_fail_missing_signature?: boolean
          certificate_date_validation_enabled?: boolean
          coc_expiry_commercial_years?: number
          coc_expiry_domestic_years?: number
          created_at?: string
          earth_continuity_check_enabled?: boolean
          earth_continuity_max_ohms?: number
          hierarchy_check_enabled?: boolean
          id?: string
          insulation_resistance_check_enabled?: boolean
          insulation_resistance_min_mohms?: number
          mandatory_failures_for_fail?: number
          protective_conductor_check_enabled?: boolean
          rcd_function_check_enabled?: boolean
          rcd_trip_1x_max_ms?: number
          rcd_trip_5x_max_ms?: number
          rcd_trip_max_ms?: number
          safety_critical_failures_for_fail?: number
          signature_check_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_confidence_threshold_percent?: number
          ai_model?: string
          ai_temperature?: number
          auto_fail_earth_resistance_threshold?: boolean
          auto_fail_future_dated?: boolean
          auto_fail_invalid_certificate?: boolean
          auto_fail_missing_initial_ref?: boolean
          auto_fail_missing_signature?: boolean
          certificate_date_validation_enabled?: boolean
          coc_expiry_commercial_years?: number
          coc_expiry_domestic_years?: number
          created_at?: string
          earth_continuity_check_enabled?: boolean
          earth_continuity_max_ohms?: number
          hierarchy_check_enabled?: boolean
          id?: string
          insulation_resistance_check_enabled?: boolean
          insulation_resistance_min_mohms?: number
          mandatory_failures_for_fail?: number
          protective_conductor_check_enabled?: boolean
          rcd_function_check_enabled?: boolean
          rcd_trip_1x_max_ms?: number
          rcd_trip_5x_max_ms?: number
          rcd_trip_max_ms?: number
          safety_critical_failures_for_fail?: number
          signature_check_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      coc_validations: {
        Row: {
          created_at: string
          document_id: string
          id: string
          report_data: Json | null
          status: string
          subsection_id: string
          validated_at: string
          validated_by: string | null
          violations: Json | null
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          report_data?: Json | null
          status: string
          subsection_id: string
          validated_at?: string
          validated_by?: string | null
          violations?: Json | null
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          report_data?: Json | null
          status?: string
          subsection_id?: string
          validated_at?: string
          validated_by?: string | null
          violations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "coc_validations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "subsection_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coc_validations_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      document_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          order_index: number
          subsection_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          subsection_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
      inspection_signatures: {
        Row: {
          created_at: string
          id: string
          inspection_id: string
          ip_address: string | null
          signature_data: string
          signature_url: string | null
          signed_at: string
          signer_email: string | null
          signer_name: string
          signer_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          inspection_id: string
          ip_address?: string | null
          signature_data: string
          signature_url?: string | null
          signed_at?: string
          signer_email?: string | null
          signer_name: string
          signer_type: string
        }
        Update: {
          created_at?: string
          id?: string
          inspection_id?: string
          ip_address?: string | null
          signature_data?: string
          signature_url?: string | null
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
          signer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_signatures_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
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
      issue_reports: {
        Row: {
          admin_notes: string | null
          browser_info: Json | null
          category: string
          created_at: string
          description: string
          fix_confidence_score: number | null
          fix_description: string | null
          fix_test_result: Json | null
          fix_test_run_at: string | null
          id: string
          needs_user_verification: boolean | null
          page_url: string
          rejection_reason: string | null
          rejection_screenshot_url: string | null
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          screenshot_url: string | null
          severity: string
          status: string
          updated_at: string
          user_email: string
          user_name: string | null
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          admin_notes?: string | null
          browser_info?: Json | null
          category?: string
          created_at?: string
          description: string
          fix_confidence_score?: number | null
          fix_description?: string | null
          fix_test_result?: Json | null
          fix_test_run_at?: string | null
          id?: string
          needs_user_verification?: boolean | null
          page_url: string
          rejection_reason?: string | null
          rejection_screenshot_url?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_url?: string | null
          severity?: string
          status?: string
          updated_at?: string
          user_email: string
          user_name?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          admin_notes?: string | null
          browser_info?: Json | null
          category?: string
          created_at?: string
          description?: string
          fix_confidence_score?: number | null
          fix_description?: string | null
          fix_test_result?: Json | null
          fix_test_run_at?: string | null
          id?: string
          needs_user_verification?: boolean | null
          page_url?: string
          rejection_reason?: string | null
          rejection_screenshot_url?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_url?: string | null
          severity?: string
          status?: string
          updated_at?: string
          user_email?: string
          user_name?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          issue_report_id: string | null
          message: string
          read: boolean | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          issue_report_id?: string | null
          message: string
          read?: boolean | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          issue_report_id?: string | null
          message?: string
          read?: boolean | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_issue_report_id_fkey"
            columns: ["issue_report_id"]
            isOneToOne: false
            referencedRelation: "issue_reports"
            referencedColumns: ["id"]
          },
        ]
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
      settings: {
        Row: {
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
          name: string
          order_index: number
          site_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          site_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
          file_url: string
          id: string
          site_id: string
          updated_at: string
        }
        Insert: {
          category: string
          category_id?: string | null
          created_at?: string
          file_count?: number | null
          file_name: string
          file_url: string
          id?: string
          site_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          category_id?: string | null
          created_at?: string
          file_count?: number | null
          file_name?: string
          file_url?: string
          id?: string
          site_id?: string
          updated_at?: string
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
          created_at: string
          created_by: string | null
          description: string | null
          estimated_cost: number | null
          id: string
          inspection_id: string | null
          notes: string | null
          photos: Json | null
          rectification_notes: string | null
          rectification_photos: Json | null
          rectified_at: string | null
          rectified_by: string | null
          risk_level: string | null
          status: string
          subsection_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          inspection_id?: string | null
          notes?: string | null
          photos?: Json | null
          rectification_notes?: string | null
          rectification_photos?: Json | null
          rectified_at?: string | null
          rectified_by?: string | null
          risk_level?: string | null
          status?: string
          subsection_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          inspection_id?: string | null
          notes?: string | null
          photos?: Json | null
          rectification_notes?: string | null
          rectification_photos?: Json | null
          rectified_at?: string | null
          rectified_by?: string | null
          risk_level?: string | null
          status?: string
          subsection_id?: string
          title?: string
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
          coc_issue_date: string | null
          coc_number: string | null
          coc_status: string | null
          coc_type: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          subsection_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category_id: string
          coc_issue_date?: string | null
          coc_number?: string | null
          coc_status?: string | null
          coc_type?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          subsection_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category_id?: string
          coc_issue_date?: string | null
          coc_number?: string | null
          coc_status?: string | null
          coc_type?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
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
          coc_issue_date: string | null
          coc_number: string | null
          coc_status: string | null
          coc_type: string | null
          created_at: string
          ct_ratio: string | null
          description: string | null
          firebase_id: string | null
          id: string
          inspection_template_id: string | null
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
          coc_issue_date?: string | null
          coc_number?: string | null
          coc_status?: string | null
          coc_type?: string | null
          created_at?: string
          ct_ratio?: string | null
          description?: string | null
          firebase_id?: string | null
          id?: string
          inspection_template_id?: string | null
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
          coc_issue_date?: string | null
          coc_number?: string | null
          coc_status?: string | null
          coc_type?: string | null
          created_at?: string
          ct_ratio?: string | null
          description?: string | null
          firebase_id?: string | null
          id?: string
          inspection_template_id?: string | null
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
      suggestions: {
        Row: {
          admin_notes: string | null
          browser_info: Json | null
          category: string
          created_at: string
          description: string
          fix_confidence_score: number | null
          fix_description: string | null
          fix_test_result: Json | null
          fix_test_run_at: string | null
          id: string
          needs_user_verification: boolean | null
          page_url: string
          priority: string
          rejection_reason: string | null
          rejection_screenshot_url: string | null
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          screenshot_url: string | null
          status: string
          title: string
          updated_at: string
          user_email: string
          user_name: string | null
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          admin_notes?: string | null
          browser_info?: Json | null
          category?: string
          created_at?: string
          description: string
          fix_confidence_score?: number | null
          fix_description?: string | null
          fix_test_result?: Json | null
          fix_test_run_at?: string | null
          id?: string
          needs_user_verification?: boolean | null
          page_url: string
          priority?: string
          rejection_reason?: string | null
          rejection_screenshot_url?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_url?: string | null
          status?: string
          title: string
          updated_at?: string
          user_email: string
          user_name?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          admin_notes?: string | null
          browser_info?: Json | null
          category?: string
          created_at?: string
          description?: string
          fix_confidence_score?: number | null
          fix_description?: string | null
          fix_test_result?: Json | null
          fix_test_run_at?: string | null
          id?: string
          needs_user_verification?: boolean | null
          page_url?: string
          priority?: string
          rejection_reason?: string | null
          rejection_screenshot_url?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_url?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_email?: string
          user_name?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
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
      validation_conversations: {
        Row: {
          created_at: string | null
          created_by: string | null
          document_id: string
          id: string
          status: string | null
          subsection_id: string
          title: string | null
          updated_at: string | null
          validation_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          document_id: string
          id?: string
          status?: string | null
          subsection_id: string
          title?: string | null
          updated_at?: string | null
          validation_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          document_id?: string
          id?: string
          status?: string | null
          subsection_id?: string
          title?: string | null
          updated_at?: string | null
          validation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_conversations_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "subsections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_conversations_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "coc_validations"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_feedback: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          description: string
          feedback_type: string
          id: string
          implementation_notes: string | null
          original_finding: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          suggested_improvement: string | null
          title: string
          validation_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          feedback_type: string
          id?: string
          implementation_notes?: string | null
          original_finding?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          suggested_improvement?: string | null
          title: string
          validation_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          feedback_type?: string
          id?: string
          implementation_notes?: string | null
          original_finding?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          suggested_improvement?: string | null
          title?: string
          validation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "validation_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "validation_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_feedback_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "coc_validations"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          created_by: string | null
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "validation_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_pending_invites: { Args: never; Returns: number }
      contractor_has_site_access: {
        Args: { _site_id: string; _user_id: string }
        Returns: boolean
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
