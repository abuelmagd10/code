#!/usr/bin/env node

/**
 * 🚨 إصلاح طارئ: استبدال دالة loadOrders المعقدة بإصدار مبسط
 */

const fs = require('fs')

console.log('🚨 بدء الإصلاح الطارئ لدالة loadOrders...')

const filePath = 'app/sales-orders/page.tsx'

try {
  // قراءة الملف
  let content = fs.readFileSync(filePath, 'utf8')
  
  // البحث عن بداية ونهاية دالة loadOrders
  const startPattern = /\/\/ تحميل الأوامر\s*const loadOrders = async \(\) => \{/
  const endPattern = /\s*\};\s*\/\/ دالة لتحديث حالة الفاتورة المرتبطة/
  
  const startMatch = content.match(startPattern)
  const endMatch = content.match(endPattern)
  
  if (!startMatch || !endMatch) {
    console.error('❌ لم يتم العثور على دالة loadOrders')
    process.exit(1)
  }
  
  const startIndex = startMatch.index
  const endIndex = endMatch.index
  
  // الدالة المبسطة الجديدة
  const newLoadOrders = `  // تحميل الأوامر - إصدار مبسط جداً
  const loadOrders = async () => {
    try {
      setLoading(true);
      const activeCompanyId = await getActiveCompanyId(supabase);
      if (!activeCompanyId) {
        console.log('❌ No active company found');
        setLoading(false);
        return;
      }

      console.log('🔍 Loading sales orders for company:', activeCompanyId);
      
      // 🚨 إصلاح طارئ: جلب جميع أوامر البيع بدون أي فلاتر حوكمة
      const { data: so, error: ordersError } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });

      if (ordersError) {
        console.error('❌ Error loading orders:', ordersError);
        toast({
          title: 'خطأ في التحميل',
          description: 'فشل تحميل أوامر البيع: ' + ordersError.message,
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }

      console.log('✅ Loaded orders:', so?.length || 0);
      setOrders(so || []);

      // جلب العملاء
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", activeCompanyId)
        .order("name");
      
      console.log('✅ Loaded customers:', customers?.length || 0);
      setCustomers(customers || []);

      // جلب المنتجات
      const { data: products } = await supabase
        .from("products")
        .select("id, name, unit_price, item_type")
        .eq("company_id", activeCompanyId)
        .order("name");
      
      console.log('✅ Loaded products:', products?.length || 0);
      setProducts(products || []);

      setLoading(false);
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      toast({
        title: 'خطأ غير متوقع',
        description: 'حدث خطأ أثناء تحميل البيانات',
        variant: 'destructive'
      });
      setLoading(false);
    }
  };`
  
  // استبدال الدالة
  const beforeFunction = content.substring(0, startIndex)
  const afterFunction = content.substring(endIndex)
  
  const newContent = beforeFunction + newLoadOrders + '\n\n' + afterFunction
  
  // كتابة الملف الجديد
  fs.writeFileSync(filePath, newContent, 'utf8')
  
  console.log('✅ تم استبدال دالة loadOrders بنجاح!')
  console.log('🎯 الآن أوامر البيع يجب أن تظهر بدون فلاتر حوكمة')
  console.log('')
  console.log('📝 الخطوات التالية:')
  console.log('1. أعد تشغيل الخادم: npm run dev')
  console.log('2. افتح صفحة أوامر البيع')
  console.log('3. تحقق من ظهور الأوامر')
  
} catch (error) {
  console.error('❌ خطأ في الإصلاح:', error.message)
  process.exit(1)
}