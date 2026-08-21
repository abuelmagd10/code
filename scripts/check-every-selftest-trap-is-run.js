#!/usr/bin/env node
/**
 * check-every-selftest-trap-is-run.js
 * ---------------------------------------------------------------------------
 * v3.75.81 — **فخٌّ لا يُنادى ليس فخّاً، بل زينةٌ على بابٍ لا يُفتَح.**
 *
 * ═══ ما الذى كشفَ هذا ═══
 *
 * قِيسَ يومَ ٢١ أغسطس ٢٠٢٦: عندَنا ٢٦ فخّاً مستقلّاً فى `scripts/selftest-*.js`،
 * **سبعةَ عشرَ منها لا يُناديها شىء** — لا سكربتُ الدفعِ، ولا الحراسةُ على
 * GitHub، ولا أمرٌ فى `package.json`. تُشغَّلُ باليدِ وحدَها، أى لا تُشغَّلُ.
 *
 * وثمرةُ ذلك عُدَّتْ لا وُصِفَتْ — ثلاثةُ فخاخٍ ساقطةٍ ولا أحدَ يعلم:
 *   • `purchase-return-priced-by-the-bill` مكسورٌ منذ **v3.75.59**، يومَ أضافت
 *     تلك الدفعةُ `pg_temp` إلى مسارِ البحثِ فى كلِّ دالّة، فصارَ نزعُ الفخِّ
 *     يقطعُ نصفَ السطرِ ويتركُ نصفَه.
 *   • `purchase-cost-masked-path` **لم يكنْ أخضرَ قطُّ** منذ v3.75.4: يطلبُ من
 *     الحارسِ عبارةً نثريّةً لا يقولُها، فيقرأُ رفضاً صحيحاً ويحسبُه قبولاً.
 *   • `notifications-reach-a-person` يرفضُ بحقٍّ، لأنَّ ردمَ v3.74.939 لم
 *     يُطبَّقْ على قاعدةِ الاختبار.
 *
 * **فخٌّ يعطبُ فى صمتٍ أسوأُ من فخٍّ لا يوجد**: الأوّلُ يُوهمُ صاحبَه أنَّ
 * حارسَه مُبرهَنٌ وهو ليس كذلك، والثانى لا يُوهمُ أحداً.
 *
 * ═══ ولماذا مُنادٍ يُحصِى لا قائمةٌ تُكتَب ═══
 *
 * لو كتبتُ هنا أسماءَ الفخاخِ لصارَ لها بيتان: الملفّاتُ فى المجلَّد، والقائمةُ
 * فى هذا الملفّ. **وفخٌّ جديدٌ يُضافُ غداً ولا يُكتَبُ فى القائمةِ يعودُ يتيماً
 * من يومِه.** فالمُنادى **يُحصِى المجلَّدَ** ولا يحفظُ اسماً واحداً.
 *
 * وهو نفسُه اسمُه `check-*` عن قصد: بوّابةُ الدفعِ تُشغِّلُ **كلَّ** `check-*.js`
 * وتُشغِّلُ فخَّها الذاتىَّ إن وُجِد. فبتسميتِه هكذا صارَ له مُنادٍ قائمٌ لا
 * يحتاجُ سطراً جديداً فى سكربتٍ لا يعيشُ فى المستودع.
 *
 * ═══ والحكمُ ثلاثةٌ لا اثنان ═══
 *
 * يرثُ هذا المُنادى حكمَ v3.75.80 نفسَه: فخٌّ بلا رابطِ قاعدةٍ **لم يَقِسْ**،
 * فلا يُحسَبُ ناجحاً ولا ساقطاً بل يُعَدُّ فى بابِه المسمّى. ولولا ذلك لصارَ
 * تشغيلُه على GitHub — حيثُ لا قاعدة — طمأنينةً كاذبة.
 *
 * Usage:
 *   node scripts/check-every-selftest-trap-is-run.js            # يُشغِّلُ الكلَّ
 *   node scripts/check-every-selftest-trap-is-run.js --require-db  # ولا يقبلُ «لم أَقِسْ»
 *   node scripts/check-every-selftest-trap-is-run.js --selftest    # يُرى وهو يرفض
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const { SKIP_TAG } = require("./lib/selftest-db")

const SCRIPTS_DIR = path.join(__dirname)
const PER_TRAP_TIMEOUT_MS = 15 * 60 * 1000

/** ولا يُطبَعُ رابطُ قاعدةٍ فى شاشةٍ أو سجلٍّ مهما وقع. */
function redact(s) {
  return String(s || "").replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
}

/**
 * **يُحصِى ولا يحفظ**: كلُّ `selftest-*.js` فى المجلَّد، مرتَّبةً بالاسم.
 * وترتيبُ الاسمِ مقصود: ناتجٌ ثابتٌ يُقارَنُ بين تشغيلين.
 */
function trapsIn(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith("selftest-") && f.endsWith(".js"))
    .sort()
}

/**
 * الحكمُ على فخٍّ واحدٍ من خروجِه ونصِّه — ثلاثةُ أبوابٍ لا اثنان.
 * @returns {"passed"|"skipped"|"failed"}
 */
function judgeTrapRun({ status, output }) {
  if (status !== 0) return "failed"
  return String(output || "").includes(SKIP_TAG) ? "skipped" : "passed"
}

function runOneTrap(dir, name, extraArgs) {
  const r = spawnSync(process.execPath, [path.join(dir, name), ...extraArgs], {
    encoding: "utf8",
    cwd: process.cwd(),
    timeout: PER_TRAP_TIMEOUT_MS,
    env: process.env,
  })
  // مهلةٌ انتهت ليست نجاحاً ولا «لم أَقِسْ»: فخٌّ معلَّقٌ فخٌّ ساقط.
  const timedOut = r.error && r.error.code === "ETIMEDOUT"
  const output = `${r.stdout || ""}${r.stderr || ""}${timedOut ? "\nX تجاوزَ الفخُّ مهلتَه." : ""}`
  const status = timedOut ? 1 : (r.status === null ? 1 : r.status)
  return { status, output }
}

function runAll(dir, extraArgs, { quiet = false } = {}) {
  const names = trapsIn(dir)
  const results = []
  for (const name of names) {
    const run = runOneTrap(dir, name, extraArgs)
    const verdict = judgeTrapRun(run)
    results.push({ name, verdict, output: run.output })
    if (!quiet) {
      const mark = verdict === "passed" ? "+" : verdict === "skipped" ? "!" : "X"
      const word = verdict === "passed" ? "مرَّ" : verdict === "skipped" ? "لم يَقِسْ" : "سقط"
      console.log(`  ${mark} ${name} — ${word}`)
    }
  }
  return results
}

// ═══════════════════════════════════════════════════════════════════════════
// الفخُّ الذاتىُّ: يُرى المُنادى وهو يرفض، وهو يُبقى البرىء.
// ═══════════════════════════════════════════════════════════════════════════

function selftest() {
  let ok = true
  const say = (good, title) => {
    if (good) console.log(`+ ${title}`)
    else { console.error(`X ${title}`); ok = false }
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "traps-selftest-"))
  try {
    const write = (name, body) => fs.writeFileSync(path.join(root, name), body, "utf8")

    write("selftest-zz-a-passing-one.js", 'console.log("+ fine"); process.exit(0)\n')
    write("selftest-zz-a-skipping-one.js", `console.log("! ${SKIP_TAG} zz - nothing measured"); process.exit(0)\n`)
    write("not-a-trap.js", 'process.exit(1)\n')

    // (١) يُحصِى ولا يحفظ: يلتقطُ ملفّاً لم يعرفْه أحدٌ من قبل، ويتركُ ما ليس فخّاً.
    const found = trapsIn(root)
    say(found.length === 2 && !found.includes("not-a-trap.js"),
      "يُحصِى المجلَّدَ: التقطَ الفخَّينِ الجديدينِ وحدَهما، ولم يُحصِ ما ليس فخّاً")

    // (٢) الحكمُ الثالث: «لم أَقِسْ» ليس نجاحاً.
    say(judgeTrapRun({ status: 0, output: `! ${SKIP_TAG} x` }) === "skipped",
      "خروجٌ بصفرٍ مع وسمِ «لم أَقِسْ» يُعَدُّ فى بابِه لا فى النجاح")
    say(judgeTrapRun({ status: 0, output: "+ ok" }) === "passed",
      "خروجٌ بصفرٍ بلا وسمٍ نجاحٌ كما يجب")

    // (٣) ولا يُبرَّأُ ساقط.
    say(judgeTrapRun({ status: 1, output: "X broke" }) === "failed",
      "خروجٌ بغيرِ صفرٍ سقوطٌ لا يُغطّى")
    say(judgeTrapRun({ status: 1, output: `! ${SKIP_TAG} x` }) === "failed",
      "ولا ينجو ساقطٌ بأن يطبعَ وسمَ «لم أَقِسْ» — الخروجُ هو الحكم")

    // (٤) وتشغيلٌ حقيقىٌّ على المجلَّدِ المصنوع: البرىءُ يمرُّ، والساقطُ يُسمّى.
    let res = runAll(root, [], { quiet: true })
    say(res.length === 2 && res.every((r) => r.verdict !== "failed"),
      "شُغِّلَ الفخّانِ فعلاً: مرَّ أحدُهما وعُدَّ الآخرُ فى «لم أَقِسْ»، ولم يسقطْ برىء")

    write("selftest-zz-a-broken-one.js", 'console.error("X planted breakage"); process.exit(1)\n')
    res = runAll(root, [], { quiet: true })
    const broken = res.find((r) => r.name === "selftest-zz-a-broken-one.js")
    say(res.length === 3 && broken && broken.verdict === "failed",
      "زُرِعَ فخٌّ مكسورٌ فالتقطَه المُنادى وسمّاه — ولم يبتلعْه بصمت")
    say(res.filter((r) => r.verdict === "failed").length === 1,
      "ولم يُعْدِ الساقطُ عدواه على البرىء: واحدٌ ساقطٌ لا ثلاثة")

    // (٥) ولا يُطبَعُ رابطُ قاعدةٍ مهما صرخَ فخّ.
    say(!redact("X failed: postgresql://u:p@host:5432/db is down").includes("u:p@host"),
      "رابطُ القاعدةِ يُحجَبُ فى كلِّ ما يُطبَع")

    // (٦) ومجلَّدٌ بلا فخٍّ واحدٍ ليس حالاً صحيحة.
    say(trapsIn(path.join(root, ".")).length > 0 && trapsIn(SCRIPTS_DIR).length > 0,
      "المجلَّدُ الحقيقىُّ فيه فخاخٌ فعلاً — ولو خلا لكانَ ذلك عطباً لا سلامة")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }

  if (!ok) {
    console.error("X المُنادى لا يُميّزُ الساقطَ من المارِّ من الذى لم يَقِسْ.")
    process.exit(1)
  }
  console.log("+ المُنادى مُبرهَنٌ: يُحصِى المجلَّدَ ولا يحفظُ اسماً، ويفصلُ الأبوابَ الثلاثة،")
  console.log("  ويُسمّى الساقطَ ولا يتّهمُ البرىء، ولا يُظهرُ رابطَ قاعدةٍ فى ناتجِه.")
  process.exit(0)
}

// ═══════════════════════════════════════════════════════════════════════════

if (process.argv.includes("--selftest")) selftest()

const requireDb = process.argv.includes("--require-db")
const passThrough = requireDb ? ["--require-db"] : []

const names = trapsIn(SCRIPTS_DIR)
if (names.length === 0) {
  console.error("X لا فخَّ واحداً فى scripts/ — المُنادى بلا من يُنادى، وهذا عطبٌ لا سلامة.")
  process.exit(1)
}

console.log(`يُنادى ${names.length} فخّاً مستقلّاً${requireDb ? " (ولا يقبلُ «لم أَقِسْ»)" : ""}:`)
const results = runAll(SCRIPTS_DIR, passThrough)

const failed = results.filter((r) => r.verdict === "failed")
const skipped = results.filter((r) => r.verdict === "skipped")
const passed = results.filter((r) => r.verdict === "passed")

console.log(
  `  — مرَّ: ${passed.length}  ·  لم يَقِسْ: ${skipped.length}  ·  سقط: ${failed.length}`)

if (failed.length > 0) {
  console.error(`X ${failed.length} فخّاً سقط — والحارسُ الذى وراءَه غيرُ مُبرهَن:`)
  for (const f of failed) {
    console.error(`  ── ${f.name}`)
    for (const line of redact(f.output).split("\n").filter(Boolean).slice(-12)) {
      console.error(`     ${line}`)
    }
  }
  process.exit(1)
}

console.log(
  `+ كلُّ فخٍّ مستقلٍّ نودىَ فعلاً هذه المرّة: ${passed.length} أثبتَ حارسَه، ` +
  `و${skipped.length} قالَ «لم أَقِسْ» بلا رابطِ قاعدةٍ ولم يدَّعِ نجاحاً.`)
