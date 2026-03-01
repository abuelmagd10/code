/**
 * التحقق من أن شركة الشحن مسموحة للفرع (حسب branch_shipping_providers)
 * للاستخدام في APIs إنشاء/تحديث الفواتير وأوامر البيع والفاتورة الشرائية
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function validateShippingProviderForBranch(
  supabase: SupabaseClient,
  params: { branch_id: string | null; shipping_provider_id: string | null; company_id: string }
): Promise<{ valid: boolean; error_ar?: string }> {
  const { branch_id, shipping_provider_id, company_id } = params
  if (!shipping_provider_id) return { valid: true }
  if (!branch_id) {
    return { valid: false, error_ar: 'يجب تحديد الفرع عند اختيار شركة الشحن' }
  }
  const { data, error } = await supabase.rpc('is_shipping_provider_allowed_for_branch', {
    p_branch_id: branch_id,
    p_shipping_provider_id: shipping_provider_id,
    p_company_id: company_id
  })
  if (error) {
    console.error('[validateShippingProviderForBranch]', error)
    return { valid: false, error_ar: 'خطأ في التحقق من صلاحية شركة الشحن للفرع' }
  }
  if (data === true) return { valid: true }
  return { valid: false, error_ar: 'شركة الشحن المختارة غير مرتبطة بهذا الفرع. راجع إعدادات الشحن وربط الفروع.' }
}
