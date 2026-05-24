/**
 * Notification Preferences API - Phase K (v3.38.0)
 *
 * GET  /api/notifications/preferences
 *      Returns the current user's preferences as a complete matrix:
 *      { [category]: { in_app: boolean, email: boolean } }
 *      Categories the user hasn't set explicitly default to enabled=true.
 *
 * PUT  /api/notifications/preferences
 *      Bulk-update preferences. Accepts the same shape as GET returns.
 *      Service role upserts each cell. Only the caller's own row is touched.
 */

import { NextRequest } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { apiError, apiSuccess, internalError, HTTP_STATUS } from '@/lib/api-error-handler'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// All categories + channels we expose to the user
const CATEGORIES = ['billing', 'finance', 'sales', 'approvals', 'system', 'inventory', 'hr', 'manufacturing'] as const
const CHANNELS = ['in_app', 'email'] as const  // sms/push reserved for future

type Category = (typeof CATEGORIES)[number]
type Channel = (typeof CHANNELS)[number]

interface PreferencesMatrix {
  [category: string]: {
    [channel: string]: boolean
  }
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Builds a full matrix from sparse DB rows.
 * Missing rows default to enabled=true.
 */
function buildMatrix(
  rows: Array<{ category: string; channel: string; enabled: boolean }>
): PreferencesMatrix {
  const matrix: PreferencesMatrix = {}
  for (const cat of CATEGORIES) {
    matrix[cat] = {}
    for (const ch of CHANNELS) {
      matrix[cat][ch] = true  // default
    }
  }
  for (const r of rows) {
    if (matrix[r.category] && r.channel in matrix[r.category]) {
      matrix[r.category][r.channel] = r.enabled
    }
  }
  return matrix
}

// ─────────────────────────────────────────
// GET — read current preferences
// ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'لم يتم العثور على الشركة', 'company_not_found')
    }

    const admin = getAdmin()
    const { data, error: fetchErr } = await admin
      .from('user_notification_preferences')
      .select('category, channel, enabled')
      .eq('user_id', user.id)
      .eq('company_id', companyId)

    if (fetchErr) {
      return internalError('خطأ فى جلب التفضيلات', fetchErr.message)
    }

    const matrix = buildMatrix(data || [])
    return apiSuccess({
      categories: CATEGORIES,
      channels: CHANNELS,
      preferences: matrix,
    })
  } catch (e: any) {
    return internalError('خطأ فى جلب التفضيلات', e.message)
  }
}

// ─────────────────────────────────────────
// PUT — bulk update preferences
// Body: { preferences: { [category]: { [channel]: boolean } } }
// ─────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'لم يتم العثور على الشركة', 'company_not_found')
    }

    const body = await req.json()
    const incoming = body?.preferences as PreferencesMatrix | undefined
    if (!incoming || typeof incoming !== 'object') {
      return apiError(HTTP_STATUS.BAD_REQUEST, 'preferences object مطلوب', 'invalid_body')
    }

    const admin = getAdmin()

    // Build upsert rows — only for known categories/channels
    const rows: Array<{
      user_id: string
      company_id: string
      category: string
      channel: string
      enabled: boolean
    }> = []

    for (const cat of CATEGORIES) {
      const catPrefs = incoming[cat]
      if (!catPrefs || typeof catPrefs !== 'object') continue
      for (const ch of CHANNELS) {
        if (typeof catPrefs[ch] === 'boolean') {
          rows.push({
            user_id: user.id,
            company_id: companyId,
            category: cat,
            channel: ch,
            enabled: catPrefs[ch],
          })
        }
      }
    }

    if (rows.length === 0) {
      return apiError(HTTP_STATUS.BAD_REQUEST, 'لا توجد تفضيلات صالحة لتحديثها', 'no_valid_rows')
    }

    const { error: upsertErr } = await admin
      .from('user_notification_preferences')
      .upsert(rows, { onConflict: 'user_id,company_id,category,channel' })

    if (upsertErr) {
      return internalError('خطأ فى حفظ التفضيلات', upsertErr.message)
    }

    // Return the updated matrix
    const { data: updated } = await admin
      .from('user_notification_preferences')
      .select('category, channel, enabled')
      .eq('user_id', user.id)
      .eq('company_id', companyId)

    return apiSuccess({
      categories: CATEGORIES,
      channels: CHANNELS,
      preferences: buildMatrix(updated || []),
      updated_count: rows.length,
    })
  } catch (e: any) {
    return internalError('خطأ فى حفظ التفضيلات', e.message)
  }
}
