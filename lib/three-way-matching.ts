/**
 * 🔍 Three-Way Matching Helper Functions
 * دوال مساعدة للمطابقة الثلاثية بين PO / GRN / Invoice
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MatchingException {
  id: string
  company_id: string
  purchase_order_id?: string | null
  goods_receipt_id?: string | null
  bill_id?: string | null
  exception_type: 'quantity_mismatch' | 'price_mismatch' | 'missing_grn' | 'missing_po' | 'over_receipt' | 'under_receipt'
  product_id?: string | null
  po_quantity?: number | null
  grn_quantity?: number | null
  bill_quantity?: number | null
  po_price?: number | null
  bill_price?: number | null
  status: 'pending' | 'resolved' | 'approved' | 'rejected'
  resolved: boolean
  resolved_by?: string | null
  resolved_at?: string | null
  resolution_notes?: string | null
  description?: string | null
  severity: 'info' | 'warning' | 'error'
  created_at: string
  updated_at: string
}

export interface QuantityMismatch {
  productId: string
  productName: string
  billQty: number
  grnQty: number
  difference: number
}

export interface ValidateBillMatchingResult {
  success: boolean
  hasExceptions: boolean
  exceptions: MatchingException[]
  errors?: string[]
}

export interface CheckBillQuantitiesResult {
  valid: boolean
  mismatches: QuantityMismatch[]
  mismatchCount: number
}

/**
 * Validate three-way matching for a bill
 * التحقق من المطابقة الثلاثية لفاتورة
 */
export async function validateBillMatching(
  supabase: SupabaseClient,
  billId: string,
  companyId: string
): Promise<ValidateBillMatchingResult> {
  try {
    const { data, error } = await supabase.rpc('validate_three_way_matching', {
      p_bill_id: billId,
      p_company_id: companyId
    })

    if (error) {
      console.error('Error validating three-way matching:', error)
      return {
        success: false,
        hasExceptions: false,
        exceptions: [],
        errors: [error.message]
      }
    }

    const result = data as {
      success: boolean
      has_exceptions: boolean
      exceptions: any[]
      exceptions_count: number
    }

    // Fetch full exception details
    const exceptionIds = result.exceptions?.map((e: any) => e.id) || []
    let exceptions: MatchingException[] = []

    if (exceptionIds.length > 0) {
      const { data: exceptionData, error: exceptionError } = await supabase
        .from('matching_exceptions')
        .select('*')
        .in('id', exceptionIds)
        .eq('company_id', companyId)

      if (!exceptionError && exceptionData) {
        exceptions = exceptionData as MatchingException[]
      }
    }

    return {
      success: result.success,
      hasExceptions: result.has_exceptions || false,
      exceptions,
      errors: result.success ? undefined : ['Validation failed']
    }
  } catch (error: any) {
    console.error('Exception validating three-way matching:', error)
    return {
      success: false,
      hasExceptions: false,
      exceptions: [],
      errors: [error.message || 'Unknown error']
    }
  }
}

/**
 * Check if bill quantities are within GRN accepted quantities
 * التحقق من أن كميات الفاتورة ضمن الكميات المقبولة في GRN
 */
export async function checkBillQuantities(
  supabase: SupabaseClient,
  billId: string,
  grnId: string | null,
  companyId: string
): Promise<CheckBillQuantitiesResult> {
  try {
    if (!grnId) {
      return {
        valid: true,
        mismatches: [],
        mismatchCount: 0
      }
    }

    const { data, error } = await supabase.rpc('check_bill_quantities', {
      p_bill_id: billId,
      p_grn_id: grnId,
      p_company_id: companyId
    })

    if (error) {
      console.error('Error checking bill quantities:', error)
      return {
        valid: false,
        mismatches: [],
        mismatchCount: 0
      }
    }

    const result = data as {
      valid: boolean
      mismatches: QuantityMismatch[]
      mismatch_count: number
    }

    return {
      valid: result.valid || false,
      mismatches: result.mismatches || [],
      mismatchCount: result.mismatch_count || 0
    }
  } catch (error: any) {
    console.error('Exception checking bill quantities:', error)
    return {
      valid: false,
      mismatches: [],
      mismatchCount: 0
    }
  }
}

/**
 * Get all matching exceptions for a bill
 * الحصول على جميع استثناءات المطابقة لفاتورة
 */
export async function getBillMatchingExceptions(
  supabase: SupabaseClient,
  billId: string,
  companyId: string
): Promise<MatchingException[]> {
  try {
    const { data, error } = await supabase
      .from('matching_exceptions')
      .select('*')
      .eq('bill_id', billId)
      .eq('company_id', companyId)
      .eq('resolved', false)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching matching exceptions:', error)
      return []
    }

    return (data || []) as MatchingException[]
  } catch (error: any) {
    console.error('Exception fetching matching exceptions:', error)
    return []
  }
}

/**
 * Resolve a matching exception
 * حل استثناء مطابقة
 */
export async function resolveMatchingException(
  supabase: SupabaseClient,
  exceptionId: string,
  companyId: string,
  userId: string,
  resolutionNotes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('matching_exceptions')
      .update({
        resolved: true,
        status: 'resolved',
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        resolution_notes: resolutionNotes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', exceptionId)
      .eq('company_id', companyId)

    if (error) {
      console.error('Error resolving matching exception:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Exception resolving matching exception:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get matching status summary for a bill
 * الحصول على ملخص حالة المطابقة لفاتورة
 */
export async function getBillMatchingStatus(
  supabase: SupabaseClient,
  billId: string,
  companyId: string
): Promise<{
  status: 'matched' | 'warnings' | 'errors' | 'unknown'
  exceptionCount: number
  errorCount: number
  warningCount: number
}> {
  try {
    const exceptions = await getBillMatchingExceptions(supabase, billId, companyId)

    const errorCount = exceptions.filter(e => e.severity === 'error').length
    const warningCount = exceptions.filter(e => e.severity === 'warning').length

    let status: 'matched' | 'warnings' | 'errors' | 'unknown' = 'matched'
    if (errorCount > 0) {
      status = 'errors'
    } else if (warningCount > 0) {
      status = 'warnings'
    }

    return {
      status,
      exceptionCount: exceptions.length,
      errorCount,
      warningCount
    }
  } catch (error: any) {
    console.error('Exception getting matching status:', error)
    return {
      status: 'unknown',
      exceptionCount: 0,
      errorCount: 0,
      warningCount: 0
    }
  }
}
