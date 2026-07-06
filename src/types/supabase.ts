/**
 * Tipos do schema Supabase — espelham docs/supabase-schema.sql
 * Expandir com `supabase gen types typescript` quando o projeto estiver linkado.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface SupabaseDatabase {
  public: {
    Tables: {
      offices: {
        Row: {
          id: string
          name: string
          address: string
          phone: string
          cnpj: string | null
          email: string | null
          created_at: string
          updated_at: string
          archived_at?: string | null
          plan_tier?: string | null
          trial_started_at?: string | null
          trial_ends_at?: string | null
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['offices']['Row']> & {
          name: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['offices']['Row']>
      }
      profiles: {
        Row: {
          id: string
          office_id: string
          full_name: string
          role: 'owner' | 'admin' | 'mecanico' | 'recepcionista'
          avatar_url: string | null
          email: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['profiles']['Row']> & {
          id: string
          office_id: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['profiles']['Row']>
      }
      settings: {
        Row: {
          id: string
          office_id: string
          dark_theme: boolean
          notifications: boolean
          low_stock_alert: boolean
          next_service_order_num: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['settings']['Row']> & {
          office_id: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['settings']['Row']>
      }
      customers: {
        Row: {
          id: string
          office_id: string
          name: string
          phone: string
          cpf: string | null
          address: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['customers']['Row']> & {
          office_id: string
          name: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['customers']['Row']>
      }
      motorcycles: {
        Row: {
          id: string
          office_id: string
          customer_id: string
          brand: string
          model: string
          year: number
          plate: string
          color: string
          mileage: number
          chassis: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['motorcycles']['Row']> & {
          office_id: string
          customer_id: string
          brand: string
          model: string
          plate: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['motorcycles']['Row']>
      }
      service_orders: {
        Row: {
          id: string
          office_id: string
          customer_id: string
          motorcycle_id: string
          number: number
          reported_issue: string
          diagnosis: string
          services_performed: string
          parts_used: Json
          parts_value: number
          labor_value: number
          discount: number
          total_value: number
          status: string
          entry_checklist: Json | null
          estimated_value: number | null
          budget_date: string | null
          budget_status: string | null
          entry_mileage: number | null
          exit_mileage: number | null
          warranty_days: number | null
          warranty_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['service_orders']['Row']> & {
          office_id: string
          customer_id: string
          motorcycle_id: string
          number: number
          reported_issue: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['service_orders']['Row']>
      }
      service_order_photos: {
        Row: {
          id: string
          office_id: string
          service_order_id: string
          storage_path: string
          public_url: string | null
          caption: string | null
          photo_type: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['service_order_photos']['Row']> & {
          office_id: string
          service_order_id: string
          storage_path: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['service_order_photos']['Row']>
      }
      appointments: {
        Row: {
          id: string
          office_id: string
          customer_id: string
          motorcycle_id: string
          service_order_id: string | null
          appointment_date: string
          appointment_time: string
          service: string
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['appointments']['Row']> & {
          office_id: string
          customer_id: string
          motorcycle_id: string
          appointment_date: string
          appointment_time: string
          service: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['appointments']['Row']>
      }
      inventory_items: {
        Row: {
          id: string
          office_id: string
          name: string
          code: string
          brand: string
          cost: number
          sale_price: number
          quantity: number
          minimum_stock: number
          created_at: string
          updated_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['inventory_items']['Row']> & {
          office_id: string
          name: string
          code: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['inventory_items']['Row']>
      }
      financial_transactions: {
        Row: {
          id: string
          office_id: string
          type: string
          description: string
          amount: number
          payment_method: string
          transaction_date: string
          paid: boolean
          due_date: string | null
          service_order_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['financial_transactions']['Row']> & {
          office_id: string
          type: string
          description: string
          amount: number
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['financial_transactions']['Row']>
      }
      warranties: {
        Row: {
          id: string
          office_id: string
          service_order_id: string
          customer_id: string
          motorcycle_id: string
          warranty_days: number
          starts_at: string
          expires_at: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['warranties']['Row']> & {
          office_id: string
          service_order_id: string
          customer_id: string
          motorcycle_id: string
          warranty_days: number
          starts_at: string
          expires_at: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['warranties']['Row']>
      }
      communication_history: {
        Row: {
          id: string
          office_id: string
          local_id: string | null
          client_id: string | null
          vehicle_id: string | null
          service_order_id: string | null
          tipo: string
          status: string
          message_text: string
          preview: string
          responsavel_nome: string | null
          sent_at: string
          metadata: Json
          created_at: string
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['communication_history']['Row']> & {
          office_id: string
          tipo: string
          status: string
          sent_at: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['communication_history']['Row']>
      }
      communication_alerts: {
        Row: {
          id: string
          office_id: string
          local_id: string | null
          client_id: string | null
          vehicle_id: string | null
          service_order_id: string | null
          tipo: string
          motivo: string
          status: string
          prioridade: string
          due_date: string
          message_text: string
          metadata: Json
          created_at: string
          updated_at: string
          resolved_at: string | null
        }
        Insert: Partial<SupabaseDatabase['public']['Tables']['communication_alerts']['Row']> & {
          office_id: string
          tipo: string
          motivo: string
          prioridade: string
          due_date: string
        }
        Update: Partial<SupabaseDatabase['public']['Tables']['communication_alerts']['Row']>
      }
    }
    Views: Record<string, never>
    Functions: {
      current_office_id: { Args: Record<string, never>; Returns: string }
      create_office_for_new_user: {
        Args: {
          p_office_name: string
          p_phone?: string
          p_city?: string
          p_state?: string
          p_full_name?: string
          p_email?: string
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
  }
}

/** Mapeamento tabela Supabase → entidade app (referência para mappers futuros) */
export const SUPABASE_TABLE_MAP = {
  offices: 'configuracao',
  customers: 'clientes',
  motorcycles: 'motos',
  service_orders: 'ordens_servico',
  inventory_items: 'pecas',
  financial_transactions: 'lancamentos',
  appointments: 'agendamentos',
  warranties: 'garantias',
  settings: 'settings',
  service_order_photos: 'fotos_os',
} as const
