import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/add-dividends-payable-account
 * إضافة حساب "الأرباح الموزعة المستحقة" لجميع الشركات الموجودة
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // التحقق من صلاحيات المستخدم
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let results = {
      accounts_2000_added: 0,
      accounts_2100_added: 0,
      accounts_2150_added: 0,
      errors: [] as string[]
    }

    // الحصول على جميع الشركات
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id')

    if (companiesError || !companies) {
      return NextResponse.json({
        error: 'Failed to fetch companies',
        details: companiesError?.message
      }, { status: 500 })
    }

    // معالجة كل شركة على حدة
    for (const company of companies) {
      try {
        // 1️⃣ التحقق من وجود حساب 2000 وإضافته إن لم يكن موجوداً
        const { data: account2000 } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', company.id)
          .eq('account_code', '2000')
          .maybeSingle()

        let parent2000Id = account2000?.id

        if (!parent2000Id) {
          const { data: newAccount2000, error: error2000 } = await supabase
            .from('chart_of_accounts')
            .insert({
              company_id: company.id,
              account_code: '2000',
              account_name: 'الالتزامات',
              account_type: 'liability',
              normal_balance: 'credit',
              level: 1,
              opening_balance: 0,
              is_active: true
            })
            .select('id')
            .single()

          if (!error2000 && newAccount2000) {
            parent2000Id = newAccount2000.id
            results.accounts_2000_added++
          }
        }

        // 2️⃣ التحقق من وجود حساب 2100 وإضافته إن لم يكن موجوداً
        const { data: account2100 } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', company.id)
          .eq('account_code', '2100')
          .maybeSingle()

        let parent2100Id = account2100?.id

        if (!parent2100Id && parent2000Id) {
          const { data: newAccount2100, error: error2100 } = await supabase
            .from('chart_of_accounts')
            .insert({
              company_id: company.id,
              account_code: '2100',
              account_name: 'الالتزامات المتداولة',
              account_type: 'liability',
              normal_balance: 'credit',
              parent_id: parent2000Id,
              level: 2,
              opening_balance: 0,
              is_active: true
            })
            .select('id')
            .single()

          if (!error2100 && newAccount2100) {
            parent2100Id = newAccount2100.id
            results.accounts_2100_added++
          }
        }

        // 3️⃣ إضافة حساب الأرباح الموزعة المستحقة (2150)
        if (parent2100Id) {
          const { data: account2150 } = await supabase
            .from('chart_of_accounts')
            .select('id')
            .eq('company_id', company.id)
            .eq('account_code', '2150')
            .maybeSingle()

          if (!account2150) {
            const { error: error2150 } = await supabase
              .from('chart_of_accounts')
              .insert({
                company_id: company.id,
                account_code: '2150',
                account_name: 'الأرباح الموزعة المستحقة',
                account_type: 'liability',
                normal_balance: 'credit',
                sub_type: 'dividends_payable',
                parent_id: parent2100Id,
                level: 3,
                opening_balance: 0,
                is_active: true,
                description: 'حساب الأرباح الموزعة للشركاء والتي لم يتم دفعها بعد'
              })

            if (!error2150) {
              results.accounts_2150_added++
            } else {
              results.errors.push(`Company ${company.id}: ${error2150.message}`)
            }
          }
        }

      } catch (companyError: any) {
        results.errors.push(`Company ${company.id}: ${companyError.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `تم إضافة حساب الأرباح الموزعة المستحقة بنجاح`,
      totalCompanies: companies.length,
      accountsAdded: results.accounts_2150_added,
      details: results
    })

  } catch (error: any) {
    console.error('Error adding dividends payable account:', error)
    return NextResponse.json({
      error: 'Failed to add dividends payable account',
      details: error?.message
    }, { status: 500 })
  }
}

/**
 * GET /api/add-dividends-payable-account
 * التحقق من حالة حساب الأرباح الموزعة المستحقة
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // عدد الشركات الكلي
    const { count: totalCompanies } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })

    // عدد الشركات التي لديها حساب 2150
    const { count: companiesWithAccount } = await supabase
      .from('chart_of_accounts')
      .select('company_id', { count: 'exact', head: true })
      .eq('account_code', '2150')

    return NextResponse.json({
      success: true,
      totalCompanies: totalCompanies || 0,
      companiesWithAccount: companiesWithAccount || 0,
      companiesMissing: (totalCompanies || 0) - (companiesWithAccount || 0),
      needsUpdate: (totalCompanies || 0) > (companiesWithAccount || 0)
    })

  } catch (error: any) {
    console.error('Error checking dividends payable account status:', error)
    return NextResponse.json({
      error: 'Failed to check status',
      details: error?.message
    }, { status: 500 })
  }
}

