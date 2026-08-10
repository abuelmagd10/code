/**
 * v3.74.999 — **بيتُ الوظائفِ الواحد.**
 *
 * قبل هذا الملفّ كان اسمُ الوظيفةِ المعروضُ للمستخدم يُكتَبُ فى ستّةَ عشرَ
 * موضعاً مستقلّاً، وكانت المواضعُ تتناقض:
 *   • `admin` يُكتَبُ «مدير عام» فى ٦ مواضعَ و«مدير» فى ١٠.
 *   • `manager` يُكتَبُ «مدير» فى ٨ مواضع — فيظهرُ المديرُ العامُّ ومديرُ الفرع
 *     بالكلمةِ نفسِها على سبعِ شاشات، ولا يُفرّقُ بينهما قارئ.
 *   • `viewer` يُكتَبُ «مشاهد» فى ٧ و«عرض فقط» فى ٤.
 *   • وخمسُ شاشاتٍ تحملُ قوائمَ قديمةً لا تعرفُ الوظائفَ الأربعَ الجديدة، فكانت
 *     تعرضُ المفتاحَ الإنجليزىَّ نفسَه للمستخدم: `hr_officer`.
 *
 * **واسمانِ لوظيفةٍ واحدةٍ ليسا اسماً — هما وظيفتانِ فى ذهنِ القارئ.**
 *
 * فهذا الملفُّ هو البيتُ الوحيدُ لأربعةِ أشياء: اسمُ الوظيفةِ بالعربيّةِ
 * والإنجليزيّة، ووصفُها، ورتبتُها (عليا/عادية)، وترتيبُها فى القوائم.
 * ويحرسه `scripts/check-role-label-one-home.js` فلا يُبنى بيتٌ ثانٍ بعد اليوم.
 *
 * ولا يحملُ هذا الملفُّ صلاحيّةً واحدة — الصلاحيّاتُ تُقرأ من قاعدةِ البيانات.
 * هو يقولُ **ماذا نُسمّى الوظيفة**، لا **ماذا تفتحُ الوظيفة**.
 */

export type ErpRoleKey =
  | "owner"
  | "admin"
  | "manager"
  | "accountant"
  | "store_manager"
  | "purchasing_officer"
  | "manufacturing_officer"
  | "booking_officer"
  | "hr_officer"
  | "staff"
  | "viewer"

/** الرتبة: عليا (المالك والمدير العام) أو عادية. */
export type ErpRoleTier = "senior" | "normal"

export type ErpLang = "ar" | "en"

export interface ErpRoleDef {
  key: ErpRoleKey
  ar: string
  en: string
  tier: ErpRoleTier
  /** ترتيب العرض فى القوائم — العليا أوّلاً ثمّ العادية. */
  order: number
  descAr: string
  descEn: string
  /** ألوان الشارة فى شاشة المستخدمين. */
  color: string
  /** لون النقطة فى قوائم الاختيار. */
  dot: string
}

/**
 * الوظائفُ الإحدى عشرةَ التى يقبلها النظام، مرتّبةً كما يقرؤها صاحبُ المشروع:
 * الأدوارُ العليا أوّلاً، ثمّ العاديّةُ من الأوسعِ مسؤوليّةً إلى الأضيق.
 *
 * وهذه القائمةُ يجب أن تُطابقَ مفرداتِ `company_members_role_check` فى قاعدةِ
 * البيانات — يتحقّقُ من ذلك `assert_baseline_v3_74_999_check()` هناك،
 * و`scripts/check-role-label-one-home.js` هنا.
 */
export const ERP_ROLES: readonly ErpRoleDef[] = [
  {
    key: "owner",
    ar: "المالك",
    en: "Owner",
    tier: "senior",
    order: 1,
    descAr: "صلاحيات كاملة على كل شيء",
    descEn: "Full permissions over everything",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    dot: "bg-purple-500",
  },
  {
    key: "admin",
    ar: "المدير العام",
    en: "General Manager",
    tier: "senior",
    order: 2,
    descAr: "إدارة كاملة للنظام",
    descEn: "Full system administration",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  {
    key: "manager",
    ar: "مدير الفرع",
    en: "Branch Manager",
    tier: "normal",
    order: 3,
    descAr: "إدارة العمليات اليومية داخل فرعه",
    descEn: "Manages daily operations within their branch",
    color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    dot: "bg-teal-500",
  },
  {
    key: "accountant",
    ar: "محاسب",
    en: "Accountant",
    tier: "normal",
    order: 4,
    descAr: "إدارة الحسابات والفواتير",
    descEn: "Manages accounts and invoices",
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    dot: "bg-green-500",
  },
  {
    key: "store_manager",
    ar: "مسؤول المخزن",
    en: "Store Manager",
    tier: "normal",
    order: 5,
    descAr: "إدارة المخزون والمنتجات",
    descEn: "Manages inventory and products",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  {
    key: "purchasing_officer",
    ar: "مسؤول المشتريات",
    en: "Purchasing Officer",
    tier: "normal",
    order: 6,
    descAr: "إدارة المشتريات والموردين",
    descEn: "Manages purchasing and suppliers",
    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    dot: "bg-indigo-500",
  },
  {
    key: "manufacturing_officer",
    ar: "مسؤول التصنيع",
    en: "Manufacturing Officer",
    tier: "normal",
    order: 7,
    descAr: "إدارة قوائم المواد والإنتاج",
    descEn: "Manages BOMs and production",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    dot: "bg-yellow-500",
  },
  {
    key: "booking_officer",
    ar: "مسؤول الحجوزات",
    en: "Booking Officer",
    tier: "normal",
    order: 8,
    descAr: "إدارة الحجوزات والخدمات",
    descEn: "Manages bookings and services",
    color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    dot: "bg-teal-500",
  },
  {
    key: "hr_officer",
    ar: "مسؤول الموارد البشرية",
    en: "HR Officer",
    tier: "normal",
    order: 9,
    descAr: "إدارة الموظفين والمرتبات والحضور",
    descEn: "Manages employees, payroll, and attendance",
    color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    dot: "bg-pink-500",
  },
  {
    key: "staff",
    ar: "موظف",
    en: "Staff",
    tier: "normal",
    order: 10,
    descAr: "صلاحيات محدودة",
    descEn: "Limited permissions",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  {
    key: "viewer",
    ar: "عرض فقط",
    en: "Viewer",
    tier: "normal",
    order: 11,
    descAr: "عرض البيانات فقط",
    descEn: "View data only",
    color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    dot: "bg-gray-500",
  },
] as const

const BY_KEY: Record<string, ErpRoleDef> = ERP_ROLES.reduce((acc, r) => {
  acc[r.key] = r
  return acc
}, {} as Record<string, ErpRoleDef>)

/** مفاتيحُ الوظائفِ الإحدى عشرة، بالترتيب. */
export const ERP_ROLE_KEYS: readonly ErpRoleKey[] = ERP_ROLES.map((r) => r.key)

/**
 * **الأدوارُ العليا** — المالكُ والمديرُ العامّ.
 *
 * كانت هذه الفكرةُ مكتوبةً بيدها فى ١٧٣ موضعاً فى الكود و١٠٢ دالّةٍ فى قاعدة
 * البيانات، وفى ثلاثةِ ثوابتَ متفرّقة. فمن أرادَ يوماً أن يُضيفَ رتبةً عليا
 * ثالثة، أو يسحبَ من المديرِ العامِّ باباً، كان عليه أن يلمسَ ٢٧٥ موضعاً —
 * ومن نسىَ واحداً منها فتحَ ثغرةً لا يراها أحد.
 *
 * **وقاعدةٌ لها مئتانِ وخمسةٌ وسبعون بيتاً ليست قاعدة.**
 */
export const SENIOR_ROLE_KEYS: readonly ErpRoleKey[] = ERP_ROLES.filter(
  (r) => r.tier === "senior",
).map((r) => r.key)

/** الأدوارُ العاديّة — ما عدا العليا. */
export const NORMAL_ROLE_KEYS: readonly ErpRoleKey[] = ERP_ROLES.filter(
  (r) => r.tier === "normal",
).map((r) => r.key)

/** هل هذا النصُّ اسمُ وظيفةٍ يقبلها النظام؟ */
export function isErpRole(role: string | null | undefined): role is ErpRoleKey {
  return typeof role === "string" && Object.prototype.hasOwnProperty.call(BY_KEY, role)
}

/**
 * هل صاحبُ هذه الوظيفةِ من الأدوارِ العليا؟
 *
 * يُنادى عليها بدل كتابة `['owner','admin'].includes(role)` بيدك — فلو تغيّرت
 * الرتبُ يوماً تغيّرَ الجوابُ فى مكانٍ واحد.
 */
export function isSeniorRole(role: string | null | undefined): boolean {
  const key = String(role || "").trim().toLowerCase()
  return BY_KEY[key]?.tier === "senior"
}

/** تعريفُ الوظيفةِ كاملاً، أو `undefined` إن كان الاسمُ غيرَ معروف. */
export function erpRole(role: string | null | undefined): ErpRoleDef | undefined {
  return BY_KEY[String(role || "").trim().toLowerCase()]
}

/**
 * الاسمُ المعروضُ للمستخدم.
 *
 * وإن لم يعرفِ النظامُ الاسمَ أعادَ النصَّ كما هو — **ولا يُخفيه**. فمن رأى
 * `hr_officer` على شاشته عَلِمَ أنّ هناك اسماً لم يُسجَّل بعد، ومن رأى فراغاً
 * لم يعلمْ شيئاً. **والظهورُ الخاطئُ يُصلَح، والاختفاءُ لا يُلاحَظ.**
 */
export function roleLabel(role: string | null | undefined, lang: ErpLang = "ar"): string {
  const raw = String(role || "").trim()
  const def = BY_KEY[raw.toLowerCase()]
  if (!def) return raw
  return lang === "en" ? def.en : def.ar
}

/** وصفُ الوظيفةِ المعروض، أو نصٌّ فارغٌ إن كان الاسمُ غيرَ معروف. */
export function roleDescription(role: string | null | undefined, lang: ErpLang = "ar"): string {
  const def = erpRole(role)
  if (!def) return ""
  return lang === "en" ? def.descEn : def.descAr
}

/** ألوانُ شارةِ الوظيفة. */
export function roleColor(role: string | null | undefined): string {
  return erpRole(role)?.color || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
}

/** لونُ نقطةِ الوظيفةِ فى قوائم الاختيار. */
export function roleDot(role: string | null | undefined): string {
  return erpRole(role)?.dot || "bg-gray-500"
}

/**
 * خياراتُ قوائمِ الاختيار، مرتّبة.
 * `excludeOwner` لقوائمِ الدعوةِ والصلاحيّات — فالمالكُ لا يُدعى ولا يُمنَح.
 */
export function roleOptions(
  lang: ErpLang = "ar",
  opts?: { excludeOwner?: boolean },
): Array<{ value: ErpRoleKey; label: string; dot: string }> {
  return ERP_ROLES.filter((r) => !(opts?.excludeOwner && r.key === "owner"))
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((r) => ({ value: r.key, label: lang === "en" ? r.en : r.ar, dot: r.dot }))
}

/** خريطةُ الأسماءِ العربيّة — للمواضعِ التى تحتاجُ الشكلَ القديم. */
export const ROLE_LABELS_AR: Record<string, string> = ERP_ROLES.reduce((acc, r) => {
  acc[r.key] = r.ar
  return acc
}, {} as Record<string, string>)

/** خريطةُ الأسماءِ الإنجليزيّة. */
export const ROLE_LABELS_EN: Record<string, string> = ERP_ROLES.reduce((acc, r) => {
  acc[r.key] = r.en
  return acc
}, {} as Record<string, string>)
