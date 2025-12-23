"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Settings, 
  Database,
  TrendingUp,
  DollarSign,
  Package,
  Calculator
} from "lucide-react"
import { 
  validateAccrualAccounting,
  fixExistingDataWithOpeningBalances,
  getAccrualAccountMapping
} from "@/lib/accrual-accounting-engine"

interface ValidationTest {
  name: string
  passed: boolean
  details: string
}

interface ValidationResult {
  isValid: boolean
  tests: ValidationTest[]
}

export default function AccrualAccountingPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [accountMapping, setAccountMapping] = useState<any>(null)
  const [isFixing, setIsFixing] = useState(false)
  const [fixResult, setFixResult] = useState<any>(null)
  const [sqlValidation, setSqlValidation] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // الحصول على معرف الشركة
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .single()

      if (!companyData) return

      setCompanyId(companyData.id)

      // تحميل نتائج التحقق
      await loadValidation(companyData.id)
      
      // تحميل خريطة الحسابات
      await loadAccountMapping(companyData.id)

      // تحميل نتائج التحقق من SQL
      await loadSqlValidation(companyData.id)

    } catch (error) {
      console.error('Error loading data:', { error: error?.message })
      toast({
        title: "خطأ",
        description: "فشل في تحميل البيانات",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const loadValidation = async (companyId: string) => {
    try {
      const result = await validateAccrualAccounting(supabase, companyId)
      setValidationResult(result)
    } catch (error) {
      console.error("Error validating accrual accounting:", error)
    }
  }

  const loadAccountMapping = async (companyId: string) => {
    try {
      const mapping = await getAccrualAccountMapping(supabase, companyId)
      setAccountMapping(mapping)
    } catch (error) {
      console.error("Error loading account mapping:", error)
      setAccountMapping({ error: error.message })
    }
  }

  const loadSqlValidation = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('validate_accrual_accounting_implementation', {
          p_company_id: companyId
        })

      if (error) {
        console.error('SQL validation error:', { error: error?.message })
        return
      }

      setSqlValidation(data || [])
    } catch (error) {
      console.error('Error loading SQL validation:', { error: error?.message })
    }
  }

  const handleFixData = async () => {
    if (!companyId) return

    try {
      setIsFixing(true)
      
      // استدعاء دالة الإصلاح من SQL
      const { data: sqlResult, error: sqlError } = await supabase
        .rpc('fix_accrual_accounting_data', {
          p_company_id: companyId
        })

      if (sqlError) {
        throw new Error(`SQL Fix Error: ${sqlError.message}`)
      }

      // استدعاء دالة الإصلاح من TypeScript
      const tsResult = await fixExistingDataWithOpeningBalances(supabase, companyId)

      setFixResult({
        sql: sqlResult,
        typescript: tsResult
      })

      toast({
        title: "تم الإصلاح بنجاح",
        description: "تم إصلاح البيانات وتطبيق نظام الاستحقاق",
        variant: "default"
      })

      // إعادة تحميل البيانات
      await loadValidation(companyId)
      await loadSqlValidation(companyId)

    } catch (error: any) {
      console.error('Error fixing data:', { error: error?.message })
      toast({
        title: "خطأ في الإصلاح",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setIsFixing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">جاري التحميل...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8 space-y-8">
        {/* Header */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Calculator className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                نظام المحاسبة على أساس الاستحقاق
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Accrual Accounting Engine - مطابق 100% لـ Zoho Books
              </p>
            </div>
          </div>
        </div>

        {/* معايير النجاح النهائي */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              معايير النجاح النهائي (لا يقبل الجدل)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium">الربح يظهر قبل التحصيل</span>
              </div>
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <Package className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium">المخزون له قيمة محاسبية</span>
              </div>
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium">COGS مسجل عند البيع</span>
              </div>
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <Calculator className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium">Trial Balance دائماً متزن</span>
              </div>
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <Settings className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium">لا علاقة مباشرة بين Cash والربح</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* نتائج التحقق */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* TypeScript Validation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                نتائج التحقق (TypeScript)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {validationResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    {validationResult.isValid ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        ✅ مطابق لـ Zoho Books
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        ❌ غير مطابق
                      </Badge>
                    )}
                  </div>
                  
                  {validationResult.tests.map((test, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {test.passed ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{test.name}</p>
                          <p className="text-xs text-gray-500">{test.details}</p>
                        </div>
                      </div>
                      <Badge variant={test.passed ? "default" : "destructive"}>
                        {test.passed ? "PASS" : "FAIL"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">لم يتم التحقق بعد</p>
              )}
            </CardContent>
          </Card>

          {/* SQL Validation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                نتائج التحقق (SQL)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sqlValidation.length > 0 ? (
                <div className="space-y-4">
                  {sqlValidation.map((test, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {test.status === 'PASS' ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{test.test_name}</p>
                          <p className="text-xs text-gray-500">{test.details}</p>
                          {test.recommendation && (
                            <p className="text-xs text-blue-600 mt-1">{test.recommendation}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant={test.status === 'PASS' ? "default" : "destructive"}>
                        {test.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">لم يتم التحقق بعد</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* خريطة الحسابات */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              خريطة الحسابات المطلوبة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {accountMapping ? (
              accountMapping.error ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    خطأ في تحميل خريطة الحسابات: {accountMapping.error}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(accountMapping).map(([key, value]) => {
                    if (key === 'company_id') return null
                    return (
                      <div key={key} className="p-3 border rounded-lg">
                        <p className="font-medium text-sm capitalize">{key.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {value ? (
                            <Badge variant="default">✅ موجود</Badge>
                          ) : (
                            <Badge variant="destructive">❌ مفقود</Badge>
                          )}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              <p className="text-gray-500">جاري تحميل خريطة الحسابات...</p>
            )}
          </CardContent>
        </Card>

        {/* إجراءات الإصلاح */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              إصلاح البيانات الحالية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                سيتم إصلاح البيانات الحالية بطريقة Opening Balances بدون تدمير التاريخ.
                هذا الإجراء آمن ولا يؤثر على البيانات الموجودة.
              </AlertDescription>
            </Alert>

            <Button 
              onClick={handleFixData} 
              disabled={isFixing}
              className="w-full"
            >
              {isFixing ? "جاري الإصلاح..." : "إصلاح البيانات وتطبيق نظام الاستحقاق"}
            </Button>

            {fixResult && (
              <div className="mt-4 space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    تم الإصلاح بنجاح!
                  </AlertDescription>
                </Alert>

                {fixResult.sql && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <h4 className="font-medium mb-2">نتائج إصلاح SQL:</h4>
                    <pre className="text-xs whitespace-pre-wrap">{fixResult.sql}</pre>
                  </div>
                )}

                {fixResult.typescript && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <h4 className="font-medium mb-2">نتائج إصلاح TypeScript:</h4>
                    <p className="text-sm">{fixResult.typescript.message}</p>
                    <div className="mt-2 text-xs text-gray-600">
                      <p>فواتير البيع المُصلحة: {fixResult.typescript.details.invoicesFixed}</p>
                      <p>فواتير الشراء المُصلحة: {fixResult.typescript.details.billsFixed}</p>
                      <p>المدفوعات المُصلحة: {fixResult.typescript.details.paymentsFixed}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* تحديث البيانات */}
        <div className="flex gap-4">
          <Button 
            onClick={() => loadValidation(companyId!)} 
            variant="outline"
            disabled={!companyId}
          >
            إعادة التحقق
          </Button>
          <Button 
            onClick={loadData} 
            variant="outline"
          >
            تحديث البيانات
          </Button>
        </div>
      </main>
    </div>
  )
}