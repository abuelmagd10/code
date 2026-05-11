"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Archive } from "lucide-react"
import type { Service } from "@/types/services"

interface ServiceArchiveDialogProps {
  service: Service | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isLoading?: boolean
  lang?: string
}

export function ServiceArchiveDialog({
  service,
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  lang = "ar",
}: ServiceArchiveDialogProps) {
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir={isAr ? "rtl" : "ltr"}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-orange-500" />
            {t("أرشفة الخدمة", "Archive Service")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              `هل أنت متأكد من أرشفة "${service?.service_name}"؟ لن تظهر الخدمة في قوائم الحجز لكن يمكن استرجاعها لاحقاً.`,
              `Are you sure you want to archive "${service?.service_name}"? It will no longer appear in booking lists but can be restored later.`
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className={isAr ? "flex-row-reverse" : ""}>
          <AlertDialogCancel disabled={isLoading}>
            {t("إلغاء", "Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {isLoading ? t("جاري الأرشفة...", "Archiving...") : t("أرشفة", "Archive")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
