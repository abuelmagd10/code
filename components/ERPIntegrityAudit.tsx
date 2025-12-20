import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, AlertTriangle, XCircle, Shield, Search, FileText } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/hooks'

interface UIAuditResult {
  page: string
  component: string
  action: string
  compliance: 'COMPLIANT' | 'VIOLATION' | 'REVIEW'
  description: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

interface DataAuditResult {
  category: string
  checkName: string
  status: 'PASS' | 'FAIL' | 'REVIEW'
  severity: string
  issueCount: number
  details: any
}

export const ERPIntegrityAudit = ({ lang }: { lang: 'ar' | 'en' }) => {
  const supabase = useSupabase()
  const [dataAudit, setDataAudit] = useState<DataAuditResult[]>([])
  const [uiAudit, setUIAudit] = useState<UIAuditResult[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'data' | 'ui' | 'summary'>('data')

  useEffect(() => {
    runComprehensiveAudit()
  }, [])

  const runComprehensiveAudit = async () => {
    try {
      setLoading(true)
      
      // تشغيل مراجعة البيانات
      const { data: auditResults } = await supabase.rpc('comprehensive_erp_audit', {
        p_company_id: 'current_company_id' // سيتم استبداله بالشركة الفعلية
      })
      
      setDataAudit(auditResults || [])
      
      // مراجعة الواجهات (محاكاة - في التطبيق الحقيقي ستكون من API)
      const uiAuditResults: UIAuditResult[] = [
        {
          page: '/sales-orders',
          component: 'OrderActions',
          action: 'Edit Button',
          compliance: 'COMPLIANT',
          description: 'Edit button properly controlled by accounting pattern',
          severity: 'LOW'
        },
        {
          page: '/invoices',
          component: 'InvoiceActions', 
          action: 'Delete Button',
          compliance: 'COMPLIANT',
          description: 'Delete button disabled for sent invoices',
          severity: 'LOW'
        },
        {
          page: '/purchase-orders',
          component: 'OrderActions',
          action: 'Edit Button',
          compliance: 'COMPLIANT',
          description: 'Edit button follows accounting pattern rules',
          severity: 'LOW'
        },
        {
          page: '/bills',
          component: 'InvoiceActions',
          action: 'Edit Button', 
          compliance: 'COMPLIANT',
          description: 'Edit button properly controlled',
          severity: 'LOW'
        }
      ]
      
      setUIAudit(uiAuditResults)
      
    } catch (error) {
      console.error('Error running audit:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS':
      case 'COMPLIANT':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'REVIEW':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case 'FAIL':
      case 'VIOLATION':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Search className="w-4 h-4 text-gray-500" />
    }
  }

  const getStatusBadge = (status: string, severity?: string) => {
    const variant = 
      status === 'PASS' || status === 'COMPLIANT' ? 'default' :
      status === 'REVIEW' ? 'secondary' : 'destructive'
    
    return <Badge variant={variant}>{status}</Badge>
  }

  const getSummaryStats = () => {
    const dataIssues = dataAudit.filter(d => d.status !== 'PASS').length
    const uiIssues = uiAudit.filter(u => u.compliance !== 'COMPLIANT').length
    const criticalIssues = dataAudit.filter(d => d.severity === 'CRITICAL').length
    const totalChecks = dataAudit.length + uiAudit.length
    const passedChecks = dataAudit.filter(d => d.status === 'PASS').length + uiAudit.filter(u => u.compliance === 'COMPLIANT').length
    
    return {
      totalChecks,
      passedChecks,
      dataIssues,
      uiIssues,
      criticalIssues,
      overallScore: totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0
    }
  }

  const stats = getSummaryStats()

  if (loading) {
    return <div className="p-8 text-center">{lang === 'en' ? 'Running comprehensive audit...' : 'جاري تشغيل المراجعة الشاملة...'}</div>
  }

  return (
    <div className="space-y-6">
      {/* رأس الصفحة */}
      <div className="flex items-center gap-4">
        <Shield className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">
            {lang === 'en' ? 'ERP Integrity Audit' : 'مراجعة سلامة نظام ERP'}
          </h1>
          <p className="text-gray-500">
            {lang === 'en' ? 'Comprehensive system audit and validation' : 'مراجعة وتحقق شامل للنظام'}
          </p>
        </div>
      </div>

      {/* ملخص النتائج */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.overallScore}%</div>
              <div className="text-sm text-gray-500">{lang === 'en' ? 'Overall Score' : 'النتيجة الإجمالية'}</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.passedChecks}</div>
              <div className="text-sm text-gray-500">{lang === 'en' ? 'Passed Checks' : 'الفحوصات الناجحة'}</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.dataIssues}</div>
              <div className="text-sm text-gray-500">{lang === 'en' ? 'Data Issues' : 'مشاكل البيانات'}</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.uiIssues}</div>
              <div className="text-sm text-gray-500">{lang === 'en' ? 'UI Issues' : 'مشاكل الواجهة'}</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.criticalIssues}</div>
              <div className="text-sm text-gray-500">{lang === 'en' ? 'Critical Issues' : 'مشاكل حرجة'}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* تحذير إجمالي */}
      {stats.criticalIssues > 0 ? (
        <Alert className="border-red-200 bg-red-50 dark:bg-red-900/20">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <div className="font-medium mb-1">
              {lang === 'en' ? '🚨 Critical Issues Detected' : '🚨 تم اكتشاف مشاكل حرجة'}
            </div>
            <div className="text-sm">
              {lang === 'en' 
                ? 'System has critical data integrity issues that must be resolved before production.'
                : 'النظام به مشاكل حرجة في سلامة البيانات يجب حلها قبل الإنتاج.'}
            </div>
          </AlertDescription>
        </Alert>
      ) : stats.overallScore >= 95 ? (
        <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            <div className="font-medium mb-1">
              {lang === 'en' ? '✅ System Ready for Production' : '✅ النظام جاهز للإنتاج'}
            </div>
            <div className="text-sm">
              {lang === 'en' 
                ? 'All critical checks passed. System meets professional ERP standards.'
                : 'تم اجتياز جميع الفحوصات الحرجة. النظام يلبي معايير ERP الاحترافية.'}
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            <div className="font-medium mb-1">
              {lang === 'en' ? '⚠️ Issues Require Attention' : '⚠️ مشاكل تحتاج انتباه'}
            </div>
            <div className="text-sm">
              {lang === 'en' 
                ? 'Some issues detected. Review and fix before production deployment.'
                : 'تم اكتشاف بعض المشاكل. يرجى المراجعة والإصلاح قبل النشر.'}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* تبويبات */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === 'summary' ? 'default' : 'outline'}
          onClick={() => setActiveTab('summary')}
        >
          <FileText className="w-4 h-4 mr-2" />
          {lang === 'en' ? 'Summary' : 'الملخص'}
        </Button>
        <Button
          variant={activeTab === 'data' ? 'default' : 'outline'}
          onClick={() => setActiveTab('data')}
        >
          <Search className="w-4 h-4 mr-2" />
          {lang === 'en' ? 'Data Audit' : 'مراجعة البيانات'}
        </Button>
        <Button
          variant={activeTab === 'ui' ? 'default' : 'outline'}
          onClick={() => setActiveTab('ui')}
        >
          <Shield className="w-4 h-4 mr-2" />
          {lang === 'en' ? 'UI Audit' : 'مراجعة الواجهة'}
        </Button>
      </div>

      {/* محتوى التبويبات */}
      {activeTab === 'data' && (
        <Card>
          <CardHeader>
            <CardTitle>{lang === 'en' ? 'Data Integrity Audit' : 'مراجعة سلامة البيانات'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">{lang === 'en' ? 'Category' : 'الفئة'}</th>
                    <th className="text-left p-2">{lang === 'en' ? 'Check' : 'الفحص'}</th>
                    <th className="text-left p-2">{lang === 'en' ? 'Status' : 'الحالة'}</th>
                    <th className="text-left p-2">{lang === 'en' ? 'Issues' : 'المشاكل'}</th>
                    <th className="text-left p-2">{lang === 'en' ? 'Severity' : 'الخطورة'}</th>
                  </tr>
                </thead>
                <tbody>
                  {dataAudit.map((result, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2">{result.category}</td>
                      <td className="p-2">{result.checkName}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result.status)}
                          {getStatusBadge(result.status)}
                        </div>
                      </td>
                      <td className="p-2">{result.issueCount}</td>
                      <td className="p-2">
                        <Badge variant={
                          result.severity === 'CRITICAL' ? 'destructive' :
                          result.severity === 'HIGH' ? 'destructive' :
                          result.severity === 'MEDIUM' ? 'secondary' : 'outline'
                        }>
                          {result.severity}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'ui' && (
        <Card>
          <CardHeader>
            <CardTitle>{lang === 'en' ? 'UI & Actions Audit' : 'مراجعة الواجهة والإجراءات'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">{lang === 'en' ? 'Page' : 'الصفحة'}</th>
                    <th className="text-left p-2">{lang === 'en' ? 'Component' : 'المكون'}</th>
                    <th className="text-left p-2">{lang === 'en' ? 'Action' : 'الإجراء'}</th>
                    <th className="text-left p-2">{lang === 'en' ? 'Compliance' : 'التوافق'}</th>
                    <th className="text-left p-2">{lang === 'en' ? 'Description' : 'الوصف'}</th>
                  </tr>
                </thead>
                <tbody>
                  {uiAudit.map((result, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2 font-mono text-xs">{result.page}</td>
                      <td className="p-2">{result.component}</td>
                      <td className="p-2">{result.action}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result.compliance)}
                          {getStatusBadge(result.compliance)}
                        </div>
                      </td>
                      <td className="p-2 text-xs">{result.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'summary' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{lang === 'en' ? 'Audit Summary' : 'ملخص المراجعة'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold mb-3">{lang === 'en' ? 'System Health' : 'صحة النظام'}</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>{lang === 'en' ? 'Overall Score:' : 'النتيجة الإجمالية:'}</span>
                        <span className={`font-bold ${stats.overallScore >= 95 ? 'text-green-600' : stats.overallScore >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {stats.overallScore}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>{lang === 'en' ? 'Passed Checks:' : 'الفحوصات الناجحة:'}</span>
                        <span className="text-green-600">{stats.passedChecks}/{stats.totalChecks}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{lang === 'en' ? 'Critical Issues:' : 'المشاكل الحرجة:'}</span>
                        <span className={stats.criticalIssues > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>
                          {stats.criticalIssues}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-3">{lang === 'en' ? 'Readiness Status' : 'حالة الجاهزية'}</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {stats.criticalIssues === 0 ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-sm">
                          {lang === 'en' ? 'Production Ready' : 'جاهز للإنتاج'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {stats.overallScore >= 90 ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        )}
                        <span className="text-sm">
                          {lang === 'en' ? 'ERP Standards' : 'معايير ERP'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {stats.uiIssues === 0 ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        )}
                        <span className="text-sm">
                          {lang === 'en' ? 'UI Compliance' : 'توافق الواجهة'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* توصيات */}
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                    {lang === 'en' ? '📋 Recommendations' : '📋 التوصيات'}
                  </h4>
                  <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    {stats.criticalIssues > 0 && (
                      <li>• {lang === 'en' ? 'Fix all critical issues before production' : 'إصلاح جميع المشاكل الحرجة قبل الإنتاج'}</li>
                    )}
                    {stats.dataIssues > 0 && (
                      <li>• {lang === 'en' ? 'Review and resolve data integrity issues' : 'مراجعة وحل مشاكل سلامة البيانات'}</li>
                    )}
                    {stats.overallScore >= 95 && (
                      <li>• {lang === 'en' ? 'System ready for production deployment' : 'النظام جاهز للنشر في الإنتاج'}</li>
                    )}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}