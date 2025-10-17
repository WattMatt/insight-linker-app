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
          google_drive_connected: boolean | null
          id: string
          login_hero_image_url: string | null
          primary_color: string | null
          updated_at: string | null
        }
        Insert: {
          company_logo_url?: string | null
          company_name?: string | null
          created_at?: string | null
          google_drive_connected?: boolean | null
          id?: string
          login_hero_image_url?: string | null
          primary_color?: string | null
          updated_at?: string | null
        }
        Update: {
          company_logo_url?: string | null
          company_name?: string | null
          created_at?: string | null
          google_drive_connected?: boolean | null
          id?: string
          login_hero_image_url?: string | null
          primary_color?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      get_user_client_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "Admin" | "User" | "Contractor" | "Moderator" | "Client"
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
    },
  },
} as const
