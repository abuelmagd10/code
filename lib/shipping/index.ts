// =============================================
// Shipping Module - Main Entry Point
// نقطة الدخول الرئيسية لنظام الشحن
// =============================================

import { BaseShippingAdapter } from './base-adapter'
import { AramexAdapter } from './adapters/aramex-adapter'
import { BostaAdapter } from './adapters/bosta-adapter'
import { ManualAdapter } from './adapters/manual-adapter'
import type { ShippingProviderConfig } from './types'

// تصدير الأنواع
export * from './types'
export { BaseShippingAdapter } from './base-adapter'

// قائمة الـ Adapters المتاحة
const adapters: Record<string, new (config: ShippingProviderConfig) => BaseShippingAdapter> = {
  'aramex': AramexAdapter,
  'bosta': BostaAdapter,
  'manual': ManualAdapter,
  'internal': ManualAdapter,  // مندوب داخلي
  'pickup': ManualAdapter,    // استلام من الفرع
}

/**
 * إنشاء Adapter لشركة الشحن المحددة
 */
export function createShippingAdapter(config: ShippingProviderConfig): BaseShippingAdapter {
  const code = config.provider_code?.toLowerCase() || 'manual'
  const AdapterClass = adapters[code] || ManualAdapter
  return new AdapterClass(config)
}

/**
 * الحصول على قائمة شركات الشحن المدعومة
 */
export function getSupportedProviders(): { code: string; name: string; hasApi: boolean }[] {
  return [
    { code: 'aramex', name: 'Aramex (أرامكس)', hasApi: true },
    { code: 'bosta', name: 'Bosta (بوسطة)', hasApi: true },
    { code: 'smsa', name: 'SMSA Express', hasApi: true },
    { code: 'dhl', name: 'DHL Express', hasApi: true },
    { code: 'fedex', name: 'FedEx', hasApi: true },
    { code: 'manual', name: 'Manual (يدوي)', hasApi: false },
    { code: 'internal', name: 'Internal Delivery (مندوب داخلي)', hasApi: false },
    { code: 'pickup', name: 'Branch Pickup (استلام من الفرع)', hasApi: false },
  ]
}

/**
 * التحقق من صحة بيانات شركة الشحن
 */
export function validateProviderConfig(config: Partial<ShippingProviderConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.provider_name) {
    errors.push('Provider name is required')
  }

  if (!config.base_url && !['manual', 'internal', 'pickup'].includes(config.provider_code || '')) {
    errors.push('Base URL is required for API-based providers')
  }

  if (config.auth_type === 'api_key' && !config.api_key) {
    errors.push('API Key is required for api_key authentication')
  }

  if (config.auth_type === 'basic' && (!config.api_key || !config.api_secret)) {
    errors.push('Username and Password are required for basic authentication')
  }

  if (config.auth_type === 'oauth2' && !config.oauth_token_url) {
    errors.push('OAuth Token URL is required for OAuth2 authentication')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * تشفير البيانات الحساسة (مبسط - استخدم encryption library في الإنتاج)
 */
export function encryptSensitiveData(data: string, key: string): string {
  // في الإنتاج: استخدم AES-256-GCM أو مكتبة تشفير معتمدة
  // هذا placeholder فقط
  const buffer = Buffer.from(data)
  return buffer.toString('base64')
}

/**
 * فك تشفير البيانات الحساسة
 */
export function decryptSensitiveData(encryptedData: string, key: string): string {
  // في الإنتاج: استخدم نفس مكتبة التشفير
  const buffer = Buffer.from(encryptedData, 'base64')
  return buffer.toString('utf-8')
}

/**
 * التحقق من توقيع Webhook
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha1' = 'sha256'
): boolean {
  try {
    const crypto = require('crypto')
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest('hex')
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch {
    return false
  }
}

// تصدير الـ Adapters للاستخدام المباشر إذا لزم
export { AramexAdapter } from './adapters/aramex-adapter'
export { BostaAdapter } from './adapters/bosta-adapter'
export { ManualAdapter } from './adapters/manual-adapter'

