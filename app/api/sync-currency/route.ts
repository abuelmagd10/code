/**
 * Currency Sync API
 * 
 * Endpoint to sync user's display currency with company's base currency
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSSR } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSSR()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', error_ar: 'غير مصرح' },
        { status: 401 }
      )
    }

    // Get active company
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json(
        { error: 'Company not found', error_ar: 'الشركة غير موجودة' },
        { status: 404 }
      )
    }

    // Get company details
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('user_id, base_currency, currency')
      .eq('id', companyId)
      .maybeSingle()

    if (companyError || !company) {
      return NextResponse.json(
        { error: 'Company not found', error_ar: 'الشركة غير موجودة' },
        { status: 404 }
      )
    }

    const companyCurrency = company.base_currency || company.currency || 'EGP'
    const isOwner = company.user_id === user.id

    // For invited users, force company currency
    if (!isOwner) {
      // Update user preference in database
      await supabase
        .from('company_members')
        .update({
          preferred_currency: companyCurrency,
          currency_sync_enabled: true
        })
        .eq('user_id', user.id)
        .eq('company_id', companyId)

      return NextResponse.json({
        success: true,
        currency: companyCurrency,
        is_owner: false,
        synced: true,
        message: 'Currency synced with company base currency',
        message_ar: 'تم مزامنة العملة مع عملة الشركة الأساسية'
      })
    }

    // For owners, return their preference or company currency
    const { data: member } = await supabase
      .from('company_members')
      .select('preferred_currency')
      .eq('user_id', user.id)
      .eq('company_id', companyId)
      .maybeSingle()

    const userCurrency = member?.preferred_currency || companyCurrency

    return NextResponse.json({
      success: true,
      currency: userCurrency,
      is_owner: true,
      synced: false,
      message: 'Owner can use custom currency',
      message_ar: 'المالك يمكنه استخدام عملة مخصصة'
    })

  } catch (error: any) {
    console.error('Currency sync error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        error_ar: 'خطأ في الخادم',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSSR()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', error_ar: 'غير مصرح' },
        { status: 401 }
      )
    }

    // Get active company
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json(
        { error: 'Company not found', error_ar: 'الشركة غير موجودة' },
        { status: 404 }
      )
    }

    // Get company and user details
    const { data: company } = await supabase
      .from('companies')
      .select('user_id, base_currency, currency')
      .eq('id', companyId)
      .maybeSingle()

    const { data: member } = await supabase
      .from('company_members')
      .select('preferred_currency, currency_sync_enabled')
      .eq('user_id', user.id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found', error_ar: 'الشركة غير موجودة' },
        { status: 404 }
      )
    }

    const companyCurrency = company.base_currency || company.currency || 'EGP'
    const isOwner = company.user_id === user.id
    const userCurrency = member?.preferred_currency || companyCurrency
    const syncEnabled = member?.currency_sync_enabled !== false

    return NextResponse.json({
      success: true,
      company_currency: companyCurrency,
      user_currency: userCurrency,
      display_currency: isOwner ? userCurrency : (syncEnabled ? companyCurrency : userCurrency),
      is_owner: isOwner,
      sync_enabled: syncEnabled,
      needs_sync: !isOwner && userCurrency !== companyCurrency && syncEnabled
    })

  } catch (error: any) {
    console.error('Get currency error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        error_ar: 'خطأ في الخادم',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

