#!/usr/bin/env node
/**
 * scripts/lib/live-db.js
 * **بيتٌ واحدٌ يحكم: هل هذا انقطاعُ اتّصال، أم نتيجةُ قياس؟**
 * ---------------------------------------------------------------------------
 * ═══ الحادثةُ التى وُلد منها هذا البيت ═══
 *
 * سقطت دفعةُ v3.75.9 على سطرٍ واحد:
 *
 *     X Client has encountered a connection error and is not queryable
 *     X حارس رفض: check-purchase-cost-masked-path.js
 *
 * ولم يكن فى الحجبِ عطبٌ واحد: نفسُ الحارسِ مرَّ قبلها بدقائق على نفسِ
 * القاعدةِ ونفسِ الكود. وكان فى الحارسِ **إعادةُ محاولةٍ مكتوبةٌ سلفاً** —
 * لكنّها لم تعمل. لماذا؟ لأنّ الحكمَ كان على **شكلِ النصّ**:
 *
 *     /ECONNRESET|Connection terminated|ETIMEDOUT|EPIPE|socket hang up/i
 *
 * وهذه قائمةُ عباراتٍ رُئيت يوماً، لا وصفٌ لخاصّيّة. ورسالةُ اليوم ليست
 * فيها، فحكمَ الحارسُ أنّ الانقطاعَ نتيجةُ قياس، فأوقفَ الدفعة.
 *
 * ═══ وبرهانُ أنّ الرسالةَ انقطاعٌ لا عطب ═══
 *
 * فى `pg` لا تُولَدُ هذه الرسالةُ إلّا من طريقٍ واحد: `_handleErrorEvent`
 * يُطفئ `_queryable` حين يموتُ المقبس، ثمّ يردُّ بها أوّلَ استعلامٍ تالٍ.
 * جُرِّب الطريقُ نفسُه فأعطى الرسالةَ حرفاً بحرف، بلا `code` وبلا
 * `severity` — أى **لم يُجب خادمُ القاعدةِ أصلاً**.
 *
 * ═══ فالقاعدةُ هنا خاصّيّةٌ لا عبارة ═══
 *
 *   • **خادمٌ أجاب** (له `severity` ورمزُ SQLSTATE) ⇐ هذه نتيجةُ قياس،
 *     لا تُعادُ أبداً… **إلّا** أن يقول الخادمُ نفسُه إنّ الاتّصالَ سقط:
 *     صنفُ `08` (استثناءُ اتّصال) و`57P01..03` (إنهاءٌ بأمرِ المشغِّل).
 *   • **رمزُ مقبسٍ باسمِه** (`ECONNRESET` وأخواتُه) ⇐ انقطاع.
 *   • **العميلُ لم يعد قابلاً للاستعلام** (`_queryable === false`) ⇐ مات
 *     المقبس. وهذه هى الحالةُ التى سقطت عليها الدفعةُ اليوم.
 *   • والنصُّ آخِرُ الأدلّةِ لا أوّلُها.
 *
 * **وشكلُ النصِّ ليس خاصّيّة.**
 * **والاتّصالُ المقطوعُ ليس نتيجةَ قياس.**
 * **ولا يُنادى اسمٌ يسكنُه غيرُه** — فالحكمُ هنا، ولا يُنسَخ فى حارس.
 * ---------------------------------------------------------------------------
 */
"use strict"

// يُسمّى عميلُ `pg` باسمِه الأصلىِّ هنا، لأنّ البيتَ يُصدِّرُ فوقَه عميلاً
// **شاهداً** بالاسمِ نفسِه — والحراسُ تنادى الشاهد.
let PgClient
try { ({ Client: PgClient } = require("pg")) } catch {
  console.error("X npm install pg --save-dev")
  process.exit(1)
}

/** أرقامُ أخطاءِ المقبسِ التى تعنى: لم نصلْ أو انقطعنا. */
const NET_ERRNO = new Set([
  "ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "EPIPE", "ETIMEDOUT",
  "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "ENETDOWN",
  "EADDRNOTAVAIL", "ERR_SOCKET_CONNECTION_TIMEOUT",
])

/** SQLSTATE: صنفُ `08` استثناءُ اتّصال، و`57P01..03` إنهاءٌ بأمرِ المشغِّل. */
const SQLSTATE_CONNECTION = /^08[0-9A-Z]{3}$|^57P0[123]$/

/** آخِرُ الأدلّة: عباراتٌ يصنعُها `pg` بنفسِه بلا رمز. */
const LAST_RESORT_TEXT =
  /not queryable|Connection terminated|Connection ended unexpectedly|socket hang up|server closed the connection|Client was closed/i

/**
 * هل هذا الخطأُ انقطاعُ اتّصالٍ (فيُعادُ القياس)، أم نتيجةُ قياسٍ (فتُرفَع)؟
 * @param {unknown} err الخطأُ الملتقَط.
 * @param {object=} client عميلُ `pg` إن وُجد — حالتُه دليلٌ أقوى من نصِّه.
 */
function isConnectionFailure(err, client) {
  if (!err) return false
  const code = String((err && err.code) || "")
  const answered = Boolean(err && err.severity) && /^[0-9A-Z]{5}$/.test(code)
  // خادمٌ أجاب: قولُه هو الفصل — ولا يُعادُ قياسٌ ردَّ عليه الخادمُ برأى.
  if (answered) return SQLSTATE_CONNECTION.test(code)
  if (NET_ERRNO.has(code)) return true
  if (client && client._queryable === false) return true
  return LAST_RESORT_TEXT.test(String((err && err.message) || ""))
}

/**
 * يفتحُ اتّصالاً حيّاً، ويُنفّذُ العمل، ويُغلق — ويُعيدُ المحاولةَ **مرّةً
 * واحدةً فقط** إن كان السقوطُ انقطاعَ اتّصال.
 *
 * ولماذا مرّةٌ واحدة؟ **وحارسٌ يسقطُ عشوائيّاً يُلتفُّ عليه بعد أسبوع** —
 * يُعادُ تشغيلُه حتّى يمرّ، فيصيرُ المرورُ عادةً لا برهاناً. فمرّةٌ تُنصفُ
 * الشبكة، وما زاد يُخفى العطب.
 *
 * @param {string} url وصلةُ القاعدة.
 * @param {(client: object) => Promise<any>} work القياسُ نفسُه.
 * @param {{onAttempt?: (attempt: number) => void, ssl?: any}=} opts
 *        `onAttempt` تُنادى قبلَ كلِّ محاولة: تُفرَّغُ فيها المُجمِّعاتُ، وإلّا
 *        بقيت ملاحظاتُ المحاولةِ المقطوعةِ فاخترعَ الحارسُ أعطاباً.
 *        `ssl` مِفصلٌ للفخِّ الذاتىِّ وحدَه — **فخٌّ لا يُشغَّل ليس فخّاً**،
 *        ولا يُشغَّلُ هذا الطريقُ حقّاً إلّا على خادمٍ وهمىٍّ بلا تعميةٍ محلّيّاً.
 *        وافتراضُه هو ما تستعملُه الحراسُ كلُّها.
 */
async function withLiveDatabase(url, work, opts) {
  const ATTEMPTS = 2
  const onAttempt = opts && typeof opts.onAttempt === "function" ? opts.onAttempt : null
  const ssl = opts && "ssl" in opts ? opts.ssl : { rejectUnauthorized: false }
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (onAttempt) onAttempt(attempt)
    // **ولا تتراكبُ استراتيجيّتان**: هذه تُعيدُ القياسَ داخلَ العمليّة، فتستعمل
    // العميلَ الخامَ لا الشاهد، وإلّا أُعيد التشغيلُ فوقَ الإعادة.
    const client = new PgClient({ connectionString: url, ssl })
    // بلا هذا المستمعِ يقتلُ انقطاعُ المقبسِ العمليةَ بدل أن يُبلِّغ.
    client.on("error", (e) => {
      if (!isConnectionFailure(e, client)) console.error(`! pg: ${(e && e.message) || e}`)
    })
    try {
      await client.connect()
      return await work(client)
    } catch (e) {
      if (attempt < ATTEMPTS && isConnectionFailure(e, client)) {
        console.log(`! سقط الاتّصالُ بالقاعدة (${(e && e.message) || e}) — يُقاسُ مرّةً أخرى، مرّةً واحدة.`)
        try { await client.end() } catch { /* already gone */ }
        continue
      }
      throw e
    } finally {
      try { await client.end() } catch { /* already gone */ }
    }
  }
  // لا يُبلَغُ هذا السطرُ إلّا لو تغيّر العدّ — ولا يُقرأُ فراغٌ ويُسمّى سلاماً.
  throw new Error("withLiveDatabase: انتهت المحاولاتُ بلا نتيجةٍ ولا خطأ")
}

// ═══════════════════════════════════════════════════════════════════════════
// **والحارسُ الذى لا يُعادُ قياسُه يُلتفُّ عليه كما يُلتفُّ على الساقط**
// ═══════════════════════════════════════════════════════════════════════════
//
// أربعةُ حراسٍ ثقالٍ يُعيدون القياسَ داخلَ العمليّةِ بـ`withLiveDatabase`.
// وبقىَ أربعةٌ وثلاثون يفتحون اتّصالاً حيّاً بلا إعادة، وأجسامُهم مختلفةٌ
// اختلافاً لا يقبلُ قالباً واحداً: منهم من يجمعُ ملاحظاتِه فى قوائمَ على
// مستوى الملفّ، ومنهم من يخرجُ من منتصفِ عملِه.
//
// **ونصفُ جراحةٍ أسوأُ من لا جراحة.** فلا تُفتَّتُ أجسامُهم، بل يُعادُ
// **تشغيلُ العمليّةِ كلِّها مرّةً واحدة** — وهذا أنظفُ من الإعادةِ الداخليّة:
// العمليّةُ الجديدةُ تبدأ من صفحةٍ بيضاءَ تماماً، فلا مُجمِّعٌ يحملُ نصفَ
// قياسٍ سابق، **ولا يخترعُ الحارسُ أعطاباً**.
//
// والمِرساةُ فى كلِّ حارسٍ حرفٌ واحد: `require("pg")` صار `require("./lib/live-db")`.
// فلا يُمَسُّ جسمُ حارسٍ واحد. **ولا يُصلَح ما لا يُفهَم.**

const RETRY_FLAG = "ERB_GUARD_SOCKET_RETRY"
let sawDrop = false

/** يُسجَّلُ أنّ المقبسَ سقط — بالخاصّيّةِ نفسِها لا بشكلِ نصّ. */
function noteIfDropped(err, client) {
  if (isConnectionFailure(err, client)) { sawDrop = true; return true }
  return false
}

/**
 * عميلٌ هو عميلُ `pg` نفسُه، ولا يزيدُ عليه إلّا أنّه **يشهد**: يلتقطُ موتَ
 * المقبسِ فى الاتّصالِ وفى الاستعلامِ وفى حدثِ الخطأ، فلا يموتُ الحارسُ
 * صامتاً ولا يُحسَبُ الانقطاعُ نتيجةَ قياس.
 */
class Client extends PgClient {
  constructor(config) {
    super(config)
    // بلا هذا المستمعِ يقتلُ انقطاعُ المقبسِ العمليةَ بدل أن يُبلِّغ.
    this.on("error", (e) => {
      if (!noteIfDropped(e, this)) console.error(`! pg: ${(e && e.message) || e}`)
    })
  }
  async connect(...args) {
    try { return await super.connect(...args) } catch (e) { noteIfDropped(e, this); throw e }
  }
  query(...args) {
    const out = super.query(...args)
    if (out && typeof out.then === "function") {
      return out.catch((e) => { noteIfDropped(e, this); throw e })
    }
    return out
  }
}

// **وفخٌّ لا يُشغَّل ليس فخّاً**: لا يُعادُ التشغيلُ إلّا إن سقطَ الحارسُ
// **وسقطَ معه المقبس**. خروجٌ ناجحٌ لا يُعاد، وعطبٌ حقيقىٌّ لا يُخفى،
// وإعادةٌ واحدةٌ لا أكثر — **وما زاد يُخفى العطب**.
process.on("exit", (code) => {
  if (code !== 1 || !sawDrop || process.env[RETRY_FLAG]) return
  const { spawnSync } = require("child_process")
  const script = process.argv[1]
  if (!script) return
  console.log("! سقط الاتّصالُ بالقاعدة أثناءَ هذا الحارس — يُعادُ تشغيلُه مرّةً واحدة.")
  const res = spawnSync(process.execPath, [script].concat(process.argv.slice(2)), {
    stdio: "inherit",
    env: Object.assign({}, process.env, { [RETRY_FLAG]: "1" }),
  })
  process.exitCode = typeof res.status === "number" ? res.status : 1
})

module.exports = {
  isConnectionFailure, withLiveDatabase, NET_ERRNO, SQLSTATE_CONNECTION,
  Client, // بديلُ `pg` فى الحراسِ التى لا تُعيدُ القياسَ داخلَ عمليّتِها
}
