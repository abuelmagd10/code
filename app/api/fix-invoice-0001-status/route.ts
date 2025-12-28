// ============================================================================
// API Route لإصلاح حالة الفاتورة INV-0001 بعد المرتجع الكامل
// API Route to fix invoice INV-0001 status after full return
// ============================================================================

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // الحصول على شركة FOODCAN
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('name', '%foodcan%')
      .limit(1)
      .single()
    
    if (companyError || !companies) {
      return NextResponse.json({
        success: false,
        error: 'لم يتم العثور على شركة FOODCAN'
      }, { status: 404 })
    }
    
    const companyId = companies.id
    
    // البحث عن الفاتورة INV-0001
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('id, invoice_number, customer_id, total_amount, paid_amount, returned_amount, status, return_status')
      .eq('company_id', companyId)
      .eq('invoice_number', 'INV-0001')
      .single()
    
    if (invError || !invoice) {
      return NextResponse.json({
        success: false,
        error: 'لم يتم العثور على الفاتورة INV-0001'
      }, { status: 404 })
    }
    
    // حساب الإجمالي الأصلي من قيد الفاتورة
    const { data: invoiceEntry } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('reference_id', invoice.id)
      .eq('reference_type', 'invoice')
      .single()
    
    let originalTotal = parseFloat(invoice.total_amount || 0)
    if (invoiceEntry) {
      const { data: arAccount } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('company_id', companyId)
        .eq('sub_type', 'accounts_receivable')
        .eq('is_active', true)
        .limit(1)
        .single()
      
      if (arAccount) {
        const { data: arLines } = await supabase
          .from('journal_entry_lines')
          .select('debit_amount')
          .eq('journal_entry_id', invoiceEntry.id)
          .eq('account_id', arAccount.id)
          .single()
        
        if (arLines) {
          originalTotal = parseFloat(arLines.debit_amount || 0)
        }
      }
    }
    
    // حساب إجمالي المرتجعات من القيود
    const { data: allReturnEntries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)
      .eq('reference_id', invoice.id)
      .eq('reference_type', 'sales_return')
    
    let totalReturned = 0
    if (allReturnEntries && allReturnEntries.length > 0) {
      const { data: arAccount } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('company_id', companyId)
        .eq('sub_type', 'accounts_receivable')
        .eq('is_active', true)
        .limit(1)
        .single()
      
      if (arAccount) {
        for (const entry of allReturnEntries) {
          const { data: arLines } = await supabase
            .from('journal_entry_lines')
            .select('credit_amount')
            .eq('journal_entry_id', entry.id)
            .eq('account_id', arAccount.id)
            .single()
          
          if (arLines) {
            totalReturned += parseFloat(arLines.credit_amount || 0)
          }
        }
      }
    }
    
    // حساب القيم الصحيحة
    const newTotal = Math.max(0, originalTotal - totalReturned)
    const newPaid = Math.min(parseFloat(invoice.paid_amount || 0), newTotal)
    const newReturned = totalReturned
    const newStatus = newTotal === 0 ? 'fully_returned' : (totalReturned > 0 ? 'partially_returned' : invoice.status)
    const returnStatus = newTotal === 0 ? 'full' : 'partial'
    
    // محاولة استخدام RPC function أولاً
    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_invoice_after_return', {
      p_invoice_id: invoice.id,
      p_returned_amount: newReturned,
      p_return_status: returnStatus,
      p_new_status: newStatus,
      p_notes: `[${new Date().toISOString().slice(0, 10)}] تم تحديث حالة المرتجع - إجمالي المرتجعات: ${newReturned.toFixed(2)} £`
    })
    
    let updateSuccess = false
    
    if (!rpcError && rpcResult && rpcResult.success) {
      // RPC نجح لكنه لا يحدث total_amount و paid_amount
      // نحتاج تحديث إضافي لهذه الحقول
      const { error: additionalUpdateError } = await supabase
        .from('invoices')
        .update({
          total_amount: newTotal,
          paid_amount: newPaid
        })
        .eq('id', invoice.id)
      
      if (!additionalUpdateError) {
        updateSuccess = true
      }
    }
    
    if (!updateSuccess) {
      // إذا فشل RPC، حاول التحديث المباشر (قد يفشل بسبب قيود)
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          total_amount: newTotal,
          paid_amount: newPaid,
          returned_amount: newReturned,
          status: newStatus,
          return_status: returnStatus
        })
        .eq('id', invoice.id)
      
      if (updateError) {
        // إذا فشل التحديث المباشر، حاول استخدام RPC فقط
        const { data: rpcResult2, error: rpcError2 } = await supabase.rpc('update_invoice_after_return', {
          p_invoice_id: invoice.id,
          p_returned_amount: newReturned,
          p_return_status: returnStatus,
          p_new_status: newStatus,
          p_notes: `[${new Date().toISOString().slice(0, 10)}] تم تحديث حالة المرتجع - إجمالي المرتجعات: ${newReturned.toFixed(2)} £`
        })
        
        if (rpcError2 || (rpcResult2 && !rpcResult2.success)) {
          return NextResponse.json({
            success: false,
            error: `فشل تحديث الفاتورة: ${updateError.message}`,
            rpcError: rpcError2?.message || (rpcResult2 && !rpcResult2.success ? rpcResult2.error : null),
            details: {
              originalTotal,
              totalReturned,
              newTotal,
              newPaid,
              newReturned,
              newStatus,
              returnStatus
            },
            note: 'قد تحتاج لتحديث الفاتورة يدوياً أو استخدام SQL مباشرة'
          }, { status: 500 })
        }
      } else {
        updateSuccess = true
      }
    }
    
    // التحقق من رصيد العميل الدائن
    const { data: credits } = await supabase
      .from('customer_credits')
      .select('id, credit_number, amount, used_amount')
      .eq('company_id', companyId)
      .eq('customer_id', invoice.customer_id)
      .eq('reference_type', 'invoice_return')
      .eq('reference_id', invoice.id)
      .eq('status', 'active')
    
    const totalCredit = credits ? credits.reduce((sum, c) => sum + (parseFloat(c.amount || 0) - parseFloat(c.used_amount || 0)), 0) : 0
    const expectedCredit = Math.min(parseFloat(invoice.paid_amount || 0), totalReturned)
    
    return NextResponse.json({
      success: true,
      message: 'تم تحديث الفاتورة بنجاح',
      data: {
        invoice: {
          invoice_number: invoice.invoice_number,
          originalTotal,
          totalReturned,
          newTotal,
          newPaid,
          newReturned,
          newStatus,
          returnStatus
        },
        customerCredit: {
          current: totalCredit,
          expected: expectedCredit,
          difference: totalCredit - expectedCredit
        }
      }
    })
    
  } catch (error: any) {
    console.error('❌ Error fixing invoice status:', error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطأ غير معروف'
    }, { status: 500 })
  }
}

