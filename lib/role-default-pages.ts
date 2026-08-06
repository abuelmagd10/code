/**
 * lib/role-default-pages.ts — البيتُ الوحيد لقائمة «ماذا يرى كلُّ دور».
 * ---------------------------------------------------------------------------
 * v3.74.965
 *
 * كانت هذه القائمةُ مكتوبةً بخطِّ اليد **مرّتين**:
 *   • lib/access-context.tsx      → defaultRolePages
 *   • app/settings/users/page.tsx → defaultSidebarResourcesByRole
 *
 * ومرآتان يدويّتان لمواصفةٍ واحدة تفترقان بالضرورة. وقد افترقتا فعلاً:
 *   • مسؤولُ المشتريات: الشاشةُ تعرض ٤ صفحات، والحقيقةُ ٦ (تنقصها
 *     products و services — وقاعدةُ البيانات تمنحه إيّاهما فعلاً).
 *   • المحاسب: تنقص الشاشةَ vendor_payment_correction_requests
 *     و customer_refund_requests.
 *   • مسؤولُ المخزن: تنقص الشاشةَ purchase_returns — وهو يملك عليها
 *     صلاحيةً كاملةً فى القاعدة.
 *
 * فكانت الشاشةُ تقول للمالك عن دورٍ ما شيئاً، والنظامُ يفعل شيئاً آخر.
 * والفارقُ عيبٌ صامتٌ لا يراه أحد.
 *
 * ولهذا صار للقاعدة **بيتٌ واحد**: هذا الملف. والموضعان أعلاه يستوردانه.
 * وحارسٌ (scripts/check-role-pages-single-home.js) يمنع عودةَ البيت الثانى.
 *
 * ═══ ما هى هذه القائمة، وما ليست ═══
 *
 * هى **الملاذُ الأخير** فقط: تُستعمل حين لا يكون للدور ولا صفٌّ واحد فى
 * company_role_permissions (شركاتٌ قديمةٌ سابقةٌ لمُشغِّل التوليد فى 3.68).
 * وفى كلِّ ما عدا ذلك — وهو الواقعُ اليوم لكلِّ الشركات — **قاعدةُ البيانات
 * هى الحُكم**، والصفحاتُ المسموحة = الموارد التى can_access = true.
 *
 * فلا تُعدَّل هذه القائمةُ لتغيير صلاحيّةِ أحد. التغييرُ مكانُه:
 * الإعدادات ← المستخدمون ← صلاحيات الأدوار.
 *
 * ⚠️ والمحتوى هنا **منقولٌ حرفياً** عمّا كان فى lib/access-context.tsx —
 * فهو الأدقُّ من المرآتين، وهو الذى كان يعمل فعلاً. فلم يتغيّر سلوكٌ واحد.
 * ---------------------------------------------------------------------------
 */

export const DEFAULT_ROLE_PAGES: Record<string, string[]> = {
  // 1. الموظف — 4 pages verbatim
  staff: ['customers', 'estimates', 'sales_orders', 'inventory'],
  // 2. المحاسب — 17 pages (dashboard explicit)
  accountant: [
    'dashboard',
    'invoices', 'sales_returns', 'sales_return_requests', 'customer_credits',
    'bills', 'purchase_returns',
    'products', 'services',
    'inventory', 'inventory_transfers', 'third_party_inventory', 'write_offs',
    'dispatch_approvals', 'inventory_goods_receipt',
    'payments', 'expenses', 'banking',
    // v3.74.569 — approvals inbox is where the accountant executes
    // corrections and receives feedback on their submissions
    'approvals',
    'vendor_payment_correction_requests', 'customer_refund_requests',
  ],
  // 3. مسؤول المشتريات
  // v3.74.297 — Added products + services. The purchasing officer
  // needs to be able to open the Products & Services page to look
  // up which SKU to put on a purchase order and to register a new
  // raw material when the supplier offers one we don't carry yet.
  purchasing_officer: [
    'suppliers', 'purchase_orders', 'inventory',
    'dispatch_approvals', 'inventory_goods_receipt',
    'products', 'services',
    // v3.74.569
    'approvals',
  ],
  // 4. مسؤول الحجوزات — 2 pages verbatim
  booking_officer: ['bookings', 'customers'],
  // 5. مسؤول التصنيع — 2 entries verbatim (umbrella + approvals)
  manufacturing_officer: ['manufacturing_boms', 'approvals'],
  // 6. مسؤول المخزن — 7 pages
  store_manager: [
    'inventory', 'inventory_transfers', 'third_party_inventory', 'write_offs',
    'dispatch_approvals', 'inventory_goods_receipt',
    'sales_return_requests',
    'purchase_returns',
    // v3.74.569 — warehouse dispatches PR items via approvals card
    'approvals',
  ],
  // 7. المدير (branch manager) — union, READ-ONLY at can_write level
  manager: [
    'dashboard',
    'customers', 'estimates', 'sales_orders',
    'invoices', 'sales_returns', 'sales_return_requests', 'customer_credits',
    'bills', 'purchase_returns',
    'products', 'services',
    'inventory', 'inventory_transfers', 'third_party_inventory', 'write_offs',
    'dispatch_approvals', 'inventory_goods_receipt',
    'payments', 'expenses', 'banking',
    'suppliers', 'purchase_orders',
    'bookings',
    'manufacturing_boms', 'approvals',
  ],
  // HR officer (not redefined in Ahmed spec — kept from v3.65.4)
  hr_officer: [
    'dashboard', 'reports', 'hr', 'employees', 'payroll', 'attendance',
    'instant_payouts', 'employee_bonuses', 'branches', 'cost_centers',
  ],
  viewer: ['dashboard', 'reports'],
}
