/**
 * API Error Handler - معالجة موحدة للأخطاء
 * =============================================
 * يوفر:
 * 1. أرقام HTTP Status موحدة
 * 2. رسائل خطأ موحدة (عربي/إنجليزي)
 * 3. تنسيق موحد لاستجابات الأخطاء
 * =============================================
 */

import { NextResponse } from "next/server"

/**
 * أرقام HTTP Status موحدة
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const

/**
 * رسائل خطأ موحدة (عربي/إنجليزي)
 */
export const ERROR_MESSAGES = {
  UNAUTHORIZED: {
    ar: "غير مصرح - يرجى تسجيل الدخول",
    en: "Unauthorized - Please log in"
  },
  FORBIDDEN: {
    ar: "ليس لديك الصلاحية للوصول إلى هذا المورد",
    en: "You do not have permission to access this resource"
  },
  NOT_FOUND: {
    ar: "المورد المطلوب غير موجود",
    en: "The requested resource was not found"
  },
  VALIDATION_ERROR: {
    ar: "خطأ في التحقق من البيانات",
    en: "Validation error"
  },
  INTERNAL_ERROR: {
    ar: "حدث خطأ داخلي في الخادم",
    en: "Internal server error"
  },
  BAD_REQUEST: {
    ar: "طلب غير صحيح",
    en: "Bad request"
  },
  MISSING_PARAMS: {
    ar: "بيانات ناقصة",
    en: "Missing required parameters"
  },
  SERVER_NOT_CONFIGURED: {
    ar: "خطأ في إعدادات الخادم",
    en: "Server configuration error"
  },
  NO_COMPANY: {
    ar: "لم يتم العثور على الشركة",
    en: "Company not found"
  },
  CONFLICT: {
    ar: "تعارض في البيانات",
    en: "Data conflict"
  }
} as const

export interface ApiErrorResponse {
  error: string
  error_en?: string
  details?: any
  code?: string
}

/**
 * إنشاء استجابة خطأ موحدة
 * 
 * @param status - رقم HTTP Status
 * @param message - رسالة الخطأ (عربي)
 * @param messageEn - رسالة الخطأ (إنجليزي) - اختياري
 * @param details - تفاصيل إضافية - اختياري
 * @param code - كود خطأ مخصص - اختياري
 * @returns NextResponse
 * 
 * @example
 * ```typescript
 * return apiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHORIZED.ar)
 * ```
 */
export function apiError(
  status: number,
  message: string,
  messageEn?: string,
  details?: any,
  code?: string
): NextResponse {
  const response: ApiErrorResponse = {
    error: message,
    ...(messageEn && { error_en: messageEn }),
    ...(details && { details }),
    ...(code && { code })
  }

  return NextResponse.json(response, { status })
}

/**
 * Helper: خطأ Unauthorized (401)
 */
export function unauthorizedError(
  customMessage?: string,
  details?: any
): NextResponse {
  return apiError(
    HTTP_STATUS.UNAUTHORIZED,
    customMessage || ERROR_MESSAGES.UNAUTHORIZED.ar,
    ERROR_MESSAGES.UNAUTHORIZED.en,
    details,
    "UNAUTHORIZED"
  )
}

/**
 * Helper: خطأ Forbidden (403)
 */
export function forbiddenError(
  customMessage?: string,
  details?: any
): NextResponse {
  return apiError(
    HTTP_STATUS.FORBIDDEN,
    customMessage || ERROR_MESSAGES.FORBIDDEN.ar,
    ERROR_MESSAGES.FORBIDDEN.en,
    details,
    "FORBIDDEN"
  )
}

/**
 * Helper: خطأ Not Found (404)
 */
export function notFoundError(
  resource?: string,
  details?: any
): NextResponse {
  const message = resource 
    ? `${resource} غير موجود`
    : ERROR_MESSAGES.NOT_FOUND.ar
  const messageEn = resource
    ? `${resource} not found`
    : ERROR_MESSAGES.NOT_FOUND.en

  return apiError(
    HTTP_STATUS.NOT_FOUND,
    message,
    messageEn,
    details,
    "NOT_FOUND"
  )
}

/**
 * Helper: خطأ Validation (422)
 */
export function validationError(
  field?: string,
  details?: any
): NextResponse {
  const message = field
    ? `خطأ في التحقق من ${field}`
    : ERROR_MESSAGES.VALIDATION_ERROR.ar
  const messageEn = field
    ? `Validation error for ${field}`
    : ERROR_MESSAGES.VALIDATION_ERROR.en

  return apiError(
    HTTP_STATUS.VALIDATION_ERROR,
    message,
    messageEn,
    details,
    "VALIDATION_ERROR"
  )
}

/**
 * Helper: خطأ Bad Request (400)
 */
export function badRequestError(
  customMessage?: string,
  details?: any
): NextResponse {
  return apiError(
    HTTP_STATUS.BAD_REQUEST,
    customMessage || ERROR_MESSAGES.BAD_REQUEST.ar,
    ERROR_MESSAGES.BAD_REQUEST.en,
    details,
    "BAD_REQUEST"
  )
}

/**
 * Helper: خطأ Internal Server Error (500)
 */
export function internalError(
  customMessage?: string,
  details?: any
): NextResponse {
  return apiError(
    HTTP_STATUS.INTERNAL_ERROR,
    customMessage || ERROR_MESSAGES.INTERNAL_ERROR.ar,
    ERROR_MESSAGES.INTERNAL_ERROR.en,
    details,
    "INTERNAL_ERROR"
  )
}

/**
 * Helper: خطأ Missing Parameters (400)
 */
export function missingParamsError(
  params?: string[],
  details?: any
): NextResponse {
  const message = params
    ? `بيانات ناقصة: ${params.join(", ")}`
    : ERROR_MESSAGES.MISSING_PARAMS.ar
  const messageEn = params
    ? `Missing parameters: ${params.join(", ")}`
    : "Missing required parameters"

  return apiError(
    HTTP_STATUS.BAD_REQUEST,
    message,
    messageEn,
    details,
    "MISSING_PARAMS"
  )
}

/**
 * Helper: نجاح مع بيانات
 */
export function apiSuccess<T>(
  data: T,
  status: number = HTTP_STATUS.OK
): NextResponse {
  return NextResponse.json(data, { status })
}

/**
 * Helper: نجاح بدون بيانات (204)
 */
export function apiSuccessNoContent(): NextResponse {
  return new NextResponse(null, { status: HTTP_STATUS.NO_CONTENT })
}
