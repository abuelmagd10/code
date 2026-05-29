"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, Eye, EyeOff, KeyRound, ShieldCheck, ShieldOff } from "lucide-react"
import {
  estimatePassphraseStrength,
  PASSPHRASE_MIN_LENGTH,
  type EncryptedBackup,
} from "@/lib/backup/crypto-utils"

type Mode = "encrypt" | "decrypt"

export interface PassphraseDialogProps {
  open: boolean
  mode: Mode
  language: "ar" | "en"
  /** Required when mode === "decrypt" — used to show the user what file they're about to open. */
  hint?: EncryptedBackup["metadata_hint"] | null
  /** Called with the passphrase. For encrypt: caller may also receive null to mean "no encryption". */
  onConfirm: (passphrase: string | null) => void
  onCancel: () => void
  /** Optional async error to surface (e.g. "wrong passphrase"). */
  error?: string | null
}

const L = {
  ar: {
    encryptTitle: "تأمين النسخة الاحتياطية",
    encryptDesc: "كلمة المرور تُشفِّر الملف على جهازك. لا يستطيع أحد قراءة محتوى النسخة بدونها — حتى نحن.",
    decryptTitle: "النسخة الاحتياطية مُشفَّرة",
    decryptDesc: "أدخل كلمة المرور التى استخدمتها عند تصدير هذه النسخة.",
    enableLabel: "تشفير النسخة بكلمة مرور (موصى به)",
    passphrase: "كلمة المرور",
    confirm: "تأكيد كلمة المرور",
    show: "إظهار",
    hide: "إخفاء",
    strength: "قوة كلمة المرور",
    mismatch: "كلمتا المرور غير متطابقتين",
    tooShort: `الحد الأدنى ${PASSPHRASE_MIN_LENGTH} حرفاً`,
    wrong: "كلمة المرور غير صحيحة أو الملف مُتلاعَب به",
    forgetWarning: "تنبيه: إذا نسيت كلمة المرور، لن نستطيع استرداد الملف. احفظها فى مكان آمن.",
    fileInfo: "معلومات الملف",
    fileCompany: "الشركة",
    fileDate: "تاريخ الإنشاء",
    fileRecords: "عدد السجلات",
    confirmBtn: "متابعة",
    cancelBtn: "إلغاء",
    exportPlainBtn: "تصدير بدون تشفير",
    exportEncBtn: "تصدير مُشفَّر",
    unlockBtn: "فتح الملف",
  },
  en: {
    encryptTitle: "Secure your backup",
    encryptDesc: "Your passphrase encrypts the file on your device. Nobody can read its contents without it — not even us.",
    decryptTitle: "Backup is encrypted",
    decryptDesc: "Enter the passphrase you used when exporting this backup.",
    enableLabel: "Encrypt this backup with a passphrase (recommended)",
    passphrase: "Passphrase",
    confirm: "Confirm passphrase",
    show: "Show",
    hide: "Hide",
    strength: "Passphrase strength",
    mismatch: "Passphrases do not match",
    tooShort: `Minimum ${PASSPHRASE_MIN_LENGTH} characters`,
    wrong: "Wrong passphrase or the file has been tampered with",
    forgetWarning: "Warning: if you forget the passphrase, we cannot recover this file. Store it somewhere safe.",
    fileInfo: "File information",
    fileCompany: "Company",
    fileDate: "Created at",
    fileRecords: "Total records",
    confirmBtn: "Continue",
    cancelBtn: "Cancel",
    exportPlainBtn: "Export without encryption",
    exportEncBtn: "Export encrypted",
    unlockBtn: "Unlock",
  },
}

export function PassphraseDialog({
  open,
  mode,
  language,
  hint = null,
  onConfirm,
  onCancel,
  error = null,
}: PassphraseDialogProps) {
  const t = L[language]
  const dir = language === "ar" ? "rtl" : "ltr"

  const [encrypt, setEncrypt] = useState(mode === "decrypt")
  const [pass, setPass] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPass, setShowPass] = useState(false)

  // Reset when opening
  useEffect(() => {
    if (open) {
      setPass("")
      setConfirm("")
      setShowPass(false)
      setEncrypt(mode === "decrypt") // decrypt always requires passphrase
    }
  }, [open, mode])

  const strength = useMemo(() => estimatePassphraseStrength(pass), [pass])

  const tooShort = encrypt && pass.length > 0 && pass.length < PASSPHRASE_MIN_LENGTH
  const mismatch = mode === "encrypt" && encrypt && confirm.length > 0 && pass !== confirm
  const canSubmit = mode === "decrypt"
    ? pass.length >= 1
    : !encrypt || (pass.length >= PASSPHRASE_MIN_LENGTH && pass === confirm && strength.score >= 2)

  const handleSubmit = () => {
    if (mode === "encrypt" && !encrypt) {
      onConfirm(null) // user chose plain export
      return
    }
    if (!canSubmit) return
    onConfirm(pass)
  }

  const strengthColors = ["bg-rose-500", "bg-rose-400", "bg-amber-400", "bg-emerald-500", "bg-emerald-600"]
  const strengthLabel = language === "ar" ? strength.label_ar : strength.label_en

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="sm:max-w-md" dir={dir}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-blue-600" />
            {mode === "encrypt" ? t.encryptTitle : t.decryptTitle}
          </DialogTitle>
          <DialogDescription>
            {mode === "encrypt" ? t.encryptDesc : t.decryptDesc}
          </DialogDescription>
        </DialogHeader>

        {/* File info for decrypt */}
        {mode === "decrypt" && hint && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50 px-3 py-2 text-sm space-y-1">
            <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">{t.fileInfo}</p>
            <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 dark:text-gray-300">
              <span>{t.fileCompany}:</span><span className="font-medium">{hint.company_name || hint.company_id}</span>
              <span>{t.fileDate}:</span><span className="font-medium">{new Date(hint.created_at).toLocaleString(language === "ar" ? "ar-EG" : "en-US")}</span>
              <span>{t.fileRecords}:</span><span className="font-medium">{hint.total_records.toLocaleString(language === "ar" ? "ar-EG" : "en-US")}</span>
            </div>
          </div>
        )}

        {/* Encrypt-mode optional toggle */}
        {mode === "encrypt" && (
          <label className="flex items-center gap-2.5 cursor-pointer">
            <Checkbox
              id="enable-encrypt"
              checked={encrypt}
              onCheckedChange={(v) => setEncrypt(v === true)}
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t.enableLabel}
            </span>
          </label>
        )}

        {/* Passphrase fields */}
        {encrypt && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pp1">{t.passphrase}</Label>
              <div className="relative">
                <Input
                  id="pp1"
                  type={showPass ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoFocus
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                  aria-label={showPass ? t.hide : t.show}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {tooShort && (
                <p className="text-xs text-rose-600">{t.tooShort}</p>
              )}
              {mode === "encrypt" && pass.length > 0 && (
                <div className="mt-1.5">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500 dark:text-gray-400">{t.strength}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-200">{strengthLabel}</span>
                  </div>
                  <div className="flex gap-1">
                    {[0,1,2,3].map((i) => (
                      <div
                        key={i}
                        className={
                          "h-1.5 flex-1 rounded-full " +
                          (i < strength.score ? strengthColors[strength.score] : "bg-gray-200 dark:bg-slate-700")
                        }
                      />
                    ))}
                  </div>
                  {strength.score < 2 && pass.length >= PASSPHRASE_MIN_LENGTH && (
                    <ul className="mt-1.5 text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                      {(language === "ar" ? strength.reasons_ar : strength.reasons_en).slice(0, 2).map((r, i) => (
                        <li key={i}>• {r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {mode === "encrypt" && (
              <div className="space-y-1.5">
                <Label htmlFor="pp2">{t.confirm}</Label>
                <Input
                  id="pp2"
                  type={showPass ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                {mismatch && <p className="text-xs text-rose-600">{t.mismatch}</p>}
              </div>
            )}
          </div>
        )}

        {/* Encrypt-mode warning */}
        {mode === "encrypt" && encrypt && (
          <Alert variant="default" className="border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
              {t.forgetWarning}
            </AlertDescription>
          </Alert>
        )}

        {/* Wrong passphrase / error */}
        {error && (
          <Alert variant="destructive">
            <ShieldOff className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {error === "WRONG_PASSPHRASE" ? t.wrong : error}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t.cancelBtn}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
            {mode === "encrypt"
              ? (encrypt ? <><ShieldCheck className="h-4 w-4" />{t.exportEncBtn}</> : t.exportPlainBtn)
              : <><KeyRound className="h-4 w-4" />{t.unlockBtn}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
