DROP TRIGGER IF EXISTS trg_accrual_bill ON bills;
DROP FUNCTION IF EXISTS accrual_bill_accounting;

CREATE OR REPLACE FUNCTION public.accrual_accounting_engine()
RETURNS trigger AS $$
DECLARE
  v_ar_id UUID; v_ap_id UUID; v_revenue_id UUID; v_inventory_id UUID; v_cogs_id UUID;
  v_journal_id UUID; v_cogs_amount NUMERIC := 0;
BEGIN
  -- الحصول على الحسابات
  SELECT id INTO v_ar_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND sub_type = 'accounts_receivable' LIMIT 1;
  SELECT id INTO v_ap_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND sub_type = 'accounts_payable' LIMIT 1;
  SELECT id INTO v_revenue_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND account_type = 'income' LIMIT 1;
  SELECT id INTO v_inventory_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND sub_type = 'inventory' LIMIT 1;
  SELECT id INTO v_cogs_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND (sub_type = 'cost_of_goods_sold' OR account_code = '5000') LIMIT 1;

  -- فواتير البيع: Draft → Sent
  IF TG_TABLE_NAME = 'invoices' AND OLD.status = 'draft' AND NEW.status = 'sent' THEN
    -- حساب COGS
    SELECT SUM(ii.quantity * COALESCE(p.cost_price, 0)) INTO v_cogs_amount
    FROM invoice_items ii JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = NEW.id AND p.item_type != 'service';

    -- قيد الإيراد + COGS - تعديل لتجنب DIRECT_POST_BLOCKED (إنشاء draft ثم posted)
    INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, status)
    VALUES (NEW.company_id, 'invoice', NEW.id, NEW.invoice_date, 'Sale - ' || NEW.invoice_number, 'draft')
    RETURNING id INTO v_journal_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES 
    (v_journal_id, v_ar_id, NEW.total_amount, 0, 'Accounts Receivable'),
    (v_journal_id, v_revenue_id, 0, NEW.total_amount, 'Sales Revenue');

    -- COGS إذا كان > 0
    IF v_cogs_amount > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES 
      (v_journal_id, v_cogs_id, v_cogs_amount, 0, 'Cost of Goods Sold'),
      (v_journal_id, v_inventory_id, 0, v_cogs_amount, 'Inventory');
    END IF;

    -- الاعتماد
    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  -- فواتير الشراء: Draft → Sent
  IF TG_TABLE_NAME = 'bills' AND OLD.status = 'draft' AND NEW.status IN ('sent', 'received') THEN
    -- تعديل لتجنب DIRECT_POST_BLOCKED (إنشاء draft ثم posted)
    INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, status)
    VALUES (NEW.company_id, 'bill', NEW.id, NEW.bill_date, 'Purchase - ' || NEW.bill_number, 'draft')
    RETURNING id INTO v_journal_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES 
    (v_journal_id, v_inventory_id, NEW.total_amount, 0, 'Inventory'),
    (v_journal_id, v_ap_id, 0, NEW.total_amount, 'Accounts Payable');

    -- الاعتماد
    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
