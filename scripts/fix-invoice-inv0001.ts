/**
 * Script لتصحيح فاتورة INV-0001
 * 
 * الاستخدام:
 * npx tsx scripts/fix-invoice-inv0001.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ يرجى تعيين NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixInvoice() {
  try {
    console.log('🔍 البحث عن الفاتورة INV-0001...')
    
    // البحث عن الفاتورة
    const { data: invoices, error: invoiceErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('invoice_number', 'INV-0001')
      .limit(1)

    if (invoiceErr || !invoices || invoices.length === 0) {
      console.error('❌ الفاتورة INV-0001 غير موجودة')
      return
    }

    const invoice = invoices[0]
    console.log(`✅ تم العثور على الفاتورة: ${invoice.id}`)
    console.log(`   الحالة: ${invoice.status}`)
    console.log(`   المبلغ المرتجع: ${invoice.returned_amount || 0}`)

    if (invoice.status !== 'sent') {
      console.error(`❌ الفاتورة ليست في حالة 'sent'. الحالة الحالية: ${invoice.status}`)
      return
    }

    // استدعاء API endpoint
    console.log('\n📞 استدعاء API endpoint للتصحيح...')
    
    // ملاحظة: هذا يتطلب تشغيل الخادم أولاً
    console.log('⚠️  يرجى فتح الصفحة /fix-invoice-inv0001 في المتصفح')
    console.log('   أو استخدم curl:')
    console.log(`   curl -X POST http://localhost:3000/api/fix-invoice-return-sent \\`)
    console.log(`     -H "Content-Type: application/json" \\`)
    console.log(`     -d '{"invoice_number": "INV-0001", "company_id": "${invoice.company_id}"}'`)

  } catch (error: any) {
    console.error('❌ خطأ:', error.message)
  }
}

fixInvoice()

