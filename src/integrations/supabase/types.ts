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
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          id?: string
          user_email: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          id?: string
          user_email?: string
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
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          primary_contact_email?: string | null
          updated_at?: string
        }
        Relationships: []
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
      inspections: {
        Row: {
          assigned_to: string[] | null
          client_rep: string | null
          consultant: string | null
          contractor: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          inspection_date: string | null
          inspector_id: string | null
          inspector_name: string | null
          location: string | null
          priority: string | null
          project_name: string | null
          qr_code_url: string | null
          shop_name: string | null
          shop_number: string | null
          site_id: string
          status: string
          subsection_id: string | null
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
          id?: string
          inspection_date?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          location?: string | null
          priority?: string | null
          project_name?: string | null
          qr_code_url?: string | null
          shop_name?: string | null
          shop_number?: string | null
          site_id: string
          status?: string
          subsection_id?: string | null
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
          id?: string
          inspection_date?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          location?: string | null
          priority?: string | null
          project_name?: string | null
          qr_code_url?: string | null
          shop_name?: string | null
          shop_number?: string | null
          site_id?: string
          status?: string
          subsection_id?: string | null
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
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
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
      subsections: {
        Row: {
          category: string | null
          coc_status: string | null
          created_at: string
          description: string | null
          id: string
          is_coc_required: boolean | null
          is_compliant: boolean | null
          metering_status: string | null
          name: string
          site_id: string
          tenant_name: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          coc_status?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_coc_required?: boolean | null
          is_compliant?: boolean | null
          metering_status?: string | null
          name: string
          site_id: string
          tenant_name?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          coc_status?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_coc_required?: boolean | null
          is_compliant?: boolean | null
          metering_status?: string | null
          name?: string
          site_id?: string
          tenant_name?: string | null
          updated_at?: string
        }
        Relationships: [
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
        }
        Insert: {
          data?: Json | null
          id?: number
          imported_at?: string | null
        }
        Update: {
          data?: Json | null
          id?: number
          imported_at?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "Admin" | "User" | "Contractor"
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
      app_role: ["Admin", "User", "Contractor"],
    },
  },
} as const
