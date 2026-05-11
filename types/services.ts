/**
 * Services Module — TypeScript Types
 * Mirrors the DB schema defined in Phase 1 migrations B1–B6.
 */

export type ServiceType = 'individual' | 'group' | 'hourly' | 'session' | 'daily'

export interface Service {
  id: string
  company_id: string
  branch_id: string
  cost_center_id: string | null

  service_code: string
  service_name: string
  service_type: ServiceType
  description: string | null
  category: string | null

  unit_price: number
  cost_price: number
  tax_rate: number
  commission_rate: number

  duration_minutes: number
  capacity: number
  buffer_minutes: number
  advance_booking_days: number
  min_advance_hours: number
  cancel_before_hours: number

  revenue_account_id: string | null
  expense_account_id: string | null
  product_catalog_id: string | null

  image_url: string | null
  color_code: string | null
  currency_code: string

  is_bookable: boolean
  is_active: boolean
  requires_approval: boolean
  notes: string | null

  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface ServiceSchedule {
  id: string
  company_id: string
  branch_id: string
  service_id: string
  day_of_week: number           // 0 = Sunday … 6 = Saturday
  start_time: string            // HH:MM:SS
  end_time: string              // HH:MM:SS
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ServiceStaff {
  id: string
  company_id: string
  service_id: string
  employee_user_id: string
  is_primary: boolean
  created_at: string
  updated_at: string
}

// ── Input DTOs ──────────────────────────────────────────────────────────────

export interface CreateServiceInput {
  branch_id?: string | null
  service_name: string
  service_type: ServiceType
  unit_price: number
  duration_minutes: number
  description?: string | null
  category?: string | null
  cost_price?: number
  tax_rate?: number
  commission_rate?: number
  capacity?: number
  buffer_minutes?: number
  advance_booking_days?: number
  min_advance_hours?: number
  cancel_before_hours?: number
  revenue_account_id?: string | null
  expense_account_id?: string | null
  cost_center_id?: string | null
  image_url?: string | null
  color_code?: string | null
  currency_code?: string
  is_bookable?: boolean
  requires_approval?: boolean
  notes?: string | null
}

export interface UpdateServiceInput {
  service_name?: string
  service_type?: ServiceType
  unit_price?: number
  duration_minutes?: number
  description?: string | null
  category?: string | null
  cost_price?: number
  tax_rate?: number
  commission_rate?: number
  capacity?: number
  buffer_minutes?: number
  advance_booking_days?: number
  min_advance_hours?: number
  cancel_before_hours?: number
  revenue_account_id?: string | null
  expense_account_id?: string | null
  cost_center_id?: string | null
  image_url?: string | null
  color_code?: string | null
  currency_code?: string
  is_bookable?: boolean
  requires_approval?: boolean
  notes?: string | null
}

export interface UpsertScheduleInput {
  day_of_week: number           // 0–6
  start_time: string            // HH:MM
  end_time: string              // HH:MM
  is_active?: boolean
}

export interface AddServiceStaffInput {
  employee_user_id: string
  is_primary?: boolean
}

// ── Query/Filter Types ───────────────────────────────────────────────────────

export interface ServiceListQuery {
  branch_id?: string
  service_type?: ServiceType
  category?: string
  is_active?: boolean
  is_bookable?: boolean
  search?: string
  page?: number
  limit?: number
}
