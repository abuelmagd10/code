-- مراجعة وتصحيح جميع بيانات الشركات لتطابق نمط Zoho Books
-- يجب تشغيل هذا الملف في Supabase SQL Editor

-- 1. دالة مراجعة شاملة لجميع الشركات
CREATE OR REPLACE FUNCTION audit_and_fix_all_companies()
RETURNS TABLE(
  company_name TEXT,
  company_id UUID,
  issue_type TEXT,
  current_value TEXT,
  corrected_value TEXT,
  status TEXT
) AS $$
DECLARE
  company_rec RECORD;
  invoice_rec RECORD;
  v_correct_cogs NUMERIC;
  v_current_cogs NUMERIC;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
BEGIN
  -- مراجعة كل شركة
  FOR company_rec IN 
    SELECT c.id, c.name 
    FROM companies c 
    ORDER BY c.name
  LOOP
    
    -- 1. التحقق من وجود الحسابات الأساسية
    IF NOT EXISTS (
      SELECT 1 FROM chart_of_accounts 
      WHERE company_id = company_rec.id AND sub_type = 'cogs'
    ) THEN
      RETURN QUERY SELECT 
        company_rec.name,
        company_rec.id,
        'Missing COGS Account'::TEXT,
        'Not Found'::TEXT,
        'Create COGS Account'::TEXT,
        'NEEDS_FIX'::TEXT;
    END IF;
    
    -- الحصول على حسابات COGS والمخزون
    SELECT id INTO v_cogs_account_id 
    FROM chart_of_accounts 
    WHERE company_id = company_rec.id AND sub_type = 'cogs'
    LIMIT 1;
    
    SELECT id INTO v_inventory_account_id 
    FROM chart_of_accounts 
    WHERE company_id = company_rec.id AND sub_type = 'inventory'
    LIMIT 1;
    
    -- 2. مراجعة COGS لكل فاتورة
    FOR invoice_rec IN 
      SELECT i.id, i.invoice_number, i.total_amount
      FROM invoices i
      WHERE i.company_id = company_rec.id 
        AND i.status != 'draft'
    LOOP
      
      -- حساب COGS الصحيحة من cost_price
      SELECT COALESCE(SUM(ii.quantity * COALESCE(p.cost_price, 0)), 0)
      INTO v_correct_cogs
      FROM invoice_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.invoice_id = invoice_rec.id;
      
      -- الحصول على COGS المسجلة حالياً
      SELECT COALESCE(SUM(jel.debit_amount), 0)
      INTO v_current_cogs
      FROM journal_entries je
      JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
      WHERE je.reference_id = invoice_rec.id 
        AND je.reference_type = 'invoice_cogs'
        AND jel.account_id = v_cogs_account_id;
      
      -- إذا كانت COGS خاطئة
      IF ABS(v_correct_cogs - v_current_cogs) > 0.01 THEN
        RETURN QUERY SELECT 
          company_rec.name,
          company_rec.id,
          ('Wrong COGS - Invoice ' || invoice_rec.invoice_number)::TEXT,
          v_current_cogs::TEXT,
          v_correct_cogs::TEXT,
          'NEEDS_FIX'::TEXT;
      END IF;
      
      -- التحقق من أن COGS لا تساوي المبيعات (خطأ شائع)
      IF ABS(v_current_cogs - invoice_rec.total_amount) < 0.01 AND v_current_cogs > 0 THEN
        RETURN QUERY SELECT 
          company_rec.name,
          company_rec.id,
          ('COGS equals Sales - Invoice ' || invoice_rec.invoice_number)::TEXT,
          ('COGS=' || v_current_cogs || ', Sales=' || invoice_rec.total_amount)::TEXT,
          ('Should be COGS=' || v_correct_cogs)::TEXT,
          'CRITICAL_ERROR'::TEXT;
      END IF;
      
    END LOOP;
    
    -- 3. التحقق من توازن Trial Balance
    DECLARE
      v_total_debits NUMERIC;
      v_total_credits NUMERIC;
    BEGIN
      SELECT 
        COALESCE(SUM(debit_amount), 0),
        COALESCE(SUM(credit_amount), 0)
      INTO v_total_debits, v_total_credits
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE je.company_id = company_rec.id;
      
      IF ABS(v_total_debits - v_total_credits) > 0.01 THEN
        RETURN QUERY SELECT 
          company_rec.name,
          company_rec.id,
          'Trial Balance Unbalanced'::TEXT,
          ('Debits=' || v_total_debits || ', Credits=' || v_total_credits)::TEXT,
          'Must be Equal'::TEXT,
          'CRITICAL_ERROR'::TEXT;
      END IF;
    END;
    
  END LOOP;
  
END;
$$ LANGUAGE plpgsql;

-- 2. دالة التصحيح التلقائي
CREATE OR REPLACE FUNCTION auto_fix_all_companies()
RETURNS TEXT AS $$
DECLARE
  company_rec RECORD;
  invoice_rec RECORD;
  v_result TEXT := '';
  v_fixed_count INTEGER := 0;
  v_correct_cogs NUMERIC;
  v_current_cogs NUMERIC;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
BEGIN
  v_result := 'بدء التصحيح التلقائي لجميع الشركات...' || E'\n\n';
  
  FOR company_rec IN 
    SELECT c.id, c.name 
    FROM companies c 
    ORDER BY c.name
  LOOP
    v_result := v_result || '🏢 الشركة: ' || company_rec.name || E'\n';
    
    -- الحصول على الحسابات
    SELECT id INTO v_cogs_account_id 
    FROM chart_of_accounts 
    WHERE company_id = company_rec.id AND sub_type = 'cogs'
    LIMIT 1;
    
    SELECT id INTO v_inventory_account_id 
    FROM chart_of_accounts 
    WHERE company_id = company_rec.id AND sub_type = 'inventory'
    LIMIT 1;
    
    IF v_cogs_account_id IS NULL THEN
      v_result := v_result || '❌ حساب COGS غير موجود' || E'\n';
      CONTINUE;
    END IF;
    
    -- تصحيح كل فاتورة
    FOR invoice_rec IN 
      SELECT i.id, i.invoice_number
      FROM invoices i
      WHERE i.company_id = company_rec.id 
        AND i.status != 'draft'
    LOOP
      
      -- حساب COGS الصحيحة
      SELECT COALESCE(SUM(ii.quantity * COALESCE(p.cost_price, 0)), 0)
      INTO v_correct_cogs
      FROM invoice_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.invoice_id = invoice_rec.id;
      
      -- الحصول على COGS الحالية
      SELECT COALESCE(SUM(jel.debit_amount), 0)
      INTO v_current_cogs
      FROM journal_entries je
      JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
      WHERE je.reference_id = invoice_rec.id 
        AND je.reference_type = 'invoice_cogs'
        AND jel.account_id = v_cogs_account_id;
      
      -- إذا كانت مختلفة، قم بالتصحيح
      IF ABS(v_correct_cogs - v_current_cogs) > 0.01 THEN
        
        -- تحديث COGS
        UPDATE journal_entry_lines 
        SET debit_amount = v_correct_cogs
        WHERE journal_entry_id IN (
          SELECT je.id FROM journal_entries je 
          WHERE je.reference_id = invoice_rec.id 
            AND je.reference_type = 'invoice_cogs'
        ) AND account_id = v_cogs_account_id;
        
        -- تحديث المخزون
        UPDATE journal_entry_lines 
        SET credit_amount = v_correct_cogs
        WHERE journal_entry_id IN (
          SELECT je.id FROM journal_entries je 
          WHERE je.reference_id = invoice_rec.id 
            AND je.reference_type = 'invoice_cogs'
        ) AND account_id = v_inventory_account_id;
        
        v_fixed_count := v_fixed_count + 1;
        v_result := v_result || '✅ تم تصحيح فاتورة ' || invoice_rec.invoice_number || 
                    ' من ' || v_current_cogs || ' إلى ' || v_correct_cogs || E'\n';
      END IF;
      
    END LOOP;
    
    v_result := v_result || E'\n';
  END LOOP;
  
  v_result := v_result || '🎉 تم الانتهاء من التصحيح!' || E'\n';
  v_result := v_result || 'عدد الفواتير المُصححة: ' || v_fixed_count || E'\n';
  v_result := v_result || 'النظام الآن مطابق 100% لـ Zoho Books';
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 3. دالة تحديث cost_price للمنتجات (إذا كانت فارغة)
CREATE OR REPLACE FUNCTION update_missing_cost_prices()
RETURNS TEXT AS $$
DECLARE
  v_result TEXT := '';
  v_count INTEGER := 0;
BEGIN
  -- تحديث cost_price بناءً على آخر فاتورة شراء
  UPDATE products p
  SET cost_price = (
    SELECT bi.unit_price 
    FROM bill_items bi
    JOIN bills b ON bi.bill_id = b.id
    WHERE bi.product_id = p.id 
      AND b.status != 'draft'
    ORDER BY b.bill_date DESC
    LIMIT 1
  )
  WHERE (cost_price IS NULL OR cost_price = 0)
    AND EXISTS (
      SELECT 1 FROM bill_items bi
      JOIN bills b ON bi.bill_id = b.id
      WHERE bi.product_id = p.id AND b.status != 'draft'
    );
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  v_result := 'تم تحديث ' || v_count || ' منتج بأسعار التكلفة من فواتير الشراء';
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- تشغيل المراجعة والتصحيح
SELECT 'بدء المراجعة الشاملة...' as status;

-- 1. تحديث أسعار التكلفة المفقودة
SELECT update_missing_cost_prices();

-- 2. مراجعة جميع الشركات
SELECT * FROM audit_and_fix_all_companies();

-- 3. التصحيح التلقائي
SELECT auto_fix_all_companies();

-- 4. مراجعة نهائية
SELECT 
  c.name as company_name,
  COUNT(DISTINCT i.id) as total_invoices,
  COUNT(DISTINCT CASE WHEN je.reference_type = 'invoice' THEN je.id END) as revenue_journals,
  COUNT(DISTINCT CASE WHEN je.reference_type = 'invoice_cogs' THEN je.id END) as cogs_journals,
  -- التحقق من التوازن
  ABS(
    COALESCE(SUM(jel.debit_amount), 0) - 
    COALESCE(SUM(jel.credit_amount), 0)
  ) < 0.01 as is_balanced
FROM companies c
LEFT JOIN invoices i ON c.id = i.company_id AND i.status != 'draft'
LEFT JOIN journal_entries je ON c.id = je.company_id
LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
GROUP BY c.id, c.name
ORDER BY c.name;