// =============================================
// Shipping Integration Types
// أنواع البيانات لنظام تكامل الشحن
// =============================================

// أنواع المصادقة المدعومة
export type AuthType = 'api_key' | 'oauth2' | 'basic' | 'custom'

// بيئة التشغيل
export type ShippingEnvironment = 'sandbox' | 'production'

// حالات الشحنة الداخلية
export type InternalShipmentStatus = 
  | 'pending'      // في انتظار الإنشاء
  | 'created'      // تم الإنشاء
  | 'picked_up'    // تم الاستلام من الشاحن
  | 'in_transit'   // في الطريق
  | 'out_for_delivery' // خارج للتوصيل
  | 'delivered'    // تم التسليم
  | 'returned'     // مرتجع
  | 'cancelled'    // ملغي
  | 'failed'       // فشل

// إعدادات شركة الشحن
export interface ShippingProviderConfig {
  id: string
  provider_name: string
  provider_code: string | null
  auth_type: AuthType
  environment: ShippingEnvironment
  base_url: string
  sandbox_url: string | null
  api_key: string | null
  api_secret: string | null
  account_number: string | null
  oauth_token_url: string | null
  oauth_scope: string | null
  oauth_token: string | null
  oauth_refresh_token: string | null
  oauth_expires_at: string | null
  extra_config: Record<string, any>
  webhook_secret: string | null
  default_service: string | null
  is_active: boolean
}

// بيانات إنشاء شحنة
export interface CreateShipmentRequest {
  // بيانات الشاحن
  shipper: {
    name: string
    company?: string
    phone: string
    email?: string
    address: string
    city: string
    country: string
    postal_code?: string
  }
  // بيانات المستلم
  consignee: {
    name: string
    company?: string
    phone: string
    email?: string
    address: string
    city: string
    country: string
    postal_code?: string
  }
  // بيانات الشحنة
  shipment: {
    weight: number        // بالكيلوجرام
    dimensions?: {
      length: number
      width: number
      height: number
    }
    pieces?: number
    description?: string
    value?: number
    currency?: string
    cod_amount?: number   // الدفع عند الاستلام
    service_type?: string // نوع الخدمة
    reference?: string    // رقم مرجعي
  }
}

// استجابة إنشاء شحنة
export interface CreateShipmentResponse {
  success: boolean
  tracking_number?: string
  awb_number?: string
  label_url?: string
  tracking_url?: string
  estimated_delivery?: string
  shipping_cost?: number
  provider_reference?: string
  raw_response?: any
  error?: {
    code: string
    message: string
    details?: any
  }
}

// طلب تتبع شحنة
export interface TrackShipmentRequest {
  tracking_number: string
  awb_number?: string
}

// استجابة تتبع شحنة
export interface TrackShipmentResponse {
  success: boolean
  current_status?: string
  status_code?: string
  status_description?: string
  location?: string
  updated_at?: string
  estimated_delivery?: string
  delivered_at?: string
  delivered_to?: string
  events?: ShipmentEvent[]
  raw_response?: any
  error?: {
    code: string
    message: string
  }
}

// حدث في الشحنة
export interface ShipmentEvent {
  timestamp: string
  status: string
  status_code?: string
  description?: string
  location?: string
}

// طلب إلغاء شحنة
export interface CancelShipmentRequest {
  tracking_number: string
  awb_number?: string
  reason?: string
}

// استجابة إلغاء شحنة
export interface CancelShipmentResponse {
  success: boolean
  message?: string
  raw_response?: any
  error?: {
    code: string
    message: string
  }
}

// طلب طباعة البوليصة
export interface PrintLabelRequest {
  tracking_number: string
  awb_number?: string
  format?: 'pdf' | 'zpl' | 'png'
}

// استجابة طباعة البوليصة
export interface PrintLabelResponse {
  success: boolean
  label_url?: string
  label_data?: string // Base64
  format?: string
  error?: {
    code: string
    message: string
  }
}

