#!/usr/bin/env node
/**
 * check-delete-gate-names-its-resource.js
 * ---------------------------------------------------------------------------
 * v3.74.964 — بوّابةُ الحذف تسمّى موردَها.
 *
 * ═══ المرضُ الذى وُلد منه هذا الحارس ═══
 *
 * كانت «public.can_delete_data(p_company_id)» تسأل جدولَ الصلاحيات سؤالاً
 * واحداً ثابتاً — «هل لهذا الدور حذفٌ على مورد **customers**؟» — ثمّ
 * تُستعمَل الإجابةُ نفسُها فى **أربعةَ عشرَ جدولاً**: القيودُ اليومية،
 * المدفوعات، فواتيرُ الشراء، الموظّفون، المنتجات، المساهمون، مرتجعاتُ
 * البيع، أرصدةُ الموردين، التسوياتُ البنكية…
 *
 * فكان مندوبُ المبيعات فى شركة «تست» يستطيع حذفَ قيدٍ يومى — لأنّه يملك
 * حذفَ عميل. ولم يمنحه أحدٌ ذلك؛ مُنح له من حيث لا يدرى المانح.
 *
 * ═══ ما يحرسه ═══
 *
 * **الخاصّيةُ المحرَّمة، لا الصياغة:** أن تقرّر بوّابةُ حذفٍ إجابتَها من
 * موردٍ ليس موردَها. وتجسيدُها فى القاعدة اليوم اسمٌ واحد: «can_delete_data».
 * فالممنوعُ أن تظهر فى **سياسةٍ أو دالّةٍ جديدة**.
 *
 * والبديلُ موجودٌ سلفاً ولا يحتاج اختراعاً:
 *     public.can_delete_resource(company_id, '<موردُ هذا الجدول>')
 *
 * ═══ لماذا يبدأ من هجرته هو ═══
 *
 * الهجراتُ الأقدمُ من 20260805000003 تحمل المرضَ بحكم التاريخ — وقد
 * عولجت فى 964. فلو صرخ الحارسُ عليها لصرخ كلَّ يومٍ بلا سبب، **وحارسٌ
 * يصرخ بلا سبب يُطفأ**. فهو يفحص هجراتِ اليوم وما بعده فقط.
 *
 * ═══ التعليقُ ليس تعليمة ═══
 *
 * ستّ مراتٍ فى هذا المشروع اصطاد حارسٌ جملةً فى تعليق — آخرُها فى 952 حين
 * صرخ حارسى على شرحى أنا. فالتعليقاتُ (سطرِيّة وكُتلية) والسلاسلُ النصّية
 * تُنزع **قبل** البحث.
 *
 * Usage: node scripts/check-delete-gate-names-its-resource.js [--list] [--selftest]
 * Env:   DELETE_GATE_SCAN_ROOT — جذرٌ بديل (يستعمله الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")
const os = require("os")

const ROOT = process.env.DELETE_GATE_SCAN_ROOT || process.cwd()
const VERBOSE = process.argv.includes("--list")
const SELFTEST = process.argv.includes("--selftest")

/** الهجرةُ التى وُلد فيها الحارس. ما قبلَها تاريخٌ، لا يُحاسَب. */
const BORN = "20260805000003"

/** الاسمُ المحرَّم: بوّابةُ حذفٍ لا تسمّى موردَها. */
const BANNED = /\bcan_delete_data\s*\(/

/**
 * ═══ تعريفُ الغلاف ليس استعمالاً له ═══
 *
 * هجرةُ 964 نفسُها **تُعرّف** can_delete_data غلافاً مهجوراً، وتضع عليه
 * تعليقاً يقول إنّه مهجور. فلو بحث الحارسُ عن الاسم مجرَّداً لصرخ على
 * الهجرة التى عالجت المرض — وهذا ما وقع فعلاً عند أوّل تجربة، **قبل
 * الشحن**، وهو نفسُ ما وقع فى 952 حين صرخ حارسى على شرحى أنا.
 *
 * فالمُحرَّم **الاستدعاء**، لا **التعريف**. وتُقنَّع هنا كتلتان:
 * تعريفُ الدالّة نفسِها، والتعليقُ عليها. والتقنيعُ بمسافاتٍ تحفظ الأسطر،
 * فتبقى أرقامُ السطور صادقةً عند الإبلاغ.
 */
const OWN_DEFINITION = [
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?can_delete_data\b[\s\S]*?\$\$[\s\S]*?\$\$\s*;/gi,
  /COMMENT\s+ON\s+FUNCTION\s+(?:public\.)?can_delete_data\b[\s\S]*?;/gi,
]

/** يستبدل الكتلَ المسموحةَ بمسافاتٍ بنفس الطول، فتُحفظ أرقامُ السطور. */
function maskOwnDefinition(sql) {
  let out = sql
  for (const re of OWN_DEFINITION) {
    out = out.replace(re, (m) => m.replace(/[^\n]/g, " "))
  }
  return out
}

/** ينزع تعليقاتِ SQL وسلاسلَه النصّية، فلا يُصطاد شرحٌ ولا نصُّ رسالة. */
function stripSqlNoise(sql) {
  let out = ""
  let i = 0
  const n = sql.length
  while (i < n) {
    const two = sql.slice(i, i + 2)
    if (two === "--") {                       // تعليقُ سطر
      const nl = sql.indexOf("\n", i)
      i = nl === -1 ? n : nl
      continue
    }
    if (two === "/*") {                       // تعليقُ كتلة
      const end = sql.indexOf("*/", i + 2)
      i = end === -1 ? n : end + 2
      out += " "
      continue
    }
    if (sql[i] === "'") {                     // سلسلةٌ نصّية
      i++
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue }
        if (sql[i] === "'") { i++; break }
        i++
      }
      out += " '' "
      continue
    }
    const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i, i + 40))
    if (dollar) {                             // جسدُ دالّةٍ بعلامة الدولار
      const tag = dollar[0]
      const end = sql.indexOf(tag, i + tag.length)
      if (end === -1) { out += sql.slice(i); break }
      // جسدُ الدالّة شيفرةٌ أيضاً — يُفحص، لكن بعد تنظيفه هو الآخر
      out += " " + stripSqlNoise(sql.slice(i + tag.length, end)) + " "
      i = end + tag.length
      continue
    }
    out += sql[i]
    i++
  }
  return out
}

function listMigrations(root) {
  const dir = path.join(root, "supabase", "migrations")
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  return names
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (f.match(/^(\d{14})/) || [])[1] >= BORN)
    .sort()
    .map((f) => path.join(dir, f))
}

function scan(root) {
  const offenders = []
  for (const abs of listMigrations(root)) {
    let raw
    try { raw = fs.readFileSync(abs, "utf8") } catch { continue }
    const masked = maskOwnDefinition(raw)
    const code = stripSqlNoise(masked)
    if (!BANNED.test(code)) continue
    // أرقامُ السطور من النصِّ المقنَّع — نفسُ الأسطر، بلا الكتل المسموحة
    const lines = masked.split(/\r?\n/)
    const hits = []
    for (let k = 0; k < lines.length; k++) {
      if (lines[k].trimStart().startsWith("--")) continue
      if (BANNED.test(lines[k])) hits.push(k + 1)
    }
    offenders.push({ file: path.relative(root, abs).split(path.sep).join("/"), lines: hits })
  }
  return offenders
}

// ── الفخُّ الذاتى: يُثبت أنّ الحارسَ يرفض المذنبَ ويُبرّئ البرىء ────────
function selftest() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "delete-gate-"))
  const dir = path.join(base, "supabase", "migrations")
  fs.mkdirSync(dir, { recursive: true })

  const guilty = path.join(dir, "20991231000001_guilty.sql")
  fs.writeFileSync(guilty,
    "CREATE POLICY x_delete ON public.x\n" +
    "  FOR DELETE USING (can_delete_data(company_id));\n")

  const innocent = path.join(dir, "20991231000002_innocent.sql")
  fs.writeFileSync(innocent,
    "-- هذه الهجرة تشرح can_delete_data(company_id) ولا تستعملها.\n" +
    "/* وهذه كتلةٌ تذكر can_delete_data( أيضاً. */\n" +
    "CREATE POLICY y_delete ON public.y\n" +
    "  FOR DELETE USING (public.can_delete_resource(company_id, 'bills'));\n" +
    "DO $$ BEGIN RAISE NOTICE 'can_delete_data( فى نصِّ رسالة'; END $$;\n")

  const old = path.join(dir, "20240101000001_history.sql")
  fs.writeFileSync(old,
    "CREATE POLICY z_delete ON public.z FOR DELETE USING (can_delete_data(company_id));\n")

  // تعريفُ الغلافِ المهجور والتعليقُ عليه — مسموحان، وهذا نصُّ 964 نفسِه
  const wrapper = path.join(dir, "20991231000003_wrapper.sql")
  fs.writeFileSync(wrapper,
    "CREATE OR REPLACE FUNCTION public.can_delete_data(p_company_id uuid)\n" +
    "RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER\n" +
    "AS $$\n  SELECT public.can_delete_resource(p_company_id, 'customers');\n$$;\n" +
    "COMMENT ON FUNCTION public.can_delete_data(uuid) IS 'مهجورة';\n")

  // والحالةُ الخبيثة: نفسُ الملفِّ يُعرّف الغلافَ **ثمّ** يستدعيه فى سياسة
  const sneaky = path.join(dir, "20991231000004_sneaky.sql")
  fs.writeFileSync(sneaky,
    "CREATE OR REPLACE FUNCTION public.can_delete_data(p_company_id uuid)\n" +
    "RETURNS boolean LANGUAGE sql AS $$ SELECT true; $$;\n" +
    "CREATE POLICY w_delete ON public.w FOR DELETE USING (can_delete_data(company_id));\n")

  const found = scan(base)
  const names = found.map((o) => path.basename(o.file))

  const pass1 = names.includes("20991231000001_guilty.sql")
  const pass2 = !names.includes("20991231000002_innocent.sql")
  const pass3 = !names.includes("20240101000001_history.sql")
  const pass4 = !names.includes("20991231000003_wrapper.sql")
  const pass5 = names.includes("20991231000004_sneaky.sql")

  console.log((pass1 ? "  ok  " : "  X   ") + "يرفض المذنب (سياسةُ حذفٍ تنادى can_delete_data)")
  console.log((pass2 ? "  ok  " : "  X   ") + "يُبرّئ البرىء (ذكرٌ فى تعليقٍ أو نصّ، والاستعمالُ سليم)")
  console.log((pass3 ? "  ok  " : "  X   ") + "لا يصرخ على التاريخ (هجرةٌ أقدمُ من " + BORN + ")")
  console.log((pass4 ? "  ok  " : "  X   ") + "لا يصرخ على تعريفِ الغلافِ المهجور والتعليقِ عليه")
  console.log((pass5 ? "  ok  " : "  X   ") + "يرفض مَن يُعرّف الغلافَ ثمّ يستدعيه فى سياسة")

  try { fs.rmSync(base, { recursive: true, force: true }) } catch { /* لا يهمّ */ }
  return pass1 && pass2 && pass3 && pass4 && pass5
}

if (SELFTEST) {
  console.log("# الفخُّ الذاتى — check-delete-gate-names-its-resource")
  process.exit(selftest() ? 0 : 1)
}

const offenders = scan(ROOT)

if (offenders.length === 0) {
  if (VERBOSE) {
    const n = listMigrations(ROOT).length
    console.log("ok — بوّابةُ الحذف تسمّى موردَها. (فُحصت " + n + " هجرةً من " + BORN + " فصاعداً)")
  }
  process.exit(0)
}

console.error("")
console.error("X v3.74.964 — بوّابةُ حذفٍ لا تسمّى موردَها.")
console.error("")
console.error("  can_delete_data(company_id) تسأل دائماً عن مورد 'customers'،")
console.error("  فتُقرّر حذفَ قيدٍ يومى بصفِّ العملاء. استعمل بدلَها:")
console.error("")
console.error("      public.can_delete_resource(company_id, '<موردُ هذا الجدول>')")
console.error("")
for (const o of offenders) {
  console.error("  · " + o.file + (o.lines.length ? "  (سطر " + o.lines.join(", ") + ")" : ""))
}
console.error("")
process.exit(1)
