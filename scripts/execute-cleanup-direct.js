// scripts/execute-cleanup-direct.js
// تنفيذ مباشر لسكريبت التنظيف الشامل عبر Supabase REST API

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// قراءة .env.local إذا كان موجوداً
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
} catch (e) {
  // تجاهل الأخطاء
}

// قراءة متغيرات البيئة
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ خطأ: متغيرات البيئة غير موجودة')
  console.error('يجب تعيين: NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY')
  console.error('تأكد من وجود .env.local في المجلد الجذر')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function executeSQL(sql) {
  // استخدام Supabase REST API مباشرة
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ sql_query: sql })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  return await response.json()
}

async function executeCleanup() {
  try {
    console.log('🚀 بدء تنفيذ سكريبت التنظيف الشامل لشركة "تست"...\n')

    // قراءة السكريبت SQL
    const sqlPath = path.join(__dirname, 'cleanup-test-company-complete.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('📝 تم قراءة السكريبت SQL\n')

    // تنفيذ SQL مباشرة
    try {
      const result = await executeSQL(sql)
      console.log('✅ تم تنفيذ السكريبت بنجاح!')
      if (result) {
        console.log('📊 النتائج:', JSON.stringify(result, null, 2))
      }
    } catch (sqlError) {
      // إذا فشل exec_sql، نستخدم طريقة بديلة: تنفيذ الأوامر بشكل منفصل
      console.log('⚠️  فشل التنفيذ المباشر، جرب طريقة بديلة...\n')
      
      // العثور على شركة "تست"
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .or('name.ilike.تست,name.ilike.%تست%')
        .limit(1)
        .single()

      if (companyError || !companyData) {
        throw new Error('لم يتم العثور على شركة "تست"')
      }

      const companyId = companyData.id
      console.log(`✅ تم العثور على شركة "تست" - ID: ${companyId}\n`)

      // تعطيل Trigger
      console.log('⏳ تعطيل Trigger...')
      await supabase.rpc('exec_sql', { 
        sql_query: 'ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;' 
      }).catch(() => {})

      // حذف سطور القيود
      console.log('⏳ حذف سطور القيود...')
      const { count: linesCount } = await supabase
        .from('journal_entry_lines')
        .select('*', { count: 'exact', head: true })
        .in('journal_entry_id', 
          supabase.from('journal_entries')
            .select('id')
            .eq('company_id', companyId)
            .in('reference_type', [
              'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
              'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
              'sales_return', 'purchase_return'
            ])
        )

      // حذف القيود
      console.log('⏳ حذف القيود...')
      const { error: journalError } = await supabase
        .from('journal_entries')
        .delete()
        .eq('company_id', companyId)
        .in('reference_type', [
          'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
          'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
          'sales_return', 'purchase_return'
        ])

      if (journalError) {
        console.warn('⚠️  تحذير في حذف القيود:', journalError.message)
      }

      // إعادة تفعيل Trigger
      console.log('⏳ إعادة تفعيل Trigger...')
      await supabase.rpc('exec_sql', { 
        sql_query: 'ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;' 
      }).catch(() => {})

      // حذف المدفوعات
      console.log('⏳ حذف المدفوعات...')
      const { error: paymentError } = await supabase
        .from('payments')
        .delete()
        .eq('company_id', companyId)

      // حذف حركات المخزون
      console.log('⏳ حذف حركات المخزون...')
      const { error: inventoryError } = await supabase
        .from('inventory_transactions')
        .delete()
        .eq('company_id', companyId)

      // حذف المرتجعات
      console.log('⏳ حذف المرتجعات...')
      await supabase.from('sales_returns').delete().eq('company_id', companyId)
      await supabase.from('purchase_returns').delete().eq('company_id', companyId)
      await supabase.from('vendor_credits').delete().eq('company_id', companyId)

      // حذف سطور الفواتير
      console.log('⏳ حذف سطور الفواتير...')
      const invoiceIds = await supabase.from('invoices').select('id').eq('company_id', companyId)
      if (invoiceIds.data) {
        await supabase.from('invoice_items').delete().in('invoice_id', invoiceIds.data.map(i => i.id))
      }

      const billIds = await supabase.from('bills').select('id').eq('company_id', companyId)
      if (billIds.data) {
        await supabase.from('bill_items').delete().in('bill_id', billIds.data.map(b => b.id))
      }

      // حذف الفواتير
      console.log('⏳ حذف الفواتير...')
      await supabase.from('invoices').delete().eq('company_id', companyId)
      await supabase.from('bills').delete().eq('company_id', companyId)

      // حذف الطلبات
      console.log('⏳ حذف الطلبات...')
      const soIds = await supabase.from('sales_orders').select('id').eq('company_id', companyId)
      if (soIds.data) {
        await supabase.from('sales_order_items').delete().in('sales_order_id', soIds.data.map(s => s.id))
      }
      await supabase.from('sales_orders').delete().eq('company_id', companyId)

      const poIds = await supabase.from('purchase_orders').select('id').eq('company_id', companyId)
      if (poIds.data) {
        await supabase.from('purchase_order_items').delete().in('purchase_order_id', poIds.data.map(p => p.id))
      }
      await supabase.from('purchase_orders').delete().eq('company_id', companyId)

      // إعادة تعيين المخزون
      console.log('⏳ إعادة تعيين المخزون إلى صفر...')
      await supabase
        .from('products')
        .update({ quantity_on_hand: 0 })
        .eq('company_id', companyId)

      // حذف product_inventory
      console.log('⏳ حذف مخزون المنتجات في المستودعات...')
      const productIds = await supabase.from('products').select('id').eq('company_id', companyId)
      if (productIds.data) {
        await supabase
          .from('product_inventory')
          .delete()
          .in('product_id', productIds.data.map(p => p.id))
          .catch(() => {}) // تجاهل الخطأ إذا لم يكن الجدول موجوداً
      }

      // حذف inventory_write_offs
      console.log('⏳ حذف إهلاكات المخزون...')
      const writeOffIds = await supabase.from('inventory_write_offs').select('id').eq('company_id', companyId)
      if (writeOffIds.data) {
        await supabase
          .from('inventory_write_off_items')
          .delete()
          .in('write_off_id', writeOffIds.data.map(w => w.id))
          .catch(() => {})
      }
      await supabase.from('inventory_write_offs').delete().eq('company_id', companyId).catch(() => {})

      console.log('\n✅ ✅ ✅ تم الانتهاء من التنظيف! ✅ ✅ ✅\n')
    }

    // التحقق من النتيجة
    console.log('🔍 التحقق من النتيجة...\n')
    
    const { data: companyData } = await supabase
      .from('companies')
      .select('id')
      .or('name.ilike.تست,name.ilike.%تست%')
      .limit(1)
      .single()

    if (!companyData) {
      console.error('❌ لم يتم العثور على شركة "تست"')
      return
    }

    const companyId = companyData.id

    // التحقق من الفواتير
    const { count: invoiceCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)

    // التحقق من القيود
    const { count: journalCount } = await supabase
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('reference_type', [
        'invoice', 'invoice_payment', 'bill', 'bill_payment',
        'sales_return', 'purchase_return'
      ])

    // التحقق من حركات المخزون
    const { count: inventoryCount } = await supabase
      .from('inventory_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)

    // التحقق من المنتجات بمخزون
    const { count: productStockCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .neq('quantity_on_hand', 0)

    console.log('📊 نتائج التحقق:')
    console.log(`  ✅ الفواتير: ${invoiceCount || 0}`)
    console.log(`  ✅ القيود المرتبطة: ${journalCount || 0}`)
    console.log(`  ✅ حركات المخزون: ${inventoryCount || 0}`)
    console.log(`  ✅ منتجات بمخزون ≠ 0: ${productStockCount || 0}`)

    if ((invoiceCount || 0) === 0 && (journalCount || 0) === 0 && (inventoryCount || 0) === 0 && (productStockCount || 0) === 0) {
      console.log('\n✅ ✅ ✅ التنظيف مكتمل بنجاح! ✅ ✅ ✅')
      console.log('🎉 شركة "تست" جاهزة للاختبار اليدوي!')
    } else {
      console.log('\n⚠️  لا تزال هناك بيانات متبقية')
    }

  } catch (error) {
    console.error('❌ خطأ في التنفيذ:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// تنفيذ
executeCleanup()

