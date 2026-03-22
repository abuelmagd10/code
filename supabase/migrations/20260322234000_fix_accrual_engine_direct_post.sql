DROP TRIGGER IF EXISTS trg_accrual_bill ON bills;
DROP FUNCTION IF EXISTS accrual_bill_accounting;

CREATE OR REPLACE FUNCTION public.accrual_accounting_engine()
RETURNS trigger AS $$
DECLARE
  v_inventory_id UUID;
  v_purchases_id UUID;
  v_ap_id UUID;
  v_cash_id UUID;
  v_sales_id UUID;
  v_ar_id UUID;
  v_cogs_id UUID;
  v_journal_id UUID;
BEGIN
  -- إيقاف تشغيل التريجرز الأخرى مؤقتاً لتجنب التداخل العودي أو قيود التعديل (enforce_je_integrity)
  PERFORM set_config('app.allow_direct_post', 'true', true);

  -- جلب حسابات الشركة (تفترض وجود جدول ثوابت أو Accounts Mapping)
  SELECT 
    ap_account_id, ar_account_id, cash_account_id,
    inventory_account_id, cogs_account_id, sales_account_id, purchases_account_id
  INTO 
    v_ap_id, v_ar_id, v_cash_id,
    v_inventory_id, v_cogs_id, v_sales_id, v_purchases_id
  FROM company_accounting_settings
  WHERE company_id = NEW.company_id 
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE LOG 'Accounting settings missing for company_id: %', NEW.company_id;
    RETURN NEW;
  END IF;

  ------------------------------------------------------------------------------------------------
  -- ✅ 1. Soft-Delete Journals when Bill/Invoice is REVERTED (Draft / Cancelled)
  ------------------------------------------------------------------------------------------------

  -- الفواتير (Bills): إذا تم إرجاع حالة الفاتورة إلى مسودة أو إلغاؤها من حالة نشطة
  IF TG_TABLE_NAME = 'bills' AND OLD.status IN ('sent', 'received', 'paid', 'partially_paid') AND NEW.status IN ('draft', 'cancelled', 'pending_approval') THEN
    UPDATE journal_entries 
       SET is_deleted = TRUE, 
           deleted_at = NOW(),
           description = CONCAT(COALESCE(description, ''), ' [Auto Soft-Deleted: Bill reverted to ', NEW.status, ']')
     WHERE reference_type = 'bill' 
       AND reference_id = NEW.id 
       AND (is_deleted IS NULL OR is_deleted = FALSE);
    RETURN NEW;
  END IF;

  -- فواتير المبيعات (Invoices): إذا تم إرجاع حالة الفاتورة أو إلغاؤها
  IF TG_TABLE_NAME = 'invoices' AND OLD.status IN ('sent', 'paid', 'partially_paid') AND NEW.status IN ('draft', 'cancelled', 'pending_approval') THEN
    UPDATE journal_entries 
       SET is_deleted = TRUE, 
           deleted_at = NOW(),
           description = CONCAT(COALESCE(description, ''), ' [Auto Soft-Deleted: Invoice reverted to ', NEW.status, ']')
     WHERE reference_type IN ('invoice', 'invoice_cogs') 
       AND reference_id = NEW.id 
       AND (is_deleted IS NULL OR is_deleted = FALSE);
    RETURN NEW;
  END IF;

  ------------------------------------------------------------------------------------------------
  -- ✅ 2. Create Journals on Status Activations (Sent / Received)
  ------------------------------------------------------------------------------------------------

  -- فواتير الشراء: الدخول في حالة مرسلة/مستلمة
  IF TG_TABLE_NAME = 'bills' AND OLD.status NOT IN ('sent', 'received', 'paid', 'partially_paid') AND NEW.status IN ('sent', 'received') THEN
    INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, status)
    VALUES (NEW.company_id, 'bill', NEW.id, NEW.bill_date, 'Purchase - ' || NEW.bill_number, 'draft')
    RETURNING id INTO v_journal_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES 
    (v_journal_id, v_inventory_id, NEW.total_amount, 0, 'Inventory'),
    (v_journal_id, v_ap_id, 0, NEW.total_amount, 'Accounts Payable');

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  -- فواتير البيع: الدخول في حالة مرسلة
  IF TG_TABLE_NAME = 'invoices' AND OLD.status NOT IN ('sent', 'paid', 'partially_paid') AND NEW.status = 'sent' THEN
    -- A. Revenue Entry
    INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, status)
    VALUES (NEW.company_id, 'invoice', NEW.id, NEW.invoice_date, 'Sales - ' || NEW.invoice_number, 'draft')
    RETURNING id INTO v_journal_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES 
    (v_journal_id, v_ar_id, NEW.total_amount, 0, 'Accounts Receivable'),
    (v_journal_id, v_sales_id, 0, NEW.total_amount, 'Sales Revenue');

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

    -- B. COGS Entry (if total_cost > 0)
    IF NEW.total_cost > 0 THEN
      INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, status)
      VALUES (NEW.company_id, 'invoice_cogs', NEW.id, NEW.invoice_date, 'COGS - ' || NEW.invoice_number, 'draft')
      RETURNING id INTO v_journal_id;

      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES 
      (v_journal_id, v_cogs_id, NEW.total_cost, 0, 'Cost of Goods Sold'),
      (v_journal_id, v_inventory_id, 0, NEW.total_cost, 'Inventory');

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
    END IF;
  END IF;

  -- المدفوعات (Payments): الدخول في حالة منتهية
  IF TG_TABLE_NAME = 'payments' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, status)
    VALUES (NEW.company_id, 'payment', NEW.id, NEW.payment_date, 'Payment - ' || NEW.reference_number, 'draft')
    RETURNING id INTO v_journal_id;

    IF NEW.payment_type = 'incoming' THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES 
      (v_journal_id, v_cash_id, NEW.amount, 0, 'Cash In'),
      (v_journal_id, v_ar_id, 0, NEW.amount, 'Accounts Receivable Reduction');
    ELSIF NEW.payment_type = 'outgoing' THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES 
      (v_journal_id, v_ap_id, NEW.amount, 0, 'Accounts Payable Reduction'),
      (v_journal_id, v_cash_id, 0, NEW.amount, 'Cash Out');
    END IF;

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  ------------------------------------------------------------------------------------------------
  -- ✅ التأكد من تنظيف السياق للمنعقدين الآخرين
  ------------------------------------------------------------------------------------------------
  PERFORM set_config('app.allow_direct_post', 'false', true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
