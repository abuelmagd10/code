#!/usr/bin/env node
/**
 * check-select-policy-self-lookup.js — حارسُ ٩٥٢.
 * ---------------------------------------------------------------------------
 * العطبُ الذى وقع فعلاً (٤ أغسطس ٢٠٢٦): قاعدةُ الرؤية على purchase_orders
 * كانت USING (can_access_purchase_order(id)) — تعود فتبحث عن الصفِّ فى
 * الجدول بمُعرِّفه. وPostgreSQL يطبّق قواعدَ الرؤية على الصفِّ العائد من
 * RETURNING، وPostgREST يستعمل RETURNING دائماً. فالصفُّ الوليدُ ليس فى
 * الجدول بعدُ، فالجوابُ «لا» أبداً، فيُرفض كلُّ إنشاءٍ بـ 42501.
 *
 * فهذا يمنع عودةَ **الخاصية**: قاعدةُ SELECT (أو ALL) تُعرِّف الصفَّ
 * بمفتاحه بدل أعمدته.
 *
 * ومداه الهجراتُ الأحدثُ من ٢٠٢٦٠٨٠٤٠٠٠٠٠١ وحدَها. فالتاريخُ يحوى تسعَ
 * حالاتٍ معروفةً مقيسةً ومسجَّلةً فى CHANGELOG، وحارسٌ يصيح على ما مضى
 * يُطفأ فى أوّل أسبوع فلا يحرس شيئاً بعدها.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

const ROOT = process.cwd()
const DIR = path.join(ROOT, "supabase", "migrations")
const SINCE = "20260804000001"

if (!fs.existsSync(DIR)) {
  console.error("X supabase/migrations غيرُ موجود — شغّل الأمر من جذر المستودع.")
  process.exit(1)
}

const files = fs.readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => (f.match(/^\d+/) || ["0"])[0] > SINCE)
  .sort()

const offenders = []

for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), "utf8")
  // كلُّ CREATE POLICY حتى الفاصلة المنقوطة، بلا أسطر الشرح.
  const body = src.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n")
  const re = /CREATE\s+POLICY\s+([\w"]+)[\s\S]*?;/gi
  let m
  while ((m = re.exec(body)) !== null) {
    const block = m[0]
    const forClause = /\bFOR\s+(SELECT|ALL)\b/i.exec(block)
    if (!forClause) continue                       // لا FOR ⇒ ALL ضمناً؟ لا: نطلب تصريحاً
    const using = /\bUSING\s*\(([\s\S]*)\)\s*(?:WITH\s+CHECK|;)/i.exec(block)
    if (!using) continue
    // الخاصية: نداءُ دالةٍ وسيطُها الوحيد هو id.
    if (!/[a-z_][\w.]*\s*\(\s*id\s*\)/i.test(using[1])) continue
    offenders.push(f + "  ·  " + m[1] + "  ·  FOR " + forClause[1].toUpperCase())
  }
}

if (offenders.length > 0) {
  console.error("")
  console.error("X v3.74.952: قاعدةُ رؤيةٍ تُعرِّف الصفَّ بمفتاحه — " + offenders.length + " موضعاً:")
  for (const o of offenders) console.error("   " + o)
  console.error("")
  console.error("   هذه الصياغةُ تُجيب «لا» دائماً على صفٍّ وليد، فتمنع الإنشاءَ كلَّه (42501).")
  console.error("   اقرأ أعمدةَ الصفِّ نفسِه:")
  console.error("     USING (company_id IN (SELECT public.get_user_company_ids())")
  console.error("            AND public.can_access_record_branch(company_id, branch_id))")
  process.exit(1)
}

console.log("ok  " + files.length + " هجرةً بعد ٩٥٢، لا قاعدةَ رؤيةٍ تبحث عن صفِّها بمفتاحه.")
