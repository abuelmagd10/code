import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    const { id } = await params
    const { data, error } = await supabase
      .from('depreciation_schedules')
      .select('*')
      .eq('company_id', companyId)
      .eq('asset_id', id)
      .order('period_number')

    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('Error fetching depreciation schedules:', error)
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    const { id } = await params
    const body = await request.json()
    const { action, schedule_ids, user_id } = body

    if (action === 'approve') {
      // Approve schedules
      const { error } = await supabase
        .from('depreciation_schedules')
        .update({
          status: 'approved',
          approved_by: user_id,
          approved_at: new Date().toISOString()
        })
        .eq('company_id', companyId)
        .eq('asset_id', id)
        .in('id', schedule_ids)
        .eq('status', 'pending')

      if (error) throw error

      return NextResponse.json({ success: true })
    }

    if (action === 'post') {
      // ⚠️ ERP Professional Pattern: Only post current month or past months
      // منع ترحيل الفترات المستقبلية (مثل Zoho, Odoo, ERPNext)
      const currentMonthStart = new Date()
      currentMonthStart.setDate(1)
      currentMonthStart.setHours(0, 0, 0, 0)
      
      // Get schedules to verify they're not future periods
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('depreciation_schedules')
        .select('id, period_date, status')
        .eq('company_id', companyId)
        .eq('asset_id', id)
        .in('id', schedule_ids)
      
      if (schedulesError) throw schedulesError
      
      // Filter out future periods
      const validScheduleIds: string[] = []
      const futureScheduleIds: string[] = []
      
      for (const schedule of schedulesData || []) {
        const periodDate = new Date(schedule.period_date)
        periodDate.setHours(0, 0, 0, 0)
        
        if (periodDate > currentMonthStart) {
          futureScheduleIds.push(schedule.id)
        } else {
          validScheduleIds.push(schedule.id)
        }
      }
      
      if (futureScheduleIds.length > 0) {
        return NextResponse.json({ 
          error: 'Cannot post future depreciation periods. Only current month or past months can be posted.',
          future_periods: futureScheduleIds.length
        }, { status: 400 })
      }
      
      if (validScheduleIds.length === 0) {
        return NextResponse.json({ error: 'No valid schedules to post' }, { status: 400 })
      }
      
      // Post only valid (current/past) schedules
      for (const scheduleId of validScheduleIds) {
        const { error } = await supabase.rpc('post_depreciation', {
          p_schedule_id: scheduleId,
          p_user_id: user_id
        })

        if (error) throw error
      }

      return NextResponse.json({ 
        success: true, 
        posted_count: validScheduleIds.length 
      })
    }

    // ✅ إلغاء إهلاك معتمد (Approved - غير مرحل)
    if (action === 'cancel') {
      // التحقق من الصلاحيات: Owner أو Admin فقط
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { data: memberData } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", companyId)
        .single()

      const isOwner = companyData?.user_id === user.id
      const userRole = isOwner ? "owner" : (memberData?.role || "viewer")
      const canCancel = userRole === 'owner' || userRole === 'admin'

      if (!canCancel) {
        return NextResponse.json({ 
          error: 'Forbidden',
          error_ar: 'لا يمكن إلغاء الإهلاك. العملية مسموحة فقط للإدارة العليا (Admin/Owner).',
          error_en: 'Cannot cancel depreciation. Operation allowed only for top management (Admin/Owner).'
        }, { status: 403 })
      }

      // جلب جداول الإهلاك للتحقق
      const { data: schedules, error: schedulesError } = await supabase
        .from('depreciation_schedules')
        .select('id, status, journal_entry_id')
        .eq('company_id', companyId)
        .eq('asset_id', id)
        .in('id', schedule_ids)

      if (schedulesError) throw schedulesError

      // التحقق: لا يمكن إلغاء إهلاك مرحل (يجب استخدام cancel_posted)
      const postedSchedules = schedules?.filter(s => s.status === 'posted')
      if (postedSchedules && postedSchedules.length > 0) {
        return NextResponse.json({ 
          error: 'Cannot cancel posted depreciation. Use cancel_posted action instead.',
          error_ar: 'لا يمكن إلغاء إهلاك مرحل. يرجى استخدام إلغاء مع قيد عكسي.',
          posted_count: postedSchedules.length
        }, { status: 400 })
      }

      // إلغاء الجداول المعتمدة فقط
      const { error } = await supabase
        .from('depreciation_schedules')
        .update({
          status: 'cancelled',
          approved_by: null,
          approved_at: null,
          cancelled_by: user.id,
          cancelled_at: new Date().toISOString()
        })
        .eq('company_id', companyId)
        .eq('asset_id', id)
        .in('id', schedule_ids)
        .in('status', ['approved']) // فقط المعتمدة

      if (error) throw error

      return NextResponse.json({ 
        success: true,
        cancelled_count: schedule_ids.length
      })
    }

    // ✅ إلغاء إهلاك مرحل (Posted) - مع قيد عكسي
    if (action === 'cancel_posted') {
      // التحقق من الصلاحيات: Owner أو Admin فقط
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { data: memberData } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", companyId)
        .single()

      const isOwner = companyData?.user_id === user.id
      const userRole = isOwner ? "owner" : (memberData?.role || "viewer")
      const canCancel = userRole === 'owner' || userRole === 'admin'

      if (!canCancel) {
        return NextResponse.json({ 
          error: 'Forbidden',
          error_ar: 'لا يمكن إلغاء الإهلاك المرحل. العملية مسموحة فقط للإدارة العليا (Admin/Owner).',
          error_en: 'Cannot cancel posted depreciation. Operation allowed only for top management (Admin/Owner).'
        }, { status: 403 })
      }

      // جلب جداول الإهلاك المرحلة مع بيانات الأصل
      const { data: schedules, error: schedulesError } = await supabase
        .from('depreciation_schedules')
        .select(`
          id,
          period_number,
          depreciation_amount,
          accumulated_depreciation,
          book_value,
          journal_entry_id,
          fixed_assets!inner(
            id,
            name,
            accumulated_depreciation,
            book_value,
            purchase_cost,
            salvage_value,
            depreciation_expense_account_id,
            accumulated_depreciation_account_id
          )
        `)
        .eq('company_id', companyId)
        .eq('asset_id', id)
        .in('id', schedule_ids)
        .eq('status', 'posted')

      if (schedulesError) throw schedulesError

      if (!schedules || schedules.length === 0) {
        return NextResponse.json({ 
          error: 'No posted schedules found',
          error_ar: 'لا توجد جداول إهلاك مرحلة'
        }, { status: 400 })
      }

      // ✅ الوصول إلى fixed_assets (بسبب !inner يعود كـ object وليس array)
      const firstSchedule = schedules[0] as any
      const asset: any = Array.isArray(firstSchedule.fixed_assets) 
        ? firstSchedule.fixed_assets[0] 
        : firstSchedule.fixed_assets

      if (!asset) {
        return NextResponse.json({ 
          error: 'Asset data not found',
          error_ar: 'بيانات الأصل غير موجودة'
        }, { status: 400 })
      }

      // التحقق من وجود الحسابات
      if (!asset.depreciation_expense_account_id || !asset.accumulated_depreciation_account_id) {
        return NextResponse.json({ 
          error: 'Depreciation accounts not configured for this asset',
          error_ar: 'الحسابات المحاسبية للإهلاك غير مُعرّفة لهذا الأصل'
        }, { status: 400 })
      }

      // إنشاء قيد عكسي لكل جدول إهلاك
      const reversalEntryIds: string[] = []
      let totalCancelledDepreciation = 0

      for (const schedule of schedules) {
        // 1. إنشاء قيد عكسي
        const { data: reversalEntry, error: reversalError } = await supabase
          .from('journal_entries')
          .insert({
            company_id: companyId,
            entry_date: new Date().toISOString().split('T')[0],
            description: `إلغاء إهلاك: ${asset.name} - فترة ${schedule.period_number}`,
            reference_type: 'depreciation_reversal',
            reference_id: id
          })
          .select()
          .single()

        if (reversalError) throw reversalError

        reversalEntryIds.push(reversalEntry.id)

        // 2. إنشاء سطور القيد العكسي
        // من حساب مجمع الإهلاك (مدين) - لإرجاع الإهلاك
        const { error: line1Error } = await supabase
          .from('journal_entry_lines')
          .insert({
            journal_entry_id: reversalEntry.id,
            account_id: asset.accumulated_depreciation_account_id,
            description: `إلغاء مجمع إهلاك: ${asset.name}`,
            debit_amount: schedule.depreciation_amount,
            credit_amount: 0
          })

        if (line1Error) throw line1Error

        // إلى حساب مصروف الإهلاك (دائن) - لإرجاع المصروف
        const { error: line2Error } = await supabase
          .from('journal_entry_lines')
          .insert({
            journal_entry_id: reversalEntry.id,
            account_id: asset.depreciation_expense_account_id,
            description: `إلغاء مصروف إهلاك: ${asset.name}`,
            debit_amount: 0,
            credit_amount: schedule.depreciation_amount
          })

        if (line2Error) throw line2Error

        // 3. تحديث جدول الإهلاك
        const { error: updateError } = await supabase
          .from('depreciation_schedules')
          .update({
            status: 'cancelled',
            reversal_journal_entry_id: reversalEntry.id,
            cancelled_by: user.id,
            cancelled_at: new Date().toISOString()
          })
          .eq('id', schedule.id)

        if (updateError) throw updateError

        totalCancelledDepreciation += Number(schedule.depreciation_amount || 0)
      }

      // 4. إعادة حساب accumulated_depreciation و book_value للأصل
      const newAccumulatedDepreciation = Math.max(0, 
        Number(asset.accumulated_depreciation || 0) - totalCancelledDepreciation
      )
      const newBookValue = Math.min(
        Number(asset.purchase_cost || 0),
        Number(asset.book_value || 0) + totalCancelledDepreciation
      )

      const { error: assetUpdateError } = await supabase
        .from('fixed_assets')
        .update({
          accumulated_depreciation: newAccumulatedDepreciation,
          book_value: newBookValue,
          status: newBookValue <= Number(asset.salvage_value || 0) 
            ? 'fully_depreciated' 
            : 'active',
          updated_at: new Date().toISOString(),
          updated_by: user.id
        })
        .eq('id', id)

      if (assetUpdateError) throw assetUpdateError

      return NextResponse.json({ 
        success: true,
        cancelled_count: schedules.length,
        reversal_entry_ids: reversalEntryIds,
        new_accumulated_depreciation: newAccumulatedDepreciation,
        new_book_value: newBookValue
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error processing depreciation action:', error)
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 })
  }
}