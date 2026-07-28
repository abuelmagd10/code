/**
 * lib-reachability.js
 * ---------------------------------------------------------------------------
 * v3.74.869 — **بعد خطأَى وصولٍ متتاليين، أداةٌ بدل الحدس.**
 *
 * أخطأتُ مرّتين فى يومين فى السؤال نفسه — «هل هذا الكود موصول؟»:
 *
 *   ٨٦٥: قلتُ إن `purchase-returns-vendor-credits` بلا مستدعٍ.
 *        وكان بحثى `--include=*.ts` ومستدعياه صفحتان **`.tsx`**.
 *   ٨٦٨: قلتُ إن `sales-returns.ts` كودٌ ميت.
 *        ونصفه **حىٌّ** عبر `await import('./sales-returns')` — استيرادٌ
 *        **ديناميكىٌّ نسبى** لا يلتقطه بحثٌ عن `@/lib/...`.
 *
 * والخطآن فى اتجاهٍ واحد: **كلاهما وصف الحىَّ ميتاً**، أى هوَّن من الأثر.
 * ومن يخطئ مرّتين بأداةٍ يدوية فالعيب فى الأداة لا فى الانتباه.
 *
 * ما تفعله هذه الوحدة
 * -------------------
 * تبنى رسم الاستيراد الحقيقى للمشروع من نقاط الدخول (كل `page.tsx`
 * و`route.ts` و`layout.tsx` و`middleware.ts`)، وتتبع:
 *
 *   • `import x from "@/lib/y"`            (مسار مُستعار)
 *   • `import x from "./y"` و`"../y"`      (نسبى)
 *   • `await import("...")` و`import(...)` (ديناميكى — عطبُ ٨٦٨)
 *   • `export … from "…"`                  (إعادة تصدير)
 *   • الامتدادات `.ts` و`.tsx` و`/index.ts` (عطبُ ٨٦٥)
 *
 * ولا تدّعى أكثر مما تقيس: هى **رسمُ وحدات لا رسمُ دوال**. فملفٌّ يُعدّ
 * موصولاً إن استُورد، ولو كان التصدير المعنىّ فيه غير مُستدعىً. ⇒ فنتيجتها
 * **متحفِّظة فى الاتجاه الآمن**: قد تصف الميتَ حياً، ولا تصف الحىَّ ميتاً.
 * وهذا هو الاتجاه الذى يجب أن يخطئ فيه قياسُ أثرٍ أمنى أو مالى.
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")

const CODE_RE = /\.(ts|tsx)$/

/** كل ملفات الشيفرة تحت الجذور المعطاة. */
function collect(root, dirs) {
  const out = []
  const seen = new Set()
  const walk = (d) => {
    if (!fs.existsSync(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue
        walk(p)
        continue
      }
      if (!CODE_RE.test(e.name)) continue
      if (seen.has(p)) continue
      seen.add(p)
      out.push(p)
    }
  }
  for (const d of dirs) walk(path.join(root, d))
  return out
}

/**
 * يحوّل مواصفة استيراد إلى مسارٍ حقيقى على القرص.
 * يجرّب الامتدادات و`/index` — وإغفال `.tsx` هو ما أوقعنى فى ٨٦٥.
 */
function resolveSpec(root, fromFile, spec) {
  let base
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2))
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec)
  else return null // حزمة خارجية

  const candidates = [
    base + ".ts",
    base + ".tsx",
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    base,
  ]
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c } catch { /* next */ }
  }
  return null
}

/** كل مواصفات الاستيراد فى ملف — الساكن والديناميكى وإعادة التصدير. */
function specsOf(src) {
  const specs = []
  const patterns = [
    /\bimport\s+[^"'`;]*?from\s*["'`]([^"'`]+)["'`]/g,   // import x from "y"
    /\bimport\s*["'`]([^"'`]+)["'`]/g,                    // import "y"
    /\bexport\s+[^"'`;]*?from\s*["'`]([^"'`]+)["'`]/g,    // export … from "y"
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,          // import("y")  ← عطب ٨٦٨
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ]
  for (const re of patterns) for (const m of src.matchAll(re)) specs.push(m[1])
  return specs
}

/** نقاط الدخول: ما يصله المستخدم أو الخادم مباشرةً. */
function entryPoints(files, root) {
  return files.filter((f) => {
    const rel = path.relative(root, f).replace(/\\/g, "/")
    if (!rel.startsWith("app/")) return false
    const base = path.basename(f)
    return (
      base === "page.tsx" || base === "page.ts" ||
      base === "route.ts" || base === "route.tsx" ||
      base === "layout.tsx" || base === "template.tsx" ||
      base === "middleware.ts" || base === "error.tsx" || base === "loading.tsx"
    )
  })
}

/**
 * @returns {{ reachable: Set<string>, all: string[], entries: string[] }}
 *          مساراتٌ مطلقة.
 */
function analyse(root, dirs = ["app", "lib"]) {
  const all = collect(root, dirs)
  const srcOf = new Map()
  for (const f of all) srcOf.set(f, fs.readFileSync(f, "utf8"))

  const entries = entryPoints(all, root)
  const mw = path.join(root, "middleware.ts")
  if (fs.existsSync(mw)) { entries.push(mw); srcOf.set(mw, fs.readFileSync(mw, "utf8")) }

  const reachable = new Set()
  const stack = [...entries]
  while (stack.length) {
    const f = stack.pop()
    if (reachable.has(f)) continue
    reachable.add(f)
    const src = srcOf.get(f) ?? (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "")
    for (const spec of specsOf(src)) {
      const target = resolveSpec(root, f, spec)
      if (target && !reachable.has(target)) stack.push(target)
    }
  }

  // v3.74.869 — يُعاد `sources` كى لا يقرأ المستدعى الملفات مرّةً ثانية.
  // القياس: التحليل كلّه ٠.٧ ثانية معالجة و٢٣ ثانية انتظار قرص — فالقراءة
  // المكرّرة تُضاعف الجزء الغالب من التكلفة، لا الجزء الهيّن.
  return { reachable, all, entries, sources: srcOf }
}

module.exports = { analyse, collect, resolveSpec, specsOf, entryPoints }
