import type { ToastActionElement, ToastProps } from "@/components/ui/toast"
import { getErrorMessage, commonErrorMessages } from '@/lib/error-messages'

type ToastFn = (props: Partial<ToastProps> & {
  title?: string
  description?: string
  action?: ToastActionElement
}) => void

type Language = 'ar' | 'en'

/**
 * Success toast for delete actions with bilingual support.
 * Example: "تم الحذف" / "تم حذف الفاتورة بنجاح."
 */
export function toastDeleteSuccess(toast: ToastFn, resourceLabel: string, lang: Language = 'ar') {
  const messages = {
    ar: {
      title: "تم الحذف",
      description: `تم حذف ${resourceLabel} بنجاح`
    },
    en: {
      title: "Deleted Successfully",
      description: `${resourceLabel} has been deleted successfully`
    }
  }
  
  toast({
    title: messages[lang].title,
    description: messages[lang].description,
  })
}

/**
 * Error toast for delete actions with bilingual support.
 * You can override the description with a specific failure reason.
 */
export function toastDeleteError(
  toast: ToastFn,
  resourceLabel: string,
  description?: string,
  lang: Language = 'ar'
) {
  const messages = {
    ar: {
      title: "فشل الحذف",
      defaultDescription: `حدث خطأ أثناء حذف ${resourceLabel}`
    },
    en: {
      title: "Delete Failed",
      defaultDescription: `Failed to delete ${resourceLabel}`
    }
  }
  
  toast({
    title: messages[lang].title,
    description: description ?? messages[lang].defaultDescription,
    variant: "destructive",
  })
}

/**
 * Generic success toast for CRUD operations with bilingual support.
 * actionLabel examples: "الحفظ", "التحديث", "الإنشاء" / "Save", "Update", "Create".
 */
export function toastActionSuccess(
  toast: ToastFn,
  actionLabel: string,
  resourceLabel?: string,
  lang: Language = 'ar'
) {
  const messages = {
    ar: {
      title: `تم ${actionLabel}`,
      description: resourceLabel ? `تم ${actionLabel} ${resourceLabel} بنجاح` : `تم ${actionLabel} بنجاح`
    },
    en: {
      title: `${actionLabel} Successful`,
      description: resourceLabel ? `${resourceLabel} has been ${actionLabel.toLowerCase()}d successfully` : `${actionLabel} completed successfully`
    }
  }
  
  toast({
    title: messages[lang].title,
    description: messages[lang].description,
  })
}

/**
 * Generic error toast for CRUD operations with bilingual support and unified error messages.
 */
export function toastActionError(
  toast: ToastFn,
  actionLabel: string,
  resourceLabel?: string,
  description?: string,
  lang: Language = 'ar',
  errorKey?: string
) {
  let errorMessage = description
  
  // Use unified error message if errorKey is provided
  if (errorKey) {
    errorMessage = getErrorMessage(errorKey, lang)
  }
  
  const messages = {
    ar: {
      title: `فشل ${actionLabel}`,
      defaultDescription: resourceLabel
        ? `حدث خطأ أثناء ${actionLabel} ${resourceLabel}`
        : `حدث خطأ أثناء ${actionLabel}`
    },
    en: {
      title: `${actionLabel} Failed`,
      defaultDescription: resourceLabel
        ? `Failed to ${actionLabel.toLowerCase()} ${resourceLabel}`
        : `Failed to ${actionLabel.toLowerCase()}`
    }
  }
  
  toast({
    title: messages[lang].title,
    description: errorMessage ?? messages[lang].defaultDescription,
    variant: "destructive",
  })
}

