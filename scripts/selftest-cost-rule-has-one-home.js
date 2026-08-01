#!/usr/bin/env node
/**
 * selftest-cost-rule-has-one-home.js
 * ---------------------------------------------------------------------------
 * v3.74.934 — يُرى الحارس وهو يرفض عودةَ الحكم المكرَّر، وهو يُبقى البرىء.
 *
 * الشكلُ الذى يحرسه **يبدو سليماً سطراً سطراً**: `setCanViewCOGS(isUpperRole)`
 * سطرٌ مفهوم، و`can_view_purchase_cost` دالةٌ صحيحة. والعطبُ فى وجودهما
 * معاً — حكمان لشىءٍ واحد. فلا سبيل لبرهنة الحارس إلا **بزرع الشكل ثم
 * النظر: أيرفض أم يمرّ؟**
 *
 * ويعمل على شجرةٍ مؤقتةٍ فى مجلدٍ مستقل، فلا يلمس ملفات المشروع أصلاً:
 *   (أ) رايةُ تكلفةٍ تُسند من `isUpperRole`      ⇒ يُرفض ويُسمَّى الملفُ والسطر.
 *   (ب) رايةٌ تُسند من نداء القاعدة (معكوس)      ⇒ يصمت.
 *   (ج) `isUpperRole` فى قرارٍ لا علاقة له بالتكلفة (معكوس) ⇒ يصمت — فالحارسُ
 *       الذى يرفض البرىء يُعطَّل بعد أسبوع.
 *   (د) صفحةُ المنتجات بلا نداءٍ للقاعدة          ⇒ يُرفض.
 *   (هـ) وصفحةُ المشروع الحقيقية                   ⇒ يصمت.
 *
 * Usage: node scripts/selftest-cost-rule-has-one-home.js
 * ---------------------------------------------------------------------------
 */

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const GUARD = "scripts/check-cost-rule-has-one-home.js"

function runGuard(root) {
  const r = spawnSync(process.execPath, [GUARD], {
    encoding: "utf8",
    env: { ...process.env, COST_RULE_SCAN_ROOT: root },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

/** شجرةٌ صغيرةٌ فيها ملفٌ واحد، تُبنى وتُهدم فى مجلدٍ مؤقت. */
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cost-rule-"))
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, body)
  }
  return root
}

const ASKS_THE_RULE = `
  const { data: mayViewCost } = await supabase.rpc("can_view_purchase_cost", {
    p_company_id: companyId, p_created_by: null,
    p_product_branch_id: branchId || null, p_scope_by_branch: true,
  })
  setCanViewCOGS(mayViewCost === true)
`

let ok = true
const stage = (title, files, mustFail, needle) => {
  if (!ok) return
  const root = tree(files)
  const r = runGuard(root)
  fs.rmSync(root, { recursive: true, force: true })
  if (mustFail) {
    if (!r.failed || (needle && !r.output.includes(needle))) {
      console.error(`X ${title}: the guard did NOT refuse${needle ? ` (looked for "${needle}")` : ""}.`)
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
      return
    }
  } else if (r.failed) {
    console.error(`X ${title}: the guard refused something innocent - it would be switched off in a week.`)
    console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
    ok = false
    return
  }
  console.log(`+ ${title}: ${mustFail ? "رُفض كما يجب" : "لم يُبلَّغ عنه كما يجب"}`)
}

// (أ) الشكلُ الذى وقع فعلاً
stage("a cost flag decided by a role list", {
  "app/products/page.tsx": `"use client"\n${ASKS_THE_RULE}\n`,
  "app/somewhere/page.tsx": `  setCanViewCOGS(isUpperRole)\n`,
}, true, "role list")

// (ب) الشكلُ الصحيح
stage("a cost flag decided by the rule itself", {
  "app/products/page.tsx": `"use client"\n${ASKS_THE_RULE}\n`,
}, false)

// (ج) البرىء: قائمةُ أدوارٍ فى قرارٍ لا شأن له بالتكلفة
stage("a role list used for something that is not the cost", {
  "app/products/page.tsx": `"use client"\n${ASKS_THE_RULE}\n`,
  "app/other/page.tsx": `  setCanDeleteBranch(isUpperRole)\n  const canSeeAdminTab = UPPER_ROLES.includes(role)\n`,
}, false)

// (د) الشاشةُ التى تُدخل التكلفة ولا تسأل القاعدة
stage("the product screen that never asks the rule", {
  "app/products/page.tsx": `"use client"\n  const canViewCOGS = true\n`,
}, true, "never calls can_view_purchase_cost")

// (هـ) وشجرةُ المشروع نفسها
if (ok) {
  const r = runGuard(process.cwd())
  if (r.failed) {
    console.error("X the guard refuses the project as it stands - it would block every push.")
    console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
    ok = false
  } else {
    console.log("+ شجرةُ المشروع كما هى: لم يُبلَّغ عنها كما يجب")
  }
}

if (!ok) process.exit(1)
console.log("+ the one-home guard is proven refusing a role-list decision and a screen that never")
console.log("  asks, while sparing an unrelated role list and the project tree as it stands.")
