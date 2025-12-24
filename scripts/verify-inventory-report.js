const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyInventoryReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 التحقق من تقرير المخزون - VitaSlims');
  console.log('='.repeat(80) + '\n');

  // Get VitaSlims company
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('name', 'VitaSlims')
    .single();

  if (!company) {
    console.log('❌ الشركة غير موجودة');
    return;
  }

  // Get all products
  const { data: products } = await supabase
    .from('products')
    .select('id, sku, name, quantity_on_hand')
    .eq('company_id', company.id)
    .order('sku');

  console.log('📊 عدد المنتجات:', products.length);
  console.log('');

  let totalPurchase = 0;
  let totalSale = 0;
  let totalSaleReturn = 0;
  let totalPurchaseReturn = 0;
  let totalWriteOff = 0;
  let totalOnHand = 0;
  let errors = 0;

  // Check each product
  for (const product of products) {
    const { data: trans } = await supabase
      .from('inventory_transactions')
      .select('transaction_type, quantity_change')
      .eq('product_id', product.id);

    let purchase = 0;
    let sale = 0;
    let saleReturn = 0;
    let purchaseReturn = 0;
    let writeOff = 0;

    for (const t of trans || []) {
      if (t.transaction_type === 'purchase') {
        purchase += t.quantity_change;
      } else if (t.transaction_type === 'sale') {
        sale += Math.abs(t.quantity_change);
      } else if (t.transaction_type === 'sale_return') {
        saleReturn += t.quantity_change;
      } else if (t.transaction_type === 'purchase_return') {
        purchaseReturn += Math.abs(t.quantity_change);
      } else if (t.transaction_type === 'write_off') {
        writeOff += Math.abs(t.quantity_change);
      }
    }

    const calculated = purchase - sale + saleReturn - purchaseReturn - writeOff;
    const match = calculated === product.quantity_on_hand;

    if (!match) {
      errors++;
      console.log(`❌ ${product.sku} - ${product.name}`);
    } else {
      console.log(`✅ ${product.sku} - ${product.name}`);
    }

    console.log(`   المشتريات: ${purchase}`);
    console.log(`   المبيعات: ${sale}`);
    console.log(`   مرتجعات المبيعات: ${saleReturn}`);
    console.log(`   مرتجعات المشتريات: ${purchaseReturn}`);
    console.log(`   الهالك: ${writeOff}`);
    console.log(`   المخزون المحسوب: ${calculated}`);
    console.log(`   المخزون الفعلي: ${product.quantity_on_hand}`);
    console.log(`   الفرق: ${product.quantity_on_hand - calculated}`);
    console.log('');

    totalPurchase += purchase;
    totalSale += sale;
    totalSaleReturn += saleReturn;
    totalPurchaseReturn += purchaseReturn;
    totalWriteOff += writeOff;
    totalOnHand += product.quantity_on_hand;
  }

  console.log('='.repeat(80));
  console.log('📊 الإجمالي:');
  console.log('='.repeat(80));
  console.log(`إجمالي المشتريات: ${totalPurchase}`);
  console.log(`إجمالي المبيعات: ${totalSale}`);
  console.log(`إجمالي مرتجعات المبيعات: ${totalSaleReturn}`);
  console.log(`إجمالي مرتجعات المشتريات: ${totalPurchaseReturn}`);
  console.log(`إجمالي الهالك: ${totalWriteOff}`);
  console.log(`إجمالي المخزون المتاح: ${totalOnHand}`);
  console.log('');

  const calculatedTotal = totalPurchase - totalSale + totalSaleReturn - totalPurchaseReturn - totalWriteOff;
  console.log(`المخزون المحسوب: ${calculatedTotal}`);
  console.log(`المخزون الفعلي: ${totalOnHand}`);
  console.log(`الفرق: ${totalOnHand - calculatedTotal}`);
  console.log('');

  if (errors === 0 && calculatedTotal === totalOnHand) {
    console.log('✅ جميع البيانات صحيحة 100%');
  } else {
    console.log(`❌ وجدت ${errors} مشكلة`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ اكتمل التحقق');
  console.log('='.repeat(80) + '\n');
}

verifyInventoryReport().catch(console.error);

