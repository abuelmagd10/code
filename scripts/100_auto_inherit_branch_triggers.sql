-- =====================================================
-- Auto Inherit Branch/Cost Center/Warehouse Triggers
-- تلقائياً وراثة الفرع ومركز التكلفة والمخزن
-- =====================================================

-- 1. Function لتعيين الفرع الافتراضي للفواتير والمشتريات
CREATE OR REPLACE FUNCTION set_default_branch_for_document()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_id UUID;
    v_cost_center_id UUID;
    v_warehouse_id UUID;
BEGIN
    -- تعيين الفرع الرئيسي إذا لم يتم تحديده
    IF NEW.branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
        FROM branches b
        WHERE b.company_id = NEW.company_id AND b.is_main = true
        LIMIT 1;
        NEW.branch_id := v_branch_id;
    END IF;

    -- تعيين مركز التكلفة من الفرع
    IF NEW.cost_center_id IS NULL AND NEW.branch_id IS NOT NULL THEN
        SELECT cc.id INTO v_cost_center_id
        FROM cost_centers cc
        WHERE cc.branch_id = NEW.branch_id AND cc.is_main = true
        LIMIT 1;

        IF v_cost_center_id IS NULL THEN
            SELECT cc.id INTO v_cost_center_id
            FROM cost_centers cc
            WHERE cc.branch_id = NEW.branch_id
            LIMIT 1;
        END IF;
        NEW.cost_center_id := v_cost_center_id;
    END IF;

    -- تعيين المخزن من الفرع
    IF NEW.warehouse_id IS NULL AND NEW.branch_id IS NOT NULL THEN
        SELECT w.id INTO v_warehouse_id
        FROM warehouses w
        WHERE w.branch_id = NEW.branch_id AND w.is_main = true
        LIMIT 1;

        IF v_warehouse_id IS NULL THEN
            SELECT w.id INTO v_warehouse_id
            FROM warehouses w
            WHERE w.company_id = NEW.company_id AND w.is_main = true
            LIMIT 1;
        END IF;
        NEW.warehouse_id := v_warehouse_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Triggers للفواتير والمشتريات
DROP TRIGGER IF EXISTS trg_set_default_branch_invoices ON invoices;
CREATE TRIGGER trg_set_default_branch_invoices
    BEFORE INSERT ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION set_default_branch_for_document();

DROP TRIGGER IF EXISTS trg_set_default_branch_bills ON bills;
CREATE TRIGGER trg_set_default_branch_bills
    BEFORE INSERT ON bills
    FOR EACH ROW
    EXECUTE FUNCTION set_default_branch_for_document();

-- 3. Function لوراثة الفرع والمخزن لحركات المخزون
CREATE OR REPLACE FUNCTION inherit_branch_warehouse_for_inventory()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_id UUID;
    v_warehouse_id UUID;
BEGIN
    IF NEW.branch_id IS NULL OR NEW.warehouse_id IS NULL THEN
        -- محاولة الوراثة من الفاتورة المصدر
        IF NEW.transaction_type IN ('sale', 'sale_return') THEN
            SELECT branch_id, warehouse_id INTO v_branch_id, v_warehouse_id
            FROM invoices WHERE id = NEW.reference_id;
        ELSIF NEW.transaction_type IN ('purchase', 'purchase_return') THEN
            SELECT branch_id, warehouse_id INTO v_branch_id, v_warehouse_id
            FROM bills WHERE id = NEW.reference_id;
        END IF;

        NEW.branch_id := COALESCE(NEW.branch_id, v_branch_id);
        NEW.warehouse_id := COALESCE(NEW.warehouse_id, v_warehouse_id);

        -- إذا لم يتم العثور، استخدم الافتراضي
        IF NEW.branch_id IS NULL OR NEW.warehouse_id IS NULL THEN
            SELECT b.id, w.id INTO v_branch_id, v_warehouse_id
            FROM branches b
            LEFT JOIN warehouses w ON w.branch_id = b.id AND w.is_main = true
            WHERE b.company_id = NEW.company_id AND b.is_main = true
            LIMIT 1;

            NEW.branch_id := COALESCE(NEW.branch_id, v_branch_id);
            NEW.warehouse_id := COALESCE(NEW.warehouse_id, v_warehouse_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inherit_branch_warehouse_inventory ON inventory_transactions;
CREATE TRIGGER trg_inherit_branch_warehouse_inventory
    BEFORE INSERT ON inventory_transactions
    FOR EACH ROW
    EXECUTE FUNCTION inherit_branch_warehouse_for_inventory();

-- 4. Function لوراثة الفرع ومركز التكلفة للقيود المحاسبية
CREATE OR REPLACE FUNCTION inherit_branch_cost_center_for_journal()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_id UUID;
    v_cost_center_id UUID;
BEGIN
    IF NEW.branch_id IS NULL OR NEW.cost_center_id IS NULL THEN
        -- محاولة الوراثة من المستند المصدر
        IF NEW.reference_type IN ('invoice', 'invoice_payment', 'sale_return') THEN
            SELECT branch_id, cost_center_id INTO v_branch_id, v_cost_center_id
            FROM invoices WHERE id = NEW.reference_id;
        ELSIF NEW.reference_type IN ('bill', 'bill_payment', 'purchase_return') THEN
            SELECT branch_id, cost_center_id INTO v_branch_id, v_cost_center_id
            FROM bills WHERE id = NEW.reference_id;
        ELSIF NEW.reference_type = 'payment' THEN
            SELECT branch_id, cost_center_id INTO v_branch_id, v_cost_center_id
            FROM payments WHERE id = NEW.reference_id;
        END IF;

        NEW.branch_id := COALESCE(NEW.branch_id, v_branch_id);
        NEW.cost_center_id := COALESCE(NEW.cost_center_id, v_cost_center_id);

        -- تعيين الفرع الرئيسي إذا لم يوجد
        IF NEW.branch_id IS NULL THEN
            SELECT b.id INTO v_branch_id
            FROM branches b
            WHERE b.company_id = NEW.company_id AND b.is_main = true
            LIMIT 1;
            NEW.branch_id := v_branch_id;
        END IF;

        -- تعيين مركز التكلفة من الفرع
        IF NEW.cost_center_id IS NULL AND NEW.branch_id IS NOT NULL THEN
            SELECT cc.id INTO v_cost_center_id
            FROM cost_centers cc
            WHERE cc.branch_id = NEW.branch_id AND cc.is_main = true
            LIMIT 1;

            IF v_cost_center_id IS NULL THEN
                SELECT cc.id INTO v_cost_center_id
                FROM cost_centers cc
                WHERE cc.branch_id = NEW.branch_id
                LIMIT 1;
            END IF;
            NEW.cost_center_id := v_cost_center_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inherit_branch_cost_center_journal ON journal_entries;
CREATE TRIGGER trg_inherit_branch_cost_center_journal
    BEFORE INSERT ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION inherit_branch_cost_center_for_journal();

-- 5. Function لإنشاء مركز تكلفة افتراضي عند إنشاء فرع جديد
CREATE OR REPLACE FUNCTION create_default_cost_center_for_branch()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO cost_centers (
        company_id,
        branch_id,
        cost_center_name,
        cost_center_code,
        is_main
    ) VALUES (
        NEW.company_id,
        NEW.id,
        'مركز التكلفة - ' || COALESCE(NEW.name, NEW.branch_name),
        'CC-' || COALESCE(NEW.code, NEW.branch_code),
        NEW.is_main
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_default_cost_center ON branches;
CREATE TRIGGER trg_create_default_cost_center
    AFTER INSERT ON branches
    FOR EACH ROW
    EXECUTE FUNCTION create_default_cost_center_for_branch();

-- 6. Function لتعيين الفرع ومركز التكلفة والمخزن الافتراضي للأعضاء الجدد
CREATE OR REPLACE FUNCTION assign_default_branch_to_member()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_id UUID;
    v_cost_center_id UUID;
    v_warehouse_id UUID;
BEGIN
    -- تعيين الفرع الرئيسي
    IF NEW.branch_id IS NULL THEN
        SELECT id INTO v_branch_id
        FROM branches
        WHERE company_id = NEW.company_id AND is_main = true
        LIMIT 1;
        NEW.branch_id := v_branch_id;
    END IF;

    -- تعيين مركز التكلفة
    IF NEW.cost_center_id IS NULL AND NEW.branch_id IS NOT NULL THEN
        SELECT id INTO v_cost_center_id
        FROM cost_centers
        WHERE branch_id = NEW.branch_id
        LIMIT 1;
        NEW.cost_center_id := v_cost_center_id;
    END IF;

    -- تعيين المخزن
    IF NEW.warehouse_id IS NULL THEN
        SELECT id INTO v_warehouse_id
        FROM warehouses
        WHERE company_id = NEW.company_id AND is_main = true
        LIMIT 1;
        NEW.warehouse_id := v_warehouse_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_default_member_branch ON company_members;
CREATE TRIGGER trg_assign_default_member_branch
    BEFORE INSERT ON company_members
    FOR EACH ROW
    EXECUTE FUNCTION assign_default_branch_to_member();

-- =====================================================
-- ملاحظة: تم تطبيق هذه الـ Triggers مباشرة على قاعدة البيانات
-- هذا الملف للتوثيق والنسخ الاحتياطي
-- =====================================================

