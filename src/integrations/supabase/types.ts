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
      admin_notification_prefs: {
        Row: {
          enabled: boolean
          event_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          event_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          event_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      mission_day_notes: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          influencers: string
          updated_at: string
          week_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          influencers?: string
          updated_at?: string
          week_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          influencers?: string
          updated_at?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_day_notes_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "mission_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_weeks: {
        Row: {
          approver_signature_name: string | null
          approver_signed_at: string | null
          approver_user_id: string | null
          author_signature_name: string | null
          author_signed_at: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          locked: boolean
          notes: string | null
          owner_user_id: string
          updated_at: string
          week: number
          year: number
        }
        Insert: {
          approver_signature_name?: string | null
          approver_signed_at?: string | null
          approver_user_id?: string | null
          author_signature_name?: string | null
          author_signed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          locked?: boolean
          notes?: string | null
          owner_user_id: string
          updated_at?: string
          week: number
          year: number
        }
        Update: {
          approver_signature_name?: string | null
          approver_signed_at?: string | null
          approver_user_id?: string | null
          author_signature_name?: string | null
          author_signed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          locked?: boolean
          notes?: string | null
          owner_user_id?: string
          updated_at?: string
          week?: number
          year?: number
        }
        Relationships: []
      }
      missions: {
        Row: {
          carried_from_id: string | null
          created_at: string
          day_of_week: number
          details: string | null
          done: boolean
          due_time: string | null
          id: string
          position: number
          reminder_at: string | null
          reminder_sent_at: string | null
          title: string
          updated_at: string
          week_id: string
        }
        Insert: {
          carried_from_id?: string | null
          created_at?: string
          day_of_week: number
          details?: string | null
          done?: boolean
          due_time?: string | null
          id?: string
          position?: number
          reminder_at?: string | null
          reminder_sent_at?: string | null
          title: string
          updated_at?: string
          week_id: string
        }
        Update: {
          carried_from_id?: string | null
          created_at?: string
          day_of_week?: number
          details?: string | null
          done?: boolean
          due_time?: string | null
          id?: string
          position?: number
          reminder_at?: string | null
          reminder_sent_at?: string | null
          title?: string
          updated_at?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_carried_from_id_fkey"
            columns: ["carried_from_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "mission_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          name: string
          order_id: string
          price: number
          product_id: string | null
          quantity: number
        }
        Insert: {
          id?: string
          name: string
          order_id: string
          price: number
          product_id?: string | null
          quantity: number
        }
        Update: {
          id?: string
          name?: string
          order_id?: string
          price?: number
          product_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_notes: string | null
          contact_phone: string | null
          created_at: string
          id: string
          notes: string | null
          ordered_by_name: string | null
          status: Database["public"]["Enums"]["order_status"]
          team_id: string
          total: number
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          ordered_by_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          team_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          ordered_by_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          team_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          low_stock_threshold: number | null
          name: string
          price: number
          stock: number
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number | null
          name: string
          price?: number
          stock?: number
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number | null
          name?: string
          price?: number
          stock?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_approver: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_approver?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_approver?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          team_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          team_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      replacement_products: {
        Row: {
          active: boolean
          balai_stock: number
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          takin_stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          balai_stock?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          takin_stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          balai_stock?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          takin_stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      replacement_request_items: {
        Row: {
          id: string
          name: string
          quantity: number
          replacement_product_id: string | null
          request_id: string
        }
        Insert: {
          id?: string
          name: string
          quantity: number
          replacement_product_id?: string | null
          request_id: string
        }
        Update: {
          id?: string
          name?: string
          quantity?: number
          replacement_product_id?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replacement_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "replacement_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      replacement_requests: {
        Row: {
          contact_phone: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          notes: string | null
          ordered_by_name: string | null
          status: Database["public"]["Enums"]["replacement_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          contact_phone?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          notes?: string | null
          ordered_by_name?: string | null
          status?: Database["public"]["Enums"]["replacement_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          contact_phone?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          notes?: string | null
          ordered_by_name?: string | null
          status?: Database["public"]["Enums"]["replacement_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "replacement_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_budget_alerts: {
        Row: {
          created_at: string
          id: string
          month: string
          team_id: string
          threshold: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          team_id: string
          threshold: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          team_id?: string
          threshold?: number
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          active: boolean
          contact_phone: string | null
          created_at: string
          id: string
          is_admin_only: boolean
          monthly_limit: number
          name: string
          pin: string
        }
        Insert: {
          active?: boolean
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_admin_only?: boolean
          monthly_limit?: number
          name: string
          pin: string
        }
        Update: {
          active?: boolean
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_admin_only?: boolean
          monthly_limit?: number
          name?: string
          pin?: string
        }
        Relationships: []
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
      is_approver: { Args: { _user_id: string }; Returns: boolean }
      team_month_spent: { Args: { _team_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "staff"
      order_status:
        | "pending"
        | "approved"
        | "preparing"
        | "ready"
        | "completed"
        | "cancelled"
        | "awaiting_approval"
      replacement_status: "preparing" | "ready" | "done" | "cancelled"
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
      app_role: ["admin", "staff"],
      order_status: [
        "pending",
        "approved",
        "preparing",
        "ready",
        "completed",
        "cancelled",
        "awaiting_approval",
      ],
      replacement_status: ["preparing", "ready", "done", "cancelled"],
    },
  },
} as const
