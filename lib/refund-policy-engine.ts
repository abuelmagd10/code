/**
 * 🔒 Refund Policy Engine
 * نظام سياسة الاسترداد مع الموافقات والحوكمة الكاملة
 */

import { createClient } from '@/lib/supabase/server'

export type RefundRequestStatus = 
  | 'pending'           // في انتظار الموافقة
  | 'branch_approved'   // موافقة مدير الفرع
  | 'finance_approved'  // موافقة المدير المالي
  | 'approved'          // موافقة نهائية
  | 'rejected'          // مرفوض
  | 'disbursed'         // تم الصرف
  | 'cancelled'         // ملغي

export type RefundSourceType = 
  | 'invoice'           // فاتورة
  | 'sales_return'      // مرتجع مبيعات
  | 'payment'           // دفعة

export interface RefundRequest {
  id: string
  company_id: string
  branch_id: string
  cost_center_id: string
  warehouse_id: string
  
  // المستند المرتبط
  source_type: RefundSourceType
  source_id: string
  source_number: string
  
  // تفاصيل الاسترداد
  requested_amount: number
  approved_amount?: number
  reason: string
  attachments?: string[]
  
  // الحالة والموافقات
  status: RefundRequestStatus
  requested_by: string
  requested_at: string
  
  branch_approved_by?: string
  branch_approved_at?: string
  
  finance_approved_by?: string
  finance_approved_at?: string
  
  final_approved_by?: string
  final_approved_at?: string
  
  rejected_by?: string
  rejected_at?: string
  rejection_reason?: string
  
  // سند الصرف
  disbursement_voucher_id?: string
  disbursed_by?: string
  disbursed_at?: string
  
  notes?: string
}

export interface ApprovalRule {
  min_amount: number
  max_amount: number
  required_approvers: ('branch_manager' | 'finance_manager' | 'gm' | 'owner')[]
}

export class RefundPolicyEngine {
  
  /**
   * قواعد الموافقة حسب المبلغ
   */
  private static APPROVAL_RULES: ApprovalRule[] = [
    {
      min_amount: 0,
      max_amount: 1000,
      required_approvers: ['branch_manager']
    },
    {
      min_amount: 1001,
      max_amount: 5000,
      required_approvers: ['branch_manager', 'finance_manager']
    },
    {
      min_amount: 5001,
      max_amount: Infinity,
      required_approvers: ['branch_manager', 'finance_manager', 'gm']
    }
  ]
  
  /**
   * التحقق من صلاحية طلب الاسترداد
   */
  static async validateRefundRequest(
    supabase: any,
    sourceType: RefundSourceType,
    sourceId: string,
    requestedAmount: number
  ): Promise<{ valid: boolean; error?: string; sourceData?: any }> {
    
    // 1. التحقق من وجود المستند الأصلي
    const { data: source, error: sourceError } = await supabase
      .from(sourceType === 'invoice' ? 'invoices' : 
            sourceType === 'sales_return' ? 'sales_returns' : 'payments')
      .select('*')
      .eq('id', sourceId)
      .single()
    
    if (sourceError || !source) {
      return { valid: false, error: 'المستند الأصلي غير موجود' }
    }
    
    // 2. التحقق من حالة المستند
    if (source.status === 'cancelled' || source.status === 'draft') {
      return { valid: false, error: 'لا يمكن الاسترداد من مستند ملغي أو مسودة' }
    }
    
    // 3. التحقق من عدم وجود طلب استرداد نشط
    const { data: existingRequest } = await supabase
      .from('refund_requests')
      .select('id, status')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .in('status', ['pending', 'branch_approved', 'finance_approved', 'approved'])
      .maybeSingle()
    
    if (existingRequest) {
      return { valid: false, error: 'يوجد طلب استرداد نشط لهذا المستند' }
    }
    
    // 4. التحقق من المبلغ
    const maxAmount = source.total_amount || source.amount || 0
    if (requestedAmount <= 0 || requestedAmount > maxAmount) {
      return { valid: false, error: 'المبلغ المطلوب غير صحيح' }
    }
    
    // 5. حساب المبلغ المسترد سابقاً
    const { data: previousRefunds } = await supabase
      .from('refund_requests')
      .select('approved_amount')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .eq('status', 'disbursed')
    
    const totalRefunded = previousRefunds?.reduce((sum: number, r: { approved_amount?: number | null }) => sum + (r.approved_amount || 0), 0) || 0
    const remainingAmount = maxAmount - totalRefunded
    
    if (requestedAmount > remainingAmount) {
      return { 
        valid: false, 
        error: `المبلغ المتبقي للاسترداد: ${remainingAmount}` 
      }
    }
    
    return { valid: true, sourceData: source }
  }
  
  /**
   * الحصول على قواعد الموافقة المطلوبة
   */
  static getRequiredApprovers(amount: number): string[] {
    const rule = this.APPROVAL_RULES.find(
      r => amount >= r.min_amount && amount <= r.max_amount
    )
    return rule?.required_approvers || []
  }
  
  /**
   * التحقق من صلاحية الموافقة
   */
  static async canApprove(
    supabase: any,
    userId: string,
    companyId: string,
    requestedAmount: number,
    currentStatus: RefundRequestStatus
  ): Promise<{ canApprove: boolean; nextStatus?: RefundRequestStatus; error?: string }> {
    
    // الحصول على دور المستخدم
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single()
    
    if (!member) {
      return { canApprove: false, error: 'المستخدم غير موجود' }
    }
    
    const role = member.role
    const requiredApprovers = this.getRequiredApprovers(requestedAmount)
    
    // تحديد الخطوة التالية حسب الحالة الحالية والدور
    if (currentStatus === 'pending') {
      if (role === 'manager' && requiredApprovers.includes('branch_manager')) {
        return { canApprove: true, nextStatus: 'branch_approved' }
      }
    }
    
    if (currentStatus === 'branch_approved') {
      if (role === 'accountant' && requiredApprovers.includes('finance_manager')) {
        return { canApprove: true, nextStatus: 'finance_approved' }
      }
    }
    
    if (currentStatus === 'finance_approved' || 
        (currentStatus === 'branch_approved' && !requiredApprovers.includes('finance_manager'))) {
      if ((role === 'general_manager' || role === 'admin') && requiredApprovers.includes('gm')) {
        return { canApprove: true, nextStatus: 'approved' }
      }
    }
    
    // إذا لم يكن هناك موافق آخر مطلوب
    if (currentStatus === 'branch_approved' && requiredApprovers.length === 1) {
      return { canApprove: true, nextStatus: 'approved' }
    }
    
    return { canApprove: false, error: 'ليس لديك صلاحية الموافقة في هذه المرحلة' }
  }
  
  /**
   * منع إنشاء سند صرف مكرر
   */
  static async preventDuplicateDisbursement(
    supabase: any,
    refundRequestId: string
  ): Promise<{ allowed: boolean; error?: string }> {
    
    const { data: request } = await supabase
      .from('refund_requests')
      .select('disbursement_voucher_id, status')
      .eq('id', refundRequestId)
      .single()
    
    if (!request) {
      return { allowed: false, error: 'طلب الاسترداد غير موجود' }
    }
    
    if (request.status !== 'approved') {
      return { allowed: false, error: 'الطلب غير مصرح به' }
    }
    
    if (request.disbursement_voucher_id) {
      return { allowed: false, error: 'تم إصدار سند صرف مسبقاً' }
    }
    
    return { allowed: true }
  }
  
  /**
   * التحقق من إمكانية إعادة فتح الطلب
   */
  static async canReopenRequest(
    supabase: any,
    userId: string,
    companyId: string,
    refundRequestId: string
  ): Promise<{ canReopen: boolean; error?: string }> {
    
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single()
    
    if (!member || !['admin', 'general_manager'].includes(member.role)) {
      return { canReopen: false, error: 'فقط المدير العام يمكنه إعادة فتح الطلب' }
    }
    
    const { data: request } = await supabase
      .from('refund_requests')
      .select('status, disbursement_voucher_id')
      .eq('id', refundRequestId)
      .single()
    
    if (!request) {
      return { canReopen: false, error: 'الطلب غير موجود' }
    }
    
    if (request.status === 'disbursed') {
      return { canReopen: false, error: 'لا يمكن إعادة فتح طلب تم صرفه' }
    }
    
    if (request.disbursement_voucher_id) {
      return { canReopen: false, error: 'يجب حذف سند الصرف أولاً' }
    }
    
    return { canReopen: true }
  }
  
  /**
   * إنشاء سجل تدقيق
   */
  static async createAuditLog(
    supabase: any,
    refundRequestId: string,
    action: string,
    userId: string,
    details: any
  ): Promise<void> {
    // v3.74.878 — دالةٌ اسمها `createAuditLog` كانت **لا تتحقّق أنها
    // أنشأت شيئاً**. فشلُ التسجيل لا يُبطل الاسترداد، لكنه لا يصمت.
    const { error } = await supabase
      .from('refund_audit_logs')
      .insert({
        refund_request_id: refundRequestId,
        action,
        user_id: userId,
        details,
        created_at: new Date().toISOString()
      })

    if (error) {
      console.error(
        `REFUND_AUDIT_LOG_FAILED: refund ${refundRequestId} action=${action} ` +
        `user=${userId} — ${error.message}`
      )
    }
  }
}
