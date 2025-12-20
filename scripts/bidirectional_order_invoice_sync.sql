-- نظام الربط الثنائي المحسن للأوامر والفواتير
-- يضمن المزامنة الكاملة ضمن حدود النمط المحاسبي

-- =====================================================
-- 1. دوال المزامنة الثنائية الذكية
-- =====================================================

-- دالة المزامنة من أمر البيع إلى الفاتورة (في حالة المسودة فقط)
CREATE OR REPLACE FUNCTION sync_invoice_from_sales_order()
RETURNS TRIGGER AS $$
DECLARE
    invoice_record RECORD;
BEGIN
    -- فقط في حالة المسودة يُسمح بالمزامنة من الأمر للفاتورة
    IF NEW.status = 'draft' AND OLD.status = 'draft' THEN
        -- البحث عن الفاتورة المرتبطة
        SELECT * INTO invoice_record FROM invoices WHERE sales_order_id = NEW.id;
        
        IF FOUND THEN
            -- تحديث الفاتورة لتطابق الأمر
            UPDATE invoices SET
                subtotal = NEW.subtotal,
                tax_amount = NEW.tax_amount,
                total_amount = NEW.total,
                shipping = NEW.shipping,
                discount_amount = NEW.discount_amount,
                notes = NEW.notes,
                updated_at = NOW()
            WHERE id = invoice_record.id;
            
            -- مزامنة البنود
            PERFORM sync_invoice_items_from_order(NEW.id, invoice_record.id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- دالة المزامنة من الفاتورة إلى أمر البيع (في الحالات المرسلة/المدفوعة)
CREATE OR REPLACE FUNCTION sync_sales_order_from_invoice()
RETURNS TRIGGER AS $$
DECLARE
    order_status TEXT;
BEGIN
    -- فقط إذا كانت الفاتورة مرتبطة بأمر بيع
    IF NEW.sales_order_id IS NOT NULL THEN
        -- جلب حالة الأمر
        SELECT status INTO order_status FROM sales_orders WHERE id = NEW.sales_order_id;
        
        -- المزامنة فقط إذا كان الأمر في حالة غير مسودة
        IF order_status != 'draft' THEN
            UPDATE sales_orders SET
                subtotal = NEW.subtotal,
                tax_amount = NEW.tax_amount,
                total = NEW.total_amount,
                shipping = NEW.shipping,
                discount_amount = NEW.discount_amount,
                status = CASE 
                    WHEN NEW.status = 'sent' THEN 'sent'
                    WHEN NEW.status IN ('paid', 'partially_paid') THEN 'invoiced'
                    ELSE order_status
                END,
                updated_at = NOW()
            WHERE id = NEW.sales_order_id;
            
            -- مزامنة البنود
            PERFORM sync_order_items_from_invoice(NEW.sales_order_id, NEW.id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- دالة المزامنة من أمر الشراء إلى الفاتورة (في حالة المسودة فقط)
CREATE OR REPLACE FUNCTION sync_bill_from_purchase_order()
RETURNS TRIGGER AS $$
DECLARE
    bill_record RECORD;
BEGIN
    -- فقط في حالة المسودة يُسمح بالمزامنة من الأمر للفاتورة
    IF NEW.status = 'draft' AND OLD.status = 'draft' THEN
        -- البحث عن الفاتورة المرتبطة
        SELECT * INTO bill_record FROM bills WHERE purchase_order_id = NEW.id;
        
        IF FOUND THEN
            -- تحديث الفاتورة لتطابق الأمر
            UPDATE bills SET
                subtotal = NEW.subtotal,
                tax_amount = NEW.tax_amount,
                total_amount = NEW.total,
                shipping = NEW.shipping,
                discount_amount = NEW.discount_amount,
                notes = NEW.notes,
                updated_at = NOW()
            WHERE id = bill_record.id;
            
            -- مزامنة البنود
            PERFORM sync_bill_items_from_order(NEW.id, bill_record.id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- دالة المزامنة من فاتورة الشراء إلى أمر الشراء (في الحالات المرسلة/المدفوعة)
CREATE OR REPLACE FUNCTION sync_purchase_order_from_bill()
RETURNS TRIGGER AS $$
DECLARE
    order_status TEXT;
BEGIN
    -- فقط إذا كانت الفاتورة مرتبطة بأمر شراء
    IF NEW.purchase_order_id IS NOT NULL THEN
        -- جلب حالة الأمر
        SELECT status INTO order_status FROM purchase_orders WHERE id = NEW.purchase_order_id;
        
        -- المزامنة فقط إذا كان الأمر في حالة غير مسودة
        IF order_status != 'draft' THEN
            UPDATE purchase_orders SET
                subtotal = NEW.subtotal,
                tax_amount = NEW.tax_amount,
                total = NEW.total_amount,
                shipping = NEW.shipping,
                discount_amount = NEW.discount_amount,
                status = CASE 
                    WHEN NEW.status = 'sent' THEN 'sent'
                    WHEN NEW.status IN ('paid', 'partially_paid') THEN 'billed'
                    ELSE order_status
                END,
                updated_at = NOW()
            WHERE id = NEW.purchase_order_id;
            
            -- مزامنة البنود
            PERFORM sync_order_items_from_bill(NEW.purchase_order_id, NEW.id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. دوال مزامنة البنود
-- =====================================================

-- مزامنة بنود الفاتورة من أمر البيع
CREATE OR REPLACE FUNCTION sync_invoice_items_from_order(order_id UUID, invoice_id UUID)
RETURNS VOID AS $$
BEGIN
    -- حذف البنود الحالية
    DELETE FROM invoice_items WHERE invoice_id = sync_invoice_items_from_order.invoice_id;
    
    -- نسخ البنود من الأمر
    INSERT INTO invoice_items (
        invoice_id, product_id, description, quantity, unit_price, 
        tax_rate, discount_percent, line_total
    )
    SELECT 
        sync_invoice_items_from_order.invoice_id, 
        product_id, description, quantity, unit_price,
        tax_rate, discount_percent, line_total
    FROM sales_order_items 
    WHERE sales_order_id = sync_invoice_items_from_order.order_id;
END;
$$ LANGUAGE plpgsql;

-- مزامنة بنود أمر البيع من الفاتورة
CREATE OR REPLACE FUNCTION sync_order_items_from_invoice(order_id UUID, invoice_id UUID)
RETURNS VOID AS $$
BEGIN
    -- تحديث البنود الموجودة فقط (لا نحذف لأن الأمر مغلق)
    UPDATE sales_order_items soi SET
        quantity = ii.quantity,
        unit_price = ii.unit_price,
        tax_rate = ii.tax_rate,
        discount_percent = ii.discount_percent,
        line_total = ii.line_total
    FROM invoice_items ii
    WHERE soi.sales_order_id = sync_order_items_from_invoice.order_id
    AND ii.invoice_id = sync_order_items_from_invoice.invoice_id
    AND soi.product_id = ii.product_id;
END;
$$ LANGUAGE plpgsql;

-- مزامنة بنود فاتورة الشراء من أمر الشراء
CREATE OR REPLACE FUNCTION sync_bill_items_from_order(order_id UUID, bill_id UUID)
RETURNS VOID AS $$
BEGIN
    -- حذف البنود الحالية
    DELETE FROM bill_items WHERE bill_id = sync_bill_items_from_order.bill_id;
    
    -- نسخ البنود من الأمر
    INSERT INTO bill_items (
        bill_id, product_id, description, quantity, unit_price, 
        tax_rate, discount_percent, line_total
    )
    SELECT 
        sync_bill_items_from_order.bill_id, 
        product_id, description, quantity, unit_price,
        tax_rate, discount_percent, line_total
    FROM purchase_order_items 
    WHERE purchase_order_id = sync_bill_items_from_order.order_id;
END;
$$ LANGUAGE plpgsql;

-- مزامنة بنود أمر الشراء من فاتورة الشراء
CREATE OR REPLACE FUNCTION sync_order_items_from_bill(order_id UUID, bill_id UUID)
RETURNS VOID AS $$
BEGIN
    -- تحديث البنود الموجودة فقط (لا نحذف لأن الأمر مغلق)
    UPDATE purchase_order_items poi SET
        quantity = bi.quantity,
        unit_price = bi.unit_price,
        tax_rate = bi.tax_rate,
        discount_percent = bi.discount_percent,
        line_total = bi.line_total
    FROM bill_items bi
    WHERE poi.purchase_order_id = sync_order_items_from_bill.order_id
    AND bi.bill_id = sync_order_items_from_bill.bill_id
    AND poi.product_id = bi.product_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. دوال الحماية المحسنة
-- =====================================================

-- منع تعديل الأمر بعد إرسال الفاتورة
CREATE OR REPLACE FUNCTION prevent_order_edit_after_invoice_sent()
RETURNS TRIGGER AS $$
DECLARE
    invoice_status TEXT;
    has_payments BOOLEAN := FALSE;
BEGIN
    -- للأوامر البيع
    IF TG_TABLE_NAME = 'sales_orders' THEN
        -- التحقق من حالة الفاتورة المرتبطة
        SELECT i.status INTO invoice_status 
        FROM invoices i 
        WHERE i.sales_order_id = NEW.id;
        
        -- التحقق من وجود مدفوعات
        SELECT EXISTS(
            SELECT 1 FROM payments p 
            JOIN invoices i ON p.invoice_id = i.id 
            WHERE i.sales_order_id = NEW.id AND p.amount > 0
        ) INTO has_payments;
        
        -- منع التعديل إذا كانت الفاتورة مرسلة أو مدفوعة
        IF invoice_status IN ('sent', 'paid', 'partially_paid') OR has_payments THEN
            RAISE EXCEPTION 'لا يمكن تعديل أمر البيع. الفاتورة مرسلة أو مدفوعة. يجب التعديل من خلال الفاتورة فقط.';
        END IF;
    END IF;
    
    -- لأوامر الشراء
    IF TG_TABLE_NAME = 'purchase_orders' THEN
        -- التحقق من حالة فاتورة الشراء المرتبطة
        SELECT b.status INTO invoice_status 
        FROM bills b 
        WHERE b.purchase_order_id = NEW.id;
        
        -- التحقق من وجود مدفوعات
        SELECT EXISTS(
            SELECT 1 FROM payments p 
            JOIN bills b ON p.bill_id = b.id 
            WHERE b.purchase_order_id = NEW.id AND p.amount > 0
        ) INTO has_payments;
        
        -- منع التعديل إذا كانت الفاتورة مرسلة أو مدفوعة
        IF invoice_status IN ('sent', 'paid', 'partially_paid') OR has_payments THEN
            RAISE EXCEPTION 'لا يمكن تعديل أمر الشراء. الفاتورة مرسلة أو مدفوعة. يجب التعديل من خلال الفاتورة فقط.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- منع التعديل المباشر للفاتورة المرتبطة بأمر في حالة مسودة
CREATE OR REPLACE FUNCTION prevent_direct_invoice_edit_when_order_draft()
RETURNS TRIGGER AS $$
DECLARE
    order_status TEXT;
BEGIN
    -- للفواتير البيع
    IF TG_TABLE_NAME = 'invoices' AND NEW.sales_order_id IS NOT NULL THEN
        SELECT status INTO order_status 
        FROM sales_orders 
        WHERE id = NEW.sales_order_id;
        
        IF order_status = 'draft' THEN
            RAISE EXCEPTION 'لا يمكن تعديل الفاتورة مباشرة. الأمر في حالة مسودة - يجب التعديل من خلال أمر البيع فقط.';
        END IF;
    END IF;
    
    -- لفواتير الشراء
    IF TG_TABLE_NAME = 'bills' AND NEW.purchase_order_id IS NOT NULL THEN
        SELECT status INTO order_status 
        FROM purchase_orders 
        WHERE id = NEW.purchase_order_id;
        
        IF order_status = 'draft' THEN
            RAISE EXCEPTION 'لا يمكن تعديل فاتورة الشراء مباشرة. الأمر في حالة مسودة - يجب التعديل من خلال أمر الشراء فقط.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. إنشاء الـ Triggers
-- =====================================================

-- Triggers للمزامنة الثنائية
DROP TRIGGER IF EXISTS sync_invoice_from_so_trigger ON sales_orders;
CREATE TRIGGER sync_invoice_from_so_trigger
    AFTER UPDATE ON sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION sync_invoice_from_sales_order();

DROP TRIGGER IF EXISTS sync_so_from_invoice_trigger ON invoices;
CREATE TRIGGER sync_so_from_invoice_trigger
    AFTER UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION sync_sales_order_from_invoice();

DROP TRIGGER IF EXISTS sync_bill_from_po_trigger ON purchase_orders;
CREATE TRIGGER sync_bill_from_po_trigger
    AFTER UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION sync_bill_from_purchase_order();

DROP TRIGGER IF EXISTS sync_po_from_bill_trigger ON bills;
CREATE TRIGGER sync_po_from_bill_trigger
    AFTER UPDATE ON bills
    FOR EACH ROW
    EXECUTE FUNCTION sync_purchase_order_from_bill();

-- Triggers للحماية
DROP TRIGGER IF EXISTS prevent_so_edit_trigger ON sales_orders;
CREATE TRIGGER prevent_so_edit_trigger
    BEFORE UPDATE ON sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION prevent_order_edit_after_invoice_sent();

DROP TRIGGER IF EXISTS prevent_po_edit_trigger ON purchase_orders;
CREATE TRIGGER prevent_po_edit_trigger
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION prevent_order_edit_after_invoice_sent();

DROP TRIGGER IF EXISTS prevent_invoice_direct_edit_trigger ON invoices;
CREATE TRIGGER prevent_invoice_direct_edit_trigger
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION prevent_direct_invoice_edit_when_order_draft();

DROP TRIGGER IF EXISTS prevent_bill_direct_edit_trigger ON bills;
CREATE TRIGGER prevent_bill_direct_edit_trigger
    BEFORE UPDATE ON bills
    FOR EACH ROW
    EXECUTE FUNCTION prevent_direct_invoice_edit_when_order_draft();

-- =====================================================
-- 5. دالة التحقق من صحة الربط الثنائي
-- =====================================================

CREATE OR REPLACE FUNCTION validate_bidirectional_linking()
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    count_issues INTEGER,
    details TEXT
) AS $$
BEGIN
    -- التحقق من الأوامر بدون فواتير مرتبطة
    RETURN QUERY
    SELECT 
        'Sales Orders Without Invoices'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END::TEXT,
        COUNT(*)::INTEGER,
        'Sales orders that should have linked invoices'::TEXT
    FROM sales_orders so
    WHERE so.status != 'draft' 
    AND NOT EXISTS (SELECT 1 FROM invoices WHERE sales_order_id = so.id);
    
    -- التحقق من الفواتير بدون أوامر مرتبطة
    RETURN QUERY
    SELECT 
        'Invoices Without Sales Orders'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'INFO' END::TEXT,
        COUNT(*)::INTEGER,
        'Invoices created directly (not from orders)'::TEXT
    FROM invoices
    WHERE sales_order_id IS NULL;
    
    -- التحقق من عدم تطابق المبالغ
    RETURN QUERY
    SELECT 
        'Amount Mismatch (SO vs Invoice)'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ERROR' END::TEXT,
        COUNT(*)::INTEGER,
        'Sales orders and invoices with different totals'::TEXT
    FROM sales_orders so
    JOIN invoices i ON so.id = i.sales_order_id
    WHERE ABS(so.total - i.total_amount) > 0.01;
    
    -- نفس التحققات لأوامر الشراء
    RETURN QUERY
    SELECT 
        'Purchase Orders Without Bills'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END::TEXT,
        COUNT(*)::INTEGER,
        'Purchase orders that should have linked bills'::TEXT
    FROM purchase_orders po
    WHERE po.status != 'draft' 
    AND NOT EXISTS (SELECT 1 FROM bills WHERE purchase_order_id = po.id);
    
    RETURN QUERY
    SELECT 
        'Amount Mismatch (PO vs Bill)'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ERROR' END::TEXT,
        COUNT(*)::INTEGER,
        'Purchase orders and bills with different totals'::TEXT
    FROM purchase_orders po
    JOIN bills b ON po.id = b.purchase_order_id
    WHERE ABS(po.total - b.total_amount) > 0.01;
END;
$$ LANGUAGE plpgsql;

-- عرض نتائج التحقق
SELECT 'تم تطبيق نظام الربط الثنائي المحسن بنجاح' as status;
SELECT * FROM validate_bidirectional_linking();