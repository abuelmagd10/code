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
import { Trash2 } from "lucide-react"
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
            <Trash2 className="w-5 h-5 text-red-500" />
            {t("حذف الخدمة", "Delete Service")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              `هل أنت متأكد من حذف "${service?.service_name}"؟ الخدمة هتختفى من قوائم الحجز فوراً. لو فيها حجوزات نشطة، الحذف هيتوقف وهيظهرلك سبب واضح.`,
              `Are you sure you want to delete "${service?.service_name}"? It will disappear from booking lists immediately. If it has active bookings, deletion will be blocked with a clear reason.`
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
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading ? t("جارٍ الحذف...", "Deleting...") : t("حذف", "Delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
