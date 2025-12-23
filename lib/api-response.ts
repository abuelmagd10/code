/**
 * نظام استجابة API موحد - Production Ready
 * 
 * يوفر نمط موحد لجميع استجابات API مع:
 * - Error codes واضحة
 * - رسائل آمنة للمستخدم
 * - Logging داخلي بدون كشف بيانات حساسة
 */

import { NextResponse } from 'next/server'

// ✅ Error Codes الموحدة
export const API_ERROR_CODES = {
  // Authentication & Authorization (401, 403)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // Resource Not Found (404)
  NOT_FOUND: 'NOT_FOUND',
  COMPANY_NOT_FOUND: 'COMPANY_NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  
  // Validation Errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Business Logic Errors (422)
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Server Errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const

export type ApiErrorCode = typeof API_ERROR_CODES[keyof typeof API_ERROR_CODES]

// ✅ نوع الاستجابة الموحد
export interface ApiResponse<T = any> {
  success: boolean
  code?: ApiErrorCode | string
  message?: string
  messageEn?: string
  data?: T
  error?: string
  details?: any
  timestamp?: string
}

/**
 * ✅ إنشاء استجابة نجاح موحدة
 */
export function apiSuccess<T = any>(
  data?: T,
  message?: string,
  messageEn?: string
): NextResponse<ApiResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    message,
    messageEn,
    timestamp: new Date().toISOString()
  }, { status: 200 })
}

/**
 * ✅ إنشاء استجابة خطأ موحدة
 */
export function apiError(
  status: number,
  code: ApiErrorCode | string,
  message: string,
  messageEn?: string,
  details?: any,
  internalError?: any
): NextResponse<ApiResponse> {
  // ✅ تسجيل الخطأ داخلياً فقط (بدون كشف للمستخدم)
  if (internalError) {
    console.error(`[API Error] ${code}:`, {
      message,
      status,
      details,
      error: internalError instanceof Error ? internalError.message : internalError,
      stack: internalError instanceof Error ? internalError.stack : undefined
    })
  }

  // ✅ إرجاع استجابة آمنة للمستخدم
  return NextResponse.json({
    success: false,
    code,
    message,
    messageEn,
    details: process.env.NODE_ENV === 'development' ? details : undefined,
    timestamp: new Date().toISOString()
  }, { status })
}

/**
 * ✅ 401 Unauthorized
 */
export function unauthorizedError(
  message: string = 'غير مصرح - يرجى تسجيل الدخول',
  messageEn: string = 'Unauthorized - Please login'
) {
  return apiError(401, API_ERROR_CODES.UNAUTHORIZED, message, messageEn)
}

/**
 * ✅ 403 Forbidden
 */
export function forbiddenError(
  message: string = 'ممنوع - ليس لديك صلاحية',
  messageEn: string = 'Forbidden - Insufficient permissions'
) {
  return apiError(403, API_ERROR_CODES.FORBIDDEN, message, messageEn)
}

/**
 * ✅ 404 Not Found
 */
export function notFoundError(
  resource: string = 'المورد',
  messageEn: string = 'Resource not found'
) {
  return apiError(
    404,
    API_ERROR_CODES.NOT_FOUND,
    `${resource} غير موجود`,
    messageEn
  )
}

/**
 * ✅ 400 Bad Request / Validation Error
 */
export function validationError(
  message: string = 'بيانات غير صالحة',
  messageEn: string = 'Invalid data',
  details?: any
) {
  return apiError(400, API_ERROR_CODES.VALIDATION_ERROR, message, messageEn, details)
}

/**
 * ✅ 500 Internal Server Error
 */
export function internalServerError(
  message: string = 'حدث خطأ في السيرفر',
  messageEn: string = 'Internal server error',
  internalError?: any
) {
  return apiError(
    500,
    API_ERROR_CODES.INTERNAL_ERROR,
    message,
    messageEn,
    undefined,
    internalError
  )
}

