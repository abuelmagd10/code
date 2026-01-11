#!/usr/bin/env node

/**
 * 🔧 إصلاح مشكلة عدم ظهور أوامر البيع للمستخدمين
 * 
 * المشكلة: نظام الحوكمة يطبق فلاتر صارمة جداً مما يمنع ظهور أوامر البيع
 * الحل: إنشاء البنية الأساسية المطلوبة وتحديث البيانات القديمة
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ متغيرات البيئة مفقودة')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixSalesOrdersVisibility() {
  console.log('🔧 بدء إصلاح مشكلة عدم ظهور أوامر البيع...')
  
  try {
    // 1️⃣ جلب جميع الشركات
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name')
    
    if (companiesError) {
      throw new Error(`خطأ في جلب الشركات: ${companiesError.message}`)
    }
    
    console.log(`📊 تم العثور على ${companies.length} شركة`)
    
    for (const company of companies) {
      console.log(`\n🏢 معالجة شركة: ${company.name} (${company.id})`)
      
      // 2️⃣ التحقق من وجود فرع
      let { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .eq('company_id', company.id)
      
      if (!branches || branches.length === 0) {
        console.log('📍 إنشاء فرع افتراضي...')
        const { data: newBranch, error: branchError } = await supabase
          .from('branches')
          .insert({
            company_id: company.id,
            name: 'الفرع الرئيسي',
            address: 'العنوان الرئيسي',
            is_active: true
          })
          .select()
          .single()
        
        if (branchError) {
          console.error(`❌ خطأ في إنشاء الفرع: ${branchError.message}`)
          continue
        }
        
        branches = [newBranch]
        console.log('✅ تم إنشاء الفرع الافتراضي')
      }
      
      const mainBranch = branches[0]
      
      // 3️⃣ التحقق من وجود مركز تكلفة
      let { data: costCenters } = await supabase
        .from('cost_centers')
        .select('id, name')
        .eq('company_id', company.id)
        .eq('branch_id', mainBranch.id)
      
      if (!costCenters || costCenters.length === 0) {
        console.log('🎯 إنشاء مركز تكلفة افتراضي...')
        const { data: newCostCenter, error: ccError } = await supabase
          .from('cost_centers')
          .insert({
            company_id: company.id,
            branch_id: mainBranch.id,
            name: 'مركز التكلفة الرئيسي',
            description: 'مركز التكلفة الافتراضي',
            is_active: true
          })
          .select()
          .single()
        
        if (ccError) {
          console.error(`❌ خطأ في إنشاء مركز التكلفة: ${ccError.message}`)
          continue
        }
        
        costCenters = [newCostCenter]
        console.log('✅ تم إنشاء مركز التكلفة الافتراضي')
      }
      
      const mainCostCenter = costCenters[0]
      
      // 4️⃣ التحقق من وجود مخزن
      let { data: warehouses } = await supabase
        .from('warehouses')
        .select('id, name, is_main')
        .eq('company_id', company.id)
        .eq('branch_id', mainBranch.id)
      
      let mainWarehouse = warehouses?.find(w => w.is_main)
      
      if (!mainWarehouse) {
        console.log('📦 إنشاء مخزن افتراضي...')
        const { data: newWarehouse, error: warehouseError } = await supabase
          .from('warehouses')
          .insert({
            company_id: company.id,
            branch_id: mainBranch.id,
            name: 'المخزن الرئيسي',
            location: 'الموقع الافتراضي',
            is_main: true,
            is_active: true
          })
          .select()
          .single()
        
        if (warehouseError) {
          console.error(`❌ خطأ في إنشاء المخزن: ${warehouseError.message}`)
          continue
        }
        
        mainWarehouse = newWarehouse
        console.log('✅ تم إنشاء المخزن الافتراضي')
      }
      
      // 5️⃣ تحديث أعضاء الشركة
      console.log('👥 تحديث أعضاء الشركة...')
      const { error: membersError } = await supabase
        .from('company_members')
        .update({
          branch_id: mainBranch.id,
          cost_center_id: mainCostCenter.id,
          warehouse_id: mainWarehouse.id
        })
        .eq('company_id', company.id)
        .or('branch_id.is.null,cost_center_id.is.null,warehouse_id.is.null')
      
      if (membersError) {
        console.error(`❌ خطأ في تحديث الأعضاء: ${membersError.message}`)
      } else {
        console.log('✅ تم تحديث أعضاء الشركة')
      }
      
      // 6️⃣ تحديث أوامر البيع القديمة
      console.log('🛒 تحديث أوامر البيع القديمة...')
      const { error: ordersError } = await supabase
        .from('sales_orders')
        .update({
          branch_id: mainBranch.id,
          cost_center_id: mainCostCenter.id,
          warehouse_id: mainWarehouse.id
        })
        .eq('company_id', company.id)
        .or('branch_id.is.null,cost_center_id.is.null,warehouse_id.is.null')
      
      if (ordersError) {
        console.error(`❌ خطأ في تحديث أوامر البيع: ${ordersError.message}`)
      } else {
        console.log('✅ تم تحديث أوامر البيع')
      }
      
      // 7️⃣ تحديث الفواتير القديمة
      console.log('🧾 تحديث الفواتير القديمة...')
      const { error: invoicesError } = await supabase
        .from('invoices')
        .update({
          branch_id: mainBranch.id,
          cost_center_id: mainCostCenter.id,
          warehouse_id: mainWarehouse.id
        })
        .eq('company_id', company.id)
        .or('branch_id.is.null,cost_center_id.is.null,warehouse_id.is.null')
      
      if (invoicesError) {
        console.error(`❌ خطأ في تحديث الفواتير: ${invoicesError.message}`)
      } else {
        console.log('✅ تم تحديث الفواتير')
      }
      
      // 8️⃣ تحديث العملاء
      console.log('👤 تحديث العملاء...')
      const { error: customersError } = await supabase
        .from('customers')
        .update({
          branch_id: mainBranch.id
        })
        .eq('company_id', company.id)
        .is('branch_id', null)
      
      if (customersError) {
        console.error(`❌ خطأ في تحديث العملاء: ${customersError.message}`)
      } else {
        console.log('✅ تم تحديث العملاء')
      }
      
      // 9️⃣ إحصائيات بعد الإصلاح
      const { data: stats } = await supabase
        .from('sales_orders')
        .select('id, branch_id, cost_center_id, warehouse_id')
        .eq('company_id', company.id)
      
      const withBranch = stats?.filter(s => s.branch_id).length || 0
      const withCostCenter = stats?.filter(s => s.cost_center_id).length || 0
      const withWarehouse = stats?.filter(s => s.warehouse_id).length || 0
      
      console.log(`📊 إحصائيات أوامر البيع:`)
      console.log(`   - إجمالي: ${stats?.length || 0}`)
      console.log(`   - مع فرع: ${withBranch}`)
      console.log(`   - مع مركز تكلفة: ${withCostCenter}`)
      console.log(`   - مع مخزن: ${withWarehouse}`)
    }
    
    console.log('\n🎉 تم إكمال الإصلاح بنجاح!')
    console.log('\n📝 الخطوات التالية:')
    console.log('1. قم بتسجيل الدخول مرة أخرى')
    console.log('2. تحقق من ظهور أوامر البيع')
    console.log('3. إذا لم تظهر، تحقق من دور المستخدم')
    
  } catch (error) {
    console.error('❌ خطأ في الإصلاح:', error.message)
    process.exit(1)
  }
}

// تشغيل الإصلاح
fixSalesOrdersVisibility()