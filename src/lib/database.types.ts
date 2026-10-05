export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string;
          updated_at: string;
          value: string;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          created_at: string;
          customer_phone: string;
          customer_profile_id: string;
          description: string | null;
          garage_id: string;
          id: string;
          scheduled_at: string | null;
          service_id: string | null;
          status: Database["public"]["Enums"]["booking_status"];
          updated_at: string;
          vehicle_number: string | null;
        };
        Insert: {
          created_at?: string;
          customer_phone: string;
          customer_profile_id: string;
          description?: string | null;
          garage_id: string;
          id?: string;
          scheduled_at?: string | null;
          service_id?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
          vehicle_number?: string | null;
        };
        Update: {
          created_at?: string;
          customer_phone?: string;
          customer_profile_id?: string;
          description?: string | null;
          garage_id?: string;
          id?: string;
          scheduled_at?: string | null;
          service_id?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
          vehicle_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_customer_profile_id_fkey";
            columns: ["customer_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_garage_id_fkey";
            columns: ["garage_id"];
            isOneToOne: false;
            referencedRelation: "garages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "garage_services";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          is_active: boolean;
          name: string;
          phone: string;
          profile_id: string | null;
          referral_code: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          phone: string;
          profile_id?: string | null;
          referral_code: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          phone?: string;
          profile_id?: string | null;
          referral_code?: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employees_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      failure_categories: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          display_name: string;
          is_active: boolean;
          recommended_service_code: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          display_name: string;
          is_active?: boolean;
          recommended_service_code?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          display_name?: string;
          is_active?: boolean;
          recommended_service_code?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "failure_categories_recommended_service_code_fkey";
            columns: ["recommended_service_code"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["code"];
          },
        ];
      };
      fee_settlements: {
        Row: {
          amount: number;
          created_at: string;
          garage_id: string;
          id: string;
          paid_at: string | null;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          status: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          garage_id: string;
          id?: string;
          paid_at?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          status?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          garage_id?: string;
          id?: string;
          paid_at?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_settlements_garage_id_fkey";
            columns: ["garage_id"];
            isOneToOne: false;
            referencedRelation: "garages";
            referencedColumns: ["id"];
          },
        ];
      };
      garage_ledger: {
        Row: {
          amount: number;
          created_at: string;
          entry_type: string;
          garage_id: string;
          id: string;
          note: string | null;
          service_record_id: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          entry_type: string;
          garage_id: string;
          id?: string;
          note?: string | null;
          service_record_id?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          entry_type?: string;
          garage_id?: string;
          id?: string;
          note?: string | null;
          service_record_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "garage_ledger_garage_id_fkey";
            columns: ["garage_id"];
            isOneToOne: false;
            referencedRelation: "garages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "garage_ledger_service_record_id_fkey";
            columns: ["service_record_id"];
            isOneToOne: false;
            referencedRelation: "service_records";
            referencedColumns: ["id"];
          },
        ];
      };
      garage_payout_details: {
        Row: {
          garage_id: string;
          qr_image_path: string | null;
          updated_at: string;
        };
        Insert: {
          garage_id: string;
          qr_image_path?: string | null;
          updated_at?: string;
        };
        Update: {
          garage_id?: string;
          qr_image_path?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "garage_payout_details_garage_id_fkey";
            columns: ["garage_id"];
            isOneToOne: true;
            referencedRelation: "garages";
            referencedColumns: ["id"];
          },
        ];
      };
      garage_services: {
        Row: {
          created_at: string;
          description: string | null;
          duration_minutes: number | null;
          garage_id: string;
          id: string;
          is_active: boolean;
          name: string;
          price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          duration_minutes?: number | null;
          garage_id: string;
          id?: string;
          is_active?: boolean;
          name: string;
          price: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          duration_minutes?: number | null;
          garage_id?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "garage_services_garage_id_fkey";
            columns: ["garage_id"];
            isOneToOne: false;
            referencedRelation: "garages";
            referencedColumns: ["id"];
          },
        ];
      };
      garage_standing: {
        Row: {
          fraud_strikes: number;
          garage_id: string;
          note: string | null;
          penalty_amount: number;
          updated_at: string;
        };
        Insert: {
          fraud_strikes?: number;
          garage_id: string;
          note?: string | null;
          penalty_amount?: number;
          updated_at?: string;
        };
        Update: {
          fraud_strikes?: number;
          garage_id?: string;
          note?: string | null;
          penalty_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "garage_standing_garage_id_fkey";
            columns: ["garage_id"];
            isOneToOne: true;
            referencedRelation: "garages";
            referencedColumns: ["id"];
          },
        ];
      };
      garages: {
        Row: {
          address: string | null;
          assigned_employee_id: string | null;
          business_type: Database["public"]["Enums"]["business_type"];
          created_at: string;
          email: string | null;
          id: string;
          is_offboarded: boolean;
          is_verified: boolean;
          latitude: number | null;
          legal_business_name: string | null;
          longitude: number | null;
          name: string;
          onboarding_status: Database["public"]["Enums"]["onboarding_status"];
          owner_profile_id: string;
          phone: string | null;
          photo_url: string | null;
          rating: number;
          referral_code: string | null;
          service_hours: string | null;
          total_reviews: number;
          updated_at: string;
          working_days: string[];
        };
        Insert: {
          address?: string | null;
          assigned_employee_id?: string | null;
          business_type?: Database["public"]["Enums"]["business_type"];
          created_at?: string;
          email?: string | null;
          id?: string;
          is_offboarded?: boolean;
          is_verified?: boolean;
          latitude?: number | null;
          legal_business_name?: string | null;
          longitude?: number | null;
          name: string;
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"];
          owner_profile_id: string;
          phone?: string | null;
          photo_url?: string | null;
          rating?: number;
          referral_code?: string | null;
          service_hours?: string | null;
          total_reviews?: number;
          updated_at?: string;
          working_days?: string[];
        };
        Update: {
          address?: string | null;
          assigned_employee_id?: string | null;
          business_type?: Database["public"]["Enums"]["business_type"];
          created_at?: string;
          email?: string | null;
          id?: string;
          is_offboarded?: boolean;
          is_verified?: boolean;
          latitude?: number | null;
          legal_business_name?: string | null;
          longitude?: number | null;
          name?: string;
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"];
          owner_profile_id?: string;
          phone?: string | null;
          photo_url?: string | null;
          rating?: number;
          referral_code?: string | null;
          service_hours?: string | null;
          total_reviews?: number;
          updated_at?: string;
          working_days?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "garages_assigned_employee_id_fkey";
            columns: ["assigned_employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "garages_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_deliveries: {
        Row: {
          acked_at: string | null;
          channel: Database["public"]["Enums"]["delivery_channel"];
          created_at: string;
          error: string | null;
          fell_back_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["delivery_kind"];
          provider_message_id: string | null;
          push_deadline_at: string | null;
          recipient_phone: string;
          recipient_profile_id: string | null;
          sent_at: string;
          service_record_id: string;
          state: Database["public"]["Enums"]["delivery_state"];
          updated_at: string;
        };
        Insert: {
          acked_at?: string | null;
          channel: Database["public"]["Enums"]["delivery_channel"];
          created_at?: string;
          error?: string | null;
          fell_back_at?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["delivery_kind"];
          provider_message_id?: string | null;
          push_deadline_at?: string | null;
          recipient_phone: string;
          recipient_profile_id?: string | null;
          sent_at?: string;
          service_record_id: string;
          state?: Database["public"]["Enums"]["delivery_state"];
          updated_at?: string;
        };
        Update: {
          acked_at?: string | null;
          channel?: Database["public"]["Enums"]["delivery_channel"];
          created_at?: string;
          error?: string | null;
          fell_back_at?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["delivery_kind"];
          provider_message_id?: string | null;
          push_deadline_at?: string | null;
          recipient_phone?: string;
          recipient_profile_id?: string | null;
          sent_at?: string;
          service_record_id?: string;
          state?: Database["public"]["Enums"]["delivery_state"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_recipient_profile_id_fkey";
            columns: ["recipient_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_deliveries_service_record_id_fkey";
            columns: ["service_record_id"];
            isOneToOne: false;
            referencedRelation: "service_records";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          channel: Database["public"]["Enums"]["invoice_delivery_channel"] | null;
          created_at: string;
          id: string;
          payload: NonNullable<Json>;
          profile_id: string | null;
          read_at: string | null;
          service_record_id: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
          updated_at: string;
        };
        Insert: {
          body?: string | null;
          channel?: Database["public"]["Enums"]["invoice_delivery_channel"] | null;
          created_at?: string;
          id?: string;
          payload?: NonNullable<Json>;
          profile_id?: string | null;
          read_at?: string | null;
          service_record_id?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
          updated_at?: string;
        };
        Update: {
          body?: string | null;
          channel?: Database["public"]["Enums"]["invoice_delivery_channel"] | null;
          created_at?: string;
          id?: string;
          payload?: NonNullable<Json>;
          profile_id?: string | null;
          read_at?: string | null;
          service_record_id?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          title?: string;
          type?: Database["public"]["Enums"]["notification_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_service_record_id_fkey";
            columns: ["service_record_id"];
            isOneToOne: false;
            referencedRelation: "service_records";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          booking_id: string | null;
          created_at: string;
          customer_profile_id: string | null;
          garage_id: string | null;
          id: string;
          method: Database["public"]["Enums"]["payment_method"] | null;
          platform_fee: number;
          provider: string | null;
          provider_payment_id: string | null;
          service_record_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          booking_id?: string | null;
          created_at?: string;
          customer_profile_id?: string | null;
          garage_id?: string | null;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"] | null;
          platform_fee?: number;
          provider?: string | null;
          provider_payment_id?: string | null;
          service_record_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          booking_id?: string | null;
          created_at?: string;
          customer_profile_id?: string | null;
          garage_id?: string | null;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"] | null;
          platform_fee?: number;
          provider?: string | null;
          provider_payment_id?: string | null;
          service_record_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_customer_profile_id_fkey";
            columns: ["customer_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_garage_id_fkey";
            columns: ["garage_id"];
            isOneToOne: false;
            referencedRelation: "garages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_service_record_id_fkey";
            columns: ["service_record_id"];
            isOneToOne: false;
            referencedRelation: "service_records";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_roles: {
        Row: {
          created_at: string;
          profile_id: string;
          role: Database["public"]["Enums"]["app_role"];
        };
        Insert: {
          created_at?: string;
          profile_id: string;
          role: Database["public"]["Enums"]["app_role"];
        };
        Update: {
          created_at?: string;
          profile_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
        };
        Relationships: [
          {
            foreignKeyName: "profile_roles_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          auth_user_id: string | null;
          created_at: string;
          id: string;
          name: string | null;
          phone_number: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
          vehicle_make: string | null;
          vehicle_model: string | null;
          vehicle_number: string | null;
          vehicle_year: string | null;
        };
        Insert: {
          auth_user_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string | null;
          phone_number: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
          vehicle_make?: string | null;
          vehicle_model?: string | null;
          vehicle_number?: string | null;
          vehicle_year?: string | null;
        };
        Update: {
          auth_user_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string | null;
          phone_number?: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
          vehicle_make?: string | null;
          vehicle_model?: string | null;
          vehicle_number?: string | null;
          vehicle_year?: string | null;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          admin_notes: string | null;
          created_at: string;
          description: string | null;
          evidence_urls: string[];
          garage_id: string;
          id: string;
          reason: string;
          reporter_profile_id: string;
          service_record_id: string | null;
          status: Database["public"]["Enums"]["report_status"];
          updated_at: string;
        };
        Insert: {
          admin_notes?: string | null;
          created_at?: string;
          description?: string | null;
          evidence_urls?: string[];
          garage_id: string;
          id?: string;
          reason: string;
          reporter_profile_id: string;
          service_record_id?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          updated_at?: string;
        };
        Update: {
          admin_notes?: string | null;
          created_at?: string;
          description?: string | null;
          evidence_urls?: string[];
          garage_id?: string;
          id?: string;
          reason?: string;
          reporter_profile_id?: string;
          service_record_id?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_garage_id_fkey";
            columns: ["garage_id"];
            isOneToOne: false;
            referencedRelation: "garages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_profile_id_fkey";
            columns: ["reporter_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_service_record_id_fkey";
            columns: ["service_record_id"];
            isOneToOne: false;
            referencedRelation: "service_records";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          comment: string | null;
          created_at: string;
          customer_profile_id: string;
          garage_id: string;
          id: string;
          rating: number;
          updated_at: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          customer_profile_id: string;
          garage_id: string;
          id?: string;
          rating: number;
          updated_at?: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          customer_profile_id?: string;
          garage_id?: string;
          id?: string;
          rating?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_customer_profile_id_fkey";
            columns: ["customer_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_garage_id_fkey";
            columns: ["garage_id"];
            isOneToOne: false;
            referencedRelation: "garages";
            referencedColumns: ["id"];
          },
        ];
      };
      service_categories: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          display_name: string;
          is_active: boolean;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          display_name: string;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          display_name?: string;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      service_otps: {
        Row: {
          attempt_count: number;
          consumed: boolean;
          created_at: string;
          expires_at: string;
          id: string;
          max_attempts: number;
          otp_hash: string;
          otp_salt: string;
          phone: string;
          provider_message_id: string | null;
          resend_count: number;
          sent_provider: string | null;
          service_record_id: string;
          updated_at: string;
          verified_at: string | null;
        };
        Insert: {
          attempt_count?: number;
          consumed?: boolean;
          created_at?: string;
          expires_at: string;
          id?: string;
          max_attempts?: number;
          otp_hash: string;
          otp_salt: string;
          phone: string;
          provider_message_id?: string | null;
          resend_count?: number;
          sent_provider?: string | null;
          service_record_id: string;
          updated_at?: string;
          verified_at?: string | null;
        };
        Update: {
          attempt_count?: number;
          consumed?: boolean;
          created_at?: string;
          expires_at?: string;
          id?: string;
          max_attempts?: number;
          otp_hash?: string;
          otp_salt?: string;
          phone?: string;
          provider_message_id?: string | null;
          resend_count?: number;
          sent_provider?: string | null;
          service_record_id?: string;
          updated_at?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_otps_service_record_id_fkey";
            columns: ["service_record_id"];
            isOneToOne: false;
            referencedRelation: "service_records";
            referencedColumns: ["id"];
          },
        ];
      };
      service_record_failures: {
        Row: {
          created_at: string;
          failure_category_code: string;
          service_record_id: string;
        };
        Insert: {
          created_at?: string;
          failure_category_code: string;
          service_record_id: string;
        };
        Update: {
          created_at?: string;
          failure_category_code?: string;
          service_record_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_record_failures_failure_category_code_fkey";
            columns: ["failure_category_code"];
            isOneToOne: false;
            referencedRelation: "failure_categories";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "service_record_failures_service_record_id_fkey";
            columns: ["service_record_id"];
            isOneToOne: false;
            referencedRelation: "service_records";
            referencedColumns: ["id"];
          },
        ];
      };
      service_record_services: {
        Row: {
          created_at: string;
          service_category_code: string;
          service_record_id: string;
        };
        Insert: {
          created_at?: string;
          service_category_code: string;
          service_record_id: string;
        };
        Update: {
          created_at?: string;
          service_category_code?: string;
          service_record_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_record_services_service_category_code_fkey";
            columns: ["service_category_code"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "service_record_services_service_record_id_fkey";
            columns: ["service_record_id"];
            isOneToOne: false;
            referencedRelation: "service_records";
            referencedColumns: ["id"];
          },
        ];
      };
      service_records: {
        Row: {
          amount: number;
          approved_by_customer: boolean | null;
          created_at: string;
          customer_phone: string;
          customer_profile_id: string | null;
          description: string;
          garage_earnings: number;
          garage_id: string;
          garage_name: string;
          id: string;
          invoice_delivery_channel: Database["public"]["Enums"]["invoice_delivery_channel"];
          invoice_notification_status: Database["public"]["Enums"]["invoice_notification_status"];
          invoice_number: string | null;
          is_reliable: boolean;
          model_year: number | null;
          odometer_km: number | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          platform_fee: number;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          service_notes: string | null;
          status: Database["public"]["Enums"]["service_record_status"];
          taxonomy_version: number;
          updated_at: string;
          vehicle_make_code: string | null;
          vehicle_make_other: string | null;
          vehicle_model_code: string | null;
          vehicle_model_other: string | null;
          vehicle_number: string | null;
          vehicle_type: Database["public"]["Enums"]["vehicle_type"];
          verification_method: Database["public"]["Enums"]["verification_method"] | null;
        };
        Insert: {
          amount: number;
          approved_by_customer?: boolean | null;
          created_at?: string;
          customer_phone: string;
          customer_profile_id?: string | null;
          description: string;
          garage_earnings?: number;
          garage_id: string;
          garage_name: string;
          id?: string;
          invoice_delivery_channel?: Database["public"]["Enums"]["invoice_delivery_channel"];
          invoice_notification_status?: Database["public"]["Enums"]["invoice_notification_status"];
          invoice_number?: string | null;
          is_reliable?: boolean;
          model_year?: number | null;
          odometer_km?: number | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          platform_fee?: number;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          service_notes?: string | null;
          status?: Database["public"]["Enums"]["service_record_status"];
          taxonomy_version?: number;
          updated_at?: string;
          vehicle_make_code?: string | null;
          vehicle_make_other?: string | null;
          vehicle_model_code?: string | null;
          vehicle_model_other?: string | null;
          vehicle_number?: string | null;
          vehicle_type: Database["public"]["Enums"]["vehicle_type"];
          verification_method?: Database["public"]["Enums"]["verification_method"] | null;
        };
        Update: {
          amount?: number;
          approved_by_customer?: boolean | null;
          created_at?: string;
          customer_phone?: string;
          customer_profile_id?: string | null;
          description?: string;
          garage_earnings?: number;
          garage_id?: string;
          garage_name?: string;
          id?: string;
          invoice_delivery_channel?: Database["public"]["Enums"]["invoice_delivery_channel"];
          invoice_notification_status?: Database["public"]["Enums"]["invoice_notification_status"];
          invoice_number?: string | null;
          is_reliable?: boolean;
          model_year?: number | null;
          odometer_km?: number | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          platform_fee?: number;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          service_notes?: string | null;
          status?: Database["public"]["Enums"]["service_record_status"];
          taxonomy_version?: number;
          updated_at?: string;
          vehicle_make_code?: string | null;
          vehicle_make_other?: string | null;
          vehicle_model_code?: string | null;
          vehicle_model_other?: string | null;
          vehicle_number?: string | null;
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"];
          verification_method?: Database["public"]["Enums"]["verification_method"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_records_customer_profile_id_fkey";
            columns: ["customer_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_records_garage_id_fkey";
            columns: ["garage_id"];
            isOneToOne: false;
            referencedRelation: "garages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_records_vehicle_make_code_fkey";
            columns: ["vehicle_make_code"];
            isOneToOne: false;
            referencedRelation: "vehicle_makes";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "service_records_vehicle_model_taxonomy_fkey";
            columns: ["vehicle_model_code", "vehicle_make_code", "vehicle_type"];
            isOneToOne: false;
            referencedRelation: "vehicle_models";
            referencedColumns: ["code", "make_code", "vehicle_type"];
          },
        ];
      };
      support_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          sender_kind: string;
          sender_profile_id: string;
          ticket_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          sender_kind: string;
          sender_profile_id: string;
          ticket_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          sender_kind?: string;
          sender_profile_id?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_messages_sender_profile_id_fkey";
            columns: ["sender_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      support_tickets: {
        Row: {
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          id: string;
          last_message_at: string;
          opener_name: string | null;
          opener_phone: string | null;
          opener_profile_id: string;
          opener_role: Database["public"]["Enums"]["app_role"];
          status: Database["public"]["Enums"]["support_ticket_status"];
          subject: string | null;
          updated_at: string;
        };
        Insert: {
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          id?: string;
          last_message_at?: string;
          opener_name?: string | null;
          opener_phone?: string | null;
          opener_profile_id: string;
          opener_role: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["support_ticket_status"];
          subject?: string | null;
          updated_at?: string;
        };
        Update: {
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          id?: string;
          last_message_at?: string;
          opener_name?: string | null;
          opener_phone?: string | null;
          opener_profile_id?: string;
          opener_role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["support_ticket_status"];
          subject?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_tickets_claimed_by_fkey";
            columns: ["claimed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_tickets_opener_profile_id_fkey";
            columns: ["opener_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_devices: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          last_seen_at: string | null;
          platform: string;
          profile_id: string;
          push_token: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          last_seen_at?: string | null;
          platform: string;
          profile_id: string;
          push_token: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          last_seen_at?: string | null;
          platform?: string;
          profile_id?: string;
          push_token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_devices_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_makes: {
        Row: {
          code: string;
          created_at: string;
          display_name: string;
          is_active: boolean;
          sort_order: number;
          updated_at: string;
          vehicle_types: Database["public"]["Enums"]["vehicle_type"][];
        };
        Insert: {
          code: string;
          created_at?: string;
          display_name: string;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
          vehicle_types: Database["public"]["Enums"]["vehicle_type"][];
        };
        Update: {
          code?: string;
          created_at?: string;
          display_name?: string;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
          vehicle_types?: Database["public"]["Enums"]["vehicle_type"][];
        };
        Relationships: [];
      };
      vehicle_models: {
        Row: {
          code: string;
          created_at: string;
          display_name: string;
          is_active: boolean;
          make_code: string;
          sort_order: number;
          updated_at: string;
          vehicle_type: Database["public"]["Enums"]["vehicle_type"];
        };
        Insert: {
          code: string;
          created_at?: string;
          display_name: string;
          is_active?: boolean;
          make_code: string;
          sort_order?: number;
          updated_at?: string;
          vehicle_type: Database["public"]["Enums"]["vehicle_type"];
        };
        Update: {
          code?: string;
          created_at?: string;
          display_name?: string;
          is_active?: boolean;
          make_code?: string;
          sort_order?: number;
          updated_at?: string;
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"];
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_models_make_code_fkey";
            columns: ["make_code"];
            isOneToOne: false;
            referencedRelation: "vehicle_makes";
            referencedColumns: ["code"];
          },
        ];
      };
      vehicle_shares: {
        Row: {
          created_at: string;
          profile_id: string;
          revoked_at: string | null;
          token: string;
          vehicle_number: string;
        };
        Insert: {
          created_at?: string;
          profile_id: string;
          revoked_at?: string | null;
          token: string;
          vehicle_number: string;
        };
        Update: {
          created_at?: string;
          profile_id?: string;
          revoked_at?: string | null;
          token?: string;
          vehicle_number?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_shares_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      ack_notification_delivery: {
        Args: { p_delivery_id: string };
        Returns: {
          acked_at: string | null;
          channel: Database["public"]["Enums"]["delivery_channel"];
          created_at: string;
          error: string | null;
          fell_back_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["delivery_kind"];
          provider_message_id: string | null;
          push_deadline_at: string | null;
          recipient_phone: string;
          recipient_profile_id: string | null;
          sent_at: string;
          service_record_id: string;
          state: Database["public"]["Enums"]["delivery_state"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "notification_deliveries";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      add_my_role: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] };
        Returns: Database["public"]["Enums"]["app_role"][];
      };
      admin_fee_overview: {
        Args: Record<PropertyKey, never>;
        Returns: {
          accrued: number;
          garage_id: string;
          last_settled_at: string;
          name: string;
          outstanding: number;
          settled: number;
        }[];
      };
      admin_overview_stats: { Args: { p_days?: number }; Returns: Json };
      app_flag: { Args: { p_key: string }; Returns: boolean };
      apply_fee_settlement_payment: {
        Args: { p_amount_paise: number; p_order_id: string; p_payment_id: string };
        Returns: string;
      };
      apply_garage_referral: { Args: { p_code: string; p_garage_id: string }; Returns: string };
      claim_support_ticket: {
        Args: { p_ticket_id: string };
        Returns: {
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          id: string;
          last_message_at: string;
          opener_name: string | null;
          opener_phone: string | null;
          opener_profile_id: string;
          opener_role: Database["public"]["Enums"]["app_role"];
          status: Database["public"]["Enums"]["support_ticket_status"];
          subject: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "support_tickets";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_service_payment: {
        Args: { p_payment_method: string; p_service_record_id: string };
        Returns: {
          customer_pays: number;
          garage_receives: number;
          invoice_number: string;
          platform_fee: number;
          status: Database["public"]["Enums"]["service_record_status"];
          verified: boolean;
        }[];
      };
      create_notification_delivery: {
        Args: {
          p_ack_window_seconds?: number;
          p_channel: Database["public"]["Enums"]["delivery_channel"];
          p_kind: Database["public"]["Enums"]["delivery_kind"];
          p_service_record_id: string;
        };
        Returns: string;
      };
      create_service_record_with_taxonomy: {
        Args: {
          p_amount: number;
          p_customer_has_app: boolean;
          p_customer_phone: string;
          p_failure_codes: string[];
          p_garage_id: string;
          p_model_year: number;
          p_odometer_km: number;
          p_service_codes: string[];
          p_service_notes: string;
          p_vehicle_make_code: string;
          p_vehicle_make_other: string;
          p_vehicle_model_code: string;
          p_vehicle_model_other: string;
          p_vehicle_number: string;
          p_vehicle_type: Database["public"]["Enums"]["vehicle_type"];
        };
        Returns: {
          customer_phone: string;
          service_record_id: string;
          status: Database["public"]["Enums"]["service_record_status"];
        }[];
      };
      create_vehicle_share: { Args: { p_vehicle_number: string }; Returns: string };
      current_auth_phone: { Args: Record<PropertyKey, never>; Returns: string };
      current_phone_number: { Args: Record<PropertyKey, never>; Returns: string };
      current_profile_has_role: {
        Args: { target: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
      current_profile_id: { Args: Record<PropertyKey, never>; Returns: string };
      current_role: { Args: Record<PropertyKey, never>; Returns: Database["public"]["Enums"]["app_role"] };
      customer_decline_service: {
        Args: { p_reason?: string; p_service_record_id: string };
        Returns: undefined;
      };
      dearmor: { Args: { "": string }; Returns: string };
      employee_assigned_to_garage: { Args: { target_garage_id: string }; Returns: boolean };
      garage_owed_balance: { Args: { p_garage_id: string }; Returns: number };
      garage_service_metrics: {
        Args: { p_garage_ids?: string[] };
        Returns: {
          fees: number;
          garage_id: string;
          gmv: number;
          last_30d: number;
          services: number;
        }[];
      };
      garage_settlement_status: {
        Args: { p_garage_id: string };
        Returns: {
          due_now: number;
          locked: boolean;
          outstanding: number;
        }[];
      };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { "": string }; Returns: string };
      get_shared_vehicle_history: {
        Args: { p_token: string };
        Returns: {
          garage_name: string;
          invoice_number: string;
          odometer_km: number;
          service_date: string;
          vehicle_number: string;
          work_done: string;
        }[];
      };
      has_completed_service_with: { Args: { p_garage_id: string }; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_support: { Args: Record<PropertyKey, never>; Returns: boolean };
      link_current_auth_profile: {
        Args: Record<PropertyKey, never>;
        Returns: {
          auth_user_id: string | null;
          created_at: string;
          id: string;
          name: string | null;
          phone_number: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
          vehicle_make: string | null;
          vehicle_model: string | null;
          vehicle_number: string | null;
          vehicle_year: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      lookup_referral_code: { Args: { p_code: string }; Returns: string };
      my_roles: { Args: Record<PropertyKey, never>; Returns: Database["public"]["Enums"]["app_role"][] };
      normalize_indian_phone: { Args: { raw_phone: string }; Returns: string };
      open_support_ticket: {
        Args: { p_opener_role: Database["public"]["Enums"]["app_role"] };
        Returns: string;
      };
      owns_garage: { Args: { target_garage_id: string }; Returns: boolean };
      pgp_armor_headers: { Args: { "": string }; Returns: Record<string, unknown>[] };
      public_garage_service_counts: {
        Args: { p_garage_ids: string[] };
        Returns: {
          completed: number;
          garage_id: string;
        }[];
      };
      purge_stale_pending_service_records: { Args: { p_older_than?: string }; Returns: number };
      register_device: { Args: { p_platform: string; p_push_token: string }; Returns: undefined };
      resolve_support_ticket: {
        Args: { p_ticket_id: string };
        Returns: {
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          id: string;
          last_message_at: string;
          opener_name: string | null;
          opener_phone: string | null;
          opener_profile_id: string;
          opener_role: Database["public"]["Enums"]["app_role"];
          status: Database["public"]["Enums"]["support_ticket_status"];
          subject: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "support_tickets";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      revoke_vehicle_share: { Args: { p_vehicle_number: string }; Returns: undefined };
      verify_service_otp: {
        Args: { p_otp_hash_candidate: string; p_service_record_id: string };
        Returns: {
          ok: boolean;
          reason: string;
          remaining_attempts: number;
          status: Database["public"]["Enums"]["service_record_status"];
        }[];
      };
    };
    Enums: {
      app_role: "customer" | "garage" | "admin" | "employee" | "support";
      booking_status: "pending" | "accepted" | "rejected" | "completed" | "cancelled";
      business_type: "individual" | "partnership" | "proprietorship" | "private_limited" | "public_limited";
      delivery_channel: "push" | "whatsapp";
      delivery_kind: "otp" | "invoice";
      delivery_state: "sent" | "acked" | "fallback" | "failed";
      invoice_delivery_channel: "push" | "whatsapp" | "manual" | "none";
      invoice_notification_status: "pending" | "sent" | "failed" | "fallback_sent" | "not_required";
      notification_status: "pending" | "sent" | "failed" | "read";
      notification_type: "service_approval" | "invoice_ready" | "booking_update" | "report_update";
      onboarding_status: "pending" | "bank_details" | "verification" | "completed";
      payment_method: "cash" | "razorpay" | "qr";
      report_status: "pending" | "reviewing" | "resolved" | "dismissed";
      service_record_status: "pending_otp" | "otp_verified" | "payment_pending" | "completed" | "cancelled";
      support_ticket_status: "open" | "claimed" | "resolved";
      vehicle_type: "2w" | "3w" | "4w" | "other";
      verification_method: "whatsapp_otp" | "in_app";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "garage", "admin", "employee", "support"],
      booking_status: ["pending", "accepted", "rejected", "completed", "cancelled"],
      business_type: ["individual", "partnership", "proprietorship", "private_limited", "public_limited"],
      delivery_channel: ["push", "whatsapp"],
      delivery_kind: ["otp", "invoice"],
      delivery_state: ["sent", "acked", "fallback", "failed"],
      invoice_delivery_channel: ["push", "whatsapp", "manual", "none"],
      invoice_notification_status: ["pending", "sent", "failed", "fallback_sent", "not_required"],
      notification_status: ["pending", "sent", "failed", "read"],
      notification_type: ["service_approval", "invoice_ready", "booking_update", "report_update"],
      onboarding_status: ["pending", "bank_details", "verification", "completed"],
      payment_method: ["cash", "razorpay", "qr"],
      report_status: ["pending", "reviewing", "resolved", "dismissed"],
      service_record_status: ["pending_otp", "otp_verified", "payment_pending", "completed", "cancelled"],
      support_ticket_status: ["open", "claimed", "resolved"],
      vehicle_type: ["2w", "3w", "4w", "other"],
      verification_method: ["whatsapp_otp", "in_app"],
    },
  },
} as const;
