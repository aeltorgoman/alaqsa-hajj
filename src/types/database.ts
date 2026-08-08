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
      announcements: {
        Row: {
          body: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: number
          priority: string
          push_sent_at: string | null
          show_at: string
          target_ids: number[]
          target_type: string
          title: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: never
          priority?: string
          push_sent_at?: string | null
          show_at?: string
          target_ids?: number[]
          target_type?: string
          title?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: never
          priority?: string
          push_sent_at?: string | null
          show_at?: string
          target_ids?: number[]
          target_type?: string
          title?: string | null
        }
        Relationships: []
      }
      buses: {
        Row: {
          capacity: number | null
          created_at: string | null
          id: number
          name: string | null
          season_id: number
          type: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string | null
          id?: never
          name?: string | null
          season_id?: number
          type?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string | null
          id?: never
          name?: string | null
          season_id?: number
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buses_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      camps: {
        Row: {
          created_at: string | null
          gender: string | null
          id: number
          name: string | null
          page_type: string | null
          season_id: number
          type: string | null
        }
        Insert: {
          created_at?: string | null
          gender?: string | null
          id?: never
          name?: string | null
          page_type?: string | null
          season_id?: number
          type?: string | null
        }
        Update: {
          created_at?: string | null
          gender?: string | null
          id?: never
          name?: string | null
          page_type?: string | null
          season_id?: number
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "camps_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      company_assets: {
        Row: { alt_text: string | null; asset_key: string; asset_url: string; metadata: Json; updated_at: string | null }
        Insert: { alt_text?: string | null; asset_key: string; asset_url: string; metadata?: Json; updated_at?: string | null }
        Update: { alt_text?: string | null; asset_key?: string; asset_url?: string; metadata?: Json; updated_at?: string | null }
        Relationships: []
      }
      company_config: {
        Row: {
          admin_name: string | null
          admin_phone: string | null
          admin_whatsapp: string | null
          banner_image_url: string | null
          banner_position: string | null
          banner_position_x: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_iban: string | null
          bank_name: string | null
          bank_swift: string | null
          camp_arafa_address: string | null
          camp_arafa_url: string | null
          camp_mina_address: string | null
          camp_mina_url: string | null
          city: string | null
          color_accent: string | null
          color_primary: string | null
          color_sidebar: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          features: Json | null
          hotel_address: string | null
          hotel_name: string | null
          hotel_url: string | null
          id: number
          logo_url: string | null
          name_ar: string
          name_en: string | null
          portal_help_message: string | null
          portal_settings: Json
          portal_welcome_message: string | null
          season_label: string | null
          tagline: string | null
        }
        Insert: {
          admin_name?: string | null
          admin_phone?: string | null
          admin_whatsapp?: string | null
          banner_image_url?: string | null
          banner_position?: string | null
          banner_position_x?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_swift?: string | null
          camp_arafa_address?: string | null
          camp_arafa_url?: string | null
          camp_mina_address?: string | null
          camp_mina_url?: string | null
          city?: string | null
          color_accent?: string | null
          color_primary?: string | null
          color_sidebar?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          features?: Json | null
          hotel_address?: string | null
          hotel_name?: string | null
          hotel_url?: string | null
          id?: number
          logo_url?: string | null
          name_ar?: string
          name_en?: string | null
          portal_help_message?: string | null
          portal_settings?: Json
          portal_welcome_message?: string | null
          season_label?: string | null
          tagline?: string | null
        }
        Update: {
          admin_name?: string | null
          admin_phone?: string | null
          admin_whatsapp?: string | null
          banner_image_url?: string | null
          banner_position?: string | null
          banner_position_x?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_swift?: string | null
          camp_arafa_address?: string | null
          camp_arafa_url?: string | null
          camp_mina_address?: string | null
          camp_mina_url?: string | null
          city?: string | null
          color_accent?: string | null
          color_primary?: string | null
          color_sidebar?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          features?: Json | null
          hotel_address?: string | null
          hotel_name?: string | null
          hotel_url?: string | null
          id?: number
          logo_url?: string | null
          name_ar?: string
          name_en?: string | null
          portal_help_message?: string | null
          portal_settings?: Json
          portal_welcome_message?: string | null
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
            isOneToOne: true
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
      notification_deliveries: {
        Row: {
          announcement_id: number
          error: string | null
          id: number
          passenger_id: number
          read_at: string | null
          sent_at: string
          status: string
        }
        Insert: {
          announcement_id: number
          error?: string | null
          id?: number
          passenger_id: number
          read_at?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          announcement_id?: number
          error?: string | null
          id?: number
          passenger_id?: number
          read_at?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "passengers"
            referencedColumns: ["id"]
          },
        ]
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
          season_id: number
          short_ar: string | null
          short_en: string | null
          sort_order: number | null
          updated_at: string | null
          updated_by: string | null
          wants_flight: boolean | null
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
          season_id?: number
          short_ar?: string | null
          short_en?: string | null
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
          wants_flight?: boolean | null
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
          season_id?: number
          short_ar?: string | null
          short_en?: string | null
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
          wants_flight?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "passengers_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
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
      pilgrim_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: number
          last_seen_at: string
          p256dh: string
          passenger_id: number
          platform: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: number
          last_seen_at?: string
          p256dh: string
          passenger_id: number
          platform?: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: number
          last_seen_at?: string
          p256dh?: string
          passenger_id?: number
          platform?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilgrim_push_subscriptions_passenger_id_fkey"
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
          season_id: number
          type: string | null
        }
        Insert: {
          created_at?: string | null
          floor?: string | null
          id?: never
          notes?: string | null
          number?: string | null
          season_id?: number
          type?: string | null
        }
        Update: {
          created_at?: string | null
          floor?: string | null
          id?: never
          notes?: string | null
          number?: string | null
          season_id?: number
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
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
      user_profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          name: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          permissions?: Json
          updated_at?: string
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
      company_profile_public: {
        Row: {
          admin_name: string | null
          admin_phone: string | null
          admin_whatsapp: string | null
          banner_image_url: string | null
          banner_position: string | null
          banner_position_x: string | null
          camp_arafa_address: string | null
          camp_arafa_url: string | null
          camp_mina_address: string | null
          camp_mina_url: string | null
          city: string | null
          color_accent: string | null
          color_primary: string | null
          color_sidebar: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          features: Json | null
          hotel_address: string | null
          hotel_name: string | null
          hotel_url: string | null
          id: number | null
          logo_url: string | null
          name_ar: string | null
          name_en: string | null
          portal_help_message: string | null
          portal_settings: Json | null
          portal_welcome_message: string | null
          season_label: string | null
          tagline: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      active_season_id: { Args: never; Returns: number }
      announcement_audience: {
        Args: { p_target_ids: number[]; p_target_type: string }
        Returns: {
          passenger_id: number
        }[]
      }
      close_season: {
        Args: { p_closed_by: string; p_new_name: string }
        Returns: number
      }
      create_financial_group_with_member: {
        Args: {
          p_created_by: string
          p_name: string
          p_notes: string
          p_passenger_id: number
        }
        Returns: Json
      }
      create_user: {
        Args: {
          p_name: string
          p_password: string
          p_permissions: Json
          p_username: string
        }
        Returns: undefined
      }
      delete_season: { Args: { p_season_id: number }; Returns: undefined }
      get_pilgrim_portal: {
        Args: { p_day: number; p_doc: string; p_month: number; p_year: number }
        Returns: Json
      }
      get_portal_announcements: { Args: never; Returns: Json }
      has_permission: { Args: { p_key: string }; Returns: boolean }
      mark_pilgrim_notification_read: {
        Args: {
          p_announcement_id: number
          p_day: number
          p_doc: string
          p_month: number
          p_year: number
        }
        Returns: boolean
      }
      push_enabled_passengers: {
        Args: never
        Returns: {
          devices: number
          passenger_id: number
        }[]
      }
      register_pilgrim_push: {
        Args: {
          p_auth: string
          p_day: number
          p_doc: string
          p_endpoint: string
          p_month: number
          p_p256dh: string
          p_platform?: string
          p_user_agent?: string
          p_year: number
        }
        Returns: boolean
      }
      resolve_pilgrim_id: {
        Args: { p_day: number; p_doc: string; p_month: number; p_year: number }
        Returns: number
      }
      unregister_pilgrim_push: {
        Args: { p_endpoint: string }
        Returns: boolean
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
