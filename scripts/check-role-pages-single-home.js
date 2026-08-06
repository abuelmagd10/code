#!/usr/bin/env node
/**
 * check-role-pages-single-home.js
 * ---------------------------------------------------------------------------
 * v3.74.965 — لقائمة «ماذا يرى كلُّ دور» بيتٌ واحد.
 *
 * ═══ المرضُ الذى وُلد منه هذا الحارس ═══
 *
 * كانت القائمةُ مكتوبةً بخطِّ اليد مرّتين: مرّةً فى lib/access-context.tsx
 * (defaultRolePages) ومرّةً فى app/settings/users/page.tsx
 * (defaultSidebarResourcesByRole). ومرآتان يدويّتان تفترقان بالضرورة.
 *
 * وقد افترقتا فعلاً، وقِيس الفارق: مسؤولُ المشتريات تعرض له الشاشةُ أربعَ
 * صفحاتٍ والحقيقةُ ستّ؛ والمحاسبُ تنقصه صفحتان؛ ومسؤولُ المخزن تنقصه
 * مرتجعاتُ المشتريات — وهو يملك عليها صلاحيةً كاملةً فى القاعدة.
 *
 * فكانت الشاشةُ تقول للمالك عن دورٍ ما شيئاً والنظامُ يفعل شيئاً آخر.
 *
 * ═══ ما يحرسه — خاصّيةٌ لا صياغة ═══
 *
 * الممنوعُ أن يُكتب فى المشروع **جدولُ دورٍ إلى صفحات** فى أىِّ موضعٍ غير
 * lib/role-default-pages.ts.
 *
 * والتعرّفُ عليه بشرطين معاً — والشرطُ الثانى هو الذى يفصل الحقَّ عن الشبيه:
 *   ‏(١) كائنٌ يربط **أربعةَ أسماءِ أدوارٍ فأكثر** بمصفوفات. وأربعةٌ عتبةٌ
 *       عاليةٌ عن قصد، فلا يُصطاد كائنٌ صغيرٌ يربط دورين بشىءٍ آخر.
 *   ‏(٢) **ومحتوى المصفوفات أسماءُ موارد** — ثلاثةٌ منها فأكثر من مفردات
 *       الكتالوج المعروفة (bills، invoices، inventory، …).
 *
 * ولماذا الشرطُ الثانى؟ لأنّ فى المشروع كائنين يربطان أدواراً بمصفوفاتٍ
 * وليسا هذه القائمة، وقد أوقفانى فعلاً عند أوّل تشغيل:
 *   • app/approvals/page.tsx → roleTabs: دورٌ إلى **تبويبات**
 *     ("recv" · "disp" · "pay" · "pret").
 *   • app/reports/page.tsx  → ROLE_REPORT_MAP: دورٌ إلى **مسارات تقارير**
 *     ("/reports/purchases" · "/reports/inventory-count").
 * ولا واحدةٌ من هذه المفردات اسمُ مورد. فهما يمرّان، وهما محقّان.
 *
 * ويُتحقَّق كذلك من أنّ البيتَ الوحيد قائم، وأنّ المواضعَ الثلاثةَ المعروفة
 * تستورده ولا تُعيد كتابتَه.
 *
 * ═══ التعليقُ ليس تعليمة ═══
 *
 * التعليقاتُ تُنزع قبل البحث. ستُّ مراتٍ فى هذا المشروع اصطاد حارسٌ جملةً
 * فى تعليق، آخرُها فى 964 حين صرخ حارسى على هجرتى أنا — وأُمسك قبل الشحن.
 *
 * Usage: node scripts/check-role-pages-single-home.js [--list] [--selftest]
 * Env:   ROLE_PAGES_SCAN_ROOT — جذرٌ بديل (يستعمله الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")
const os = require("os")

const ROOT = process.env.ROLE_PAGES_SCAN_ROOT || process.cwd()
const VERBOSE = process.argv.includes("--list")
const SELFTEST = process.argv.includes("--selftest")

/** البيتُ الوحيدُ المسموح. */
const HOME = "lib/role-default-pages.ts"

/** المواضعُ التى كانت بيوتاً، ويجب أن تستورد الآن. */
const MUST_IMPORT = ["lib/access-context.tsx", "app/settings/users/page.tsx",
  "app/api/ai/find-page/route.ts"]

const ROLES = ["staff", "accountant", "purchasing_officer", "booking_officer",
  "manufacturing_officer", "store_manager", "manager", "hr_officer", "viewer",
  "general_manager", "employee", "sales"]

/**
 * مفرداتُ الموارد: ما تحويه قائمةُ صفحاتِ الأدوار حقّاً. تُطابَق **كاملةً**
 * داخل علامتَى اقتباس — فلا يُطابق "/reports/sales" الكلمةَ reports.
 */
const RESOURCE_WORDS = ["dashboard", "reports", "invoices", "customers", "estimates",
  "sales_orders", "sales_returns", "bills", "suppliers", "purchase_orders",
  "purchase_returns", "vendor_credits", "products", "inventory",
  "inventory_transfers", "write_offs", "third_party_inventory", "payments",
  "expenses", "journal_entries", "banking", "chart_of_accounts", "employees",
  "payroll", "attendance", "branches", "cost_centers", "bookings", "services",
  "manufacturing_boms", "approvals", "customer_credits", "product_availability"]

const SCAN_DIRS = ["app", "lib", "components", "hooks", "contexts"]
const SKIP = [/node_modules/, /[\\/]\.next/, /[\\/]\.git[\\/]/, /[\\/]\.claude/]

/** ينزع تعليقاتِ جافاسكربت — سطرِيّةً وكُتليّة — بلا لمسِ عناوين http. */
function stripJsComments(src) {
  let out = ""
  let i = 0
  const n = src.length
  while (i < n) {
    const two = src.slice(i, i + 2)
    if (two === "//" && src[i - 1] !== ":") {
      const nl = src.indexOf("\n", i)
      i = nl === -1 ? n : nl
      continue
    }
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2)
      i = end === -1 ? n : end + 2
      out += " "
      continue
    }
    out += src[i]
    i++
  }
  return out
}

function walk(dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (SKIP.some((r) => r.test(p))) continue
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * يعيد { roles, words }: أسماءُ الأدوار المتبوعةُ بمصفوفة، ومفرداتُ الموارد
 * الموجودةُ **داخل تلك المصفوفات وحدَها** — لا فى الملفّ كلِّه، وإلا لالتقط
 * ذكراً عابراً فى موضعٍ آخر.
 */
function roleMapShape(code) {
  const roles = new Set()
  const words = new Set()
  for (const r of ROLES) {
    const re = new RegExp("(^|[^\\w$'\"])" + r + "\\s*:\\s*\\[([^\\]]*)\\]")
    const m = re.exec(code)
    if (!m) continue
    roles.add(r)
    const inside = m[2]
    for (const w of RESOURCE_WORDS) {
      if (new RegExp("[\"']" + w + "[\"']").test(inside)) words.add(w)
    }
  }
  return { roles: roles, words: words }
}

/** بيتٌ لقائمة صفحات الأدوار: أربعةُ أدوارٍ فأكثر **و** ثلاثُ مفرداتِ موارد. */
function isRolePagesHome(code) {
  const s = roleMapShape(code)
  return s.roles.size >= 4 && s.words.size >= 3 ? s : null
}

function scan(root) {
  const files = []
  for (const d of SCAN_DIRS) walk(path.join(root, d), files)
  const rel = (abs) => path.relative(root, abs).split(path.sep).join("/")

  const offenders = []
  for (const abs of files) {
    const r = rel(abs)
    if (r === HOME) continue
    let src
    try { src = fs.readFileSync(abs, "utf8") } catch { continue }
    if (!/\b(staff|accountant|store_manager|manager)\s*:/.test(src)) continue
    const s = isRolePagesHome(stripJsComments(src))
    if (s) offenders.push({ file: r, roles: [...s.roles].sort(), words: [...s.words].sort() })
  }

  const missing = []
  if (!fs.existsSync(path.join(root, HOME))) {
    missing.push(HOME + " غيرُ موجود - البيتُ الوحيد مفقود.")
  } else {
    const home = fs.readFileSync(path.join(root, HOME), "utf8")
    if (!/export\s+const\s+DEFAULT_ROLE_PAGES/.test(home)) {
      missing.push(HOME + " لا يُصدّر DEFAULT_ROLE_PAGES.")
    }
  }
  for (const m of MUST_IMPORT) {
    const abs = path.join(root, m)
    if (!fs.existsSync(abs)) continue
    const src = fs.readFileSync(abs, "utf8")
    if (!/DEFAULT_ROLE_PAGES/.test(src)) {
      missing.push(m + " لا يستورد DEFAULT_ROLE_PAGES - عاد بيتاً ثانياً.")
    }
  }
  return { offenders: offenders, missing: missing, scanned: files.length }
}

// -- الفخُّ الذاتى -----------------------------------------------------------
function selftest() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "role-pages-"))
  fs.mkdirSync(path.join(base, "lib"), { recursive: true })
  fs.mkdirSync(path.join(base, "app", "settings", "users"), { recursive: true })
  fs.mkdirSync(path.join(base, "app", "api", "ai", "find-page"), { recursive: true })
  fs.mkdirSync(path.join(base, "app", "approvals"), { recursive: true })
  fs.mkdirSync(path.join(base, "app", "reports"), { recursive: true })

  fs.writeFileSync(path.join(base, HOME),
    "export const DEFAULT_ROLE_PAGES: Record<string, string[]> = {\n" +
    "  staff: ['customers'],\n  accountant: ['bills'],\n" +
    "  manager: ['dashboard'],\n  viewer: ['reports'],\n}\n")

  fs.writeFileSync(path.join(base, "lib", "access-context.tsx"),
    "import { DEFAULT_ROLE_PAGES } from './role-default-pages'\n" +
    "const defaultRolePages = DEFAULT_ROLE_PAGES\n")
  fs.writeFileSync(path.join(base, "app", "settings", "users", "page.tsx"),
    "import { DEFAULT_ROLE_PAGES } from '@/lib/role-default-pages'\nconst x = DEFAULT_ROLE_PAGES\n")
  fs.writeFileSync(path.join(base, "app", "api", "ai", "find-page", "route.ts"),
    "import { DEFAULT_ROLE_PAGES } from '@/lib/role-default-pages'\nconst y = DEFAULT_ROLE_PAGES\n")

  // الشبيهان الحقيقيّان من المشروع — يجب أن يمرّا
  fs.writeFileSync(path.join(base, "app", "approvals", "page.tsx"),
    "const roleTabs: Record<string, string[]> = {\n" +
    "  store_manager: ['recv','disp','bwd','bcr','wo','tr','sret','pr','pret'],\n" +
    "  accountant: ['pay','pret','disc','sret','cref','vcor','misc','je','vc'],\n" +
    "  purchasing_officer: ['pret','disc','misc'],\n" +
    "  manufacturing_officer: ['bom','routing','po','mi','pr'],\n" +
    "  manager: ['disc','pay','pret','sret','cref','vcor','disp'],\n" +
    "  staff: [],\n  booking_officer: [],\n}\n")
  fs.writeFileSync(path.join(base, "app", "reports", "page.tsx"),
    "const ROLE_REPORT_MAP: Record<string, string[]> = {\n" +
    "  manager: ['*'],\n  viewer: ['*'],\n" +
    "  accountant: ['/reports/sales','/reports/invoices','/reports/purchases'],\n" +
    "  store_manager: ['/reports/inventory-count','/reports/inventory-audit'],\n" +
    "  purchasing_officer: ['/reports/purchases','/reports/product-expiry'],\n" +
    "  booking_officer: ['/reports/bookings/top-services'],\n" +
    "  manufacturing_officer: ['/reports/manufacturing/bom-cost'],\n}\n")

  let r = scan(base)
  const pass1 = r.offenders.length === 0 && r.missing.length === 0

  fs.writeFileSync(path.join(base, "lib", "second-home.ts"),
    "export const OTHER = {\n  staff: ['customers','estimates'],\n" +
    "  accountant: ['bills','payments'],\n  manager: ['dashboard','reports'],\n" +
    "  store_manager: ['inventory','write_offs'],\n}\n")
  r = scan(base)
  const pass2 = r.offenders.some((o) => o.file === "lib/second-home.ts")
  fs.unlinkSync(path.join(base, "lib", "second-home.ts"))

  fs.writeFileSync(path.join(base, "lib", "small.ts"),
    "const labels = { staff: ['customers'], manager: ['bills'] }\n")
  r = scan(base)
  const pass3 = !r.offenders.some((o) => o.file === "lib/small.ts")
  fs.unlinkSync(path.join(base, "lib", "small.ts"))

  fs.writeFileSync(path.join(base, "lib", "commented.ts"),
    "/*\n staff: ['customers'],\n accountant: ['bills'],\n" +
    " manager: ['payments'],\n viewer: ['reports'],\n*/\nexport const nothing = 1\n")
  r = scan(base)
  const pass4 = !r.offenders.some((o) => o.file === "lib/commented.ts")
  fs.unlinkSync(path.join(base, "lib", "commented.ts"))

  fs.writeFileSync(path.join(base, "lib", "access-context.tsx"),
    "const defaultRolePages = {\n  staff: ['customers'],\n  accountant: ['bills'],\n" +
    "  manager: ['payments'],\n  viewer: ['reports'],\n}\n")
  r = scan(base)
  const pass5 = r.missing.some((m) => m.indexOf("access-context") >= 0) &&
                r.offenders.some((o) => o.file === "lib/access-context.tsx")

  console.log((pass1 ? "  ok  " : "  X   ") + "يمرّ حين يكون البيتُ واحداً والمواضعُ الثلاثة تستورد")
  console.log((pass2 ? "  ok  " : "  X   ") + "يرفض بيتاً ثانياً يربط اربعةَ ادوارٍ بأسماءِ موارد")
  console.log((pass3 ? "  ok  " : "  X   ") + "لا يصرخ على كائنٍ صغيرٍ يربط دورين")
  console.log((pass4 ? "  ok  " : "  X   ") + "لا يصرخ على ذكرٍ داخل تعليق")
  console.log((pass5 ? "  ok  " : "  X   ") + "يرفض ارتدادَ موضعٍ معروفٍ الى كتابة القائمة بنفسه")
  console.log((pass1 ? "  ok  " : "  X   ") + "لا يصرخ على roleTabs (دور -> تبويبات) ولا ROLE_REPORT_MAP (دور -> مسارات)")

  try { fs.rmSync(base, { recursive: true, force: true }) } catch { /* لا يهمّ */ }
  return pass1 && pass2 && pass3 && pass4 && pass5
}

if (SELFTEST) {
  console.log("# الفخُّ الذاتى - check-role-pages-single-home")
  process.exit(selftest() ? 0 : 1)
}

const res = scan(ROOT)

if (res.offenders.length === 0 && res.missing.length === 0) {
  if (VERBOSE) {
    console.log("ok - بيتٌ واحدٌ لقائمة صفحات الأدوار. (فُحص " + res.scanned + " ملفاً)")
  }
  process.exit(0)
}

console.error("")
console.error("X v3.74.965 - لقائمة «ماذا يرى كلُّ دور» أكثرُ من بيت.")
console.error("")
for (const m of res.missing) console.error("  ! " + m)
for (const o of res.offenders) {
  console.error("  - " + o.file +
    "  (أدوار: " + o.roles.join(", ") +
    "  ·  موارد: " + (o.words || []).join(", ") + ")")
}
console.error("")
console.error("  البيتُ الوحيد: " + HOME)
console.error("  استورد منه DEFAULT_ROLE_PAGES بدل إعادة كتابة القائمة.")
console.error("")
process.exit(1)
