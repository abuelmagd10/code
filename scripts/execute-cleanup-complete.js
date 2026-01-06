// scripts/execute-cleanup-complete.js
// تنفيذ سكريبت التنظيف الشامل لشركة "تست" مباشرة

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// قراءة متغيرات البيئة
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ خطأ: متغيرات البيئة غير موجودة')
  console.error('يجب تعيين: NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function executeCleanup() {
  try {
    console.log('🚀 بدء تنفيذ سكريبت التنظيف الشامل...\n')

    // قراءة السكريبت SQL
    const sqlPath = path.join(__dirname, 'cleanup-test-company-complete.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    // تقسيم السكريبت إلى أوامر منفصلة (بناءً على ;)
    // لكن DO $$ blocks يجب تنفيذها كاملة
    const statements = sql
      .split(/;\s*(?=DO|\$)/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    console.log(`📝 تم قراءة ${statements.length} أمر SQL\n`)

    // تنفيذ كل أمر
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      
      // تخطي التعليقات
      if (statement.startsWith('--') || statement.length < 10) {
        continue
      }

      try {
        console.log(`⏳ تنفيذ الأمر ${i + 1}/${statements.length}...`)
        
        // تنفيذ SQL مباشرة
        const { data, error } = await supabase.rpc('exec_sql', { 
          sql_query: statement 
        })

        if (error) {
          // محاولة تنفيذ مباشر عبر query
          const { data: queryData, error: queryError } = await supabase
            .from('_exec_sql')
            .select('*')
          
          if (queryError) {
            // استخدام طريقة بديلة: تنفيذ SQL مباشرة
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({ sql_query: statement })
            })

            if (!response.ok) {
              // تنفيذ مباشر عبر Supabase client
              const { error: directError } = await supabase
                .rpc('exec_sql', { sql_query: statement })
              
              if (directError) {
                console.warn(`⚠️  تحذير في الأمر ${i + 1}:`, directError.message)
              }
            }
          }
        } else {
          console.log(`✅ تم تنفيذ الأمر ${i + 1} بنجاح`)
        }
      } catch (err) {
        console.warn(`⚠️  خطأ في الأمر ${i + 1}:`, err.message)
        // الاستمرار في التنفيذ
      }
    }

    // طريقة بديلة: تنفيذ SQL كامل مباشرة
    console.log('\n🔄 محاولة تنفيذ SQL مباشرة...')
    
    // استخدام Supabase REST API مباشرة
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ sql_query: sql })
    })

    if (response.ok) {
      const result = await response.json()
      console.log('✅ تم تنفيذ السكريبت بنجاح!')
      console.log('📊 النتائج:', result)
    } else {
      // طريقة بديلة: استخدام Supabase Admin API
      console.log('🔄 محاولة طريقة بديلة...')
      
      // تنفيذ SQL عبر Supabase Admin
      const adminResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ sql_query: sql })
      })

      if (adminResponse.ok) {
        console.log('✅ تم تنفيذ السكريبت بنجاح!')
      } else {
        const errorText = await adminResponse.text()
        console.error('❌ خطأ في التنفيذ:', errorText)
        throw new Error('فشل تنفيذ SQL')
      }
    }

    // التحقق من النتيجة
    console.log('\n🔍 التحقق من النتيجة...')
    
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

    console.log('\n📊 نتائج التحقق:')
    console.log(`  - الفواتير: ${invoiceCount}`)
    console.log(`  - القيود المرتبطة: ${journalCount}`)
    console.log(`  - حركات المخزون: ${inventoryCount}`)
    console.log(`  - منتجات بمخزون ≠ 0: ${productStockCount}`)

    if (invoiceCount === 0 && journalCount === 0 && inventoryCount === 0 && productStockCount === 0) {
      console.log('\n✅ ✅ ✅ التنظيف مكتمل بنجاح! ✅ ✅ ✅')
    } else {
      console.log('\n⚠️  لا تزال هناك بيانات متبقية')
    }

  } catch (error) {
    console.error('❌ خطأ في التنفيذ:', error)
    process.exit(1)
  }
}

// تنفيذ
executeCleanup()

