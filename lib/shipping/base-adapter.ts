// =============================================
// Base Shipping Adapter
// الـ Adapter الأساسي لشركات الشحن
// =============================================

import type {
  ShippingProviderConfig,
  CreateShipmentRequest,
  CreateShipmentResponse,
  TrackShipmentRequest,
  TrackShipmentResponse,
  CancelShipmentRequest,
  CancelShipmentResponse,
  PrintLabelRequest,
  PrintLabelResponse,
} from './types'

/**
 * الـ Adapter الأساسي - يجب أن ترث منه جميع adapters شركات الشحن
 */
export abstract class BaseShippingAdapter {
  protected config: ShippingProviderConfig
  protected providerCode: string

  constructor(config: ShippingProviderConfig) {
    this.config = config
    this.providerCode = config.provider_code || 'unknown'
  }

  /**
   * الحصول على رابط API المناسب حسب البيئة
   */
  protected getBaseUrl(): string {
    if (this.config.environment === 'sandbox' && this.config.sandbox_url) {
      return this.config.sandbox_url
    }
    return this.config.base_url
  }

  /**
   * إنشاء Headers المصادقة حسب نوع المصادقة
   */
  protected async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    switch (this.config.auth_type) {
      case 'api_key':
        if (this.config.api_key) {
          headers['Authorization'] = `Bearer ${this.config.api_key}`
          // بعض الشركات تستخدم X-API-Key
          headers['X-API-Key'] = this.config.api_key
        }
        if (this.config.api_secret) {
          headers['X-API-Secret'] = this.config.api_secret
        }
        break

      case 'basic':
        if (this.config.api_key && this.config.api_secret) {
          const credentials = Buffer.from(`${this.config.api_key}:${this.config.api_secret}`).toString('base64')
          headers['Authorization'] = `Basic ${credentials}`
        }
        break

      case 'oauth2':
        const token = await this.getOAuthToken()
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
        break

      case 'custom':
        // يتم تخصيصها في الـ adapter الفرعي
        break
    }

    // إضافة رقم الحساب إن وجد
    if (this.config.account_number) {
      headers['X-Account-Number'] = this.config.account_number
    }

    return headers
  }

  /**
   * الحصول على OAuth Token (مع تجديده إذا لزم)
   */
  protected async getOAuthToken(): Promise<string | null> {
    // التحقق من صلاحية التوكن الحالي
    if (this.config.oauth_token && this.config.oauth_expires_at) {
      const expiresAt = new Date(this.config.oauth_expires_at)
      if (expiresAt > new Date()) {
        return this.config.oauth_token
      }
    }

    // تجديد التوكن إذا كان منتهي
    if (this.config.oauth_refresh_token && this.config.oauth_token_url) {
      try {
        const response = await fetch(this.config.oauth_token_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.config.oauth_refresh_token,
            client_id: this.config.api_key || '',
            client_secret: this.config.api_secret || '',
          }),
        })

        if (response.ok) {
          const data = await response.json()
          // يجب حفظ التوكن الجديد في قاعدة البيانات
          return data.access_token
        }
      } catch (error) {
        console.error('OAuth token refresh failed:', error)
      }
    }

    return this.config.oauth_token
  }

  /**
   * تنفيذ طلب HTTP مع معالجة الأخطاء
   */
  protected async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any
  ): Promise<{ success: boolean; data?: T; error?: { code: string; message: string } }> {
    try {
      const url = `${this.getBaseUrl()}${endpoint}`
      const headers = await this.getAuthHeaders()

      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
      })

      const responseData = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: responseData.message || responseData.error || 'Request failed',
          },
        }
      }

      return { success: true, data: responseData }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }
    }
  }

  // ==========================================
  // الدوال التي يجب تنفيذها في كل adapter فرعي
  // ==========================================

  /** إنشاء شحنة جديدة */
  abstract createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse>

  /** تتبع شحنة */
  abstract trackShipment(request: TrackShipmentRequest): Promise<TrackShipmentResponse>

  /** إلغاء شحنة */
  abstract cancelShipment(request: CancelShipmentRequest): Promise<CancelShipmentResponse>

  /** طباعة البوليصة */
  abstract printLabel(request: PrintLabelRequest): Promise<PrintLabelResponse>

  /** اختبار الاتصال */
  abstract testConnection(): Promise<{ success: boolean; message: string }>

  /** تحويل حالة شركة الشحن للحالة الداخلية */
  abstract mapProviderStatus(providerStatus: string): string
}

