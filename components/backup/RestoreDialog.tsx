'use client'

/**
 * نافذة استعادة النسخة الاحتياطية مع التحقق والتأكيد المزدوج
 * Restore Dialog with Validation and Double Confirmation
 */

import { useState, useEffect } from 'react'
import { AlertCircle, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
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

type RestoreStep = 'validating' | 'validation_report' | 'confirming' | 'restoring' | 'complete' | 'error'

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
  const [confirmText, setConfirmText] = useState('')
  const [confirmCheckbox, setConfirmCheckbox] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  const t = (en: string, ar: string) => (language === 'en' ? en : ar)

  // التحقق من صحة النسخة عند فتح النافذة
  useEffect(() => {
    if (open && step === 'validating') {
      validateBackup()
    }
  }, [open])

  const validateBackup = async () => {
    try {
      const response = await fetch('/api/backup/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupData })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'فشل التحقق')
      }

      const result = await response.json()
      setValidationResult(result.validation)

      if (result.validation.valid) {
        setStep('validation_report')
      } else {
        setStep('error')
        setErrorMessage(
          result.validation.errors.map((e: any) => e.message).join('\n')
        )
      }
    } catch (err: any) {
      console.error('Validation error:', err)
      setStep('error')
      setErrorMessage(err.message || t('Failed to validate backup', 'فشل التحقق من النسخة الاحتياطية'))
    }
  }

  const handleRestore = async () => {
    if (confirmText !== 'RESTORE' || !confirmCheckbox) {
      toast({
        title: t('Error', 'خطأ'),
        description: t('Please confirm the restore operation', 'يُرجى تأكيد عملية الاستعادة'),
        variant: 'destructive'
      })
      return
    }

    try {
      setStep('restoring')
      setRestoreProgress(10)

      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupData })
      })

      setRestoreProgress(50)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'فشل الاستعادة')
      }

      const result = await response.json()
      setRestoreProgress(100)

      if (result.success) {
        setStep('complete')
        toast({
          title: t('Success', 'نجح'),
          description: t(
            `Backup restored successfully (${result.result.records_restored} records)`,
            `تم استعادة النسخة الاحتياطية بنجاح (${result.result.records_restored} سجل)`
          )
        })

        // إعادة تحميل الصفحة بعد 3 ثواني
        setTimeout(() => {
          window.location.reload()
        }, 3000)
      } else {
        throw new Error(result.result.errors.join('\n'))
      }
    } catch (err: any) {
      console.error('Restore error:', err)
      setStep('error')
      setErrorMessage(err.message || t('Failed to restore backup', 'فشل استعادة النسخة الاحتياطية'))
    }
  }

  const handleClose = () => {
    if (step !== 'restoring') {
      setStep('validating')
      setValidationResult(null)
      setConfirmText('')
      setConfirmCheckbox(false)
      setRestoreProgress(0)
      setErrorMessage('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('Restore Backup', 'استعادة نسخة احتياطية')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Please review the validation report before proceeding',
              'يُرجى مراجعة تقرير التحقق قبل المتابعة'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* مرحلة التحقق */}
        {step === 'validating' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-lg font-medium">
              {t('Validating backup...', 'جاري التحقق من النسخة الاحتياطية...')}
            </p>
          </div>
        )}

        {/* تقرير التحقق */}
        {step === 'validation_report' && validationResult && (
          <div className="space-y-4">
            <ValidationReport
              validationResult={validationResult}
              backupData={backupData}
              language={language}
            />

            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">
                  {t('Final Warning:', 'تحذير نهائي:')}
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>{t('All current data will be permanently deleted', 'سيتم حذف جميع البيانات الحالية نهائياً')}</li>
                  <li>{t('This action cannot be undone', 'لا يمكن التراجع عن هذه العملية')}</li>
                  <li>{t('Make sure this is the correct backup', 'تأكد من أن هذه هي النسخة الصحيحة')}</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => setStep('confirming')}
              variant="destructive"
              className="w-full"
            >
              {t('I Understand, Proceed to Confirmation', 'أفهم ذلك، المتابعة إلى التأكيد')}
            </Button>
          </div>
        )}

        {/* مرحلة التأكيد المزدوج */}
        {step === 'confirming' && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                {t(
                  'Type "RESTORE" to confirm this action',
                  'اكتب "RESTORE" لتأكيد هذه العملية'
                )}
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('Type RESTORE to confirm:', 'اكتب RESTORE للتأكيد:')}
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESTORE"
                className="font-mono"
              />
            </div>

            <div className="flex items-start space-x-2 rtl:space-x-reverse">
              <Checkbox
                id="confirm-checkbox"
                checked={confirmCheckbox}
                onCheckedChange={(checked) => setConfirmCheckbox(checked as boolean)}
              />
              <label
                htmlFor="confirm-checkbox"
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {t(
                  'I understand that this action will permanently delete all current data and cannot be undone',
                  'أفهم أن هذه العملية ستحذف جميع البيانات الحالية نهائياً ولا يمكن التراجع عنها'
                )}
              </label>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>
                {t('Cancel', 'إلغاء')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRestore}
                disabled={confirmText !== 'RESTORE' || !confirmCheckbox}
              >
                {t('Restore Backup', 'استعادة النسخة الاحتياطية')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* مرحلة الاستعادة */}
        {step === 'restoring' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-lg font-medium">
              {t('Restoring backup...', 'جاري استعادة النسخة الاحتياطية...')}
            </p>
            <Progress value={restoreProgress} className="w-full" />
            <p className="text-sm text-muted-foreground">{restoreProgress}%</p>
          </div>
        )}

        {/* مرحلة الاكتمال */}
        {step === 'complete' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <CheckCircle className="w-16 h-16 text-green-500" />
            <p className="text-lg font-medium text-green-600">
              {t('Backup restored successfully!', 'تم استعادة النسخة الاحتياطية بنجاح!')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('The page will reload in 3 seconds...', 'سيتم إعادة تحميل الصفحة خلال 3 ثواني...')}
            </p>
          </div>
        )}

        {/* مرحلة الخطأ */}
        {step === 'error' && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <XCircle className="w-4 h-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">{t('Error:', 'خطأ:')}</p>
                <p className="text-sm whitespace-pre-wrap">{errorMessage}</p>
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button onClick={handleClose}>
                {t('Close', 'إغلاق')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

