import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { secureApiRequest } from '@/lib/api-security-enhanced'
import { serverError, forbiddenError } from '@/lib/api-security-enhanced'

export async function GET(request: NextRequest) {
  try {
    // التحقق من الأمان والصلاحيات
    const { user, companyId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: 'reports', action: 'read' },
      allowedRoles: ['owner', 'admin', 'accountant']
    })

    if (error) return error
    if (!companyId) return serverError('معرف الشركة مطلوب')

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const checkType = searchParams.get('type') || 'comprehensive'

    let results: any[] = []

    switch (checkType) {
      case 'journal_balance':
        const { data: journalResults, error: journalError } = await supabase
          .rpc('verify_journal_entries_balance', { p_company_id: companyId })
        
        if (journalError) throw journalError
        results = journalResults || []
        break

      case 'inventory':
        const { data: inventoryResults, error: inventoryError } = await supabase
          .rpc('verify_inventory_integrity', { p_company_id: companyId })
        
        if (inventoryError) throw inventoryError
        results = inventoryResults || []
        break

      case 'receivables':
        const { data: receivablesResults, error: receivablesError } = await supabase
          .rpc('verify_accounts_receivable', { p_company_id: companyId })
        
        if (receivablesError) throw receivablesError
        results = receivablesResults || []
        break

      case 'payables':
        const { data: payablesResults, error: payablesError } = await supabase
          .rpc('verify_accounts_payable', { p_company_id: companyId })
        
        if (payablesError) throw payablesError
        results = payablesResults || []
        break

      case 'accounting_pattern':
        const { data: patternResults, error: patternError } = await supabase
          .rpc('verify_accounting_pattern', { p_company_id: companyId })
        
        if (patternError) throw patternError
        results = patternResults || []
        break

      case 'comprehensive':
      default:
        const { data: comprehensiveResults, error: comprehensiveError } = await supabase
          .rpc('comprehensive_data_integrity_check', { p_company_id: companyId })
        
        if (comprehensiveError) throw comprehensiveError
        results = comprehensiveResults || []
        break
    }

    // تحليل النتائج
    const summary = {
      totalChecks: results.length,
      passedChecks: results.filter(r => r.status === 'PASS').length,
      failedChecks: results.filter(r => r.status === 'FAIL').length,
      totalErrors: results.reduce((sum, r) => sum + (r.error_count || 0), 0),
      overallStatus: results.every(r => r.status === 'PASS') ? 'HEALTHY' : 'ISSUES_FOUND'
    }

    // تجميع النتائج حسب الفئة
    const resultsByCategory = results.reduce((acc, result) => {
      const category = result.check_category || 'General'
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(result)
      return acc
    }, {} as Record<string, any[]>)

    return NextResponse.json({
      success: true,
      data: {
        checkType,
        companyId,
        timestamp: new Date().toISOString(),
        summary,
        resultsByCategory,
        allResults: results,
        recommendations: generateRecommendations(results)
      }
    })

  } catch (error: any) {
    console.error('Data integrity check error:', error)
    return serverError(`خطأ في فحص سلامة البيانات: ${error.message}`)
  }
}

function generateRecommendations(results: any[]): string[] {
  const recommendations: string[] = []

  results.forEach(result => {
    if (result.status === 'FAIL') {
      switch (result.check_name) {
        case 'Journal Balance':
          recommendations.push('يوجد قيود محاسبية غير متوازنة. يجب مراجعة القيود وتصحيحها.')
          break
        case 'Inventory Integrity':
          recommendations.push('يوجد تضارب في أرصدة المخزون. يجب إجراء جرد فعلي وتسوية الفروقات.')
          break
        case 'Accounts Receivable':
          recommendations.push('يوجد تضارب في الذمم المدينة. يجب مراجعة الفواتير والمدفوعات.')
          break
        case 'Accounts Payable':
          recommendations.push('يوجد تضارب في الذمم الدائنة. يجب مراجعة فواتير الشراء والمدفوعات.')
          break
        case 'Missing References':
          recommendations.push('يوجد قيود محاسبية بدون مراجع صحيحة. يجب ربط القيود بالمستندات الأصلية.')
          break
        case 'Duplicate Entries':
          recommendations.push('يوجد قيود محاسبية مكررة. يجب حذف القيود المكررة.')
          break
      }
    }
  })

  if (recommendations.length === 0) {
    recommendations.push('جميع الفحوصات نجحت. البيانات المحاسبية سليمة.')
  }

  return recommendations
}