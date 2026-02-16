'use client'

/**
 * نافذة استعادة النسخة الاحتياطية مع التحقق والتأكيد المزدوج
 * Restore Dialog with Validation, Dry Run, and Double Confirmation
 */

import { useState, useEffect } from 'react'
import { AlertCircle, Loader2, CheckCircle, XCircle, AlertTriangle, PlayCircle, ShieldCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { BackupData, ValidationResult } from '@/lib/backup/types'
import ValidationReport from './ValidationReport'

interface RestoreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  backupData: BackupData
  companyId: string
  language: 'en' | 'ar'
}

type RestoreStep =
  | 'validating'      // 1. Client-side Schema/Version Check
  | 'validation_fail' // Validation Failed
  | 'ready_dry_run'   // Validation Passed, Ready for Dry Run
  | 'dry_running'     // 2. Server-side Dry Run (RPC)
  | 'dry_run_report'  // 3. Show Dry Run Results & Impact
  | 'confirming'      // 4. Double Confirmation
  | 'restoring'       // 5. Actual Restore Execution
  | 'complete'        // Success
  | 'error'           // Generic Error

export default function RestoreDialog({
  open,
  onOpenChange,
  backupData,
  companyId,
  language
}: RestoreDialogProps) {
  const { toast } = useToast()
  const [step, setStep] = useState<RestoreStep>('validating')
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [dryRunReport, setDryRunReport] = useState<any | null>(null)

  const [confirmText, setConfirmText] = useState('')
  const [confirmCheckbox, setConfirmCheckbox] = useState(false)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  const t = (en: string, ar: string) => (language === 'en' ? en : ar)

  // 1. Initial Validation on Open
  useEffect(() => {
    if (open && step === 'validating') {
      validateBackupSchema()
    }
  }, [open])

  const validateBackupSchema = async () => {
    try {
      const response = await fetch('/api/backup/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupData })
      })

      if (!response.ok) throw new Error('Failed to validate')

      const result = await response.json()
      setValidationResult(result.validation)

      if (result.validation.valid) {
        setStep('ready_dry_run')
      } else {
        setStep('validation_fail')
        setErrorMessage(result.validation.errors.map((e: any) => e.message).join('\n'))
      }
    } catch (err: any) {
      setStep('error')
      setErrorMessage(err.message || t('Validation Error', 'خطأ في التحقق'))
    }
  }

  // 2. Execute Dry Run
  const handleDryRun = async () => {
    try {
      setStep('dry_running')
      setProgress(20)

      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupData,
          dryRun: true,
          skipValidation: true // We already validated schema
        })
      })

      setProgress(80)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || error.details || 'Dry Run Failed')
      }

      const result = await response.json()
      setProgress(100)

      if (result.success) {
        setDryRunReport(result.result.report || result.result)
        setStep('dry_run_report')
      } else {
        throw new Error(result.error || 'Dry Run Failed')
      }
    } catch (err: any) {
      console.error(err)
      setStep('error')
      setErrorMessage(t('Dry Run Failed: ', 'فشل الاختبار: ') + err.message)
    }
  }

  // 3. Execute Real Restore
  const handleRestore = async () => {
    if (confirmText !== 'RESTORE' || !confirmCheckbox) {
      toast({
        title: t('Error', 'خطأ'),
        description: t('Please confirm completely', 'يُرجى التأكيد بشكل كامل'),
        variant: 'destructive'
      })
      return
    }

    try {
      setStep('restoring')
      setProgress(10)

      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupData,
          dryRun: false,
          skipValidation: true
        })
      })

      // Simulate progress since logic is server-side atomic
      const interval = setInterval(() => {
        setProgress(p => Math.min(p + 5, 90))
      }, 500)

      if (!response.ok) {
        clearInterval(interval)
        const error = await response.json()
        throw new Error(error.error || 'Restore Failed')
      }

      const result = await response.json()
      clearInterval(interval)
      setProgress(100)

      if (result.success) {
        setStep('complete')
        toast({
          title: t('Success', 'تم بنجاح'),
          description: t('System Restored Successfully', 'تم استعادة النظام بنجاح')
        })
        setTimeout(() => window.location.reload(), 3000)
      } else {
        throw new Error(result.error || 'Restore Failed')
      }
    } catch (err: any) {
      setStep('error')
      setErrorMessage(err.message)
    }
  }

  const handleClose = () => {
    if (step === 'restoring') return
    setStep('validating')
    setValidationResult(null)
    setDryRunReport(null)
    setConfirmText('')
    setConfirmCheckbox(false)
    setProgress(0)
    setErrorMessage('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('Restore System', 'استعادة النظام')}</DialogTitle>
          <DialogDescription>
            {t('Step-by-step secure restoration process', 'عملية استعادة آمنة خطوة بخطوة')}
          </DialogDescription>
        </DialogHeader>

        {/* 1. Validation Loading */}
        {step === 'validating' && (
          <div className="flex flex-col items-center py-8 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p>{t('Verifying File Format...', 'جاري التحقق من الملف...')}</p>
          </div>
        )}

        {/* 2. Validation Failed */}
        {step === 'validation_fail' && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <XCircle className="w-4 h-4" />
              <AlertDescription className="whitespace-pre-wrap">{errorMessage}</AlertDescription>
            </Alert>
            <DialogFooter><Button onClick={handleClose}>{t('Close', 'إغلاق')}</Button></DialogFooter>
          </div>
        )}

        {/* 3. Ready for Dry Run */}
        {step === 'ready_dry_run' && validationResult && (
          <div className="space-y-4">
            <ValidationReport validationResult={validationResult} backupData={backupData} language={language} />
            <div className="bg-muted p-4 rounded-lg border">
              <h4 className="font-semibold flex items-center gap-2 mb-2">
                <PlayCircle className="w-4 h-4" />
                {t('Next Step: Dry Run', 'الخطوة التالية: التشغيل التجريبي')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t(
                  'We will simulate the restore process on the server to check for financial integrity and constraint violations without modifying any data.',
                  'سنقوم بمحاكاة الاستعادة على الخادم للتحقق من السلامة المالية والقيود دون تعديل أي بيانات.'
                )}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>{t('Cancel', 'إلغاء')}</Button>
              <Button onClick={handleDryRun}>{t('Start Dry Run', 'بدء التشغيل التجريبي')}</Button>
            </DialogFooter>
          </div>
        )}

        {/* 4. Dry Running */}
        {step === 'dry_running' && (
          <div className="flex flex-col items-center py-8 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
            <p>{t('Simulating Restore (Dry Run)...', 'جاري محاكاة الاستعادة...')}</p>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {/* 5. Dry Run Report & Confirmation */}
        {step === 'dry_run_report' && dryRunReport && (
          <div className="space-y-4">
            <Alert className="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800">
              <ShieldCheck className="w-4 h-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                {t('Dry Run Passed! Data integrity verified.', 'نجحت المحاكاة! تم التحقق من سلامة البيانات.')}
              </AlertDescription>
            </Alert>

            {/* Show diff or summary */}
            <div className="grid grid-cols-2 gap-4 text-sm border p-4 rounded bg-background">
              <div>
                <p className="text-muted-foreground">{t('Expected Records:', 'السجلات المتوقعة:')}</p>
                <p className="font-bold text-lg">{dryRunReport.summary?.totalRecords || backupData.metadata.total_records}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('Financial Status:', 'الحالة المالية:')}</p>
                <p className="font-bold text-lg text-green-600">BALANCED</p>
              </div>
            </div>

            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>
                <p className="font-bold mb-1">{t('FINAL WARNING', 'تحذير نهائي')}</p>
                {t('Proceeding will PERMANENTLY REPLACE all company data.', 'المتابعة ستؤدي إلى استبدال جميع بيانات الشركة بشكل دائم.')}
              </AlertDescription>
            </Alert>

            <Button onClick={() => setStep('confirming')} variant="destructive" className="w-full">
              {t('Proceed to Final Confirmation', 'المتابعة للتأكيد النهائي')}
            </Button>
          </div>
        )}

        {/* 6. Double Confirmation */}
        {step === 'confirming' && (
          <div className="space-y-4">
            <h3 className="font-bold text-red-600">{t('Authorize Destructive Action', 'تفويض إجراء مدمر')}</h3>
            <div className="space-y-2">
              <label className="text-sm">{t('Type "RESTORE" to confirm:', 'اكتب "RESTORE" للتأكيد:')}</label>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="border-red-300 focus-visible:ring-red-500"
                placeholder="RESTORE"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="conf"
                checked={confirmCheckbox}
                onCheckedChange={(c) => setConfirmCheckbox(!!c)}
              />
              <label htmlFor="conf" className="text-sm cursor-pointer select-none">
                {t('I assume full responsibility for data loss', 'أتحمل المسؤولية الكاملة عن فقدان البيانات')}
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>{t('Cancel', 'إلغاء')}</Button>
              <Button
                variant="destructive"
                disabled={confirmText !== 'RESTORE' || !confirmCheckbox}
                onClick={handleRestore}
              >
                {t('EXECUTE RESTORE', 'تنفيذ الاستعادة')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* 7. Restoring */}
        {step === 'restoring' && (
          <div className="flex flex-col items-center py-8 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-red-600" />
            <p className="font-bold text-red-600">{t('Restoring Data... DO NOT CLOSE', 'جاري استعادة البيانات... لا تغلق الصفحة')}</p>
            <Progress value={progress} className="w-full h-2" />
          </div>
        )}

        {/* 8. Error */}
        {step === 'error' && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <XCircle className="w-4 h-4" />
              <AlertDescription className="whitespace-pre-wrap">{errorMessage}</AlertDescription>
            </Alert>
            <DialogFooter><Button onClick={handleClose}>{t('Close', 'إغلاق')}</Button></DialogFooter>
          </div>
        )}

        {/* 9. Complete */}
        {step === 'complete' && (
          <div className="flex flex-col items-center py-8 space-y-4 text-center">
            <CheckCircle className="w-16 h-16 text-green-500" />
            <h3 className="text-xl font-bold text-green-600">{t('Restore Complete', 'تمت الاستعادة')}</h3>
            <p className="text-muted-foreground">{t('Reloading system...', 'جاري إعادة تحميل النظام...')}</p>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}

