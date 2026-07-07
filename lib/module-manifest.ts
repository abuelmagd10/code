/**
 * v3.74.260 — Module Subscription manifest.
 *
 * Defines which sidebar top-level groups are CORE (always shown) and
 * which are OPTIONAL (owner toggles them on/off per company).
 *
 * The sidebar uses isModuleEnabled() to decide whether to render an
 * optional group. Backward-compatible: when a company's enabled_modules
 * is NULL the helper returns true for every module — existing
 * installations see the same sidebar they had before.
 */

export type ModuleKey =
  | 'dashboard'
  | 'approvals'
  | 'sales'
  | 'accounting'
  | 'settings'
  | 'services_bookings'
  | 'purchases'
  | 'inventory'
  | 'manufacturing'
  | 'fixed_assets'
  | 'hr'

/** Always-on modules. The owner cannot disable these. */
export const CORE_MODULES: readonly ModuleKey[] = [
  'dashboard',
  // v3.74.571 — approvals inbox is core: it unifies EVERY workflow's
  // pending items (payments, corrections, refunds, sales/purchase
  // returns, goods receipt, dispatch, discounts...) so hiding it via
  // the module toggle would leave approvers with no way in.
  'approvals',
  'sales',
  'purchases',
  'inventory',
  'accounting',
  'settings',
]

/** Toggle-able modules. Each company decides which to subscribe to. */
export const OPTIONAL_MODULES: readonly ModuleKey[] = [
  'services_bookings',
  'manufacturing',
  'fixed_assets',
  'hr',
]

/** Bilingual labels for the settings UI. */
export const MODULE_LABELS: Record<ModuleKey, { ar: string; en: string; description?: { ar: string; en: string } }> = {
  dashboard:         { ar: 'لوحة التحكم',          en: 'Dashboard' },
  approvals:         { ar: 'صندوق الموافقات',       en: 'Approvals Inbox' },
  sales:             { ar: 'المبيعات',             en: 'Sales' },
  accounting:        { ar: 'الحسابات',             en: 'Accounting' },
  settings:          { ar: 'الإعدادات',            en: 'Settings' },
  services_bookings: { ar: 'الخدمات والحجوزات',     en: 'Services & Bookings',
                       description: { ar: 'لشركات الخدمات اللى بتعتمد على الحجز والمواعيد.', en: 'For service-based businesses that book appointments.' } },
  purchases:         { ar: 'المشتريات',             en: 'Purchases',
                       description: { ar: 'لو شركتك بتشترى من موردين.', en: 'If your company buys from suppliers.' } },
  inventory:         { ar: 'المخزون',               en: 'Inventory',
                       description: { ar: 'لو عندك مخزون منتجات تتبع كمياته.', en: 'If you maintain product stock.' } },
  manufacturing:     { ar: 'التصنيع',               en: 'Manufacturing',
                       description: { ar: 'للمصانع — أوامر إنتاج وقوائم مواد.', en: 'For factories — production orders and BOMs.' } },
  fixed_assets:      { ar: 'الأصول الثابتة',        en: 'Fixed Assets',
                       description: { ar: 'لتسجيل وإهلاك الأصول الثابتة.', en: 'Register and depreciate fixed assets.' } },
  hr:                { ar: 'الموظفون والمرتبات',    en: 'HR & Payroll',
                       description: { ar: 'لو عندك موظفين بمرتبات منتظمة.', en: 'If you have salaried employees.' } },
}

/**
 * Decide whether a given module key should appear in the sidebar for a
 * company. Used by components/sidebar.tsx to filter top-level groups.
 *
 * Rules:
 *   - Core modules: always true.
 *   - enabled_modules NULL: backward-compatible — every module is on.
 *   - enabled_modules is an array: optional modules show iff included.
 */
export function isModuleEnabled(
  key: ModuleKey,
  enabledModules: readonly string[] | null | undefined
): boolean {
  if ((CORE_MODULES as readonly string[]).includes(key)) return true
  if (enabledModules == null) return true // legacy companies — show all
  return enabledModules.includes(key)
}
