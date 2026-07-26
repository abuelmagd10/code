#!/usr/bin/env node
/**
 * check-hardcoded-account-codes.js
 * ---------------------------------------------------------------------------
 * v3.74.847 — لا كود يبحث عن حساب برقم لا وجود له فى **أى** دليل حسابات.
 *
 * **الحادثة**: طريق صرف المرتبات كان يبحث عن حساب المصروف بالكود `6110`:
 *     .from('chart_of_accounts').eq('account_code', '6110')
 * والدليل المعتمد فى المشروع يستعمل `5210` «الرواتب والأجور». الكود 6110
 * **غير موجود فى أى من الشركات الأربع**، فكان الطريق يردّ دائماً
 * «حساب المصروفات 6110 غير موجود» — أى أن **صرف المرتبات لم يعمل ولا مرة،
 * فى أى شركة**. تأكيد من الإنتاج: دفعتان و١٨ كشفاً و**صفر** قيود صرف.
 *
 * ولماذا لم يُكتشف؟ لأن الرقم **ثابت فى الكود** لا فى القاعدة، فلا فحص مخطط
 * يراه؛ والرسالة تبدو كنقص فى إعداد الشركة لا كعطب فى البرنامج.
 *
 * ⇒ **الدرس**: الحساب يُطلب **بمعناه** (`sub_type`) لا برقمه. الرقم يتغيّر من
 *   دليل لآخر ومن بلد لآخر؛ المعنى لا يتغيّر. والرقم — إن لزم — يكون
 *   احتياطياً بعد المعنى، لا مصدراً وحيداً.
 *
 * يقارن هذا الفحص كل كود حساب مذكور صراحةً فى الكود بقائمة أكواد القالب
 * (`chart_of_accounts_template`) المحفوظة فى ملف، فيمسك الرقم الوهمى قبل
 * المستخدم.
 *
 * Usage: node scripts/check-hardcoded-account-codes.js
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")

// أكواد قالب دليل الحسابات، منقولة من chart_of_accounts_template على الإنتاج
// (٩٥ حساباً، ٢٠٢٦-٠٧-٢٦). تُحدَّث مع القالب لا قبله.
const TEMPLATE_CODES = new Set(`
1000 1100 1110 1120 1130 1131 1135 1140 1145 1146 1150 1160 1170 1180 1185
1200 1210 1220 1230 1240 1250 1260 1270 1290 1300 1310 1320 1330 1390
2000 2100 2110 2115 2120 2125 2130 2135 2136 2140 2145 2150 2155 2160 2170
2200 2210 2220 2230 2240
3000 3100 3200 3300 3400 3500 3600
4000 4100 4110 4120 4200 4300 4310 4320 4330 4400
5000 5100 5110 5120 5130 5140 5200 5210 5211 5215 5220 5230 5240 5250 5260
5270 5280 5290 5295 5300 5310 5320 5330 5340 5350 5360 5370 5410 5415
`.trim().split(/\s+/))

// أكواد يُسمح بذكرها وإن لم تكن فى القالب، وكل واحد بسببه.
const ALLOWED = new Map([
  // v3.74.847 — احتياطى موروث: شركة أنشأت دليلها بترقيم قديم. يُبحث عنه
  // **بعد** sub_type='salaries_expense'، فلا يُعتمد عليه وحده.
  ["6110", "legacy salaries-expense code, used only as a fallback after sub_type"],
  // v3.74.847 — the simplified report matched depreciation on '5500' alone and
  // therefore never found any: the account is 5290. It now matches
  // sub_type='depreciation_expense' first, and 5500 is kept ONLY so a company
  // that really numbered it that way is not broken by the correction.
  ["5500", "legacy depreciation code, matched only after sub_type and 5290"],
])

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", "supabase"])

// يلتقط رقماً من أربع خانات مرتبطاً صراحةً بعمود كود الحساب.
const PATTERNS = [
  /account_code["']?\s*[,:]\s*["'](\d{4})["']/g,
  /["'](\d{4})["']\s*\)\s*\/\/\s*account_code/g,
  /account_code\s*(?:=|===|==)\s*["'](\d{4})["']/g,
]

const offenders = []

function scan(file) {
  const src = fs.readFileSync(file, "utf8")
  const rel = path.relative(root, file).replace(/\\/g, "/")
  for (const re of PATTERNS) {
    re.lastIndex = 0
    for (const m of src.matchAll(re)) {
      const code = m[1]
      if (TEMPLATE_CODES.has(code) || ALLOWED.has(code)) continue
      const line = src.slice(0, m.index).split("\n").length
      offenders.push({ rel, line, code })
    }
  }
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(full)
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      scan(full)
    }
  }
}

for (const d of ["app", "lib", "components", "scripts"]) {
  const p = path.join(root, d)
  if (fs.existsSync(p)) walk(p)
}

if (offenders.length > 0) {
  console.error(`X ${offenders.length} reference(s) to an account code no chart contains:\n`)
  for (const o of offenders) console.error(`  - ${o.rel}:${o.line}  account_code '${o.code}'`)
  console.error(
    "\n  An account looked up by NUMBER breaks on any chart numbered differently,\n" +
      "  and the failure reads like a missing setup rather than a bug. Look the\n" +
      "  account up by MEANING instead:\n\n" +
      "    .eq('sub_type', 'salaries_expense')      // what it IS\n" +
      "    ... then fall back to a code list if the tag may be absent\n\n" +
      "  If the code is genuinely correct, add it to the template and to\n" +
      "  TEMPLATE_CODES here, or document it in ALLOWED with the reason."
  )
  process.exit(1)
}

console.log(
  `+ every hard-coded account code exists in the chart template ` +
    `(${TEMPLATE_CODES.size} codes, ${ALLOWED.size} documented exception(s)).`
)
