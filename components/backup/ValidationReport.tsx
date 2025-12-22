'use client'

/**
 * تقرير التحقق من صحة النسخة الاحتياطية
 * Validation Report Component
 */

import { CheckCircle, AlertTriangle, Info, Clock, Database } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { BackupData, ValidationResult } from '@/lib/backup/types'

interface ValidationReportProps {
  validationResult: ValidationResult
  backupData: BackupData
  language: 'en' | 'ar'
}

export default function ValidationReport({
  validationResult,
  backupData,
  language
}: ValidationReportProps) {
  const t = (en: string, ar: string) => (language === 'en' ? en : ar)

  const { report, warnings, errors } = validationResult

  return (
    <div className="space-y-4">
      {/* معلومات النسخة الاحتياطية */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            {t('Backup Information', 'معلومات النسخة الاحتياطية')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">{t('Company:', 'الشركة:')}</p>
              <p className="font-medium">{backupData.metadata.company_name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('Created:', 'تاريخ الإنشاء:')}</p>
              <p className="font-medium">
                {new Date(backupData.metadata.created_at).toLocaleString(
                  language === 'en' ? 'en-US' : 'ar-EG'
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('Total Records:', 'إجمالي السجلات:')}</p>
              <p className="font-medium">{backupData.metadata.total_records.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('System Version:', 'إصدار النظام:')}</p>
              <p className="font-medium">{backupData.metadata.system_version}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ملخص العملية */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            {t('Restore Summary', 'ملخص الاستعادة')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-500">
                {t('Insert', 'إدراج')}
              </Badge>
              <span className="text-sm">
                {report.summary.recordsToInsert.toLocaleString()} {t('records', 'سجل')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {t('Update', 'تحديث')}
              </Badge>
              <span className="text-sm">
                {report.summary.recordsToUpdate.toLocaleString()} {t('records', 'سجل')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">
                {t('Delete', 'حذف')}
              </Badge>
              <span className="text-sm">
                {report.summary.recordsToDelete.toLocaleString()} {t('records', 'سجل')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                {t('Estimated time:', 'الوقت المتوقع:')} {report.summary.estimatedTime}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* تفاصيل الجداول */}
      <Card>
        <CardHeader>
          <CardTitle>{t('Tables Breakdown', 'تفاصيل الجداول')}</CardTitle>
          <CardDescription>
            {t('Number of records per table', 'عدد السجلات لكل جدول')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
                  <th className="text-left py-2">{t('Table', 'الجدول')}</th>
                  <th className="text-right py-2">{t('Records', 'السجلات')}</th>
                  <th className="text-right py-2">{t('Action', 'الإجراء')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.breakdown)
                  .filter(([_, info]) => info.count > 0)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([tableName, info]) => (
                    <tr key={tableName} className="border-b">
                      <td className="py-2 font-mono text-xs">{tableName}</td>
                      <td className="text-right py-2">{info.count.toLocaleString()}</td>
                      <td className="text-right py-2">
                        <Badge
                          variant={
                            info.action === 'insert'
                              ? 'default'
                              : info.action === 'delete'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-xs"
                        >
                          {t(info.action, info.action)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* التحذيرات */}
      {warnings.length > 0 && (
        <Alert variant="default" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          <AlertDescription>
            <p className="font-semibold mb-2 text-yellow-800 dark:text-yellow-200">
              {t('Warnings:', 'تحذيرات:')}
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
              {warnings.map((warning, index) => (
                <li key={index}>{warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* الأخطاء */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            <p className="font-semibold mb-2">{t('Errors:', 'أخطاء:')}</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {errors.map((error, index) => (
                <li key={index}>{error.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* تقييم المخاطر */}
      <Alert
        variant={
          report.risks.dataLoss === 'high'
            ? 'destructive'
            : report.risks.dataLoss === 'medium'
            ? 'default'
            : 'default'
        }
      >
        <Info className="w-4 h-4" />
        <AlertDescription>
          <p className="font-semibold mb-1">
            {t('Risk Assessment:', 'تقييم المخاطر:')}
            <Badge
              variant={
                report.risks.dataLoss === 'high'
                  ? 'destructive'
                  : report.risks.dataLoss === 'medium'
                  ? 'secondary'
                  : 'default'
              }
              className="ml-2"
            >
              {t(report.risks.dataLoss.toUpperCase(), report.risks.dataLoss)}
            </Badge>
          </p>
          <p className="text-sm">{report.risks.recommendation}</p>
        </AlertDescription>
      </Alert>

      {/* حالة التحقق */}
      {validationResult.valid ? (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {t(
              'Backup validation passed. You can proceed with the restore.',
              'تم التحقق من النسخة الاحتياطية بنجاح. يمكنك المتابعة بالاستعادة.'
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            {t(
              'Backup validation failed. Please fix the errors before proceeding.',
              'فشل التحقق من النسخة الاحتياطية. يُرجى إصلاح الأخطاء قبل المتابعة.'
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

