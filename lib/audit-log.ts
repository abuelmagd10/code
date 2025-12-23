/**
 * Audit Log Helper Functions
 * تسجيل جميع التعديلات على القيود والمستندات
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface AuditLogEntry {
  company_id: string
  user_id: string
  user_email?: string
  user_name?: string
  action: "create" | "update" | "delete" | "void" | "reverse"
  target_table: string
  record_id: string
  record_identifier?: string // e.g., INV-001, BILL-002
  old_data?: Record<string, any>
  new_data?: Record<string, any>
  changed_fields?: string[]
  reason?: string
  parent_record_id?: string
}

/**
 * تحويل action من lowercase إلى uppercase للتوافق مع قاعدة البيانات
 */
function normalizeAction(action: string): string {
  const actionMap: Record<string, string> = {
    'create': 'INSERT',
    'update': 'UPDATE',
    'delete': 'DELETE',
    'void': 'DELETE',
    'reverse': 'REVERT'
  }
  return actionMap[action.toLowerCase()] || action.toUpperCase()
}

/**
 * تسجيل حدث في سجل الأحداث
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  entry: AuditLogEntry
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      company_id: entry.company_id,
      user_id: entry.user_id,
      user_email: entry.user_email,
      user_name: entry.user_name,
      action: normalizeAction(entry.action),
      target_table: entry.target_table,
      record_id: entry.record_id,
      record_identifier: entry.record_identifier,
      old_data: entry.old_data,
      new_data: entry.new_data,
      changed_fields: entry.changed_fields,
      reason: entry.reason,
      parent_record_id: entry.parent_record_id,
    })

    if (error) throw error
    return { success: true }
  } catch (err: any) {
    console.error("Failed to log audit event:", err)
    return { success: false, error: err?.message }
  }
}

/**
 * تسجيل تعديل قيد يومي
 */
export async function logJournalEntryEdit(
  supabase: SupabaseClient,
  params: {
    companyId: string
    userId: string
    userEmail?: string
    userName?: string
    journalEntryId: string
    referenceNumber?: string
    oldLines: Array<{ account_id: string; debit_amount: number; credit_amount: number }>
    newLines: Array<{ account_id: string; debit_amount: number; credit_amount: number }>
    reason: string
    referenceType?: string
    referenceId?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const oldTotal = params.oldLines.reduce((sum, l) => sum + (l.debit_amount || 0), 0)
  const newTotal = params.newLines.reduce((sum, l) => sum + (l.debit_amount || 0), 0)

  return logAuditEvent(supabase, {
    company_id: params.companyId,
    user_id: params.userId,
    user_email: params.userEmail,
    user_name: params.userName,
    action: "update",
    target_table: "journal_entries",
    record_id: params.journalEntryId,
    record_identifier: params.referenceNumber,
    old_data: {
      lines: params.oldLines,
      total: oldTotal,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
    },
    new_data: {
      lines: params.newLines,
      total: newTotal,
    },
    changed_fields: ["journal_entry_lines", "total_amount"],
    reason: params.reason,
    parent_record_id: params.referenceId,
  })
}

/**
 * تسجيل حذف قيد يومي
 */
export async function logJournalEntryDelete(
  supabase: SupabaseClient,
  params: {
    companyId: string
    userId: string
    userEmail?: string
    userName?: string
    journalEntryId: string
    referenceNumber?: string
    deletedLines: Array<{ account_id: string; debit_amount: number; credit_amount: number }>
    reason: string
    referenceType?: string
    referenceId?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const total = params.deletedLines.reduce((sum, l) => sum + (l.debit_amount || 0), 0)

  return logAuditEvent(supabase, {
    company_id: params.companyId,
    user_id: params.userId,
    user_email: params.userEmail,
    user_name: params.userName,
    action: "delete",
    target_table: "journal_entries",
    record_id: params.journalEntryId,
    record_identifier: params.referenceNumber,
    old_data: {
      lines: params.deletedLines,
      total,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
    },
    reason: params.reason,
    parent_record_id: params.referenceId,
  })
}

/**
 * تسجيل عملية عامة (للنسخ الاحتياطي وغيرها)
 * Simple wrapper for general audit logging
 */
export async function logAudit(params: {
  company_id: string
  user_id: string
  action: string
  target_table: string
  target_id: string
  description?: string
  metadata?: Record<string, any>
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: params.action,
        companyId: params.company_id,
        userId: params.user_id,
        targetTable: params.target_table,
        recordId: params.target_id,
        recordIdentifier: params.description,
        newData: params.metadata
      })
    })

    if (!response.ok) {
      throw new Error('Failed to log audit event')
    }

    return { success: true }
  } catch (err: any) {
    console.error('Failed to log audit event:', err)
    return { success: false, error: err?.message }
  }
}

// Reference types that indicate the journal entry is linked to a document
export const DOCUMENT_LINKED_REFERENCE_TYPES = [
  "invoice",
  "invoice_payment",
  "invoice_cogs",
  "invoice_reversal",
  "invoice_cogs_reversal",
  "invoice_inventory_reversal",
  "bill",
  "bill_payment",
  "bill_reversal",
  "purchase_return",
  "purchase_return_refund",
  "sale_return",
  "sale_return_refund",
  "vendor_credit",
  "vendor_credit_application",
  "supplier_payment",
  "customer_payment",
  "inventory_write_off",
  "credit_note",
]

/**
 * التحقق مما إذا كان القيد مرتبطاً بمستند
 */
export function isDocumentLinkedEntry(referenceType: string | null | undefined): boolean {
  if (!referenceType) return false
  return DOCUMENT_LINKED_REFERENCE_TYPES.includes(referenceType)
}

/**
 * التحقق من أن المستخدم هو المالك
 */
export async function isOwner(supabase: SupabaseClient, companyId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    // التحقق من أن المستخدم هو مالك الشركة
    const { data: company } = await supabase
      .from("companies")
      .select("user_id")
      .eq("id", companyId)
      .single()

    if (company?.user_id === user.id) return true

    // التحقق من company_members
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    return member?.role === "owner"
  } catch {
    return false
  }
}

/**
 * الحصول على معلومات المستخدم الحالي
 */
export async function getCurrentUserInfo(supabase: SupabaseClient): Promise<{
  userId: string
  email: string
  name: string
  role: string
} | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    return {
      userId: user.id,
      email: user.email || "",
      name: user.user_metadata?.full_name || user.email || "",
      role: user.user_metadata?.role || "user"
    }
  } catch {
    return null
  }
}

