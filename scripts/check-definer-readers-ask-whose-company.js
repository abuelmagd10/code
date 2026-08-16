#!/usr/bin/env node
/**
 * check-definer-readers-ask-whose-company.js
 * **وبابٌ يُسأَلُ: هل له قفل؟ لا: هل يطرقُه أحد؟**
 * ---------------------------------------------------------------------------
 *   node scripts/check-definer-readers-ask-whose-company.js [--require-db] [--list] [--selftest]
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس — v3.75.38 ═══
 *
 * سبعُ دفعاتٍ متتاليةٍ كانت تسألُ سؤالاً واحداً عن كلِّ دالّةٍ بصلاحيّاتٍ
 * كاملةٍ مفتوحةٍ للمستخدِمِ المسجَّل: **هل يطرقُ هذا البابَ أحد؟** فإن لم
 * يطرقْه أحدٌ نُزعت منحتُه. وهو سؤالٌ صحيح — لكنّه ليس الوحيد.
 *
 * فقد قِيس على الإنتاج، بدورِ `authenticated` نفسِه، بهُويّةِ عضوٍ فى شركةٍ
 * يطلبُ بياناتِ شركةٍ **ليس عضواً فيها**:
 *
 *     ما تسمحُ حمايةُ الصفوفِ برؤيتِه مباشرةً ...  ٠ حساب · ٠ سطرَ يوميّة
 *     وما سلّمَتْه `get_trial_balance` .........  ميزانُ المراجعةِ كاملاً
 *     و`search_audit_trail` ...................  ٥٠ صفّاً من سجلِّ التدقيق
 *
 * **حمايةُ الصفوفِ صامدة، والدالّةُ تمرُّ من فوقِها** — لأنّها بصلاحيّاتٍ
 * كاملةٍ يملكُها `postgres` فهى معفاةٌ منها، ثمّ **لا تسألُ من المُنادى**.
 *
 * ═══ ولماذا لم يرَه حارسُ الكاتبات ═══
 *
 * `check-exposed-definer-functions.js` شرطُه أن يكونَ فى الجسدِ
 * `INSERT`/`UPDATE`/`DELETE` — **فالقارئاتُ خارجَ ولايتِه**. وهو ليس عطباً
 * فيه: هو يحرسُ ما وُلد ليحرسَه، ويحرسُه جيّداً (الكاتباتُ بلا سؤالٍ = صفر).
 * **لكنّ بابَ القراءةِ بابٌ أيضاً.**
 *
 * ═══ والقياسُ خاصّيّةٌ تُتَتَبَّعُ عبرَ شجرةِ النداء ═══
 *
 * القياسُ الساذجُ يقرأُ جسدَ الدالّةِ وحدَه ويسألُ: أفيه `assert_company_access`؟
 * **وهذا يكذبُ فى الاتّجاهَين:**
 *
 *   • يُبرّئُ البرىءَ خطأً: `auto_post_monthly_depreciation` لا تسألُ بنفسِها،
 *     لكنّها تُفوِّضُ إلى `post_depreciation` **وتلك تسأل**. فهى مقفولة.
 *   • ويُبرّئُ المذنبَ خطأً: وجودُ `auth.uid()` فى الجسدِ لا يعنى سؤالاً —
 *     فى تلك الدالّةِ نفسِها كان `auth.uid()` **ختمَ فاعلٍ** يُوضَعُ على القيد،
 *     لا إذناً يُسأَلُ عنه. **وشكلُ النصِّ ليس خاصّيّة.**
 *
 * فالقياسُ هنا: تُبنى **شجرةُ النداء** بين دوالِّ `public` — الحافّةُ لا تُقبَلُ
 * إلّا إذا كان الاسمُ المذكورُ **دالّةً موجودةً فعلاً فى القاعدة** — ثمّ يُسأَل:
 * هل تصلُ هذه الدالّةُ، بنفسِها أو عبرَ من تُفوِّضُ إليه، إلى بوّابةِ سؤال؟
 *
 * ═══ والبوّابةُ بيتٌ واحدٌ لا يُبنى له ثانٍ ═══
 *
 *   `public.assert_company_access(uuid)` · `public.assert_company_access_by_row(...)`
 *
 * ولا تُؤلَّفُ هنا قاعدةُ «من يملكُ هذه الشركة» — تُقرأُ الأسماءُ من القاعدةِ
 * ويُتحقَّقُ أنّها حيّة. **وبحثٌ لا يجد ليس دليلَ غياب**: إن لم تُوجَدْ بوّابةٌ
 * حيّةٌ فى القاعدةِ رفضَ الحارسُ ولم يمرّ.
 *
 * ═══ ومعدودٌ لا مسكوتٌ عنه ═══
 *
 * الدَّينُ اليومَ مقيسٌ لا مُقدَّر، **ويُثبَّتُ هنا لا فى فحصٍ يجرى على البيتَين**
 * — لأنّ بيتَ الإنتاجِ وبيتَ التجربةِ يختلفانِ فى عددِ الدوالِّ اختلافاً
 * مشروعاً، ورقمٌ واحدٌ يجرى عليهما إمّا أن يكذبَ على أحدِهما وإمّا أن يُسكِتَ
 * نموّاً فى الآخر. **فالشرطُ فى القاعدة، والعدُّ هنا.**
 *
 * ولا يُدَّعى أنّ كلَّ واحدةٍ من هذا العددِ مكشوفة: فيهنّ **بوّاباتُ إذنٍ
 * بأنفسِهنّ** (`can_delete_data` · `check_permission` · `erp_is_company_owner`)
 * وهنّ السؤالُ لا المسؤول. **فهذا عددُ المشتبَهِ بهم لا عددُ المُدانين** —
 * وكلُّ واحدةٍ تُقاسُ بالنداءِ الحىِّ فى الدفعةِ التى تُقفلُها.
 *
 * ═══ وفحصٌ يمكن تخطّيه ليس فحصاً ═══
 *
 * بلا قاعدةٍ حيّةٍ يرفضُ الحارسُ حين يُطلَبُ منه `--require-db`، ويرفضُ دائماً
 * إن وجدَ القاعدةَ بلا دوالَّ أصلاً.
 * ---------------------------------------------------------------------------
 */
"use strict"

// ═══ الفخُّ الذاتىُّ يجرى بلا قاعدة ═══
const SELFTEST = process.argv.includes("--selftest")

/**
 * **الحافّةُ لا تُبنى من نصٍّ بل من اسمٍ يُحَلُّ إلى دالّةٍ موجودة.**
 * @param {{oid:number, prosrc:string}[]} fns
 * @returns {Map<number, Set<number>>}
 */
function buildEdges(fns) {
  const byName = new Map()
  for (const f of fns) {
    if (!byName.has(f.proname)) byName.set(f.proname, [])
    byName.get(f.proname).push(f.oid)
  }
  const edges = new Map()
  const CALL = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g
  for (const f of fns) {
    const out = new Set()
    let m
    CALL.lastIndex = 0
    while ((m = CALL.exec(String(f.prosrc || "")))) {
      const hits = byName.get(m[1])
      if (hits) for (const o of hits) if (o !== f.oid) out.add(o)
    }
    edges.set(f.oid, out)
  }
  return edges
}

/**
 * **الوصولُ لا يقفُ عند الجارِ الأوّل** — من يُفوِّضُ إلى من يسألُ يسأل.
 * @returns {Set<number>} كلُّ دالّةٍ تصلُ إلى بوّابة
 */
function reachesGate(edges, gateOids, maxDepth) {
  const depth = typeof maxDepth === "number" ? maxDepth : 4
  const gates = new Set(gateOids)
  // **والبوّابةُ نفسُها ليست باباً بلا قفل — هى القفل.** فتُبذَرُ فى الوصولِ
  // بعمقِ صفر، وإلّا حُوكِمت بأنّها لا تسألُ نفسَها.
  const reach = new Set(gates)
  let frontier = new Set(gates)
  for (const [caller, callees] of edges) {
    for (const c of callees) if (gates.has(c)) { frontier.add(caller); reach.add(caller); break }
  }
  for (let d = 1; d < depth && frontier.size; d++) {
    const next = new Set()
    for (const [caller, callees] of edges) {
      if (reach.has(caller)) continue
      for (const c of callees) if (frontier.has(c)) { next.add(caller); break }
    }
    for (const f of next) reach.add(f)
    frontier = next
  }
  return reach
}

/** بابٌ محكومٌ هنا: صلاحيّاتٌ كاملة · يبلغُه المستخدِمُ المسجَّل · يأخذُ رقمَ شركة. */
function isJudged(fn) {
  return Boolean(fn.prosecdef) && Boolean(fn.auth_can_call) && /p_company_id\s+uuid/.test(String(fn.args || ""))
}

/** الأبوابُ المحكومةُ التى لا تصلُ إلى بوّابةِ سؤال، مرتَّبةً بالاسم. */
function gatelessDoors(fns, gateOids) {
  const edges = buildEdges(fns)
  const reach = reachesGate(edges, gateOids)
  return fns.filter((f) => isJudged(f) && !reach.has(f.oid)).map((f) => f.sig).sort()
}

// ═══════════════════════════════ الفخُّ الذاتىّ ═══════════════════════════════
if (SELFTEST) {
  let bad = 0
  const t = (label, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) console.log(`  ok  ${label}  (توقّعتُ ${w} فجاء ${g})`)
    else { console.error(`X   ${label}  (توقّعتُ ${w} فجاء ${g})`); bad++ }
  }
  const F = (oid, proname, prosrc, opts) =>
    Object.assign({ oid, proname, prosrc, sig: `${proname}(uuid)`, args: "p_company_id uuid", prosecdef: true, auth_can_call: true }, opts || {})

  const GATE = F(1, "assert_company_access", "BEGIN RETURN; END", { args: "p_company_id uuid" })

  // ── الحافّة: اسمٌ يُحَلُّ إلى دالّةٍ موجودة ──
  {
    const fns = [GATE, F(2, "reader", "PERFORM public.assert_company_access(p_company_id);")]
    t("يرى النداءَ المؤهَّلَ بالمخطَّط", buildEdges(fns).get(2).has(1), true)
  }
  {
    const fns = [GATE, F(2, "reader", "PERFORM assert_company_access(p_company_id);")]
    t("ويراه بلا تأهيل", buildEdges(fns).get(2).has(1), true)
  }
  {
    const fns = [GATE, F(2, "reader", "SELECT assert_company_access_elsewhere(p_company_id);")]
    t("ولا يخدعه اسمٌ بادئتُه نفسُها", buildEdges(fns).get(2).has(1), false)
  }
  {
    const fns = [GATE, F(2, "reader", "-- assert_company_access(p_company_id)\nSELECT 1;")]
    t("ويعدُّ الذكرَ فى تعليقٍ نداءً — ولا يُدَّعى غيرُ ذلك", buildEdges(fns).get(2).has(1), true)
  }
  {
    const fns = [F(2, "reader", "SELECT no_such_function(p_company_id);")]
    t("ولا يبنى حافّةً إلى اسمٍ لا دالّةَ له — والاسمُ يُحَلُّ لا يُصدَّق", buildEdges(fns).get(2).size, 0)
  }
  {
    const fns = [F(2, "selfie", "SELECT selfie(p_company_id);")]
    t("ولا يعدُّ الدالّةَ منادِيةً نفسَها حافّة", buildEdges(fns).get(2).size, 0)
  }

  // ── الوصولُ عبرَ التفويض ──
  {
    const fns = [GATE, F(2, "delegate", "PERFORM public.assert_company_access(p_company_id);"),
                 F(3, "reader", "SELECT delegate(p_company_id);")]
    t("ويصلُ عبرَ وسيطٍ واحد — ومن يُفوِّضُ إلى من يسألُ يسأل", gatelessDoors(fns, [1]), [])
  }
  {
    const fns = [GATE, F(2, "a", "PERFORM public.assert_company_access(p_company_id);"),
                 F(3, "b", "SELECT a(p_company_id);"), F(4, "c", "SELECT b(p_company_id);")]
    t("ويصلُ عبرَ وسيطَين", gatelessDoors(fns, [1]), [])
  }
  {
    const fns = [F(2, "lonely", "SELECT 1;")]
    t("ويسقطُ بابٌ لا يصلُ إلى بوّابةٍ أبداً", gatelessDoors(fns, []), ["lonely(uuid)"])
  }
  {
    const fns = [GATE, F(2, "far1", "SELECT far2(p_company_id);"), F(3, "far2", "SELECT far3(p_company_id);"),
                 F(4, "far3", "SELECT far4(p_company_id);"), F(5, "far4", "SELECT far5(p_company_id);"),
                 F(6, "far5", "PERFORM public.assert_company_access(p_company_id);")]
    t("ويقفُ عند سقفِ العمقِ فلا يدورُ بلا نهاية", gatelessDoors(fns, [1]).includes("far1(uuid)"), true)
  }
  {
    const fns = [GATE, F(2, "loop_a", "SELECT loop_b(p_company_id);"), F(3, "loop_b", "SELECT loop_a(p_company_id);")]
    t("ولا تُوقِفُه حلقةٌ مغلقة", gatelessDoors(fns, [1]), ["loop_a(uuid)", "loop_b(uuid)"])
  }

  // ── من يُحاكَم ومن لا يُحاكَم ──
  {
    t("يحاكمُ دالّةَ صلاحيّاتٍ كاملةٍ تأخذُ رقمَ شركةٍ ويبلغُها المستخدِم",
      isJudged(F(2, "x", "")), true)
  }
  {
    t("ولا يحاكمُ دالّةً بصلاحيّاتِ مُنادِيها — فحمايةُ الصفوفِ تحرسُها",
      isJudged(F(2, "x", "", { prosecdef: false })), false)
  }
  {
    t("ولا يحاكمُ ما لا يبلغُه المستخدِمُ المسجَّل",
      isJudged(F(2, "x", "", { auth_can_call: false })), false)
  }
  {
    t("ولا يحاكمُ ما لا يأخذُ رقمَ شركةٍ أصلاً",
      isJudged(F(2, "x", "", { args: "p_invoice_id uuid" })), false)
  }
  {
    t("ولا يخدعه اسمُ وسيطٍ بادئتُه نفسُها",
      isJudged(F(2, "x", "", { args: "p_company_ids uuid[]" })), false)
  }

  // ── العطبُ الذى وُلد منه هذا الحارس ──
  {
    const fns = [GATE,
      F(2, "post_depreciation", "PERFORM public.assert_company_access_by_row('t', p_id);", { args: "p_id uuid" }),
      F(9, "assert_company_access_by_row", "PERFORM public.assert_company_access(v);", { args: "p_table text, p_row_id uuid" }),
      F(3, "auto_post_monthly_depreciation", "SELECT post_depreciation(v.id, COALESCE(p_user_id, auth.uid()));")]
    t("فتُبرَّأُ دالّةٌ تُفوِّضُ إلى من يسأل — وهو العطبُ الأوّلُ فى القياسِ القديم",
      gatelessDoors(fns, [1, 9]), [])
  }
  {
    const fns = [F(2, "stamper", "INSERT INTO t(actor) VALUES (auth.uid());")]
    t("ولا تُبرَّأُ دالّةٌ فيها auth.uid() ختمَ فاعلٍ لا سؤالَ إذن — وهو العطبُ الثانى",
      gatelessDoors(fns, []), ["stamper(uuid)"])
  }
  {
    const fns = [F(2, "mentioner", "-- company_members: see the note\nSELECT 1;")]
    t("ولا تُبرَّأُ دالّةٌ تذكرُ company_members ذِكراً — والذِّكرُ ليس سؤالاً",
      gatelessDoors(fns, []), ["mentioner(uuid)"])
  }
  {
    const fns = [GATE, F(2, "a_door", "SELECT 1;"), F(3, "b_door", "SELECT 1;")]
    t("ويُسمّى كلَّ بابٍ بلا قفلٍ مرتَّبين", gatelessDoors(fns, [1]), ["a_door(uuid)", "b_door(uuid)"])
  }

  console.log(`  الفخُّ الذاتىّ: ${20} اتّجاهاً، ${bad === 0 ? "كلُّها صحيحة" : `منها ${bad} سقط`}.`)
  process.exit(bad === 0 ? 0 : 1)
}

// ═══════════════════════════════ القياسُ الحىّ ═══════════════════════════════
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

/**
 * الدَّينُ المقيسُ على الإنتاج — لا يزيد.
 * v3.75.38: 142 · v3.75.39: 139 (ثلاثُ قارئاتٍ بلا قفلٍ أُزيلت مع مسارِها البديل).
 * v3.75.40: 122 — أربعةَ عشرَ باباً قُفلت بنداءٍ حىٍّ مُلغى، فوصلَ سبعةَ عشرَ
 *            إلى بوّابةِ سؤالٍ (أربعةَ عشرَ بنفسِها وثلاثةٌ عبرَ من تُفوِّضُ إليه).
 */
const PINNED = 122

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

if (!url) {
  const msg = "لا عنوانَ قاعدةٍ — لا يمكن قياسُ الأقفال."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} يُتخطّى (مرِّرْ --require-db ليصيرَ مانعاً).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("./lib/live-db")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const SQL_FUNCTIONS = `
  SELECT p.oid::int AS oid,
         p.proname,
         replace(p.oid::regprocedure::text, 'public.', '') AS sig,
         pg_get_function_arguments(p.oid) AS args,
         p.prosecdef,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_call,
         p.prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
`

const SQL_GATES = `
  SELECT p.oid::int AS oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('assert_company_access', 'assert_company_access_by_row')
`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const fns = (await client.query(SQL_FUNCTIONS)).rows
    const gates = (await client.query(SQL_GATES)).rows.map((r) => r.oid)

    // **وبحثٌ لا يجد ليس دليلَ غياب.**
    if (fns.length === 0) {
      console.error("X القاعدةُ بلا دوالَّ فى public — هذا ليس براءةً بل قياسٌ فاشل.")
      process.exit(1)
    }
    if (gates.length === 0) {
      console.error("X لا بوّابةَ سؤالٍ حيّةٌ فى القاعدة (assert_company_access) — والحكمُ بلا بوّابةٍ طمأنينةٌ كاذبة.")
      process.exit(1)
    }

    const judged = fns.filter(isJudged)
    const gateless = gatelessDoors(fns, gates)

    console.log(
      `  دوالُّ صلاحيّاتٍ كاملةٍ تأخذُ رقمَ شركةٍ ويبلغُها المستخدِمُ المسجَّل: ${judged.length}` +
      `   ·   بوّاباتُ السؤالِ الحيّة: ${gates.length}   ·   دوالُّ public: ${fns.length}`
    )
    console.log(`  تصلُ إلى بوّابةِ سؤال: ${judged.length - gateless.length}   ·   **بلا قفل**: ${gateless.length}   (المُثبَّت ${PINNED})`)

    if (gateless.length > PINNED) {
      console.error(`X بلا قفلٍ ${gateless.length} وقد ثُبِّتَ عند ${PINNED} — ودَينٌ يُكتَبُ ولا يُسدَّدُ يصيرُ عادة.`)
      const known = new Set()
      for (const s of gateless.slice(0, 40)) if (!known.has(s)) { known.add(s); console.error(`      - ${s}`) }
      process.exit(1)
    }
    if (gateless.length < PINNED) {
      console.error(
        `X بلا قفلٍ ${gateless.length} والمُثبَّتُ ${PINNED} — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.\n` +
        `      أنزِلِ الرقمَ فى الدفعةِ التى كسبَتْه: const PINNED = ${gateless.length}`
      )
      process.exit(1)
    }

    if (verbose) for (const s of gateless) console.log(`      - ${s}`)

    console.log(
      "+ لا بابَ قراءةٍ بصلاحيّاتٍ كاملةٍ يبلغُه المستخدِمُ المسجَّل بلا قفلٍ فوقَ الدَّينِ المُثبَّت " +
      `(${gateless.length} بلا قفل، مُثبَّتٌ عند ${PINNED}؛ القفلُ هو الوصولُ إلى assert_company_access ` +
      "بنفسِها أو عبرَ من تُفوِّضُ إليه — لا ذِكرُها فى النصّ)."
    )
    console.log(
      "  ! ومنهنّ بوّاباتُ إذنٍ بأنفسِهنّ — **فهذا عددُ المشتبَهِ بهم لا عددُ المُدانين**، " +
      "وكلُّ واحدةٍ تُقاسُ بالنداءِ الحىِّ فى الدفعةِ التى تُقفلُها."
    )
  } finally {
    await client.end()
  }
})().catch((e) => {
  console.error("X " + (e && e.message ? e.message : String(e)))
  process.exit(1)
})
