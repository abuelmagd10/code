-- ===========================================
-- Script 109: Add Branch & Warehouse to Products
-- إضافة الفرع والمستودع للمنتجات
-- ===========================================

-- 1️⃣ إضافة عمود branch_id للمنتجات
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- 2️⃣ إضافة عمود warehouse_id للمنتجات
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 3️⃣ تحويل cost_center من TEXT إلى UUID (إذا لم يكن كذلك)
-- نضيف عمود جديد cost_center_id
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- 4️⃣ إنشاء فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_products_branch_id ON products(branch_id);
CREATE INDEX IF NOT EXISTS idx_products_warehouse_id ON products(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_products_cost_center_id ON products(cost_center_id);

-- 5️⃣ تحديث المنتجات الحالية - ربطها بالفرع الرئيسي والمستودع الرئيسي
-- هذا يتم يدوياً أو عبر التطبيق

-- 6️⃣ إضافة تعليق للتوثيق
COMMENT ON COLUMN products.branch_id IS 'الفرع الذي يتبع له المنتج';
COMMENT ON COLUMN products.warehouse_id IS 'المستودع الذي يتواجد فيه المنتج';
COMMENT ON COLUMN products.cost_center_id IS 'مركز التكلفة المرتبط بالمنتج';

-- ===========================================
-- ملاحظة: بعد تنفيذ هذا السكربت:
-- - عند إضافة منتج جديد، يجب اختيار الفرع أولاً
-- - ثم يتم عرض المستودعات ومراكز التكلفة التابعة لهذا الفرع
-- ===========================================

