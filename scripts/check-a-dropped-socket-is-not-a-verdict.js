#!/usr/bin/env node
/**
 * check-a-dropped-socket-is-not-a-verdict.js
 * **والاتّصالُ المقطوعُ ليس نتيجةَ قياس.**
 * ---------------------------------------------------------------------------
 *   node scripts/check-a-dropped-socket-is-not-a-verdict.js
 *   node scripts/check-a-dropped-socket-is-not-a-verdict.js --selftest
 *
 * ═══ الحادثةُ التى وُلد منها ═══
 *
 * أُوقفت دفعةُ v3.75.9 — وقاعدةُ البيانات كانت قد قبلت الهجرةَ وتحقّقت —
 * على سطرٍ واحد:
 *
 *     X Client has encountered a connection error and is not queryable
 *     X حارس رفض: check-purchase-cost-masked-path.js
 *
 * ولم يكن فى المشروعِ عطبٌ واحد. الحارسُ نفسُه مرَّ قبلها بدقائقَ على نفسِ
 * القاعدةِ ونفسِ الكود. وكانت فيه **إعادةُ محاولةٍ مكتوبةٌ سلفاً لهذا الغرضِ
 * بعينِه** — ولم تعمل، لأنّ حكمَها كان على قائمةِ عباراتٍ رُئيت يوماً:
 * `ECONNRESET|Connection terminated|ETIMEDOUT|EPIPE|socket hang up`.
 * ورسالةُ اليوم ليست فيها.
 *
 * **وشكلُ النصِّ ليس خاصّيّة.** فُحص طريقُ `pg` فتبيّن أنّ هذه الرسالةَ لا
 * تُولَدُ إلّا بعدَ موتِ المقبس، وأنّها تأتى بلا `code` وبلا `severity` —
 * أى **لم يُجب خادمُ القاعدةِ أصلاً**. فصار الحكمُ على الخاصّيّة، وسكن بيتاً
 * واحداً: `scripts/lib/live-db.js`.
 *
 * ═══ ولماذا هذا خطرٌ لا إزعاج ═══
 *
 * **وحارسٌ يسقطُ عشوائيّاً يُلتفُّ عليه بعد أسبوع**: يُعادُ تشغيلُه حتّى يمرّ،
 * فيصيرُ المرورُ عادةً لا برهاناً، ثمّ يُستثنى، ثمّ يموت. فحمايةُ الحارسِ من
 * الشبكةِ حمايةٌ للفحصِ نفسِه.
 *
 * ═══ الخصائصُ المحكومة ═══
 *
 * **(أ)** لا حارسَ يُعيدُ محاولةً بحكمٍ من عندِه: كلُّ `check-*.js` فيه حلقةُ
 *        محاولاتٍ أو يهجّى مفرداتِ أخطاءِ الشبكة، يجب أن ينادىَ البيت.
 * **(ب)** والبيتُ يحكمُ بالخاصّيّةِ لا بالعبارة: نصُّه يجب أن يسأل عن
 *        `severity` وعن `_queryable` وعن صنفِ SQLSTATE — وإلّا عاد شكلَ نصّ.
 * **(ج)** والفخُّ يُشغَّلُ على مقبسٍ حقيقىّ: خادمٌ وهمىٌّ محلّىٌّ يموت، وآخرُ
 *        يردُّ خطأً من الخادم — فيُقاسُ أنّ الأوّلَ يُعادُ والثانى لا يُعاد.
 *        **فخٌّ لا يُشغَّل ليس فخّاً.**
 *
 * ولا يحتاجُ هذا الحارسُ قاعدةً حيّة: حكمُه على الكودِ وعلى مقبسٍ محلّىّ.
 * ---------------------------------------------------------------------------
 */
"use strict"

const fs = require("fs")
const path = require("path")
const net = require("net")

// ═══ وضعُ الفريسة: يُشغَّلُ هذا الملفُّ نفسُه حارساً وهميّاً ═══
// **فخٌّ لا يُشغَّل ليس فخّاً** — وإعادةُ التشغيلِ لا تُقاسُ إلّا بتشغيلٍ حقيقىّ،
// فيصيرُ الحارسُ فريستَه: يُستدعى بمتغيّرِ بيئةٍ فيتصرّفُ كحارسٍ يسقط.
if (process.env.ERB_SOCKET_PROBE) {
  const mode = process.env.ERB_SOCKET_PROBE
  const cf = process.env.ERB_SOCKET_PROBE_COUNTER
  const n = (Number(fs.readFileSync(cf, "utf8")) || 0) + 1
  fs.writeFileSync(cf, String(n))
  const { Client } = require("./lib/live-db")
  ;(async () => {
    if (mode === "clean") return
    if (mode === "defect") {
      throw Object.assign(new Error('relation "x" does not exist'), { code: "42P01", severity: "ERROR" })
    }
    if (mode !== "always" && n >= 2) return // الشبكةُ عادت
    // منفذٌ مغلقٌ عمداً: ECONNREFUSED — انقطاعُ اتّصالٍ بلا خادم.
    const c = new Client({ connectionString: "postgres://u:p@127.0.0.1:1/d", ssl: false })
    await c.connect()
  })().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
  return
}

const ROOT = path.resolve(__dirname, "..")
const HOME_REL = "scripts/lib/live-db.js"
const HOME_ABS = path.join(ROOT, HOME_REL)
const SELF = path.basename(__filename)

/** حارسٌ يمسُّ شأنَ الاتّصال: حلقةُ محاولاتٍ أو تهجئةُ رمزِ مقبس. */
const TOUCHES_RETRY = /attempt\s*(?:<=|<|===|==)\s*\d|ECONNRESET|socket hang up|not queryable/
const CALLS_HOME = /require\((["'])\.\/lib\/live-db\1\)|require\((["'])\.\.\/lib\/live-db\2\)/

function guardFiles() {
  return fs.readdirSync(path.join(ROOT, "scripts"))
    .filter((f) => f.startsWith("check-") && f.endsWith(".js"))
    .sort()
}

/** (أ) من يمسُّ شأنَ الاتّصالِ ولا ينادى البيت. */
function judgeOwnVocabulary(files, read) {
  const out = []
  for (const f of files) {
    const src = read(f)
    if (src === null) continue
    if (TOUCHES_RETRY.test(src) && !CALLS_HOME.test(src)) out.push(f)
  }
  return out
}

/** (د) ولا حارسَ يأخذُ عميلَه من `pg` رأساً — العميلُ من البيتِ وحدَه. */
function judgeRawClient(file, src) {
  if (!/require\(\s*["']pg["']\s*\)/.test(String(src || ""))) return null
  return file + " ينادى pg رأساً — فعميلُه لا يشهدُ على موتِ المقبس"
}

/** (ب) البيتُ يحكمُ بالخاصّيّةِ لا بالعبارة. */
function judgeHomeIsProperty(src) {
  const missing = []
  if (!/\bseverity\b/.test(src)) missing.push("لا يسأل: هل أجابَ الخادمُ أصلاً؟ (severity)")
  if (!/_queryable/.test(src)) missing.push("لا يسأل: هل ماتَ المقبس؟ (_queryable)")
  if (!/08\[0-9A-Z\]\{3\}|SQLSTATE_CONNECTION/.test(src)) missing.push("لا يعرف صنفَ SQLSTATE للاتّصال (08 / 57P0x)")
  if (!/NET_ERRNO/.test(src)) missing.push("لا يعرف أرقامَ أخطاءِ المقبس")
  if (!/class Client extends PgClient/.test(src)) missing.push("لا يُصدِّرُ عميلاً يشهدُ على موتِ المقبس")
  if (!/process\.on\("exit"/.test(src)) missing.push("لا يُعيدُ تشغيلَ الحارسِ الساقطِ على انقطاع")
  if (!/ERB_GUARD_SOCKET_RETRY/.test(src)) missing.push("بلا علامةٍ تمنعُ الإعادةَ الثانية")
  return missing
}

// ═══════════════════════ الفخُّ الذاتىّ ═══════════════════════

/** خادمٌ وهمىّ: إمّا يموتُ المقبس، أو يردُّ خطأً من الخادمِ برمزِ SQLSTATE. */
function fakeServer(mode) {
  return new Promise((resolve) => {
    const s = net.createServer((sock) => {
      let started = false
      sock.on("data", () => {
        if (mode === "drop-now") { sock.destroy(); return }
        if (mode === "server-says-no") {
          const fld = (t, v) => Buffer.concat([Buffer.from(t), Buffer.from(v, "utf8"), Buffer.from([0])])
          const body = Buffer.concat([
            fld("S", "FATAL"), fld("V", "FATAL"), fld("C", "28P01"),
            fld("M", "password authentication failed"), Buffer.from([0]),
          ])
          const len = Buffer.alloc(4); len.writeInt32BE(body.length + 4)
          sock.write(Buffer.concat([Buffer.from("E"), len, body]))
          setTimeout(() => { try { sock.end() } catch { /* gone */ } }, 20)
          return
        }
        // die-after-startup: يقومُ الاتّصالُ ثمّ يموتُ المقبس — حالةُ اليوم بعينِها
        if (!started) {
          started = true
          const auth = Buffer.alloc(9); auth.write("R", 0); auth.writeInt32BE(8, 1); auth.writeInt32BE(0, 5)
          const rfq = Buffer.alloc(6); rfq.write("Z", 0); rfq.writeInt32BE(5, 1); rfq.write("I", 5)
          sock.write(Buffer.concat([auth, rfq]))
          return
        }
        sock.destroy()
      })
      sock.on("error", () => { /* الموتُ مقصود */ })
    })
    s.on("error", () => { /* لا يُسقط الفخّ */ })
    s.listen(0, "127.0.0.1", () => resolve(s))
  })
}

/**
 * الخادمُ الوهمىُّ نفسُه **فى عمليّةٍ مستقلّة** — لأنّ المسارَ المتزامنَ يُجمِّدُ
 * حلقةَ هذه العمليّة، فخادمٌ يسكنُها لا يستطيعُ أن يُجيبَ فيبدو البابُ مغلقاً
 * وهو مفتوح. **وفخٌّ يمرُّ لسببٍ خاطئ ليس فخّاً.**
 */
const FAKE_PG_CHILD_SRC =
  'const net=require("net"),p=+process.argv[1];' +
  "net.createServer(function(sock){var started=false;" +
  'sock.on("data",function(){if(!started){started=true;' +
  'var a=Buffer.alloc(9);a.write("R",0);a.writeInt32BE(8,1);a.writeInt32BE(0,5);' +
  'var z=Buffer.alloc(6);z.write("Z",0);z.writeInt32BE(5,1);z.write("I",5);' +
  "sock.write(Buffer.concat([a,z]));return}sock.destroy()});" +
  'sock.on("error",function(){})}).listen(p,"127.0.0.1")'

/** منفذٌ حرٌّ الآن — يُحجَزُ ثمّ يُطلَقُ ليُعطى للعمليّةِ المستقلّة. */
function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port
      s.close(() => resolve(p))
    })
  })
}

async function liveFire(mode, work) {
  const { withLiveDatabase } = require("./lib/live-db")
  const s = await fakeServer(mode)
  const url = `postgres://u:p@127.0.0.1:${s.address().port}/d`
  let attempts = 0
  let message = ""
  try {
    await withLiveDatabase(url, work, {
      ssl: false, onAttempt: () => { attempts++ },
      // الطرقةُ صارت مصافحةً كاملة، فيُقصَّرُ السقفُ هنا كى لا يطولَ الفخّ —
      // **مِفصلٌ للفخِّ وحدَه**، وافتراضُه هو ما تستعملُه الحراسُ كلُّها.
      retryCeilingMs: 400, retryProbeMs: 100,
    })
  } catch (e) { message = String((e && e.message) || e) }
  await new Promise((r) => s.close(r))
  return { attempts, message }
}

/** يُنادى البيتُ عندَ الحاجةِ لا عندَ التحميل — **ولا يُنسَخُ ما يُنادى**. */
function withLiveDatabaseRef() { return require("./lib/live-db").withLiveDatabase }

async function selftest() {
  const { isConnectionFailure } = require("./lib/live-db")
  const TODAY = "Client has encountered a connection error and is not queryable"
  const OLD_VOCABULARY = /ECONNRESET|Connection terminated|ETIMEDOUT|EPIPE|socket hang up/i
  const cases = []
  const t = (name, got, exp) => cases.push([name, got, exp])

  // ── الخاصّيّة، فى الاتّجاهين ───────────────────────────────────────────
  t("يرى رسالةَ اليوم انقطاعاً", isConnectionFailure(new Error(TODAY)), true)
  t("والمفرداتُ القديمةُ كانت عمياءَ عنها", OLD_VOCABULARY.test(TODAY), false)
  t("ويرى موتَ المقبسِ من حالِ العميل",
    isConnectionFailure(new Error("anything at all"), { _queryable: false }), true)
  t("ويرى رمزَ المقبسِ باسمِه",
    isConnectionFailure(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })), true)
  t("ويرى تعذُّرَ الوصول",
    isConnectionFailure(Object.assign(new Error("x"), { code: "ENOTFOUND" })), true)
  t("ويرى انقطاعاً قالَه الخادمُ بنفسِه (صنف 08)",
    isConnectionFailure(Object.assign(new Error("x"), { code: "08006", severity: "FATAL" })), true)
  t("ويرى إنهاءً بأمرِ المشغِّل (57P01)",
    isConnectionFailure(Object.assign(new Error("x"), { code: "57P01", severity: "FATAL" })), true)

  // ── ولا يبتلعُ نتيجةَ قياسٍ حقيقيّة ──────────────────────────────────
  t("ولا يعدُّ خطأَ خادمٍ انقطاعاً",
    isConnectionFailure(Object.assign(new Error('relation "x" does not exist'), { code: "42P01", severity: "ERROR" })), false)
  t("ولا خرقَ سياسةِ صفّ",
    isConnectionFailure(Object.assign(new Error("row-level security"), { code: "42501", severity: "ERROR" })), false)
  t("ولا استثناءً رفعَه فحصٌ مرجعىّ",
    isConnectionFailure(Object.assign(new Error("BASELINE FAIL: ..."), { code: "P0001", severity: "ERROR" })), false)
  t("ولا عطباً فى الحارسِ نفسِه", isConnectionFailure(new TypeError("x is not a function")), false)
  t("ولا لا-شىء", isConnectionFailure(null), false)
  t("ولا نصّاً يذكرُ الاتّصالَ فى معنًى آخَر",
    isConnectionFailure(new Error("connection pool size must be positive")), false)

  // ── (ج) الفخُّ يُشغَّل على مقبسٍ حقيقىّ ──────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const dead = await liveFire("die-after-startup", async (c) => {
    c.query("select 1").catch(() => { /* أوّلُ ضحايا الموت */ })
    await sleep(60)
    return c.query("select 2")
  })
  t("وحين يموتُ المقبسُ بعد قيامِ الاتّصالِ يُعادُ القياسُ مرّةً", dead.attempts, 2)
  t("وتكونُ رسالتُه هى رسالةَ اليوم بعينِها", dead.message, TODAY)

  const dropped = await liveFire("drop-now", async (c) => c.query("select 1"))
  t("وحين يسقطُ الاتّصالُ قبلَ قيامِه يُعادُ القياسُ مرّةً", dropped.attempts, 2)

  const refused = await liveFire("server-says-no", async (c) => c.query("select 1"))
  t("وحين يُجيبُ الخادمُ برأيِه لا يُعادُ القياسُ", refused.attempts, 1)

  // ── وإعادةُ محاولةٍ بلا مهلةٍ ليست إعادةَ محاولة (v3.75.30) ──────────
  //    وُلدت من حادثةٍ حقيقيّة: سقطَ المقبسُ، فأُعيدت المحاولةُ فى نفسِ
  //    اللحظةِ والشبكةُ لم تعُدْ، فتوقّفت دفعةٌ سليمةٌ تماماً.
  const {
    hostOf, portOf, waitForNetwork, waitForNetworkSync, innerErrorsOf, describe,
  } = require("./lib/live-db")
  const DEAD = "postgresql://u:p@erb-no-such-host.invalid:5432/d"

  t("يقرأُ مضيفَ القاعدةِ من نصِّ الاتّصال", hostOf(DEAD), "erb-no-such-host.invalid")
  t("ولا يسقطُ على نصٍّ ليس عنواناً", hostOf("not a url at all"), null)

  // ── **وسؤالُ الاسمِ ليس سؤالَ الباب** (v3.75.65) ──────────────────────
  //    المقيسُ هو المنفذُ نفسُه لا ترجمةُ الاسم. وهذا هو الفخُّ الذى يمنعُ
  //    عودةَ العطبِ الذى أسقطَ دفعتَين: اسمٌ يُترجَمُ فى 61ms وبابٌ مغلق.
  t("يقرأُ منفذَ القاعدةِ من نصِّ الاتّصال", portOf(DEAD), 5432)
  t("ويفترضُ منفذَ بوستجرس حين يُسكَتُ عنه", portOf("postgresql://u:p@h/d"), 5432)
  t("ولا يخترعُ منفذاً لنصٍّ ليس عنواناً", portOf("not a url at all"), null)

  // **بابٌ يُدخَلُ منه حقّاً**: خادمٌ يُتِمُّ المصافحةَ — لا مقبسٌ عارٍ يقبلُ
  // ثمّ يقطع. فالطرقةُ هى نفسُ المصافحةِ التى ستُعيدُها المحاولة.
  const open = await fakeServer("die-after-startup")
  const OPEN_URL = `postgresql://u:p@127.0.0.1:${open.address().port}/d`
  // **وبابٌ مقبسُه يُفتَحُ ولا تُتِمُّ المصافحة** — وهو مُجمِّعُ الاتّصالاتِ
  // حين يمرض: طرقةٌ أخفُّ من الدخولِ كانت ستقولُ «مفتوح» عن بابٍ لا يُدخَل.
  const half = await fakeServer("drop-now")
  const HALF_URL = `postgresql://u:p@127.0.0.1:${half.address().port}/d`
  // وبابٌ مغلقٌ تماماً **واسمُه يُترجَمُ فوراً** — وهذه هى الحالةُ التى خدعت
  // المهلةَ القديمة: كانت تعودُ فى مللى ثوانٍ لأنّ الاسمَ أجاب.
  const shut = await fakeServer("drop-now")
  const SHUT_PORT = shut.address().port
  await new Promise((r) => shut.close(r))
  const SHUT_URL = `postgresql://u:p@127.0.0.1:${SHUT_PORT}/d`

  const waitedDead = await waitForNetwork(DEAD, 700, 200, false)
  t("وينتظرُ حتى السقفِ حين لا يُترجَمُ الاسمُ أصلاً", waitedDead >= 700, true)
  const waitedOpen = await waitForNetwork(OPEN_URL, 5000, 200, false)
  t("ويعودُ فورَ أن تتِمَّ المصافحة — ولا ينتظرُ بلا سبب", waitedOpen < 1000, true)
  const waitedShut = await waitForNetwork(SHUT_URL, 900, 200, false)
  t("**وينتظرُ حتى السقفِ والاسمُ يُجيبُ والبابُ مغلق** — وهو العطبُ الذى أسقطَ دفعتَين",
    waitedShut >= 900, true)
  const waitedHalf = await waitForNetwork(HALF_URL, 900, 200, false)
  t("**ولا يُخدَعُ بمقبسٍ يُفتَحُ ثمّ يُقطَع** — فالطرقةُ هى الدخولُ نفسُه",
    waitedHalf >= 900, true)

  const syncDead = waitForNetworkSync(DEAD, 700, 200, false)
  t("والمسارُ المتزامنُ ينتظرُ بالسياسةِ نفسِها", syncDead >= 700, true)
  const farPort = await freePort()
  const farServer = require("child_process").spawn(
    process.execPath, ["-e", FAKE_PG_CHILD_SRC, String(farPort)], { stdio: "ignore" }
  )
  await new Promise((r) => setTimeout(r, 700))
  const syncOpen = waitForNetworkSync(`postgresql://u:p@127.0.0.1:${farPort}/d`, 5000, 200, false)
  t("ويعودُ هو أيضاً فورَ أن تتِمَّ المصافحة", syncOpen < 2500, true)
  try { farServer.kill() } catch { /* already gone */ }
  const syncShut = waitForNetworkSync(SHUT_URL, 900, 200, false)
  t("ولا يخدعه هو أيضاً اسمٌ يُجيبُ وبابٌ مغلق", syncShut >= 900, true)
  const syncHalf = waitForNetworkSync(HALF_URL, 900, 200, false)
  t("ولا يخدعه مقبسٌ يُفتَحُ ثمّ يُقطَع", syncHalf >= 900, true)
  await new Promise((r) => open.close(r))
  await new Promise((r) => half.close(r))

  // ── **والغلافُ ليس الخطأ** (v3.75.65) ─────────────────────────────────
  //    happy-eyeballs يلفُّ سقوطَ كلِّ العناوين فى AggregateError نصُّها
  //    **فارغٌ** ورمزُها رمزُ أوّلِها — فحُكمٌ على الغلافِ وحدَه يقرأُ فراغاً.
  const wrapped = new AggregateError(
    [
      Object.assign(new Error("connect EAFNOSUPPORT ::1:5432"), { code: "EAFNOSUPPORT", address: "::1", port: 5432 }),
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), { code: "ECONNREFUSED", address: "10.0.0.1", port: 5432 }),
    ],
    ""
  )
  wrapped.code = "EAFNOSUPPORT"
  t("ورسالةُ الغلافِ فارغةٌ فعلاً — فلا خبرَ فى طباعتِها", String(wrapped.message), "")
  t("**ويُفتَحُ الغلافُ فيُرى الانقطاعُ داخلَه**", isConnectionFailure(wrapped), true)
  t("ولا يقفُ عند رمزِ الغلافِ وحدَه",
    require("./lib/live-db").NET_ERRNO.has("EAFNOSUPPORT"), false)
  t("ويعُدُّ أخطاءَ الداخلِ دونَ الغلاف", innerErrorsOf(wrapped).length, 2)
  t("ويصلُ إلى السببِ المتسلسلِ cause أيضاً",
    isConnectionFailure(Object.assign(new Error("wrapper"), {
      cause: Object.assign(new Error("x"), { code: "ECONNRESET" }),
    })), true)
  const circular = new Error("wrapper")
  circular.errors = [circular]
  t("ولا يدورُ على نفسِه حين يلفُّ الخطأُ نفسَه", innerErrorsOf(circular).length, 0)
  t("ولا يُسمّى غلافاً كلُّ ما فيه نتيجةُ قياسٍ انقطاعاً",
    isConnectionFailure(new AggregateError([Object.assign(new Error("nope"), { code: "42P01", severity: "ERROR" })], "")), false)
  t("والنصُّ المطبوعُ يقولُ رموزَ الداخلِ وعناوينَها",
    /ECONNREFUSED @10\.0\.0\.1:5432/.test(describe(wrapped)), true)
  t("ولا يُسمّى الغلافَ بلا خبر", describe(wrapped) !== "AggregateError", true)
  t("ويحجبُ نصَّ الاتّصالِ إن ظهرَ فيه",
    describe(new Error("bad postgresql://u:p@h:5432/d here")).includes("u:p@"), false)

  // **ولا يُفقَدُ سلوكٌ كان قائماً**: لو لم تعُدِ الشبكةُ أُعيدت المحاولةُ
  // مرّةً واحدةً كما كانت قبلَ المهلة — المهلةُ تؤخّرُ ولا تمنع.
  let deadAttempts = 0
  try {
    await withLiveDatabaseRef()(DEAD, async (c) => c.query("select 1"), {
      ssl: false, retryCeilingMs: 500, retryProbeMs: 200,
      onAttempt: () => { deadAttempts++ },
    })
  } catch { /* الرفضُ متوقَّع */ }
  t("والمهلةُ تؤخّرُ ولا تمنعُ الإعادة", deadAttempts, 2)

  // ── وإعادةُ تشغيلِ العمليّةِ كلِّها — بتشغيلٍ حقيقىّ لا بادّعاء ────────
  const { spawnSync } = require("child_process")
  const os = require("os")
  const runProbe = (mode) => {
    const cf = path.join(os.tmpdir(), "erb_socket_probe_" + mode + ".txt")
    fs.writeFileSync(cf, "0")
    const r = spawnSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env, {
        ERB_SOCKET_PROBE: mode, ERB_SOCKET_PROBE_COUNTER: cf, ERB_GUARD_SOCKET_RETRY: "",
      }),
      encoding: "utf8", timeout: 30000,
    })
    return { runs: Number(fs.readFileSync(cf, "utf8")), code: r.status }
  }
  const heal = runProbe("drop")
  t("وحين يسقطُ الاتّصالُ ثمّ تعودُ الشبكةُ يُعادُ التشغيلُ مرّةً", heal.runs, 2)
  t("ويُعتمَدُ خروجُ التشغيلِ الثانى", heal.code, 0)
  const stay = runProbe("always")
  t("وإن لم يعُدْ لا يُعادُ إلّا مرّةً واحدة", stay.runs, 2)
  t("ثمّ يرفضُ ولا يبتلع", stay.code, 1)
  const defect = runProbe("defect")
  t("ولا يُعادُ تشغيلٌ سقطَ بعطبٍ حقيقىّ", defect.runs, 1)
  t("ويرفضُ كما يجب", defect.code, 1)
  const clean = runProbe("clean")
  t("ولا يُعادُ تشغيلٌ نجح", clean.runs, 1)

  // ── (ب) البيتُ يحكمُ بالخاصّيّة ─────────────────────────────────────
  t("والبيتُ يحكمُ بالخاصّيّةِ لا بالعبارة",
    judgeHomeIsProperty(fs.readFileSync(HOME_ABS, "utf8")).length, 0)
  t("ولو صارَ عباراتٍ لقالَها الفحص",
    judgeHomeIsProperty("const T = /ECONNRESET/i; module.exports = {}").length > 0, true)

  // ── (أ) فى الاتّجاهين ────────────────────────────────────────────────
  const rd = (f) => ({
    "check-good.js": 'const {withLiveDatabase} = require("./lib/live-db")\nfor (let attempt = 1; attempt <= 2; attempt++) {}',
    "check-bad.js": 'const T = /ECONNRESET/i\nfor (let attempt = 1; attempt <= 2; attempt++) {}',
    "check-quiet.js": 'const x = 1',
  })[f] ?? null
  t("ويقبلُ حارساً ينادى البيت", judgeOwnVocabulary(["check-good.js"], rd).length, 0)
  t("ويرفضُ حارساً يحكمُ بنفسِه", judgeOwnVocabulary(["check-bad.js"], rd).length, 1)
  t("ويُسمّيه بالاسم", judgeOwnVocabulary(["check-bad.js"], rd)[0], "check-bad.js")
  t("ولا يشتكى من حارسٍ لا شأنَ له بالاتّصال", judgeOwnVocabulary(["check-quiet.js"], rd).length, 0)
  t("ويرفضُ حارساً ينادى pg رأساً", judgeRawClient("check-x.js", 'const { Client } = require("pg")') !== null, true)
  t("ويقبلُ حارساً يأخذُ عميلَه من البيت", judgeRawClient("check-x.js", 'const { Client } = require("./lib/live-db")'), null)
  t("ولا يخدعه ذكرُ pg فى نصّ", judgeRawClient("check-x.js", 'console.log("npm install pg")'), null)

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

// ═══════════════════════ الحكمُ على المشروعِ الحىّ ═══════════════════════

async function main() {
  if (process.argv.includes("--selftest")) return selftest()

  let bad = 0
  if (!fs.existsSync(HOME_ABS)) {
    console.error("X بيتُ حكمِ الاتّصالِ غائب: " + HOME_REL)
    process.exit(1)
  }
  const homeSrc = fs.readFileSync(HOME_ABS, "utf8")

  const missing = judgeHomeIsProperty(homeSrc)
  if (missing.length) {
    bad++
    console.error("\nX البيتُ عادَ يحكمُ على شكلِ النصِّ لا على الخاصّيّة:")
    missing.forEach((m) => console.error("   " + m))
  }

  const files = guardFiles()
  const read = (f) => { try { return fs.readFileSync(path.join(ROOT, "scripts", f), "utf8") } catch { return null } }
  const rogue = judgeOwnVocabulary(files.filter((f) => f !== SELF), read)
  if (rogue.length) {
    bad++
    console.error("\nX حارسٌ يحكمُ على الاتّصالِ بنفسِه بدل البيت (" + rogue.length + "):")
    rogue.forEach((f) => console.error("   " + f))
    console.error("   — **ولا يُنادى اسمٌ يسكنُه غيرُه**: الحكمُ فى " + HOME_REL + ".")
  }

  // ═══ (د) ولا حارسَ يأخذُ عميلَه من pg رأساً ═══
  const raw = []
  for (const f of files) {
    if (f === SELF) continue
    const why = judgeRawClient(f, read(f))
    if (why) raw.push(why)
  }
  if (raw.length) {
    bad++
    console.error("\nX حارسٌ يفتحُ اتّصالَه بيدِه من pg (" + raw.length + "):")
    raw.forEach((x) => console.error("   " + x))
    console.error("   — **ولا يُنادى اسمٌ يسكنُه غيرُه**: العميلُ من " + HOME_REL + ".")
  }

  // **وحارسٌ لا يعدُّ ما مرَّ لا يعرفُ أنّه فحص**
  const opens = files.filter((f) => {
    if (f === SELF) return false
    const s2 = read(f) || ""
    return /new Client\(/.test(s2) || CALLS_HOME.test(s2)
  })
  const inProcess = opens.filter((f) => /withLiveDatabase/.test(read(f) || ""))
  const wholeRun = opens.filter((f) => !/withLiveDatabase/.test(read(f) || "") && CALLS_HOME.test(read(f) || ""))
  const naked = opens.filter((f) => !CALLS_HOME.test(read(f) || ""))
  console.log("  حراسٌ يفتحون اتّصالاً حيّاً: " + opens.length)
  console.log("     يُعيدُ القياسَ داخلَ عمليّتِه: " + inProcess.length +
    "   ·   يُعادُ تشغيلُه كلُّه: " + wholeRun.length +
    "   ·   بلا حماية: " + naked.length)
  if (naked.length) {
    bad++
    console.error("\nX حارسٌ يفتحُ اتّصالاً حيّاً ولا حمايةَ له من انقطاعٍ عابر (" + naked.length + "):")
    naked.forEach((f) => console.error("   " + f))
  }

  if (bad) process.exit(1)
  console.log("  ok  الاتّصالُ المقطوعُ ليس نتيجةَ قياس — والحكمُ خاصّيّةٌ فى بيتٍ واحد.")
}

main().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })
