#!/usr/bin/env node
/**
 * check-no-blanket-trigger-disable.js — حارسُ ٩٦٠.
 * ---------------------------------------------------------------------------
 * ٧٢ صفَّ بندٍ بقيت تشير إلى مستنداتٍ محذوفة، رغم أنّ المفتاحين الأجنبيين
 * موجودان ومُتحقَّقٌ منهما وبـ ON DELETE CASCADE. وذلك مستحيلٌ ما دام
 * المفتاحُ يعمل — فالتفسيرُ الوحيد أنّ أحداً عطّل المُشغِّلات ثمّ حذف.
 *
 * وتعطيلُ المُشغِّلات دفعةً واحدة يُعطّل معه **فرضَ المفاتيح الأجنبية**،
 * ولا يمسّ علامةَ التحقّق — فتبقى القاعدةُ تظنّ نفسَها سليمةً وهى ليست كذلك.
 *
 * والمحروسُ خاصيةٌ لا نصّ: أمرٌ يرفع الحمايةَ عن الجدول كلِّه دفعةً واحدة.
 * وتعطيلُ مُشغِّلٍ **بعينه** (DISABLE TRIGGER اسمه) يمرّ — فذلك قصدٌ محدود،
 * وقد استعملناه فى اختبارات ٩٥٥ داخل معاملاتٍ مُرجَعة.
 *
 * ومداه الهجراتُ الأحدثُ من ٢٠٢٦٠٨٠٤٠٠٠٠٠٦ وحدَها: حارسٌ يصيح على الماضى
 * يُطفأ فى أسبوع فلا يحرس شيئاً بعدها.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

const ROOT = process.cwd()
const DIR = path.join(ROOT, "supabase", "migrations")
const SINCE = "20260804000006"

if (!fs.existsSync(DIR)) { console.error("X supabase/migrations غيرُ موجود."); process.exit(1) }

const files = fs.readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => (f.match(/^\d+/) || ["0"])[0] > SINCE)
  .sort()

const offenders = []
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), "utf8")
  const lines = src.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim().startsWith("--")) continue
    if (/DISABLE\s+TRIGGER\s+ALL/i.test(l) ||
        /DISABLE\s+TRIGGER\s+USER/i.test(l) ||
        /session_replication_role\s*=\s*'?replica/i.test(l) ||
        /ALTER\s+TABLE[^;]*NOCHECK/i.test(l)) {
      offenders.push(f + ":" + (i + 1) + "  " + l.trim().slice(0, 110))
    }
  }
}

if (offenders.length > 0) {
  console.error("")
  console.error("X v3.74.960: رفعُ الحماية عن الجدول كلِّه — " + offenders.length + " موضعاً:")
  for (const o of offenders) console.error("   " + o)
  console.error("")
  console.error("   هذا يُعطّل فرضَ المفاتيح الأجنبية ولا يمسّ علامةَ التحقّق،")
  console.error("   فتبقى القاعدةُ تظنّ نفسَها سليمةً وفيها بنودٌ بلا مستندات.")
  console.error("   عطّل مُشغِّلاً بعينه إن اضطررت، لا الجدولَ كلَّه.")
  process.exit(1)
}

console.log("ok  " + files.length + " هجرةً بعد ٩٦٠، ولا واحدةَ ترفع الحمايةَ عن جدولٍ كامل.")
