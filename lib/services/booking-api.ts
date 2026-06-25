/**
 * Services & Booking Module — API Helpers
 *
 * Zod validation schemas, error mapping, and shared utilities for all
 * /api/services/** and /api/bookings/** routes.
 *
 * Pattern mirrors lib/manufacturing/bom-api.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z, type ZodTypeAny } from 'zod'

// ── Primitives ───────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid('Invalid UUID format')

const trimmedString = z.string().trim()

const nullableString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null) return null
    const s = v.trim()
    return s.length > 0 ? s : null
  })

const isoDateString = z
  .string()
  .trim()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)), {
    message: 'Date must be YYYY-MM-DD',
  })

const timeString = z
  .string()
  .trim()
  .refine((v) => /^\d{2}:\d{2}(:\d{2})?$/.test(v), {
    message: 'Time must be HH:MM or HH:MM:SS',
  })

// ── Service Schemas ──────────────────────────────────────────────────────────

export const SERVICE_TYPE_VALUES = [
  'individual',
  'group',
  'hourly',
  'session',
  'daily',
] as const

// NOTE: service_name, unit_price, cost_price, revenue_account_id,
// expense_account_id are intentionally NOT in these schemas. They are
// inherited from the linked product (`products.id` where item_type='service')
// by a database trigger. Any value supplied for them would be silently
// overwritten — so we reject them at the validation layer to surface
// misuse early.
export const createServiceSchema = z.object({
  branch_id: uuidSchema.optional().nullable(),
  product_catalog_id: uuidSchema, // REQUIRED — source of truth
  service_type: z.enum(SERVICE_TYPE_VALUES).default('individual'),
  duration_minutes: z.coerce.number().int().positive('duration_minutes must be > 0'),
  description: nullableString.optional(),
  category: nullableString.optional(),
  tax_rate: z.coerce.number().min(0).max(100).optional().default(0),
  commission_rate: z.coerce.number().min(0).max(100).optional().default(0),
  capacity: z.coerce.number().int().positive().optional().default(1),
  buffer_minutes: z.coerce.number().int().nonnegative().optional().default(0),
  advance_booking_days: z.coerce.number().int().positive().optional().default(30),
  min_advance_hours: z.coerce.number().int().nonnegative().optional().default(1),
  cancel_before_hours: z.coerce.number().int().nonnegative().optional().default(24),
  cost_center_id: uuidSchema.optional().nullable(),
  image_url: nullableString.optional(),
  color_code: nullableString.optional(),
  currency_code: trimmedString.optional().default('EGP'),
  is_bookable: z.boolean().optional().default(true),
  requires_approval: z.boolean().optional().default(false),
  notes: nullableString.optional(),
})

export const updateServiceSchema = z
  .object({
    // v3.74.320 — allow editing the branch (or clearing it to NULL
    // for "shared across all branches"). Company-scope roles only
    // — the API guards the actual permission.
    branch_id: uuidSchema.optional().nullable(),
    service_type: z.enum(SERVICE_TYPE_VALUES).optional(),
    duration_minutes: z.coerce.number().int().positive().optional(),
    description: nullableString.optional(),
    category: nullableString.optional(),
    tax_rate: z.coerce.number().min(0).max(100).optional(),
    commission_rate: z.coerce.number().min(0).max(100).optional(),
    capacity: z.coerce.number().int().positive().optional(),
    buffer_minutes: z.coerce.number().int().nonnegative().optional(),
    advance_booking_days: z.coerce.number().int().positive().optional(),
    min_advance_hours: z.coerce.number().int().nonnegative().optional(),
    cancel_before_hours: z.coerce.number().int().nonnegative().optional(),
    cost_center_id: uuidSchema.optional().nullable(),
    product_catalog_id: uuidSchema.optional(), // can change the link, not clear it
    image_url: nullableString.optional(),
    color_code: nullableString.optional(),
    currency_code: trimmedString.optional(),
    is_bookable: z.boolean().optional(),
    requires_approval: z.boolean().optional(),
    notes: nullableString.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  })

export const upsertScheduleSchema = z
  .object({
    day_of_week: z.coerce.number().int().min(0).max(6),
    start_time: timeString,
    end_time: timeString,
    is_active: z.boolean().optional().default(true),
  })
  // v3.74.355 — Treat end_time "00:00" as midnight at the end of the
  // day (24:00). Without this, a perfectly valid evening shift like
  // 18:00 → 00:00 was rejected here by the server with a 422 even
  // though the editor and the submit-time gate accept it (v3.74.354).
  // <input type="time"> cannot represent 24:00 so "00:00" is the
  // canonical encoding for end-of-day.
  .refine(
    (d) => d.end_time === '00:00' || d.end_time > d.start_time,
    {
      message:
        'وقت الانتهاء يجب أن يكون بعد وقت البداية (أو 00:00 لنهاية اليوم) (end_time must be after start_time, or "00:00" for end-of-day)',
      path: ['end_time'],
    },
  )

export const upsertSchedulesSchema = z.object({
  schedules: z.array(upsertScheduleSchema).min(1, 'At least one schedule required'),
})

export const addServiceStaffSchema = z.object({
  employee_user_id: uuidSchema,
  is_primary: z.boolean().optional().default(false),
})

// ── Booking Schemas ──────────────────────────────────────────────────────────

export const BOOKING_SOURCE_VALUES = [
  'manual',
  'online',
  'walk_in',
  'phone',
] as const

export const PAYMENT_METHOD_VALUES = [
  'cash',
  'card',
  'transfer',
  'other',
] as const

export const BOOKING_STATUS_VALUES = [
  'draft',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const

export const createBookingSchema = z.object({
  branch_id: uuidSchema.optional().nullable(),
  service_id: uuidSchema,
  customer_id: uuidSchema,
  booking_date: isoDateString,
  start_time: timeString,
  quantity: z.coerce.number().positive().optional().default(1),
  // v3.74.361 — staff_user_id is kept for backward compatibility but
  // staff_user_ids (array) is the new canonical input. If both are
  // sent, the array wins. Empty array / NULL = "open to every staff
  // member linked to the service".
  staff_user_id: uuidSchema.optional().nullable(),
  staff_user_ids: z.array(uuidSchema).optional().nullable(),
  discount_amount: z.coerce.number().nonnegative().optional().default(0),
  booking_source: z.enum(BOOKING_SOURCE_VALUES).optional().default('manual'),
  notes: nullableString.optional(),
  cost_center_id: uuidSchema.optional().nullable(),
  skip_schedule_check: z.boolean().optional().default(false),
})

export const addPaymentSchema = z.object({
  amount: z.coerce.number().positive('amount must be > 0'),
  payment_method: z.enum(PAYMENT_METHOD_VALUES).optional().default('cash'),
  payment_date: isoDateString.optional(),
  reference_no: nullableString.optional(),
  notes: nullableString.optional(),
})

export const cancelBookingSchema = z.object({
  cancellation_reason: nullableString.optional(),
})

export const rateBookingSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  feedback: nullableString.optional(),
})

export const completeBookingSchema = z.object({
  invoice_date: isoDateString.optional(),
  due_date: isoDateString.optional(),
  notes: nullableString.optional(),
})

// ── Inferred Types ────────────────────────────────────────────────────────────

export type CreateServiceInput   = z.infer<typeof createServiceSchema>
export type UpdateServiceInput   = z.infer<typeof updateServiceSchema>
export type UpsertSchedulesInput = z.infer<typeof upsertSchedulesSchema>
export type AddServiceStaffInput = z.infer<typeof addServiceStaffSchema>
export type CreateBookingInput   = z.infer<typeof createBookingSchema>
export type AddPaymentInput      = z.infer<typeof addPaymentSchema>
export type CancelBookingInput   = z.infer<typeof cancelBookingSchema>
export type RateBookingInput     = z.infer<typeof rateBookingSchema>
export type CompleteBookingInput = z.infer<typeof completeBookingSchema>

// ── Custom Error ─────────────────────────────────────────────────────────────

export class BookingApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'BookingApiError'
  }
}

// ── DB Error Mapper ──────────────────────────────────────────────────────────

function mapBookingDbError(error: any): BookingApiError | null {
  const code = String(error?.code || '')
  const text = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')

  if (code === '23505') {
    return new BookingApiError(409, 'رمز الخدمة أو الحجز مكرر، يرجى المحاولة مجدداً', {
      code: 'DUPLICATE_CODE',
    })
  }

  if (code === 'P0001') {
    // Status transitions
    if (text.includes('Invalid booking status transition')) {
      return new BookingApiError(409, 'تغيير الحالة غير مسموح به في الوضع الحالي للحجز', {
        code: 'INVALID_STATUS_TRANSITION',
      })
    }
    if (text.includes('Cannot modify a')) {
      return new BookingApiError(409, 'لا يمكن تعديل حجز في حالة نهائية (مكتمل/ملغى)', {
        code: 'TERMINAL_BOOKING',
      })
    }
    // Conflict checks
    if (text.includes('already has') && text.includes('overlapping booking')) {
      return new BookingApiError(409, 'الموظف لديه حجز آخر في نفس الوقت، اختر وقتاً آخر', {
        code: 'STAFF_DOUBLE_BOOKING',
      })
    }
    if (text.includes('capacity exceeded')) {
      return new BookingApiError(409, 'الطاقة الاستيعابية للخدمة ممتلئة في هذا الوقت', {
        code: 'CAPACITY_EXCEEDED',
      })
    }
    if (text.includes('outside service working hours')) {
      return new BookingApiError(400, 'وقت الحجز خارج أوقات العمل المحددة للخدمة', {
        code: 'OUTSIDE_WORKING_HOURS',
      })
    }
    if (text.includes('at least') && text.includes('hour') && text.includes('advance')) {
      return new BookingApiError(400, 'الحجز يجب أن يكون قبل الموعد بساعات كافية', {
        code: 'MIN_ADVANCE_HOURS',
      })
    }
    if (text.includes('more than') && text.includes('day') && text.includes('advance')) {
      return new BookingApiError(400, 'لا يمكن الحجز بأكثر من الحد الأقصى من الأيام مسبقاً', {
        code: 'MAX_ADVANCE_DAYS',
      })
    }
    if (text.includes('not bookable')) {
      return new BookingApiError(400, 'هذه الخدمة غير متاحة للحجز حالياً', {
        code: 'SERVICE_NOT_BOOKABLE',
      })
    }
    if (text.includes('not found or not accessible')) {
      return new BookingApiError(404, 'الحجز غير موجود أو غير مصرح بالوصول إليه', {
        code: 'BOOKING_NOT_FOUND',
      })
    }
    // Fallback P0001
    return new BookingApiError(400, text || 'خطأ في قاعدة البيانات', { code: 'DB_RULE_VIOLATION' })
  }

  return null
}

export function handleBookingApiError(error: unknown): NextResponse {
  if (error instanceof BookingApiError) {
    return NextResponse.json(
      { success: false, error: error.message, details: error.details ?? null },
      { status: error.status }
    )
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { success: false, error: 'بيانات غير صالحة', details: error.flatten() },
      { status: 422 }
    )
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const mapped = mapBookingDbError(error)
    if (mapped) {
      return NextResponse.json(
        { success: false, error: mapped.message, details: mapped.details ?? null },
        { status: mapped.status }
      )
    }
    console.error('[BOOKING_API_ERROR]', error)
    return NextResponse.json(
      { success: false, error: 'حدث خطأ داخلي في الخادم', details: null },
      { status: 500 }
    )
  }

  console.error('[BOOKING_API_UNHANDLED]', error)
  return NextResponse.json(
    { success: false, error: 'حدث خطأ غير متوقع', details: null },
    { status: 500 }
  )
}

// ── Body Parser ───────────────────────────────────────────────────────────────

export async function parseJsonBody<T extends ZodTypeAny>(
  request: NextRequest,
  schema: T
): Promise<z.infer<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new BookingApiError(400, 'Request body must be valid JSON')
  }
  return schema.parse(body)
}

export async function parseOptionalJsonBody<T extends ZodTypeAny>(
  request: NextRequest,
  schema: T
): Promise<z.infer<T>> {
  const raw = await request.text()
  if (!raw.trim()) return schema.parse({})
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new BookingApiError(400, 'Request body must be valid JSON')
  }
  return schema.parse(body)
}

// ── Pagination Helper ─────────────────────────────────────────────────────────

export function parsePagination(searchParams: URLSearchParams) {
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))
  const from  = (page - 1) * limit
  const to    = from + limit - 1
  return { page, limit, from, to }
}
