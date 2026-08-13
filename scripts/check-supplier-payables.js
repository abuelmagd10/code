/**
 * check-supplier-payables.js — ذممُ الموردينَ كما يقولُها الدفتر
 * ---------------------------------------------------------------------------
 * v3.75.23 — **وفمٌ يقولُ رقماً بعدَ أن قِيلَ غيرُه خطرٌ صامت.**
 *
 * كان هذا الملفُّ يطبعُ «إجمالي الذمم الدائنة» ويخالفُ الشاشةَ والدفترَ معاً،
 * ويُقرأُ على أنّه الحقيقةُ لأنّه يُطبَعُ فى كلِّ دفعة. وخالفَهما فى موضعَين:
 *
 *   ١) **قائمةُ حالاتٍ كتبها بيدِه** — `(draft,cancelled,voided,fully_returned)`
 *      — وهى تهجئةٌ خامسةٌ لا تذكرُ `rejected`، فكانت تعدُّ فاتورةً رُفضتْ
 *      بضاعتُها عند الاستلامِ **ولا قيدَ لها فى الأستاذ**. فطبعَ ٩٩٦٫١٠ فى
 *      الدفعةِ نفسِها التى صحّحت الشاشةَ إلى ٩٨٦٫١٠.
 *
 *   ٢) **حسابٌ يتجاهلُ المرتجع** — `total_amount - paid_amount` بلا طرحِ
 *      `returned_amount`. وحكمَ الدفترُ بينهما: حسابُ الشاشةِ يُطابقُ حسابَ
 *      الموردينَ ٢١١٠ **إلى صفرٍ بالضبط** (٩٨٦٫١٠ − ٦٫٢٢ إشعاراتٍ دائنةً غيرَ
 *      مطبَّقة = ٩٧٩٫٨٨ = رصيدُ الحساب)، وحسابُ هذا الملفِّ يُخطئُ بـ**١٫٩١**.
 *
 * فصارَ يسألُ **القانونَ الواحد** فى القاعدةِ عن الحالات (`bill_payable_statuses`)
 * ويحسبُ كما يحسبُ الدفتر. **ولا اسمَ بلا بيت.**
 *
 * **وإن تعذّرَ سؤالُ القانونِ لم يُخمِّنْ ولم يطبعْ إجمالاً**: قائمةٌ مكتوبةٌ
 * بيدٍ احتياطاً هى بعينُها الداءُ الذى نُزع. **ورقمٌ كاذبٌ أسوأُ من لا رقم.**
 *
 * Usage: node scripts/check-supplier-payables.js
 * ---------------------------------------------------------------------------
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// تحميل المتغيرات البيئية من .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * المتبقّى على فاتورةٍ واحدة — **بحسابِ الدفترِ لا بحسابٍ خاصٍّ بهذا الملفّ**.
 * وهو الحسابُ نفسُه الذى تستعملُه `get_suppliers_overview` على الشاشة:
 * المرتجعُ يُطرَحُ من الإجمالىِّ أوّلاً، ثمّ المدفوع، ولا ينزلُ عن الصفر.
 */
function billRemaining(bill) {
  const total = Number(bill.total_amount || 0)
  const paid = Number(bill.paid_amount || 0)
  const returned = Number(bill.returned_amount || 0)
  return Math.max(Math.max(total - returned, 0) - paid, 0)
}

async function checkSupplierPayables() {
  console.log('🔍 فحص ذمم الموردين في شركة "تست"...\n')

  // ── القانونُ الواحد: أىُّ حالةِ فاتورةٍ عبرتْ حدَّ الأستاذ فصارت مالاً؟ ──
  // يُسألُ من القاعدةِ ولا يُكتَبُ هنا. **ولا نسخةَ ثانيةً تنحرفُ يوماً.**
  const { data: payableStatuses, error: lawError } = await supabase.rpc('bill_payable_statuses')

  if (lawError || !Array.isArray(payableStatuses) || payableStatuses.length === 0) {
    console.error('❌ تعذّر سؤال القانون الواحد `bill_payable_statuses` في القاعدة.')
    console.error(`   السبب: ${lawError ? lawError.message : 'ردٌّ فارغ'}`)
    console.error('   ولن أُخمّن قائمةً بيدي — رقمٌ كاذب أسوأ من لا رقم.')
    return
  }

  console.log(`⚖️  القانون الواحد (من القاعدة): ${payableStatuses.join(', ')}\n`)

  // جلب ID شركة "تست"
  const { data: companies, error: companyError } = await supabase
    .from('companies')
    .select('id, name')
    .eq('name', 'تست')
    .limit(1)

  if (companyError || !companies || companies.length === 0) {
    console.error('❌ لم يتم العثور على شركة "تست"')
    return
  }

  const companyId = companies[0].id
  console.log(`✅ تم العثور على شركة "تست": ${companyId}\n`)

  // جلب جميع الموردين
  const { data: suppliers, error: suppliersError } = await supabase
    .from('suppliers')
    .select('id, name, phone')
    .eq('company_id', companyId)

  if (suppliersError) {
    console.error('❌ خطأ في جلب الموردين:', suppliersError)
    return
  }

  if (!suppliers || suppliers.length === 0) {
    console.log('✅ لا توجد موردين')
    return
  }

  console.log(`📋 تم العثور على ${suppliers.length} مورد:\n`)

  for (const supplier of suppliers) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🏢 المورد: ${supplier.name} (${supplier.id})`)
    console.log('='.repeat(60))

    // **الحالاتُ تأتى من القانون، لا من قائمةٍ هنا.**
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_number, bill_date, total_amount, paid_amount, returned_amount, status, return_status')
      .eq('company_id', companyId)
      .eq('supplier_id', supplier.id)
      .in('status', payableStatuses)

    if (billsError) {
      console.error(`   ❌ خطأ في جلب الفواتير: ${billsError.message}`)
      continue
    }

    if (!bills || bills.length === 0) {
      console.log('   ✅ لا توجد فواتير عبرت حدّ الأستاذ')
      continue
    }

    console.log(`\n   📄 عدد الفواتير: ${bills.length}\n`)

    let totalPayables = 0

    for (const bill of bills) {
      const totalAmount = Number(bill.total_amount || 0)
      const paidAmount = Number(bill.paid_amount || 0)
      const returnedAmount = Number(bill.returned_amount || 0)
      const remaining = billRemaining(bill)

      console.log(`   📋 ${bill.bill_number}:`)
      console.log(`      الإجمالي (total_amount): ${totalAmount.toFixed(2)}`)
      console.log(`      المرتجع (returned_amount): ${returnedAmount.toFixed(2)}`)
      console.log(`      المدفوع (paid_amount): ${paidAmount.toFixed(2)}`)
      console.log(`      المتبقي بحساب الدفتر: ${remaining.toFixed(2)}`)
      console.log(`      الحالة: ${bill.status}`)
      console.log(`      حالة المرتجع: ${bill.return_status || 'لا يوجد'}`)

      totalPayables += remaining
    }

    console.log(`\n   💰 إجمالي الذمم الدائنة: ${totalPayables.toFixed(2)}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ اكتمل الفحص — والرقم هو الرقم الذي تقوله الشاشة والدفتر.')
  console.log('='.repeat(60))
}

// تشغيل السكربت
checkSupplierPayables()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ فشل الفحص:', error)
    process.exit(1)
  })
