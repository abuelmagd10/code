#!/usr/bin/env node
/**
 * check-the-push-was-deployed.js
 * ---------------------------------------------------------------------------
 * v3.75.80 — **ودفعٌ لا يُنشَرُ صامتاً أخطرُ من دفعٍ يسقطُ صاخباً.**
 *
 * ═══ الحادثةُ التى وُلد منها هذا الرقيب ═══
 *
 * دُفِعَ إصدارُ v3.75.78 (القيد `bada4b99`) إلى `main` بنجاح: مئةٌ وثلاثةُ
 * حرّاسٍ مرّوا، وخمسةٌ وأربعونَ فخّاً ذاتيّاً، وبناءٌ كاملٌ لأربعمئةٍ وأربعينَ
 * صفحة. وقالَ السكربتُ «تمّ». **ولم يُنشَرْ شىء.**
 *
 * ضاعَ حدثُ الدفعِ فى طريقِه من GitHub إلى Vercel — مرّةً واحدةً لذلك القيدِ
 * وحدَه. ولم يظهرْ فى Vercel سجلُّ نشرٍ فاشلٍ ولا ملغىً ولا معلَّق: **لا سجلَّ
 * من أىِّ نوع**. وبقىَ المستخدمونَ على الإصدارِ السابقِ **ساعةً كاملة**، ولم
 * يُكتشَفْ ذلك إلّا لأنّ صاحبَ المشروعِ لاحظَه بعينِه.
 *
 * ودليلُ ذلك محفوظٌ فى صفحةِ القيودِ على GitHub: لكلِّ قيدٍ خمسةُ فحوص،
 * **ولـ`bada4b99` أربعةٌ فقط** — الغائبُ هو فحصُ `Vercel – code`.
 *
 * ═══ والعطبُ ليس ضياعَ الحدث، بل أنّ ضياعَه لم يقلْه أحد ═══
 *
 * الشبكاتُ تُسقِطُ أحداثاً، وهذا لا يُمنَع. **والذى يُمنَعُ هو الصمت.** فصارَ
 * لسكربتِ الإصدارِ خطوةٌ أخيرة: **هل تبدَّلَ ما يخدمُه الإنتاجُ فعلاً؟**
 *
 * ═══ وكيف يُقاسُ ذلك بلا مفتاحٍ ولا حساب ═══
 *
 * كلُّ صفحةٍ يخدمُها Vercel تحملُ فى جذرِها بصمةَ النشرِ الذى بناها:
 *
 *     <html data-dpl-id="dpl_GbUcopPhtV6fANsKmgyve8ke8gch" …>
 *
 * فتُقرَأُ البصمةُ **قبلَ الدفع**، ثمّ تُنتظَرُ بصمةٌ **مختلفة** بعدَه. وتبدُّلُها
 * برهانٌ بالأثرِ لا بالادّعاء: نشرٌ جديدٌ صارَ هو الذى يخدمُ الناس.
 * **ولا يُسأَلُ عن ذلك حسابٌ ولا يُدخَلُ مفتاح.**
 *
 * ═══ ولا يُكتَبُ عنوانُ الموقعِ هنا بيدٍ ═══
 *
 * العنوانُ الرسمىُّ للمشروعِ مُعلَنٌ سلفاً فى `app/robots.ts` (`host`)، فمنه
 * يُقرَأ. **ولا يُنادى اسمٌ يسكنُه غيرُه.**
 *
 * Usage:
 *   node scripts/check-the-push-was-deployed.js                 # فحصُ الأسلاكِ فقط، بلا شبكة
 *   node scripts/check-the-push-was-deployed.js --capture       # يطبعُ بصمةَ النشرِ الحالىّ
 *   node scripts/check-the-push-was-deployed.js --since dpl_x [--timeout 240]
 *   node scripts/check-the-push-was-deployed.js --selftest
 * ---------------------------------------------------------------------------
 */
"use strict"

const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const ROBOTS = path.join(ROOT, "app", "robots.ts")

/** المهلةُ الافتراضيّة: النشرُ عندَ هذا المشروعِ يتمُّ فى ٣–٤ دقائقَ عادةً. */
const DEFAULT_TIMEOUT_S = 300
const PROBE_S = 10

// ═══════════════════════════════════════════════════════════════════════════
// الجزءُ الخالصُ من المنطق — يُختبَرُ بلا شبكةٍ ولا قرص
// ═══════════════════════════════════════════════════════════════════════════

/** بصمةُ النشرِ من صفحةٍ يخدمُها Vercel. `null` إن لم تكنْ فيها. */
function deploymentIdOf(html) {
  const m = String(html || "").match(/data-dpl-id=["'](dpl_[A-Za-z0-9]+)["']/)
  return m ? m[1] : null
}

/** العنوانُ الرسمىُّ من إعلانِ المشروعِ نفسِه — لا من يدِ كاتبِ الحارس. */
function hostFromRobots(src) {
  const m = String(src || "").match(/host:\s*["'](https?:\/\/[^"']+)["']/)
  if (!m) return null
  return m[1].replace(/\/+$/, "")
}

/**
 * الحكم: أنُشِرَ، أم ما زالَ يُنتظَر، أم توقّفَ الانتظارُ بلا نشر؟
 * @param {{before:(string|null), now:(string|null), elapsedS:number, timeoutS:number}} s
 * @returns {"deployed"|"waiting"|"stalled"|"unreadable"}
 */
function judgeDeployment(s) {
  const before = s.before || null
  const now = s.now || null
  if (!now) return s.elapsedS >= s.timeoutS ? "unreadable" : "waiting"
  if (before && now !== before) return "deployed"
  // **ولا بصمةَ سابقةَ ليست برهانَ نشر**: بلا «قبل» لا يُقالُ «تبدَّل».
  return s.elapsedS >= s.timeoutS ? "stalled" : "waiting"
}

// ═══════════════════════════════════════════════════════════════════════════
// الفخُّ الذاتىّ — **وفخٌّ لا يُشغَّل ليس فخّاً**
// ═══════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--selftest")) {
  const cases = []
  const t = (name, got, exp) => cases.push([name, JSON.stringify(got), JSON.stringify(exp)])

  // ── قراءةُ البصمة ────────────────────────────────────────────────────────
  t("يقرأُ البصمةَ من جذرِ الصفحة",
    deploymentIdOf('<!DOCTYPE html><html data-dpl-id="dpl_GbUcopPhtV6fANsKmgyve8ke8gch" lang="ar">'),
    "dpl_GbUcopPhtV6fANsKmgyve8ke8gch")
  t("ويقرؤها بعلاماتِ اقتباسٍ مفردة",
    deploymentIdOf("<html data-dpl-id='dpl_ABC123' >"), "dpl_ABC123")
  t("ولا يخترعُ بصمةً من صفحةٍ بلا واحدة", deploymentIdOf("<html lang=ar>"), null)
  t("ولا يقرأُ فراغاً بصمةً", deploymentIdOf(""), null)
  t("ولا يقبلُ وسماً ليس بصمةَ نشر", deploymentIdOf('<html data-dpl-id="xyz_1">'), null)

  // ── العنوانُ من إعلانِ المشروع ───────────────────────────────────────────
  t("يقرأُ العنوانَ من robots", hostFromRobots('  host: "https://7esab.com",\n'), "https://7esab.com")
  t("ويحذفُ الشرطةَ الأخيرة", hostFromRobots('host: "https://x.com/",'), "https://x.com")
  t("ولا يخترعُ عنواناً حين لا إعلان", hostFromRobots("sitemap: 'x'"), null)

  // ── الحكمُ ───────────────────────────────────────────────────────────────
  t("ينشرُ حين تبدّلت البصمة",
    judgeDeployment({ before: "dpl_a", now: "dpl_b", elapsedS: 20, timeoutS: 300 }), "deployed")
  t("وينتظرُ ما دامت كما هى ولم تنتهِ المهلة",
    judgeDeployment({ before: "dpl_a", now: "dpl_a", elapsedS: 20, timeoutS: 300 }), "waiting")
  t("ويُعلنُ التوقّفَ حين انتهت المهلةُ ولم تتبدّل",
    judgeDeployment({ before: "dpl_a", now: "dpl_a", elapsedS: 300, timeoutS: 300 }), "stalled")
  t("ولا يقولُ «نُشِر» بلا بصمةٍ سابقة — ولا يُقرأُ فراغٌ ويُسمّى برهاناً",
    judgeDeployment({ before: null, now: "dpl_b", elapsedS: 20, timeoutS: 300 }), "waiting")
  t("ويُعلنُ التوقّفَ لا النشرَ حين لا بصمةَ سابقةَ وانتهت المهلة",
    judgeDeployment({ before: null, now: "dpl_b", elapsedS: 300, timeoutS: 300 }), "stalled")
  t("وينتظرُ صفحةً لم تُقرَأْ بعد",
    judgeDeployment({ before: "dpl_a", now: null, elapsedS: 20, timeoutS: 300 }), "waiting")
  t("ويقولُ «لم تُقرَأ» حين انتهت المهلةُ ولا صفحة",
    judgeDeployment({ before: "dpl_a", now: null, elapsedS: 300, timeoutS: 300 }), "unreadable")
  t("ويرى النشرَ فى نفسِ لحظةِ انتهاءِ المهلة — **والنشرُ يسبقُ الحكمَ بالتوقّف**",
    judgeDeployment({ before: "dpl_a", now: "dpl_b", elapsedS: 300, timeoutS: 300 }), "deployed")

  // ── والإعلانُ حىٌّ: العنوانُ يُقرَأُ من الملفِّ الحقيقىّ ──────────────────
  const realHost = fs.existsSync(ROBOTS) ? hostFromRobots(fs.readFileSync(ROBOTS, "utf8")) : null
  t("والعنوانُ الرسمىُّ مُعلَنٌ فعلاً فى app/robots.ts — وبيتٌ لا يُسكَنُ ليس بيتاً",
    Boolean(realHost && /^https:\/\/.+/.test(realHost)), true)

  let fail = 0
  for (const [name, got, exp] of cases) {
    const ok = got === exp
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + exp + " فجاء " + got + ")")
  }
  if (fail) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

// ═══════════════════════════════════════════════════════════════════════════
// الأسلاك — تُفحَصُ فى كلِّ تشغيلٍ ولو بلا شبكة
// ═══════════════════════════════════════════════════════════════════════════
if (!fs.existsSync(ROBOTS)) {
  console.error("X app/robots.ts غير موجود — ولا يُعرَفُ عنوانُ الإنتاجِ إلّا منه.")
  process.exit(1)
}
const SITE = (process.env.PRODUCTION_SITE_URL || "").replace(/\/+$/, "") ||
  hostFromRobots(fs.readFileSync(ROBOTS, "utf8"))
if (!SITE) {
  console.error("X لم يُقرأْ `host` من app/robots.ts — **ولا يُخترَعُ عنوانٌ بيد**.")
  process.exit(1)
}

const args = process.argv.slice(2)
const sinceIdx = args.indexOf("--since")
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null
const toIdx = args.indexOf("--timeout")
const timeoutS = toIdx >= 0 ? Math.max(10, Number(args[toIdx + 1]) || DEFAULT_TIMEOUT_S) : DEFAULT_TIMEOUT_S

/** يقرأُ بصمةَ النشرِ التى تخدمُ الإنتاجَ الآن. `null` إن تعذّرت القراءة. */
async function currentId() {
  try {
    const r = await fetch(SITE, { redirect: "follow", headers: { "cache-control": "no-cache" } })
    if (!r.ok) return null
    return deploymentIdOf(await r.text())
  } catch {
    return null
  }
}

;(async () => {
  // (أ) لا `--capture` ولا `--since` ⇒ فحصُ أسلاكٍ صامتٌ بلا شبكة.
  //     **وحارسٌ يسقطُ على شبكةٍ ليس حارسَ قانون** — ولا يُنادَى فى G1 بغيرِ ذلك.
  if (!args.includes("--capture") && !since) {
    console.log(
      `+ رقيبُ النشرِ موصولٌ وعنوانُ الإنتاجِ مقروءٌ من إعلانِ المشروع (${SITE}) — ` +
        "ويُنادَى بـ--capture قبلَ الدفعِ وبـ--since بعدَه."
    )
    process.exit(0)
  }

  // (ب) `--capture`: البصمةُ الحاليّةُ على سطرٍ وحدَها، لتُلتقَطَ فى متغيّر.
  if (args.includes("--capture")) {
    const id = await currentId()
    if (!id) {
      console.error(`X تعذّرت قراءةُ ${SITE} — لا بصمةَ نشرٍ قبلَ الدفع.`)
      process.exit(1)
    }
    console.log(id)
    process.exit(0)
  }

  // (ج) `--since`: يُنتظَرُ تبدُّلُ البصمة.
  const t0 = Date.now()
  let verdict = "waiting"
  let now = null
  for (;;) {
    now = await currentId()
    const elapsedS = Math.round((Date.now() - t0) / 1000)
    verdict = judgeDeployment({ before: since, now, elapsedS, timeoutS })
    if (verdict !== "waiting") break
    process.stdout.write(`  … يُنتظَرُ النشر (${elapsedS}s من ${timeoutS}s)\r`)
    await new Promise((r) => setTimeout(r, PROBE_S * 1000))
  }
  const took = Math.round((Date.now() - t0) / 1000)
  process.stdout.write("".padEnd(60) + "\r")

  if (verdict === "deployed") {
    console.log(`+ ونُشِرَ فعلاً: تبدّلت بصمةُ الإنتاجِ من ${since} إلى ${now} بعدَ ${took} ثانية.`)
    process.exit(0)
  }

  console.error(
    `\nX ${verdict === "unreadable"
      ? `تعذّرت قراءةُ ${SITE} طَوالَ ${took} ثانية.`
      : `مضت ${took} ثانيةً ولم تتبدّلْ بصمةُ الإنتاج (${now || "(لم تُقرَأ)"}).`}\n\n` +
      "  **والدفعُ الذى لا يُنشَرُ صامتاً هو عطبُ v3.75.78 بعينِه**: القيدُ فى\n" +
      "  GitHub، والمستخدمونَ على الإصدارِ السابق، ولا أحدَ يعلم.\n\n" +
      "  ما يُفعَلُ الآن:\n" +
      `    ١) افتحْ لوحةَ Vercel ← Deployments، واجعلْ مُرشِّحَ الحالةِ 7/7 (Canceled معه).\n` +
      "    ٢) لو لم يظهرْ سجلُّ نشرٍ لهذا القيدِ إطلاقاً ⇒ ضاعَ حدثُ الدفع:\n" +
      "         git commit --allow-empty -m \"chore: wake the deploy hook\" && git push\n" +
      "    ٣) ولو ظهرَ بحالةِ Error ⇒ العطبُ فى البناءِ لا فى الوصلة: اقرأْ سجلَّه.\n" +
      "    ٤) ولو تكرّرَ الضياعُ ⇒ Vercel ← Settings ← Git: افصلِ المستودعَ وأعِدْ وصلَه.\n"
  )
  process.exit(1)
})()
