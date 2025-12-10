// Shipping methods and providers configuration

export type ShippingMethod = 
  | 'standard'      // شحن عادي
  | 'express'       // شحن سريع
  | 'pickup'        // استلام من الفرع
  | 'internal'      // مندوب داخلي
  | 'external'      // شركة شحن خارجية

export interface ShippingMethodOption {
  value: ShippingMethod
  label: { ar: string; en: string }
}

export const shippingMethods: ShippingMethodOption[] = [
  { value: 'standard', label: { ar: 'شحن عادي', en: 'Standard Shipping' } },
  { value: 'express', label: { ar: 'شحن سريع', en: 'Express Shipping' } },
  { value: 'pickup', label: { ar: 'استلام من الفرع', en: 'Branch Pickup' } },
  { value: 'internal', label: { ar: 'مندوب داخلي', en: 'Internal Delivery' } },
  { value: 'external', label: { ar: 'شركة شحن خارجية', en: 'External Shipping Company' } },
]

export interface ShippingProvider {
  id: string
  provider_name: string
  provider_code: string | null
  is_active: boolean
}

export const getShippingMethodLabel = (method: ShippingMethod | string | null, lang: 'ar' | 'en'): string => {
  if (!method) return lang === 'en' ? 'Not specified' : 'غير محدد'
  const found = shippingMethods.find(m => m.value === method)
  return found ? found.label[lang] : method
}

// Helper to determine if shipping provider is required
export const requiresShippingProvider = (method: ShippingMethod | string | null): boolean => {
  return method === 'external'
}

