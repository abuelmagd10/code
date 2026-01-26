/**
 * API Endpoint: اعتماد إهلاك المخزون (Inventory Write-off Approval)
 * =====================================================
 * 
 * المتطلبات:
 * - ✅ الاعتماد فقط من Admin أو Owner
 * - ✅ استخدام FIFO Engine لحساب COGS
 * - ✅ إنشاء COGS Transactions مع source_type = 'depreciation'
 * - ✅ استخدام محرك الاعتماد (Accrual Accounting Engine) لتسجيل القيود
 * - ✅ الحوكمة الكاملة: branch_id, warehouse_id, cost_center_id
 * - ✅ تحديث رصيد المخزون الفعلي
 */

import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'
import { NextRequest, NextResponse } from 'next/server'
import { createWriteOffJournal } from '@/lib/accrual-accounting-engine'
import { consumeFIFOLotsWithCOGS } from '@/lib/fifo-engine'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 400 }
      )
    }

    // الحصول على المستخدم الحالي
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 🔐 التحقق من الصلاحيات: Admin أو Owner فقط
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .single()

    if (!member || !['admin', 'owner'].includes(member.role)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'غير مخول: الاعتماد متاح فقط للمدير العام (Owner) أو المدير (Admin)',
          error_en: 'Unauthorized: Approval is only available for Owner or Admin'
        },
        { status: 403 }
      )
    }

    // قراءة البيانات من الطلب
    const body = await request.json()
    const { writeOffId, expenseAccountId, inventoryAccountId } = body

    if (!writeOffId || !expenseAccountId || !inventoryAccountId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: writeOffId, expenseAccountId, inventoryAccountId' },
        { status: 400 }
      )
    }

    // جلب بيانات الإهلاك (بما في ذلك created_by للمنشئ)
    const { data: writeOff, error: writeOffError } = await supabase
      .from('inventory_write_offs')
      .select(`
        id,
        write_off_number,
        write_off_date,
        status,
        company_id,
        branch_id,
        warehouse_id,
        cost_center_id,
        total_cost,
        created_by
      `)
      .eq('id', writeOffId)
      .eq('company_id', companyId)
      .single()

    if (writeOffError || !writeOff) {
      return NextResponse.json(
        { success: false, error: 'Write-off not found' },
        { status: 404 }
      )
    }

    // التحقق من الحالة
    if (writeOff.status !== 'pending') {
      return NextResponse.json(
        { 
          success: false, 
          error: `الإهلاك ليس في حالة انتظار. الحالة الحالية: ${writeOff.status}`,
          error_en: `Write-off is not pending. Current status: ${writeOff.status}`
        },
        { status: 400 }
      )
    }

    // 🧾 Governance: التحقق من الحوكمة الكاملة
    if (!writeOff.branch_id || !writeOff.warehouse_id || !writeOff.cost_center_id) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'الحوكمة مطلوبة: يجب تحديد branch_id, warehouse_id, cost_center_id',
          error_en: 'Governance required: branch_id, warehouse_id, cost_center_id must be specified'
        },
        { status: 400 }
      )
    }

    // جلب عناصر الإهلاك
    const { data: writeOffItems, error: itemsError } = await supabase
      .from('inventory_write_off_items')
      .select('*')
      .eq('write_off_id', writeOffId)

    if (itemsError || !writeOffItems || writeOffItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No write-off items found' },
        { status: 400 }
      )
    }

    // التحقق من الرصيد المتاح لكل منتج
    for (const item of writeOffItems) {
      // استخدام دالة SQL للتحقق من الرصيد المتاح
      const { data: availableQty, error: qtyError } = await supabase.rpc(
        'get_available_inventory_quantity',
        {
          p_company_id: companyId,
          p_branch_id: writeOff.branch_id,
          p_warehouse_id: writeOff.warehouse_id,
          p_cost_center_id: writeOff.cost_center_id,
          p_product_id: item.product_id
        }
      )

      if (qtyError) {
        console.error('Error checking available quantity:', qtyError)
        return NextResponse.json(
          { 
            success: false, 
            error: `خطأ في التحقق من الرصيد للمنتج: ${qtyError.message}`,
            error_en: `Error checking stock for product: ${qtyError.message}`
          },
          { status: 500 }
        )
      }

      const availableQuantity = Number(availableQty || 0)
      if (availableQuantity < item.quantity) {
        const { data: product } = await supabase
          .from('products')
          .select('name, sku')
          .eq('id', item.product_id)
          .single()

        return NextResponse.json(
          { 
            success: false, 
            error: `الرصيد المتاح غير كافٍ للمنتج: ${product?.name || 'غير معروف'} (SKU: ${product?.sku || 'N/A'})\nالرصيد المتاح: ${availableQuantity}\nالمطلوب: ${item.quantity}`,
            error_en: `Insufficient stock for product: ${product?.name || 'Unknown'} (SKU: ${product?.sku || 'N/A'})\nAvailable: ${availableQuantity}\nRequired: ${item.quantity}`
          },
          { status: 400 }
        )
      }
    }

    // 🔄 استخدام FIFO Engine لاستهلاك الدفعات وإنشاء COGS Transactions
    let totalCOGS = 0
    const cogsTransactionIds: string[] = []

    for (const item of writeOffItems) {
      // ✅ استخدام consumeFIFOLotsWithCOGS (يدمج FIFO + COGS Transactions تلقائياً)
      const fifoResult = await consumeFIFOLotsWithCOGS(supabase, {
        companyId: companyId,
        branchId: writeOff.branch_id!,
        costCenterId: writeOff.cost_center_id!,
        warehouseId: writeOff.warehouse_id!,
        productId: item.product_id,
        quantity: item.quantity,
        sourceType: 'depreciation',
        sourceId: writeOffId,
        transactionDate: writeOff.write_off_date || new Date().toISOString().split('T')[0],
        createdByUserId: user.id
      })

      if (!fifoResult.success) {
        return NextResponse.json(
          { 
            success: false, 
            error: `فشل في حساب COGS للمنتج: ${fifoResult.error || 'خطأ غير معروف'}`,
            error_en: `Failed to calculate COGS for product: ${fifoResult.error || 'Unknown error'}`
          },
          { status: 500 }
        )
      }

      if (fifoResult.totalCOGS <= 0) {
        return NextResponse.json(
          { 
            success: false, 
            error: `COGS = 0 للمنتج: ${item.product_id}. يرجى التحقق من الرصيد والتكلفة.`,
            error_en: `COGS = 0 for product: ${item.product_id}. Please check stock and cost.`
          },
          { status: 400 }
        )
      }

      // إضافة COGS Transaction IDs
      cogsTransactionIds.push(...fifoResult.cogsTransactionIds)

      totalCOGS += fifoResult.totalCOGS

      // حساب unit_cost
      const unitCost = item.quantity > 0 ? Number((fifoResult.totalCOGS / item.quantity).toFixed(4)) : 0

      // تحديث unit_cost و total_cost في inventory_write_off_items
      await supabase
        .from('inventory_write_off_items')
        .update({
          unit_cost: unitCost,
          total_cost: fifoResult.totalCOGS
        })
        .eq('id', item.id)
    }

    // تحديث total_cost في inventory_write_offs
    await supabase
      .from('inventory_write_offs')
      .update({ total_cost: totalCOGS })
      .eq('id', writeOffId)

    // ✅ تحديث status إلى 'approved' قبل استدعاء createWriteOffJournal
    // لأن الدالة تتحقق من أن status === 'approved'
    const { error: statusUpdateError } = await supabase
      .from('inventory_write_offs')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', writeOffId)

    if (statusUpdateError) {
      console.error('Error updating write-off status:', statusUpdateError)
      return NextResponse.json(
        { 
          success: false, 
          error: `فشل في تحديث حالة الإهلاك: ${statusUpdateError.message}`,
          error_en: `Failed to update write-off status: ${statusUpdateError.message}`
        },
        { status: 500 }
      )
    }

    // ✅ استخدام محرك الاعتماد لتسجيل القيد المحاسبي
    const journalEntryId = await createWriteOffJournal(
      supabase,
      writeOffId,
      companyId
    )

    if (!journalEntryId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'فشل في إنشاء القيد المحاسبي',
          error_en: 'Failed to create journal entry'
        },
        { status: 500 }
      )
    }

    // إنشاء حركات المخزون (inventory_transactions)
    for (const item of writeOffItems) {
      await supabase
        .from('inventory_transactions')
        .insert({
          company_id: companyId,
          branch_id: writeOff.branch_id,
          cost_center_id: writeOff.cost_center_id,
          warehouse_id: writeOff.warehouse_id,
          product_id: item.product_id,
          transaction_type: 'write_off',
          quantity_change: -item.quantity,
          reference_type: 'write_off',
          reference_id: writeOffId,
          journal_entry_id: journalEntryId,
          notes: `إهلاك - ${writeOff.write_off_number}`
        })
    }

    // ✅ تحديث journal_entry_id فقط (status تم تحديثه مسبقاً في السطر 245)
    const { error: updateError } = await supabase
      .from('inventory_write_offs')
      .update({
        journal_entry_id: journalEntryId,
        updated_at: new Date().toISOString()
      })
      .eq('id', writeOffId)

    if (updateError) {
      console.error('Error updating write-off journal_entry_id:', updateError)
      return NextResponse.json(
        { 
          success: false, 
          error: `فشل في تحديث journal_entry_id: ${updateError.message}`,
          error_en: `Failed to update journal_entry_id: ${updateError.message}`
        },
        { status: 500 }
      )
    }

    // 🔔 إرسال إشعارات عند اعتماد الإهلاك
    try {
      const { 
        notifyWriteOffApproved, 
        archiveWriteOffApprovalNotifications 
      } = await import('@/lib/notification-helpers')

      // ✅ جلب اسم من قام بالاعتماد (من user_profiles أو email)
      let approvedByName: string | undefined
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('display_name, username')
          .eq('user_id', user.id)
          .maybeSingle()
        
        approvedByName = profile?.display_name || profile?.username || user.email?.split('@')[0] || undefined
      } catch (profileError) {
        console.warn('Could not fetch approver name:', profileError)
        approvedByName = user.email?.split('@')[0] || undefined
      }

      // إرسال إشعار للمنشئ
      await notifyWriteOffApproved({
        companyId,
        writeOffId,
        writeOffNumber: writeOff.write_off_number,
        createdBy: writeOff.created_by || user.id, // المنشئ الأصلي
        approvedBy: user.id,
        approvedByName, // ✅ اسم من قام بالاعتماد
        branchId: writeOff.branch_id,
        warehouseId: writeOff.warehouse_id,
        costCenterId: writeOff.cost_center_id,
        appLang: 'ar' // يمكن جعله ديناميكي لاحقاً
      })

      // أرشفة إشعارات الاعتماد السابقة
      await archiveWriteOffApprovalNotifications({
        companyId,
        writeOffId
      })
    } catch (notificationError) {
      console.error('Error sending write-off approval notifications:', notificationError)
      // لا نوقف العملية إذا فشل الإشعار
    }

    return NextResponse.json({
      success: true,
      message: 'تم اعتماد الإهلاك بنجاح',
      message_en: 'Write-off approved successfully',
      data: {
        writeOffId,
        journalEntryId,
        totalCOGS,
        cogsTransactionsCount: cogsTransactionIds.length
      }
    })

  } catch (error: any) {
    console.error('Error approving write-off:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'خطأ غير متوقع في اعتماد الإهلاك',
        error_en: error.message || 'Unexpected error approving write-off'
      },
      { status: 500 }
    )
  }
}
