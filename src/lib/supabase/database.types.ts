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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          event_id: string | null
          id: string
          order_id: string | null
          organization_id: string | null
          photo_id: string | null
          reason: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_id?: string | null
          id?: string
          order_id?: string | null
          organization_id?: string | null
          photo_id?: string | null
          reason: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_id?: string | null
          id?: string
          order_id?: string | null
          organization_id?: string | null
          photo_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          code: string
          created_at: string
          events_per_month: number | null
          from_package: string | null
          is_active: boolean
          item_type: string
          name: string
          package: string | null
          photo_quota: number | null
          price_idr: number
          retention_months: number | null
          token_count: number | null
        }
        Insert: {
          code: string
          created_at?: string
          events_per_month?: number | null
          from_package?: string | null
          is_active?: boolean
          item_type: string
          name: string
          package?: string | null
          photo_quota?: number | null
          price_idr: number
          retention_months?: number | null
          token_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          events_per_month?: number | null
          from_package?: string | null
          is_active?: boolean
          item_type?: string
          name?: string
          package?: string | null
          photo_quota?: number | null
          price_idr?: number
          retention_months?: number | null
          token_count?: number | null
        }
        Relationships: []
      }
      cohost_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          event_id: string
          expires_at: string
          id: string
          label: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          event_id: string
          expires_at?: string
          id?: string
          label?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string
          expires_at?: string
          id?: string
          label?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohost_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohost_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohost_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          actor_id: string | null
          created_at: string
          delta: number
          event_id: string | null
          expires_at: string | null
          id: string
          note: string | null
          order_id: string | null
          organization_id: string
          reason: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          delta: number
          event_id?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          organization_id: string
          reason: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          delta?: number
          event_id?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          organization_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_domains: {
        Row: {
          created_at: string
          domain: string
          event_id: string | null
          id: string
          organization_id: string | null
          paid_by: string
          registered_until: string | null
          status: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          event_id?: string | null
          id?: string
          organization_id?: string | null
          paid_by: string
          registered_until?: string | null
          status?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          event_id?: string | null
          id?: string
          organization_id?: string | null
          paid_by?: string
          registered_until?: string | null
          status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_domains_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cohosts: {
        Row: {
          created_at: string
          event_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cohosts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cohosts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sessions: {
        Row: {
          created_at: string
          ends_at: string
          event_id: string
          id: string
          name: string
          starts_at: string
          venue_address: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_name: string | null
        }
        Insert: {
          created_at?: string
          ends_at: string
          event_id: string
          id?: string
          name: string
          starts_at: string
          venue_address?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          event_id?: string
          id?: string
          name?: string
          starts_at?: string
          venue_address?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          event_type: string
          gallery_public: boolean
          gift_config: Json
          id: string
          moderation_mode: string
          organization_id: string | null
          owner_id: string
          package: string | null
          passcode_hash: string | null
          photo_quota: number
          published_at: string | null
          slug: string
          stage_blackout: boolean
          status: string
          storage_expires_at: string | null
          theme_config: Json
          timezone: string
          title: string
        }
        Insert: {
          created_at?: string
          event_type?: string
          gallery_public?: boolean
          gift_config?: Json
          id?: string
          moderation_mode?: string
          organization_id?: string | null
          owner_id?: string
          package?: string | null
          passcode_hash?: string | null
          photo_quota?: number
          published_at?: string | null
          slug: string
          stage_blackout?: boolean
          status?: string
          storage_expires_at?: string | null
          theme_config?: Json
          timezone?: string
          title: string
        }
        Update: {
          created_at?: string
          event_type?: string
          gallery_public?: boolean
          gift_config?: Json
          id?: string
          moderation_mode?: string
          organization_id?: string | null
          owner_id?: string
          package?: string | null
          passcode_hash?: string | null
          photo_quota?: number
          published_at?: string | null
          slug?: string
          stage_blackout?: boolean
          status?: string
          storage_expires_at?: string | null
          theme_config?: Json
          timezone?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_sessions: {
        Row: {
          consent_at: string
          consent_version: string
          created_at: string
          display_name: string
          event_id: string
          id: string
          invitation_id: string | null
          is_blocked: boolean
          last_seen_at: string
        }
        Insert: {
          consent_at?: string
          consent_version: string
          created_at?: string
          display_name: string
          event_id: string
          id?: string
          invitation_id?: string | null
          is_blocked?: boolean
          last_seen_at?: string
        }
        Update: {
          consent_at?: string
          consent_version?: string
          created_at?: string
          display_name?: string
          event_id?: string
          id?: string
          invitation_id?: string | null
          is_blocked?: boolean
          last_seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_sessions_invitation_id_event_id_fkey"
            columns: ["invitation_id", "event_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      invitation_media: {
        Row: {
          bytes_display: number
          created_at: string
          created_by: string | null
          event_id: string
          height: number
          id: string
          key_display: string
          key_thumb: string
          kind: string
          width: number
        }
        Insert: {
          bytes_display: number
          created_at?: string
          created_by?: string | null
          event_id: string
          height: number
          id?: string
          key_display: string
          key_thumb: string
          kind: string
          width: number
        }
        Update: {
          bytes_display?: number
          created_at?: string
          created_by?: string | null
          event_id?: string
          height?: number
          id?: string
          key_display?: string
          key_thumb?: string
          kind?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "invitation_media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          category: string
          checked_in_at: string | null
          checked_in_by_profile_id: string | null
          checked_in_by_staff_link_id: string | null
          checked_in_pax: number | null
          created_at: string
          event_id: string
          guest_name: string
          id: string
          opened_at: string | null
          pax_allowed: number
          personal_slug: string
          phone_number: string | null
          qr_token: string
          rsvp_at: string | null
          rsvp_pax: number | null
          rsvp_status: string
          sent_at: string | null
          session_ids: string[]
          source: string
          table_number: string | null
        }
        Insert: {
          category?: string
          checked_in_at?: string | null
          checked_in_by_profile_id?: string | null
          checked_in_by_staff_link_id?: string | null
          checked_in_pax?: number | null
          created_at?: string
          event_id: string
          guest_name: string
          id?: string
          opened_at?: string | null
          pax_allowed?: number
          personal_slug?: string
          phone_number?: string | null
          qr_token?: string
          rsvp_at?: string | null
          rsvp_pax?: number | null
          rsvp_status?: string
          sent_at?: string | null
          session_ids?: string[]
          source?: string
          table_number?: string | null
        }
        Update: {
          category?: string
          checked_in_at?: string | null
          checked_in_by_profile_id?: string | null
          checked_in_by_staff_link_id?: string | null
          checked_in_pax?: number | null
          created_at?: string
          event_id?: string
          guest_name?: string
          id?: string
          opened_at?: string | null
          pax_allowed?: number
          personal_slug?: string
          phone_number?: string | null
          qr_token?: string
          rsvp_at?: string | null
          rsvp_pax?: number | null
          rsvp_status?: string
          sent_at?: string | null
          session_ids?: string[]
          source?: string
          table_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_checked_in_by_profile_id_fkey"
            columns: ["checked_in_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_checked_in_by_staff_link_id_fkey"
            columns: ["checked_in_by_staff_link_id"]
            isOneToOne: false
            referencedRelation: "staff_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_idr: number
          created_at: string
          event_id: string | null
          id: string
          item_code: string
          organization_id: string | null
          paid_at: string | null
          profile_id: string | null
          provider: string
          provider_ref: string | null
          quantity: number
          status: string
        }
        Insert: {
          amount_idr: number
          created_at?: string
          event_id?: string | null
          id?: string
          item_code: string
          organization_id?: string | null
          paid_at?: string | null
          profile_id?: string | null
          provider?: string
          provider_ref?: string | null
          quantity?: number
          status?: string
        }
        Update: {
          amount_idr?: number
          created_at?: string
          event_id?: string | null
          id?: string
          item_code?: string
          organization_id?: string | null
          paid_at?: string | null
          profile_id?: string | null
          provider?: string
          provider_ref?: string | null
          quantity?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          organization_id: string
          profile_id: string
          role: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          profile_id: string
          role?: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          brand_config: Json
          created_at: string
          created_by: string | null
          id: string
          logo_key: string | null
          name: string
          slug: string
          white_label: boolean
        }
        Insert: {
          brand_config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          logo_key?: string | null
          name: string
          slug: string
          white_label?: boolean
        }
        Update: {
          brand_config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          logo_key?: string | null
          name?: string
          slug?: string
          white_label?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_reports: {
        Row: {
          created_at: string
          event_id: string
          id: string
          photo_id: string
          reason: string
          reporter_key: string
          resolved_at: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          photo_id: string
          reason: string
          reporter_key: string
          resolved_at?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          photo_id?: string
          reason?: string
          reporter_key?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photo_reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_reports_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          bytes_display: number
          caption: string | null
          created_at: string
          event_id: string
          guest_session_id: string
          height: number
          id: string
          is_pinned: boolean
          key_display: string
          key_original: string | null
          key_thumb: string
          moderated_at: string | null
          moderated_by_profile_id: string | null
          moderated_by_staff_link_id: string | null
          over_quota: boolean
          status: string
          uploader_name: string
          visible_after: string | null
          width: number
        }
        Insert: {
          bytes_display: number
          caption?: string | null
          created_at?: string
          event_id: string
          guest_session_id: string
          height: number
          id?: string
          is_pinned?: boolean
          key_display: string
          key_original?: string | null
          key_thumb: string
          moderated_at?: string | null
          moderated_by_profile_id?: string | null
          moderated_by_staff_link_id?: string | null
          over_quota?: boolean
          status?: string
          uploader_name?: string
          visible_after?: string | null
          width: number
        }
        Update: {
          bytes_display?: number
          caption?: string | null
          created_at?: string
          event_id?: string
          guest_session_id?: string
          height?: number
          id?: string
          is_pinned?: boolean
          key_display?: string
          key_original?: string | null
          key_thumb?: string
          moderated_at?: string | null
          moderated_by_profile_id?: string | null
          moderated_by_staff_link_id?: string | null
          over_quota?: boolean
          status?: string
          uploader_name?: string
          visible_after?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_guest_session_id_event_id_fkey"
            columns: ["guest_session_id", "event_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id", "event_id"]
          },
          {
            foreignKeyName: "photos_moderated_by_profile_id_fkey"
            columns: ["moderated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_moderated_by_staff_link_id_fkey"
            columns: ["moderated_by_staff_link_id"]
            isOneToOne: false
            referencedRelation: "staff_links"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          created_at: string
          key: string
        }
        Insert: {
          created_at?: string
          key: string
        }
        Update: {
          created_at?: string
          key?: string
        }
        Relationships: []
      }
      staff_links: {
        Row: {
          created_at: string
          event_id: string
          expires_at: string
          failed_pin_attempts: number
          id: string
          label: string
          locked_until: string | null
          pin_hash: string
          revoked_at: string | null
          role: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          event_id: string
          expires_at: string
          failed_pin_attempts?: number
          id?: string
          label?: string
          locked_until?: string | null
          pin_hash: string
          revoked_at?: string | null
          role: string
          token_hash: string
        }
        Update: {
          created_at?: string
          event_id?: string
          expires_at?: string
          failed_pin_attempts?: number
          id?: string
          label?: string
          locked_until?: string | null
          pin_hash?: string
          revoked_at?: string | null
          role?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_sessions: {
        Row: {
          auth_user_id: string
          created_at: string
          staff_link_id: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          staff_link_id: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          staff_link_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_sessions_staff_link_id_fkey"
            columns: ["staff_link_id"]
            isOneToOne: false
            referencedRelation: "staff_links"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_heartbeats: {
        Row: {
          auth_user_id: string
          cached_photos: number
          event_id: string
          last_seen_at: string
          realtime_live: boolean
        }
        Insert: {
          auth_user_id: string
          cached_photos?: number
          event_id: string
          last_seen_at?: string
          realtime_live: boolean
        }
        Update: {
          auth_user_id?: string
          cached_photos?: number
          event_id?: string
          last_seen_at?: string
          realtime_live?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "stage_heartbeats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          events_quota: number
          events_used: number
          id: string
          organization_id: string
          period_end: string
          period_start: string
          plan: string
          status: string
        }
        Insert: {
          created_at?: string
          events_quota: number
          events_used?: number
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          plan?: string
          status: string
        }
        Update: {
          created_at?: string
          events_quota?: number
          events_used?: number
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          plan?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_errors: {
        Row: {
          code: string
          created_at: string
          event_id: string
          id: number
          stage: string
        }
        Insert: {
          code: string
          created_at?: string
          event_id: string
          id?: never
          stage: string
        }
        Update: {
          code?: string
          created_at?: string
          event_id?: string
          id?: never
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_errors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      wishes: {
        Row: {
          author_name: string
          created_at: string
          event_id: string
          id: string
          invitation_id: string | null
          is_hidden: boolean
          message: string
        }
        Insert: {
          author_name: string
          created_at?: string
          event_id: string
          id?: string
          invitation_id?: string | null
          is_hidden?: boolean
          message: string
        }
        Update: {
          author_name?: string
          created_at?: string
          event_id?: string
          id?: string
          invitation_id?: string | null
          is_hidden?: boolean
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishes_invitation_id_event_id_fkey"
            columns: ["invitation_id", "event_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_cohost_invite: { Args: { p_token: string }; Returns: string }
      admin_activate_event: {
        Args: { p_event_id: string; p_package: string; p_reason: string }
        Returns: Json
      }
      admin_adjust_credit: {
        Args: { p_delta: number; p_organization_id: string; p_reason: string }
        Returns: Json
      }
      admin_dismiss_report: {
        Args: { p_reason: string; p_report_id: string }
        Returns: undefined
      }
      admin_record_refund: {
        Args: { p_order_id: string; p_reason: string; p_revert_event?: boolean }
        Returns: Json
      }
      admin_set_domain_status: {
        Args: { p_domain_id: string; p_reason: string; p_status: string }
        Returns: undefined
      }
      admin_takedown_photo: {
        Args: { p_photo_id: string; p_reason: string }
        Returns: Json
      }
      admin_today: {
        Args: never
        Returns: {
          checked_in: number
          event_id: string
          invitations: number
          moderation_mode: string
          open_reports: number
          package: string
          pending: number
          photos_today: number
          sessions: Json
          slug: string
          stage_cached: number
          stage_last_seen: string
          stage_live: boolean
          timezone: string
          title: string
          upload_errors_today: number
        }[]
      }
      admin_upsert_domain: {
        Args: {
          p_domain: string
          p_event_id: string
          p_paid_by: string
          p_reason: string
          p_registered_until: string
        }
        Returns: string
      }
      can_receive_event_channel: { Args: { p_topic: string }; Returns: boolean }
      can_view_profile: { Args: { p_profile_id: string }; Returns: boolean }
      check_gallery_passcode: {
        Args: { p_event_id: string; p_passcode: string }
        Returns: boolean
      }
      checkin_card: { Args: { p_invitation_id: string }; Returns: Json }
      claim_staff_link: {
        Args: { p_pin: string; p_token: string }
        Returns: Json
      }
      cleanup_ops_data: { Args: never; Returns: undefined }
      cleanup_staff_devices: { Args: never; Returns: number }
      cohost_invite_preview: { Args: { p_token: string }; Returns: Json }
      create_cohost_invite: {
        Args: { p_event_id: string; p_label?: string }
        Returns: Json
      }
      create_staff_link: {
        Args: { p_event_id: string; p_label?: string; p_role: string }
        Returns: Json
      }
      current_staff_link: {
        Args: { p_event_id: string; p_role: string }
        Returns: string
      }
      fulfill_order: {
        Args: {
          p_gross_amount: number
          p_order_id: string
          p_provider_ref: string
        }
        Returns: Json
      }
      hit_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_event_manager: { Args: { p_event_id: string }; Returns: boolean }
      is_org_member: { Args: { p_organization_id: string }; Returns: boolean }
      is_org_owner: { Args: { p_organization_id: string }; Returns: boolean }
      is_registered_user: { Args: never; Returns: boolean }
      log_admin_action: {
        Args: {
          p_action: string
          p_actor_id?: string
          p_details?: Json
          p_event_id?: string
          p_order_id?: string
          p_organization_id?: string
          p_photo_id?: string
          p_reason: string
        }
        Returns: string
      }
      random_token: { Args: { p_length: number }; Returns: string }
      require_admin: { Args: never; Returns: undefined }
      require_event_access: {
        Args: { p_event_id: string; p_roles: string[] }
        Returns: undefined
      }
      resolve_custom_domain: { Args: { p_host: string }; Returns: string }
      revoke_cohost_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      set_gallery_passcode: {
        Args: { p_event_id: string; p_passcode: string }
        Returns: undefined
      }
      staff_add_walk_in: {
        Args: {
          p_event_id: string
          p_guest_name: string
          p_id?: string
          p_pax?: number
        }
        Returns: Json
      }
      staff_approve_photos: {
        Args: { p_event_id: string; p_photo_ids: string[] }
        Returns: Json
      }
      staff_check_in: {
        Args: {
          p_checked_in_at?: string
          p_event_id: string
          p_invitation_id?: string
          p_pax?: number
          p_qr_token?: string
        }
        Returns: Json
      }
      staff_download_manifest: {
        Args: {
          p_event_id: string
          p_limit?: number
          p_offset?: number
          p_variant?: string
        }
        Returns: {
          caption: string
          created_at: string
          id: string
          key: string
          uploader_name: string
        }[]
      }
      staff_event: { Args: { p_event_id: string }; Returns: Json }
      staff_gallery_summary: { Args: { p_event_id: string }; Returns: Json }
      staff_guest_list: {
        Args: { p_event_id: string }
        Returns: {
          category: string
          checked_in_at: string
          checked_in_by: string
          checked_in_pax: number
          guest_name: string
          id: string
          pax_allowed: number
          qr_token: string
          rsvp_pax: number
          rsvp_status: string
          session_ids: string[]
          table_number: string
        }[]
      }
      staff_moderate_photo: {
        Args: { p_action: string; p_photo_id: string }
        Returns: Json
      }
      staff_photos: {
        Args: { p_event_id: string; p_ids?: string[]; p_limit?: number }
        Returns: {
          caption: string
          created_at: string
          guest_session_id: string
          height: number
          id: string
          is_pinned: boolean
          key_display: string
          key_thumb: string
          over_quota: boolean
          status: string
          uploader_name: string
          visible_after: string
          width: number
        }[]
      }
      staff_roles: { Args: { p_event_id: string }; Returns: string[] }
      staff_set_blackout: {
        Args: { p_event_id: string; p_on: boolean }
        Returns: Json
      }
      staff_stage_heartbeat: {
        Args: {
          p_cached_photos: number
          p_event_id: string
          p_realtime_live: boolean
        }
        Returns: undefined
      }
      staff_wishes: {
        Args: { p_event_id: string; p_limit?: number }
        Returns: {
          author_name: string
          created_at: string
          id: string
          message: string
        }[]
      }
      unlock_photos_within_quota: {
        Args: { p_event_id: string }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
