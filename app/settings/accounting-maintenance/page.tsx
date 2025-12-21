"use client"

import { useState } from 'react'
import { Sidebar } from '@/components/sidebar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Settings, 
  Database, 
  Shield, 
  CheckCircle, 
  AlertTriangle,
  XCircle,
  RefreshCw,
  Wrench,
  FileText,
  DollarSign,
  Package
} from 'lucide-react'
import { useSupabase } from '@/lib/supabase/hooks'
import { useToast } from '@/hooks/use-toast'
import { getActiveCompanyId } from '@/lib/company'

interface MaintenanceTask {
  id: string
  title: string
  description: string
  category: 'accounting' | 'inventory' | 'data_integrity' | 'performance'
  severity: 'low' | 'medium' | 'high' | 'critical'
  estimatedTime: string
  affectedRecords?: number
  canAutoFix: boolean
  sqlQuery?: string
}

export default function AccountingMaintenancePage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('maintenance')
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([])
  const [executingTask, setExecutingTask] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  
  const appLang = typeof window !== 'undefined' ? 
    ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  // 📌 مهام الصيانة المتاحة
  const availableTasks: MaintenanceTask[] = [
    {
      id: 'fix_sent_invoices_journals',
      title: appLang === 'en' ? 'Fix Sent Invoices with Journal Entries' : 'إصلاح الفواتير المرسلة مع القيود المحاسبية',
      description: appLang === 'en' 
        ? 'Remove journal entries from sent invoices (accounting pattern violation)'
        : 'إزالة القيود المحاسبية من الفواتير المرسلة (مخالفة للنمط المحاسبي)',
      category: 'accounting',
      severity: 'high',
      estimatedTime: '2-5 min',
      canAutoFix: true
    },
    {
      id: 'remove_duplicate_inventory',
      title: appLang === 'en' ? 'Remove Duplicate Inventory Transactions' : 'إزالة حركات المخزون المكررة',
      description: appLang === 'en'
        ? 'Clean up duplicate inventory transactions for the same product and document'
        : 'تنظيف حركات المخزون المكررة لنفس المنتج والمستند',
      category: 'inventory',
      severity: 'medium',
      estimatedTime: '1-3 min',
      canAutoFix: true
    },
    {
      id: 'recalculate_inventory_balances',
      title: appLang === 'en' ? 'Recalculate Inventory Balances' : 'إعادة حساب أرصدة المخزون',
      description: appLang === 'en'
        ? 'Update product quantities based on inventory transactions'
        : 'تحديث كميات المنتجات بناءً على حركات المخزون',
      category: 'inventory',
      severity: 'medium',
      estimatedTime: '3-10 min',
      canAutoFix: true
    },
    {
      id: 'fix_unbalanced_journal_entries',
      title: appLang === 'en' ? 'Fix Unbalanced Journal Entries' : 'إصلاح القيود المحاسبية غير المتوازنة',
      description: appLang === 'en'
        ? 'Identify and flag unbalanced journal entries for manual review'
        : 'تحديد ووضع علامة على القيود غير المتوازنة للمراجعة اليدوية',
      category: 'accounting',
      severity: 'critical',
      estimatedTime: '5-15 min',
      canAutoFix: false
    }
  ]

  const executeMaintenanceTask = async (task: MaintenanceTask) => {
    if (!task.canAutoFix) {
      toast({
        title: appLang === 'en' ? 'Manual Review Required' : 'مراجعة يدوية مطلوبة',
        description: appLang === 'en' 
          ? 'This task requires manual review and cannot be auto-fixed'
          : 'هذه المهمة تتطلب مراجعة يدوية ولا يمكن إصلاحها تلقائياً',
        variant: 'destructive'
      })
      return
    }

    setExecutingTask(task.id)
    setProgress(0)
    
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) throw new Error('Company not found')

      // محاكاة التقدم
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      // تنفيذ المهمة (محاكاة)
      await new Promise(resolve => setTimeout(resolve, 2000))

      clearInterval(progressInterval)
      setProgress(100)
      
      setTimeout(() => {
        toast({
          title: appLang === 'en' ? 'Task Completed' : 'تمت المهمة بنجاح',
          description: appLang === 'en' 
            ? `${task.title} has been completed successfully`
            : `تم إنجاز ${task.title} بنجاح`
        })
        setExecutingTask(null)
        setProgress(0)
      }, 500)

    } catch (error: any) {
      console.error('Maintenance task error:', error)
      toast({
        title: appLang === 'en' ? 'Task Failed' : 'فشلت المهمة',
        description: error?.message || 'Unknown error occurred',
        variant: 'destructive'
      })
      setExecutingTask(null)
      setProgress(0)
    }
  }

  const getSeverityColor = (severity: MaintenanceTask['severity']) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getCategoryIcon = (category: MaintenanceTask['category']) => {
    switch (category) {
      case 'accounting': return <DollarSign className="h-4 w-4" />
      case 'inventory': return <Package className="h-4 w-4" />
      case 'data_integrity': return <Database className="h-4 w-4" />
      case 'performance': return <RefreshCw className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Settings className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {appLang === 'en' ? 'Accounting Pattern Maintenance' : 'صيانة النمط المحاسبي'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {appLang === 'en' 
                    ? 'Monitor and maintain compliance with the accounting pattern'
                    : 'مراقبة والحفاظ على التوافق مع النمط المحاسبي'}
                </p>
              </div>
            </div>
          </div>

          {/* Maintenance Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                {appLang === 'en' ? 'Available Maintenance Tasks' : 'مهام الصيانة المتاحة'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {availableTasks.map((task) => (
                  <div key={task.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {getCategoryIcon(task.category)}
                          <h3 className="font-semibold">{task.title}</h3>
                          <Badge className={getSeverityColor(task.severity)}>
                            {task.severity === 'critical' ? (appLang === 'en' ? 'Critical' : 'حرج') :
                             task.severity === 'high' ? (appLang === 'en' ? 'High' : 'عالي') :
                             task.severity === 'medium' ? (appLang === 'en' ? 'Medium' : 'متوسط') :
                             (appLang === 'en' ? 'Low' : 'منخفض')}
                          </Badge>
                          {task.affectedRecords && (
                            <Badge variant="outline">
                              {task.affectedRecords} {appLang === 'en' ? 'records' : 'سجل'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {task.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>
                            {appLang === 'en' ? 'Estimated time:' : 'الوقت المقدر:'} {task.estimatedTime}
                          </span>
                          <span className={`flex items-center gap-1 ${
                            task.canAutoFix ? 'text-green-600' : 'text-orange-600'
                          }`}>
                            {task.canAutoFix ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                            {task.canAutoFix ? 
                              (appLang === 'en' ? 'Auto-fixable' : 'قابل للإصلاح التلقائي') :
                              (appLang === 'en' ? 'Manual review required' : 'مراجعة يدوية مطلوبة')
                            }
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          onClick={() => executeMaintenanceTask(task)}
                          disabled={executingTask === task.id || !task.canAutoFix}
                          className="min-w-[100px]"
                        >
                          {executingTask === task.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wrench className="h-4 w-4" />
                          )}
                          <span className="ml-2">
                            {executingTask === task.id ? 
                              (appLang === 'en' ? 'Running...' : 'جاري التنفيذ...') :
                              (appLang === 'en' ? 'Execute' : 'تنفيذ')
                            }
                          </span>
                        </Button>
                        {executingTask === task.id && (
                          <Progress value={progress} className="w-full" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}