import type { ToastActionElement, ToastProps } from "@/components/ui/toast"

type ToastFn = (props: Partial<ToastProps> & {
  title?: string
  description?: string
  action?: ToastActionElement
}) => void

/**
 * Success toast for delete actions with a consistent Arabic message.
 * Example: "تم الحذف" / "تم حذف الفاتورة بنجاح."
 */
export function toastDeleteSuccess(toast: ToastFn, resourceLabel: string) {
  toast({
    title: "تم الحذف",
    description: `تم حذف ${resourceLabel} بنجاح`,
  })
}

/**
 * Error toast for delete actions with a consistent Arabic message.
 * You can override the description with a specific failure reason.
 */
export function toastDeleteError(
  toast: ToastFn,
  resourceLabel: string,
  description?: string,
) {
  toast({
    title: "فشل الحذف",
    description: description ?? `حدث خطأ أثناء حذف ${resourceLabel}`,
    variant: "destructive",
  })
}

/**
 * Generic success toast for CRUD operations.
 * actionLabel examples: "الحفظ", "التحديث", "الإنشاء".
 */
export function toastActionSuccess(
  toast: ToastFn,
  actionLabel: string,
  resourceLabel?: string,
) {
  toast({
    title: `تم ${actionLabel}`,
    description:
      resourceLabel ? `تم ${actionLabel} ${resourceLabel} بنجاح` : `تم ${actionLabel} بنجاح`,
  })
}

/**
 * Generic error toast for CRUD operations.
 */
export function toastActionError(
  toast: ToastFn,
  actionLabel: string,
  resourceLabel?: string,
  description?: string,
) {
  toast({
    title: `فشل ${actionLabel}`,
    description:
      description ??
      (resourceLabel
        ? `حدث خطأ أثناء ${actionLabel} ${resourceLabel}`
        : `حدث خطأ أثناء ${actionLabel}`),
    variant: "destructive",
  })
}

