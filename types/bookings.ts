/**
 * Bookings Module — TypeScript Types
 * Mirrors the DB schema defined in Phase 1 migrations B7–B12.
 */

export type BookingStatus =
  | 'draft'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type BookingSource = 'manual' | 'online' | 'walk_in' | 'phone'
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other'

export interface Booking {
  id: string
  company_id: string
  branch_id: string
  cost_center_id: string | null

  booking_no: string
  service_id: string
  customer_id: string
  staff_user_id: string | null

  booking_date: string           // YYYY-MM-DD
  start_time: string             // HH:MM:SS
  end_time: string               // HH:MM:SS
  duration_minutes: number

  status: BookingStatus
  booking_source: BookingSource

  unit_price: number
  quantity: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  currency_code: string
  commission_amount: number

  payment_status: PaymentStatus
  paid_amount: number
  invoice_id: string | null

  rating: number | null          // 1–5
  feedback: string | null

  confirmed_at: string | null
  confirmed_by: string | null
  started_at: string | null
  started_by: string | null
  completed_at: string | null
  completed_by: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  reminder_sent: boolean
  notes: string | null

  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface BookingStatusHistory {
  id: string
  company_id: string
  booking_id: string
  old_status: BookingStatus | null
  new_status: BookingStatus
  changed_by: string | null
  reason: string | null
  changed_at: string
}

export interface BookingPayment {
  id: string
  company_id: string
  branch_id: string
  booking_id: string
  invoice_id: string | null
  amount: number
  payment_method: PaymentMethod
  payment_date: string
  reference_no: string | null
  notes: string | null
  created_by: string
  created_at: string
}

// ── Enriched View Type (v_bookings_full) ─────────────────────────────────────

export interface BookingFull extends Booking {
  branch_name: string | null
  service_code: string | null
  service_name: string | null
  service_type: string | null
  service_category: string | null
  service_color: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  staff_email: string | null
  outstanding_amount: number
  cost_center_name: string | null
}

// ── Input DTOs ───────────────────────────────────────────────────────────────

export interface CreateBookingInput {
  branch_id?: string | null
  service_id: string
  customer_id: string
  booking_date: string           // YYYY-MM-DD
  start_time: string             // HH:MM
  quantity?: number
  staff_user_id?: string | null
  discount_amount?: number
  booking_source?: BookingSource
  notes?: string | null
  cost_center_id?: string | null
  skip_schedule_check?: boolean
}

export interface AddPaymentInput {
  amount: number
  payment_method?: PaymentMethod
  payment_date?: string
  reference_no?: string | null
  notes?: string | null
}

export interface CancelBookingInput {
  cancellation_reason?: string | null
}

export interface RateBookingInput {
  rating: number                 // 1–5
  feedback?: string | null
}

export interface CompleteBookingInput {
  invoice_date?: string
  due_date?: string
  notes?: string | null
}

// ── Query/Filter Types ───────────────────────────────────────────────────────

export interface BookingListQuery {
  branch_id?: string
  service_id?: string
  customer_id?: string
  staff_user_id?: string
  status?: BookingStatus
  payment_status?: PaymentStatus
  date_from?: string             // YYYY-MM-DD
  date_to?: string               // YYYY-MM-DD
  search?: string
  page?: number
  limit?: number
}

export interface CalendarQuery {
  branch_id?: string
  service_id?: string
  staff_user_id?: string
  date_from: string              // YYYY-MM-DD
  date_to: string                // YYYY-MM-DD
}

export interface AvailabilityQuery {
  service_id: string
  date: string                   // YYYY-MM-DD
  staff_user_id?: string
}

export interface AvailableSlot {
  start_time: string             // HH:MM
  end_time: string               // HH:MM
  is_available: boolean
  available_capacity: number
  staff_available: boolean
}
