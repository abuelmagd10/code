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

let Client
try { ({ Client } = require("pg")) } catch {
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
    const client = new Client({ connectionString: url, ssl })
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

module.exports = { isConnectionFailure, withLiveDatabase, NET_ERRNO, SQLSTATE_CONNECTION }
