// =====================================================
// فحص جميع الفواتير في شركة "تست"
// Check All Invoices in Test Company
// =====================================================

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// قراءة .env.local
try {
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
} catch (e) {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ خطأ: SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// معرف شركة "تست"
const TEST_COMPANY_ID = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'

async function main() {
  console.log('🔍 فحص جميع الفواتير في شركة "تست"...\n')

  try {
    // 1. التحقق من وجود الشركة
    console.log('1️⃣ التحقق من وجود الشركة...')
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, name')
      .eq('id', TEST_COMPANY_ID)
      .single()

    if (companyErr) throw companyErr

    if (!company) {
      console.error('   ❌ الشركة غير موجودة!')
      return
    }

    console.log(`   ✅ الشركة موجودة: ${company.name}\n`)

    // 2. جلب جميع الفواتير بجميع الحالات
    console.log('2️⃣ جلب جميع الفواتير (جميع الحالات)...')
    const { data: allInvoices, error: invoicesErr } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        invoice_date,
        status,
        shipping_provider_id,
        shipping_providers(provider_name)
      `)
      .eq('company_id', TEST_COMPANY_ID)
      .order('invoice_date', { ascending: false })

    if (invoicesErr) throw invoicesErr

    console.log(`   ✅ تم العثور على ${allInvoices?.length || 0} فاتورة\n`)

    if (!allInvoices || allInvoices.length === 0) {
      console.log('   ⚠️  لا توجد فواتير على الإطلاق في شركة "تست"')
      console.log('   💡 يجب إنشاء فاتورة تجريبية للاختبار')
      return
    }

    // 3. تجميع الفواتير حسب الحالة
    const invoicesByStatus = {}
    allInvoices.forEach((inv) => {
      const status = inv.status || 'unknown'
      if (!invoicesByStatus[status]) {
        invoicesByStatus[status] = []
      }
      invoicesByStatus[status].push(inv)
    })

    console.log('3️⃣ الفواتير حسب الحالة:')
    Object.keys(invoicesByStatus).forEach((status) => {
      const invoices = invoicesByStatus[status]
      console.log(`   ${status}: ${invoices.length} فاتورة`)
      invoices.forEach((inv) => {
        const hasProvider = !!inv.shipping_provider_id
        const providerName = inv.shipping_providers?.provider_name || 'بدون شركة شحن'
        console.log(`      - ${inv.invoice_number} (${inv.invoice_date}) ${hasProvider ? '✅' : '❌'} ${providerName}`)
      })
    })
    console.log('')

    // 4. جلب سجلات third_party_inventory
    console.log('4️⃣ جلب سجلات third_party_inventory...')
    const { data: thirdPartyData, error: thirdPartyErr } = await supabase
      .from('third_party_inventory')
      .select('invoice_id, product_id, quantity, status')
      .eq('company_id', TEST_COMPANY_ID)

    if (thirdPartyErr) throw thirdPartyErr

    console.log(`   ✅ تم العثور على ${thirdPartyData?.length || 0} سجل`)
    if (thirdPartyData && thirdPartyData.length > 0) {
      const uniqueInvoices = new Set(thirdPartyData.map((tpi) => tpi.invoice_id))
      console.log(`   📋 مرتبط بـ ${uniqueInvoices.size} فاتورة مختلفة`)
    }
    console.log('')

    // 5. ملخص
    console.log('📊 الملخص:')
    console.log(`   - إجمالي الفواتير: ${allInvoices.length}`)
    console.log(`   - الفواتير المرسلة (Sent/Confirmed): ${(invoicesByStatus['sent'] || []).length + (invoicesByStatus['confirmed'] || []).length}`)
    console.log(`   - الفواتير مع شركات الشحن: ${allInvoices.filter((inv) => !!inv.shipping_provider_id).length}`)
    console.log(`   - سجلات third_party_inventory: ${thirdPartyData?.length || 0}`)

  } catch (err) {
    console.error('❌ خطأ عام:', err)
    process.exit(1)
  }
}

main()

