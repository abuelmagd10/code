-- إصلاح أعمدة جدول invoice_items
-- هذا السكريبت يتأكد من وجود جميع الأعمدة المطلوبة

-- إضافة الأعمدة إذا لم تكن موجودة
DO $$
BEGIN
    -- التحقق من وجود عمود tax_rate
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_items' AND column_name = 'tax_rate') THEN
        ALTER TABLE invoice_items ADD COLUMN tax_rate DECIMAL(5, 2) DEFAULT 0;
    END IF;

    -- التحقق من وجود عمود discount_percent
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_items' AND column_name = 'discount_percent') THEN
        ALTER TABLE invoice_items ADD COLUMN discount_percent DECIMAL(5, 2) DEFAULT 0;
    END IF;

    -- التحقق من وجود عمود line_total
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_items' AND column_name = 'line_total') THEN
        ALTER TABLE invoice_items ADD COLUMN line_total DECIMAL(15, 2) NOT NULL DEFAULT 0;
    END IF;
END
$$;

-- التحقق من الأعمدة الموجودة
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'invoice_items'
ORDER BY ordinal_position;

