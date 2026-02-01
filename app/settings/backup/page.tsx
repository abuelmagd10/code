'use client'

/**
 * صفحة النسخ الاحتياطي والاستعادة
 * Backup & Restore Page
 */

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload, AlertCircle, CheckCircle, Loader2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { useUserContext } from '@/hooks/use-user-context'
import { BackupData } from '@/lib/backup/types'
import RestoreDialog from '@/components/backup/RestoreDialog'

export default function BackupPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { userContext, loading: contextLoading } = useUserContext()

  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null)

  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreData, setRestoreData] = useState<BackupData | null>(null)
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // استخراج البيانات من userContext
  const companyId = userContext?.company_id || null
  const role = userContext?.role || null
  const [language, setLanguage] = useState<'ar' | 'en'>('ar')
  const companyName = 'Company' // يمكن جلبها من الشركة

  // تهيئة اللغة
  useEffect(() => {
    try {
      const v = localStorage.getItem('app_language') || 'ar'
      setLanguage(v === 'en' ? 'en' : 'ar')
    } catch { }
  }, [])

  const t = (en: string, ar: string) => (language === 'en' ? en : ar)

  // التحقق من الصلاحيات
  const canExport = ['owner', 'admin'].includes(role || '')
  const canRestore = role === 'owner'

  // تصدير نسخة احتياطية
  const handleExport = async () => {
    if (!companyId || !canExport) return

    try {
      setIsExporting(true)
      setExportProgress(10)

      const response = await fetch('/api/backup/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName })
      })

      setExportProgress(50)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'فشل التصدير')
      }

      const result = await response.json()
      setExportProgress(80)

      // إنشاء ملف JSON وتنزيله
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup_${companyName?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setExportProgress(100)
      setLastBackupDate(new Date().toISOString())

      toast({
        title: t('Success', 'نجح'),
        description: t(
          `Backup exported successfully (${result.info.total_records} records)`,
          `تم تصدير النسخة الاحتياطية بنجاح (${result.info.total_records} سجل)`
        )
      })
    } catch (err: any) {
      console.error('Export error:', err)
      toast({
        title: t('Error', 'خطأ'),
        description: err.message || t('Failed to export backup', 'فشل تصدير النسخة الاحتياطية'),
        variant: 'destructive'
      })
    } finally {
      setIsExporting(false)
      setTimeout(() => setExportProgress(0), 1000)
    }
  }

  // اختيار ملف للاستعادة
  const handleFileSelect = async (file: File) => {
    try {
      const text = await file.text()
      const data: BackupData = JSON.parse(text)

      if (!data.metadata || !data.data) {
        throw new Error(t('Invalid backup file format', 'تنسيق ملف النسخة الاحتياطية غير صالح'))
      }

      setRestoreFile(file)
      setRestoreData(data)
      setIsRestoreDialogOpen(true)
    } catch (err: any) {
      toast({
        title: t('Error', 'خطأ'),
        description: err.message || t('Failed to read backup file', 'فشل قراءة ملف النسخة الاحتياطية'),
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          {t('Backup & Restore', 'النسخ الاحتياطي والاستعادة')}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t(
            'Export and restore your company data safely',
            'تصدير واستعادة بيانات شركتك بأمان'
          )}
        </p>
      </div>

      {/* تصدير نسخة احتياطية */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            {t('Export Backup', 'تصدير نسخة احتياطية')}
          </CardTitle>
          <CardDescription>
            {t(
              'Create a complete backup of your company data',
              'إنشاء نسخة احتياطية كاملة لبيانات شركتك'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              {t(
                'The backup contains sensitive data. Please store it in a secure location.',
                'النسخة تحتوي على بيانات حساسة. يُرجى حفظها في مكان آمن.'
              )}
            </AlertDescription>
          </Alert>

          {canExport ? (
            <>
              <Button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full"
                size="lg"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('Exporting...', 'جاري التصدير...')}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    {t('Export Full Backup', 'تصدير نسخة احتياطية كاملة')}
                  </>
                )}
              </Button>

              {isExporting && exportProgress > 0 && (
                <div className="space-y-2">
                  <Progress value={exportProgress} />
                  <p className="text-sm text-center text-muted-foreground">
                    {exportProgress}%
                  </p>
                </div>
              )}

              {lastBackupDate && (
                <p className="text-sm text-muted-foreground text-center">
                  {t('Last backup:', 'آخر نسخة احتياطية:')}{' '}
                  {new Date(lastBackupDate).toLocaleString(language === 'en' ? 'en-US' : 'ar-EG')}
                </p>
              )}
            </>
          ) : (
            <Alert variant="destructive">
              <Shield className="w-4 h-4" />
              <AlertDescription>
                {t(
                  'Only company owners and admins can export backups',
                  'فقط مالك الشركة والمدراء يمكنهم تصدير النسخ الاحتياطية'
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* استعادة نسخة احتياطية */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            {t('Restore Backup', 'استعادة نسخة احتياطية')}
          </CardTitle>
          <CardDescription>
            {t(
              'Restore your company data from a backup file',
              'استعادة بيانات شركتك من ملف نسخة احتياطية'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="space-y-2">
              <p className="font-semibold">{t('Critical Warning:', 'تحذير خطير:')}</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>{t('All current data will be replaced', 'سيتم استبدال جميع البيانات الحالية')}</li>
                <li>{t('This action cannot be undone', 'لا يمكن التراجع عن هذه العملية')}</li>
                <li>{t('We recommend creating a backup first', 'يُنصح بعمل نسخة احتياطية أولاً')}</li>
              </ul>
            </AlertDescription>
          </Alert>

          {canRestore ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <Upload className="w-4 h-4 mr-2" />
                {t('Select Backup File', 'اختيار ملف النسخة الاحتياطية')}
              </Button>
            </>
          ) : (
            <Alert variant="destructive">
              <Shield className="w-4 h-4" />
              <AlertDescription>
                {t(
                  'Only the company owner can restore backups',
                  'فقط مالك الشركة يمكنه استعادة النسخ الاحتياطية'
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* نافذة الاستعادة */}
      {restoreData && (
        <RestoreDialog
          open={isRestoreDialogOpen}
          onOpenChange={setIsRestoreDialogOpen}
          backupData={restoreData}
          companyId={companyId || ''}
          language={language}
        />
      )}
    </div>
  )
}

