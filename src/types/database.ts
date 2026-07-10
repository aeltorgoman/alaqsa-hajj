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
      buses: {
        Row: {
          capacity: number | null
          created_at: string | null
          id: number
          name: string | null
          season_id: number | null
          type: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string | null
          id?: never
          name?: string | null
          season_id?: number | null
          type?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string | null
          id?: never
          name?: string | null
          season_id?: number | null
          type?: string | null
        }
        Relationships: []
      }
      camps: {
        Row: {
          created_at: string | null
          gender: string | null
          id: number
          name: string | null
          page_type: string | null
          season_id: number | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          gender?: string | null
          id?: never
          name?: string | null
          page_type?: string | null
          season_id?: number | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          gender?: string | null
          id?: never
          name?: string | null
          page_type?: string | null
          season_id?: number | null
          type?: string | null
        }
        Relationships: []
      }
      company_config: {
        Row: {
          banner_image_url: string | null
          banner_position: string | null
          banner_position_x: string | null
          color_accent: string | null
          color_primary: string | null
          color_sidebar: string | null
          contact_email: string | null
          contact_phone: string | null
          features: Json | null
          id: number
          logo_url: string | null
          name_ar: string
          name_en: string | null
          season_label: string | null
          tagline: string | null
        }
        Insert: {
          banner_image_url?: string | null
          banner_position?: string | null
          banner_position_x?: string | null
          color_accent?: string | null
          color_primary?: string | null
          color_sidebar?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          features?: Json | null
          id?: number
          logo_url?: string | null
          name_ar?: string
          name_en?: string | null
          season_label?: string | null
          tagline?: string | null
        }
        Update: {
          banner_image_url?: string | null
          banner_position?: string | null
          banner_position_x?: string | null
          color_accent?: string | null
          color_primary?: string | null
          color_sidebar?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          features?: Json | null
          id?: number
          logo_url?: string | null
          name_ar?: string
          name_en?: string | null
          season_label?: string | null
          tagline?: string | null
        }
        Relationships: []
      }
      custom_charges: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          description: string
          id: number
          notes: string | null
          passenger_id: number
          type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: number
          notes?: string | null
          passenger_id: number
          type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: number
          notes?: string | null
          passenger_id?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_charges_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "passengers"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_group_members: {
        Row: {
          group_id: number
          id: number
          passenger_id: number
        }
        Insert: {
          group_id: number
          id?: number
          passenger_id: number
        }
        Update: {
          group_id?: number
          id?: number
          passenger_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "financial_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_group_members_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "passengers"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_groups: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: number
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: number
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: number
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      flights: {
        Row: {
          airline: string | null
          arrival_date: string | null
          arrival_time: string | null
          created_at: string | null
          date: string | null
          from_airport: string | null
          id: number
          name: string | null
          time: string | null
          to_airport: string | null
          type: string | null
        }
        Insert: {
          airline?: string | null
          arrival_date?: string | null
          arrival_time?: string | null
          created_at?: string | null
          date?: string | null
          from_airport?: string | null
          id?: never
          name?: string | null
          time?: string | null
          to_airport?: string | null
          type?: string | null
        }
        Update: {
          airline?: string | null
          arrival_date?: string | null
          arrival_time?: string | null
          created_at?: string | null
          date?: string | null
          from_airport?: string | null
          id?: never
          name?: string | null
          time?: string | null
          to_airport?: string | null
          type?: string | null
        }
        Relationships: []
      }
      passengers: {
        Row: {
          bus: string | null
          bus_id: number | null
          camp_arafa: string | null
          camp_arafa_id: number | null
          camp_mina: string | null
          camp_mina_id: number | null
          contract_url: string | null
          created_at: string
          created_by: string | null
          custom_price: number | null
          dob: string | null
          expiry: string | null
          family_id: string | null
          flight: string | null
          flight_class: string | null
          flight_id: number | null
          flight_ticket_url: string | null
          gender: string | null
          hajj_permit_url: string | null
          hotel_type: string | null
          hotel_view: string | null
          id: number
          id_expiry: string | null
          name_ar: string | null
          name_en: string | null
          nat: string | null
          national_id: string | null
          national_id_url: string | null
          passenger_type: string | null
          passport: string | null
          passport_url: string | null
          phone: string | null
          photo_url: string | null
          return_flight_id: number | null
          room_id: number | null
          season_id: number | null
          short_ar: string | null
          short_en: string | null
          sort_order: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          bus?: string | null
          bus_id?: number | null
          camp_arafa?: string | null
          camp_arafa_id?: number | null
          camp_mina?: string | null
          camp_mina_id?: number | null
          contract_url?: string | null
          created_at?: string
          created_by?: string | null
          custom_price?: number | null
          dob?: string | null
          expiry?: string | null
          family_id?: string | null
          flight?: string | null
          flight_class?: string | null
          flight_id?: number | null
          flight_ticket_url?: string | null
          gender?: string | null
          hajj_permit_url?: string | null
          hotel_type?: string | null
          hotel_view?: string | null
          id?: number
          id_expiry?: string | null
          name_ar?: string | null
          name_en?: string | null
          nat?: string | null
          national_id?: string | null
          national_id_url?: string | null
          passenger_type?: string | null
          passport?: string | null
          passport_url?: string | null
          phone?: string | null
          photo_url?: string | null
          return_flight_id?: number | null
          room_id?: number | null
          season_id?: number | null
          short_ar?: string | null
          short_en?: string | null
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          bus?: string | null
          bus_id?: number | null
          camp_arafa?: string | null
          camp_arafa_id?: number | null
          camp_mina?: string | null
          camp_mina_id?: number | null
          contract_url?: string | null
          created_at?: string
          created_by?: string | null
          custom_price?: number | null
          dob?: string | null
          expiry?: string | null
          family_id?: string | null
          flight?: string | null
          flight_class?: string | null
          flight_id?: number | null
          flight_ticket_url?: string | null
          gender?: string | null
          hajj_permit_url?: string | null
          hotel_type?: string | null
          hotel_view?: string | null
          id?: number
          id_expiry?: string | null
          name_ar?: string | null
          name_en?: string | null
          nat?: string | null
          national_id?: string | null
          national_id_url?: string | null
          passenger_type?: string | null
          passport?: string | null
          passport_url?: string | null
          phone?: string | null
          photo_url?: string | null
          return_flight_id?: number | null
          room_id?: number | null
          season_id?: number | null
          short_ar?: string | null
          short_en?: string | null
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          id: number
          method: string
          notes: string | null
          passenger_id: number
          payment_date: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: number
          method?: string
          notes?: string | null
          passenger_id: number
          payment_date?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: number
          method?: string
          notes?: string | null
          passenger_id?: number
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "passengers"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_settings: {
        Row: {
          amount: number
          id: number
          key: string
          label: string
          type: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          id?: number
          key: string
          label: string
          type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          id?: number
          key?: string
          label?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rooms: {
        Row: {
          created_at: string | null
          floor: string | null
          id: number
          notes: string | null
          number: string | null
          season_id: number | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          floor?: string | null
          id?: never
          notes?: string | null
          number?: string | null
          season_id?: number | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          floor?: string | null
          id?: never
          notes?: string | null
          number?: string | null
          season_id?: number | null
          type?: string | null
        }
        Relationships: []
      }
      seasons: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          id: number
          name: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          id?: never
          name: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          id?: never
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          id: number
          is_active: boolean | null
          name: string
          password: string
          permissions: Json | null
          username: string
        }
        Insert: {
          created_at?: string | null
          id?: never
          is_active?: boolean | null
          name: string
          password: string
          permissions?: Json | null
          username: string
        }
        Update: {
          created_at?: string | null
          id?: never
          is_active?: boolean | null
          name?: string
          password?: string
          permissions?: Json | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_user: {
        Args: {
          p_name: string
          p_password: string
          p_permissions: Json
          p_username: string
        }
        Returns: undefined
      }
      update_user: {
        Args: {
          p_id: number
          p_name: string
          p_password: string
          p_permissions: Json
          p_username: string
        }
        Returns: undefined
      }
      verify_user: {
        Args: { p_password: string; p_username: string }
        Returns: {
          id: number
          name: string
          password: string
          permissions: Json
          username: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
