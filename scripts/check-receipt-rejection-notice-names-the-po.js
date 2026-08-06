#!/usr/bin/env node
/**
 * check-receipt-rejection-notice-names-the-po.js
 * ---------------------------------------------------------------------------
 * v3.74.967 — إشعارُ رفضِ الاستلام يُسمّى أمرَ الشراء ويقول الفعلَ المطلوب.
 *
 * ═══ المرضُ الذى وُلد منه هذا الحارس ═══
 *
 * رفضُ استلام البضاعة كان يُنشئ أربعةَ إشعاراتٍ **بنصٍّ واحدٍ حرفياً** -
 * لمنشئِ أمر الشراء والمالك والمدير والمحاسب: «تم رفض استلام البضاعة
 * للفاتورة رقم …». فكان يُسمّى الفاتورة، ومسؤولُ المشتريات لا يرى فواتيرَ
 * الشراء أصلاً؛ ولا يقول ماذا يُفعَل ولا مَن يفعله.
 *
 * ═══ ولماذا هذا الحارسُ مُثبِّتُ ارتدادٍ لا قانونٌ عامّ ═══
 *
 * حاولتُ أوّلاً قانوناً عامّاً: «كلُّ إشعارٍ من نوع action يجب أن يحمل نصَّه
 * الخاصّ لا النصَّ المشترك». ثمّ قِستُه على المشروع فوجدتُه **يصرخ على
 * البرىء**: إشعارُ «تعديل الفاتورة بانتظار الاعتماد» نوعُه action ويستعمل
 * النصَّ المشترك **بحقّ**، لأنّ كلَّ مُستقبِليه أصحابُ الفعل.
 *
 * فحارسٌ يصرخ على البرىء يُطفأ، ثمّ لا يحرس شيئاً. ولذلك هذا الحارسُ
 * **ضيّقٌ وصادق**: يُثبّت ما أُصلح فى موضعه بالضبط، ولا يدّعى قانوناً عامّاً
 * لم يثبت.
 *
 * ═══ ما يشترطه ═══
 *
 * فى lib/services/bill-receipt-notification.service.ts داخل notifyReceiptRejected:
 *   ‏(١) يُميَّز منشئُ أمر الشراء عن غيره (targetIsPoCreator).
 *   ‏(٢) مرجعُ إشعاره أمرُ الشراء لا الفاتورة.
 *   ‏(٣) عنوانُ إشعاره يختلف عن عنوان إشعار العلم.
 *   ‏(٤) ومفاتيحُ الأحداث (warehouse_receipt_rejected) لم تُمسّ - فهى هويّةُ
 *       منعِ التكرار، وتغييرُها يُنشئ إشعاراتٍ مكرَّرة.
 *
 * Usage: node scripts/check-receipt-rejection-notice-names-the-po.js [--list] [--selftest]
 * Env:   RECEIPT_NOTICE_SCAN_ROOT — جذرٌ بديل (يستعمله الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")
const os = require("os")

const ROOT = process.env.RECEIPT_NOTICE_SCAN_ROOT || process.cwd()
const VERBOSE = process.argv.includes("--list")
const SELFTEST = process.argv.includes("--selftest")

const FILE = "lib/services/bill-receipt-notification.service.ts"

/** يقتطع جسدَ الدالّة المسمّاة من فتحِ قوسِها إلى إغلاقه. */
function methodBody(src, name) {
  const at = src.indexOf("async " + name + "(")
  if (at < 0) return null
  const open = src.indexOf("{", src.indexOf(")", at))
  if (open < 0) return null
  let d = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++
    else if (src[i] === "}") { d--; if (d === 0) return src.slice(open, i + 1) }
  }
  return null
}

function check(root) {
  const abs = path.join(root, FILE)
  const problems = []
  if (!fs.existsSync(abs)) return [FILE + " غيرُ موجود."]
  const src = fs.readFileSync(abs, "utf8")

  const body = methodBody(src, "notifyReceiptRejected")
  if (body === null) return ["لم أجد دالّة notifyReceiptRejected فى " + FILE]

  if (!/targetIsPoCreator/.test(body)) {
    problems.push("لا تمييزَ لمنشئ أمر الشراء عن غيره (targetIsPoCreator) - عاد الجميعُ يقرأون نصّاً واحداً.")
  }
  if (!/referenceType:\s*targetIsPoCreator\s*\?\s*"purchase_order"/.test(body)) {
    problems.push("مرجعُ إشعار منشئ أمر الشراء ليس أمرَ الشراء - يقوده الرابطُ إلى فاتورةٍ لا يراها.")
  }
  if (!/actionTitle/.test(body) || !/actionMessage/.test(body)) {
    problems.push("لا عنوانَ ولا نصَّ خاصّاً بالفعل المطلوب - عاد إشعارُ العمل كإشعار العلم.")
  }
  if (!/أمر الشراء/.test(body)) {
    problems.push("نصُّ الإشعار لا يذكر أمرَ الشراء إطلاقاً.")
  }

  // مفاتيحُ الأحداث كما هى: اثنان لـ warehouse_receipt_rejected (مستخدم + دور)
  const keys = (body.match(/"warehouse_receipt_rejected"/g) || []).length
  if (keys !== 2) {
    problems.push("عددُ مفاتيح warehouse_receipt_rejected صار " + keys + " بدل 2 - مفتاحُ الحدث هويّةُ منعِ التكرار.")
  }
  if (!/"procurement",\s*\n?\s*"bill",\s*\n?\s*bill\.id,\s*\n?\s*"warehouse_receipt_rejected"/.test(body)) {
    problems.push("بناءُ مفتاح الحدث تغيّر - سيُنشئ إشعاراتٍ مكرَّرةً لنفس الحدث.")
  }
  return problems
}

// -- الفخُّ الذاتى ------------------------------------------------------------
const FIXED = [
  'export class X {',
  '  async notifyReceiptRejected(actor: any, bill: any, rejectionReason: string, cycleKey: any) {',
  '    const title = "تم رفض استلام البضاعة"',
  '    const targetIsPoCreator = Boolean(poCreatorId && bill.purchase_order_id)',
  '    const actionTitle = targetIsPoCreator ? "مطلوبٌ منك: تعديلُ أمر الشراء" : title',
  '    const actionMessage = "راجع أمر الشراء وعدّله."',
  '    await this.createNotification(actor, {',
  '      referenceType: targetIsPoCreator ? "purchase_order" : "bill",',
  '      title: actionTitle,',
  '      message: actionMessage,',
  '      eventKey: buildNotificationEventKey(',
  '        "procurement",',
  '        "bill",',
  '        bill.id,',
  '        "warehouse_receipt_rejected",',
  '        "user",',
  '        targetUserId,',
  '        cycle',
  '      ),',
  '    })',
  '    for (const recipient of roleRecipients) {',
  '      await this.createNotification(actor, {',
  '        referenceType: "bill",',
  '        title,',
  '        message,',
  '        eventKey: buildNotificationEventKey(',
  '          "procurement",',
  '          "bill",',
  '          bill.id,',
  '          "warehouse_receipt_rejected",',
  '          "role",',
  '          recipient.role,',
  '          cycle',
  '        ),',
  '      })',
  '    }',
  '  }',
  '}',
].join("\n")

const BROKEN = FIXED
  .split('referenceType: targetIsPoCreator ? "purchase_order" : "bill",').join('referenceType: "bill",')
  .split("const targetIsPoCreator = Boolean(poCreatorId && bill.purchase_order_id)").join("")
  .split("const actionTitle = targetIsPoCreator ? \"مطلوبٌ منك: تعديلُ أمر الشراء\" : title").join("")
  .split('const actionMessage = "راجع أمر الشراء وعدّله."').join("")
  .split("title: actionTitle,").join("title,")
  .split("message: actionMessage,").join("message,")

function write(base, content) {
  const abs = path.join(base, FILE)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

function selftest() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-notice-"))

  write(base, FIXED)
  const p1 = check(base).length === 0

  write(base, BROKEN)
  const broken = check(base)
  const p2 = broken.length > 0

  // مفتاحُ الحدث لو تغيّر -> يُرفض
  write(base, FIXED.split('"warehouse_receipt_rejected"').join('"receipt_rejected_v2"'))
  const p3 = check(base).length > 0

  // الملفُّ مفقود -> يُقال ولا يُتجاهل
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-empty-"))
  const p4 = check(empty).length > 0

  console.log((p1 ? "  ok  " : "  X   ") + "يمرّ على النصّ المُصلَح")
  console.log((p2 ? "  ok  " : "  X   ") + "يرفض الارتدادَ إلى نصٍّ واحدٍ ومرجعِ فاتورة")
  console.log((p3 ? "  ok  " : "  X   ") + "يرفض تغييرَ مفتاح الحدث (هويّة منع التكرار)")
  console.log((p4 ? "  ok  " : "  X   ") + "يقول إن اختفى الملفُّ ولا يصمت")

  try { fs.rmSync(base, { recursive: true, force: true }) } catch { /* لا يهمّ */ }
  try { fs.rmSync(empty, { recursive: true, force: true }) } catch { /* لا يهمّ */ }
  return p1 && p2 && p3 && p4
}

if (SELFTEST) {
  console.log("# الفخُّ الذاتى - check-receipt-rejection-notice-names-the-po")
  process.exit(selftest() ? 0 : 1)
}

const problems = check(ROOT)
if (problems.length === 0) {
  if (VERBOSE) console.log("ok - إشعارُ رفضِ الاستلام يُسمّى أمرَ الشراء ويقول الفعلَ المطلوب.")
  process.exit(0)
}

console.error("")
console.error("X v3.74.967 - إشعارُ رفضِ الاستلام ارتدّ.")
console.error("")
for (const p of problems) console.error("  - " + p)
console.error("")
process.exit(1)
