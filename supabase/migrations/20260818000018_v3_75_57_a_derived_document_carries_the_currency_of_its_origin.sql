-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.57 — **والمستندُ المُشتَقُّ يحملُ عملةَ أصلِه، ومَن أنشأَ يقرأُ لا يخترع**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- v3.75.56 فتحت البيتَ الواحدَ `erp_company_base_currency` للمستخدِمِ المسجَّل،
-- **ولم تُسدِّدْ كاتباً واحداً**. وهذه الدفعةُ تُتِمُّ ما فتحَته: أربعةُ كُتّابٍ
-- **بصلاحيّاتِ مُنادِيهم** صاروا يقرأون الأساسَ بدَلَ أن يخترعوه.
--
--   create_customer_debit_note  (١٢ وسيطاً)  ← شقيقةٌ أبرد
--   create_customer_debit_note  (١٣ وسيطاً)  ← **الشاشةُ تنادى هذه**
--   create_sales_order_atomic                 app/api/invoices/route.ts:431
--   create_vendor_credit_with_items           app/vendor-credits/new/page.tsx:263
--
-- **والطرقُ الثلاثُ ساخنة** — لا أبوابٌ باردة. وقِيس الأثرُ قبلَ أن يُمَسَّ حرف:
-- ٢١ أمرَ بيعٍ · ٢ إشعارَ دائنٍ · ٠ إشعارَ مَدين — **ولا صفَّ بعمودٍ فارغ، ولا
-- صفَّ موسومٌ بغيرِ أساسِ شركتِه**. فالعطبُ ميكانيزمٌ حىٌّ لا خسارةٌ واقعة.
--
-- ── وإشعارُ المَدينِ كان مكسوراً من طرفَيه ──────────────────────────────────
--
-- كانت النسختانِ تختارانِ العملةَ هكذا:
--
--     IF p_currency_id IS NULL THEN v_original_currency := 'EGP';        ← اختراع
--     ELSE SELECT code INTO v_original_currency FROM currencies WHERE id = p_currency_id;
--
-- **والفرعُ الثانى لا يُمكِنُ أن ينجحَ أبداً**: جدولُ `currencies` موجودٌ وفيه
-- **صفرُ صفوف**، والشاشةُ تُمرِّرُ **مُعرِّفَ سعرِ صرف** فى مكانِ مُعرِّفِ العملة
-- (`sourceInvoice?.exchange_rate_id`)، وتقاطعُ المُعرِّفاتِ بينَ الجدولَين صفر.
-- فالنتيجةُ أنّ كِلا الفرعَينِ خطأ: فراغٌ أو اختراع، **ولا مسارَ ثالثَ يكتبُ الصدق**.
--
-- **ولا يُصلَحُ عطبٌ بعطبٍ آخَر**: فلو استُبدِلَ «الجنيه» بالبيتِ الواحدِ وحدَه
-- لبقىَ الفرعُ الآخَرُ يكتبُ فراغاً — **ونصفُ جراحةٍ أسوأُ من لا جراحة**. فيُنزَعُ
-- الفرعانِ معاً ويحلُّ محلَّهما الحكمُ الصادق: **عملةُ فاتورتِه، وإن سكتت فأساسُ
-- شركتِه من صفِّها** — وهو مذهبُ إشعارِ الدائنِ من مرتجعِه نفسُه (v3.75.54).
--
-- وقراءةُ الفاتورةِ تجرى **بصلاحيّاتِ مُنادِيها**، فحمايةُ الصفوفِ تحكمُها: مَن
-- مرَّرَ فاتورةَ شركةٍ أخرى لا يراها، فلا صفَّ يعود، فيرتدُّ إلى أساسِ شركتِه هو.
-- **ولا يُولَدُ كاشفُ وجود.**
--
-- ── ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه ────────────────────────────────────────
--
-- منحةُ v3.75.56 كانت **تُعَدُّ وتُعرَضُ ولا تُشترَط**، إذ لم يكن كاتبٌ يعتمدُ
-- عليها. واليومَ يعتمدُ عليها أربعةٌ — **فنزعُها يكسرُ إنشاءَ أمرِ بيعٍ وإشعارِ
-- دائنٍ وإشعارِ مَدين**. فيُبدَّلُ فحصُ v3.75.56 ليشترطَها لا ليخبِرَ عنها.
-- والشرطُ **صادقٌ قبلَ هذه الدفعةِ وبعدَها**، فلا لحظةَ ترفضُها القاعدة.
--
-- ── وحارسٌ صرخَ فكشفَ ما لم يكن يراه أحد ──────────────────────────────────
--
-- كُتب فى هذه الدفعةِ شرطٌ يقول «لا يبلغُ هؤلاءِ الكُتّابَ زائرٌ ولا عمومُ الأدوار»،
-- **فرفضَ الشرطُ عندَ أوّلِ تشغيل**. والقياسُ قالَ لماذا: الأربعةُ **يبلغُهم
-- `anon` — الزائرُ غيرُ المسجَّلِ الدخول** — ونسختا إشعارِ المَدينِ وإشعارُ
-- الدائنِ يبلغُهم `PUBLIC` كذلك. وذلك قائمٌ من قبلِ هذه الدفعةِ ولم تُحدِثْه.
--
-- **ولم يكن حارسٌ واحدٌ فى المشروعِ يراهم**: الحرّاسُ الذين يحاكمون ما يبلغُه
-- الزائرُ يحاكمون **دوالَّ الصلاحيّاتِ الكاملةِ وحدَها** (بلا طارق ١٢١ · بلا قفل
-- ١٠٠ · الكاتباتُ بلا سؤال)، وهؤلاء **بصلاحيّاتِ مُنادِيهم** فسقطوا من كلِّ شبكة.
-- **وبحثٌ لا يجد ليس دليلَ غياب.**
--
-- **ولم يُثبَتْ بابٌ مفتوح**: الجداولُ الثلاثةُ عليها حمايةُ صفوفٍ مفعَّلة،
-- وسياساتُها تسرى على الزائرِ وهو بلا هويّة — فالقفلُ خلفَ البابِ قائم. لكنّها
-- **منحةٌ لا داعىَ لها على كاتب**، ومذهبُ أقلِّ الصلاحيّاتِ ينزعُها. فتُنزَع،
-- **والمستخدِمُ المسجَّلُ يبقى كما هو فلا شاشةَ تتأثّر**. وقِيس قبلَ النزع: لا
-- مُنادِىَ لهؤلاءِ الأربعةِ إلّا أربعةُ مواضعَ فى الشيفرةِ كلُّها خلفَ تسجيلِ دخول.
--
-- **ومعدودٌ لا مسكوتٌ عنه** — والعددُ أوسعُ من أربعة، وقِيس على البيتَين فاتّفقا:
--
--     دوالُّ يبلغُها الزائر .................  ٤٠١
--     منها **تكتب** ........................  ٣٢   ← كلُّها بصلاحيّاتِ مُنادِيها
--     منها بصلاحيّاتٍ كاملة ................   ٠   ← فحرّاسُ الدفاترِ سليمون
--     تُغلَقُ هنا ...........................   ٤
--     يبقى معدوداً ........................  ٢٨
--
-- **والثمانيةُ والعشرون تُسدَّدُ بحارسٍ يراهم، لا بنزعٍ صامتٍ هنا**: نزعُ منحةٍ
-- عن دالّةٍ لم تُقرأْ حكمٌ على موضعٍ لم يُقرَأ. فيُبنى لهم حارسٌ بفخٍّ ذاتىٍّ فى
-- v3.75.58، **ولا يُبنى بيتٌ ثانٍ ولا يُخلَطُ عطبٌ بعطب**.
--
-- ── وما لم يُمَسَّ ولماذا ──────────────────────────────────────────────────
--
-- (١) `search_path` غيرُ المضبوطِ فى ثلاثةٍ من الأربعةِ **عطبٌ مستقلٌّ يُسدَّدُ
--     بدفعتِه — ولا يُخلَطُ عطبٌ بعطب**. وهنّ بصلاحيّاتِ مُنادِيهنّ، فحمايةُ
--     الصفوفِ تحرسُهنّ، والنداءاتُ المُضافةُ هنا كلُّها مؤهَّلةٌ بـ`public.`.
-- (٢) `p_currency_id` يبقى وسيطاً ويبقى يُكتَبُ فى عمودِ `currency_id` كما كان
--     — **لم يُغيَّرْ توقيعٌ ولا حُذفَ عمود**. الذى تغيّرَ اشتقاقُ نصِّ العملةِ وحدَه.
-- (٣) جدولُ `currencies` الفارغُ يُترَكُ كما هو: **معدودٌ لا مسكوتٌ عنه**، ومَلؤه
--     أو نزعُه قرارُ بياناتٍ لا جراحةُ شيفرة.
-- (٤) وثغرةُ حارسِ الشيفرةِ عن شكلِ الارتداد `X || 'EGP'` **مقيسةٌ ومُعلَنة**،
--     وتُسدَّدُ فى v3.75.58 بدفعتِها — ولا تُدَسُّ هنا.
--
-- طُبِّقت على البيتَين، وتُقاسُ بالتطابقِ حرفاً بحرف.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- إشعارُ المَدين (١٢ وسيطاً) — الشقيقةُ الأبرد، وتُسدَّدُ كالطريقِ الساخن
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_customer_debit_note(p_company_id uuid, p_branch_id uuid, p_cost_center_id uuid, p_customer_id uuid, p_source_invoice_id uuid, p_debit_note_date date, p_reference_type character varying, p_reason text, p_items jsonb, p_notes text DEFAULT NULL::text, p_currency_id uuid DEFAULT NULL::uuid, p_exchange_rate numeric DEFAULT 1)
 RETURNS TABLE(debit_note_id uuid, debit_note_number character varying, total_amount numeric, journal_entry_id uuid, success boolean, message text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_debit_note_id UUID;
  v_debit_note_number VARCHAR(50);
  v_journal_entry_id UUID;
  v_subtotal DECIMAL(15,2) := 0;
  v_tax_amount DECIMAL(15,2) := 0;
  v_total_amount DECIMAL(15,2) := 0;
  v_item JSONB;
  v_line_total DECIMAL(15,2);
  v_line_tax DECIMAL(15,2);
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_customer_name TEXT;
  v_invoice_number TEXT;
  v_original_currency VARCHAR(3);
BEGIN
  IF p_company_id IS NULL OR p_customer_id IS NULL OR p_source_invoice_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::UUID, FALSE, 
      'Missing required fields: company_id, customer_id, or source_invoice_id';
    RETURN;
  END IF;
  
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::UUID, FALSE, 
      'At least one item is required';
    RETURN;
  END IF;
  
  SELECT c.name INTO v_customer_name FROM customers c WHERE c.id = p_customer_id;
  SELECT i.invoice_number INTO v_invoice_number FROM invoices i WHERE i.id = p_source_invoice_id;
  
  IF v_customer_name IS NULL OR v_invoice_number IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::UUID, FALSE, 
      'Customer or invoice not found';
    RETURN;
  END IF;
  
  v_debit_note_number := generate_customer_debit_note_number(p_company_id);
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_total := (v_item->>'quantity')::DECIMAL * (v_item->>'unit_price')::DECIMAL;
    v_line_tax := v_line_total * COALESCE((v_item->>'tax_rate')::DECIMAL, 0) / 100;
    v_subtotal := v_subtotal + v_line_total;
    v_tax_amount := v_tax_amount + v_line_tax;
  END LOOP;
  
  v_total_amount := v_subtotal + v_tax_amount;
  
  -- v3.75.57: عملةُ الإشعارِ عملةُ فاتورتِه، وإن سكتت فأساسُ شركتِه من صفِّها.
  SELECT NULLIF(btrim(i.original_currency), '')
    INTO v_original_currency
    FROM public.invoices i
   WHERE i.id = p_source_invoice_id;
  v_original_currency := COALESCE(v_original_currency,
                                  public.erp_company_base_currency(p_company_id));
  
  INSERT INTO customer_debit_notes (
    company_id, branch_id, cost_center_id, customer_id, debit_note_number, debit_note_date,
    source_invoice_id, subtotal, tax_amount, total_amount, applied_amount, currency_id,
    original_currency, original_subtotal, original_tax_amount, original_total_amount,
    exchange_rate, status, reference_type, reason, notes
  ) VALUES (
    p_company_id, p_branch_id, p_cost_center_id, p_customer_id, v_debit_note_number, p_debit_note_date,
    p_source_invoice_id, v_subtotal, v_tax_amount, v_total_amount, 0, p_currency_id,
    v_original_currency, v_subtotal, v_tax_amount, v_total_amount,
    p_exchange_rate, 'open', p_reference_type, p_reason, p_notes
  ) RETURNING id INTO v_debit_note_id;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_total := (v_item->>'quantity')::DECIMAL * (v_item->>'unit_price')::DECIMAL;
    INSERT INTO customer_debit_note_items (
      customer_debit_note_id, product_id, description, quantity, unit_price, tax_rate, line_total, item_type
    ) VALUES (
      v_debit_note_id, (v_item->>'product_id')::UUID, v_item->>'description',
      (v_item->>'quantity')::DECIMAL, (v_item->>'unit_price')::DECIMAL,
      COALESCE((v_item->>'tax_rate')::DECIMAL, 0), v_line_total, COALESCE(v_item->>'item_type', 'charge')
    );
  END LOOP;
  
  SELECT account_id INTO v_ar_account_id FROM profit_distribution_settings
  WHERE company_id = p_company_id AND setting_key = 'accounts_receivable_account';
  
  SELECT account_id INTO v_revenue_account_id FROM profit_distribution_settings
  WHERE company_id = p_company_id AND setting_key = 'sales_account';
  
  IF v_ar_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
    INSERT INTO journal_entries (
      company_id, branch_id, cost_center_id, reference_type, reference_id, entry_date, description, status
    ) VALUES (
      p_company_id, p_branch_id, p_cost_center_id, 'customer_debit', v_debit_note_id, p_debit_note_date,
      'Customer Debit Note ' || v_debit_note_number || ' - ' || v_customer_name || ' - Invoice ' || v_invoice_number, 'posted'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id)
    VALUES (v_journal_entry_id, v_ar_account_id, v_total_amount * p_exchange_rate, 0, 'AR - Customer Debit Note ' || v_debit_note_number, p_branch_id, p_cost_center_id);

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id)
    VALUES (v_journal_entry_id, v_revenue_account_id, 0, v_total_amount * p_exchange_rate, 'Revenue - Customer Debit Note ' || v_debit_note_number, p_branch_id, p_cost_center_id);

    UPDATE customer_debit_notes SET journal_entry_id = v_journal_entry_id WHERE id = v_debit_note_id;

    RETURN QUERY SELECT v_debit_note_id, v_debit_note_number, v_total_amount, v_journal_entry_id, TRUE,
      'Customer debit note created successfully with journal entry';
  ELSE
    RETURN QUERY SELECT v_debit_note_id, v_debit_note_number, v_total_amount, NULL::UUID, TRUE,
      'Customer debit note created successfully (no journal entry - accounts not configured)';
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::UUID, FALSE,
      'Error creating customer debit note: ' || SQLERRM;
END;
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- إشعارُ المَدين (١٣ وسيطاً) — **الطريقُ الذى تسيرُ عليه العجلات**
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_customer_debit_note(p_company_id uuid, p_branch_id uuid, p_cost_center_id uuid, p_customer_id uuid, p_source_invoice_id uuid, p_debit_note_date date, p_reference_type character varying, p_reason text, p_items jsonb, p_notes text DEFAULT NULL::text, p_currency_id uuid DEFAULT NULL::uuid, p_exchange_rate numeric DEFAULT 1, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(debit_note_id uuid, debit_note_number character varying, total_amount numeric, approval_status character varying, success boolean, message text)
 LANGUAGE plpgsql
AS $function$ DECLARE v_debit_note_id UUID; v_debit_note_number VARCHAR(50); v_subtotal DECIMAL(15,2) := 0; v_tax_amount DECIMAL(15,2) := 0; v_total_amount DECIMAL(15,2) := 0; v_item JSONB; v_line_total DECIMAL(15,2); v_line_tax DECIMAL(15,2); v_customer_name TEXT; v_invoice_number TEXT; v_original_currency VARCHAR(3); v_approval_status VARCHAR(20) := 'draft'; BEGIN IF p_company_id IS NULL OR p_customer_id IS NULL OR p_source_invoice_id IS NULL THEN RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::VARCHAR(20), FALSE, 'Missing required fields: company_id, customer_id, or source_invoice_id'; RETURN; END IF; IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::VARCHAR(20), FALSE, 'At least one item is required'; RETURN; END IF; SELECT c.name INTO v_customer_name FROM customers c WHERE c.id = p_customer_id; SELECT i.invoice_number INTO v_invoice_number FROM invoices i WHERE i.id = p_source_invoice_id; IF v_customer_name IS NULL OR v_invoice_number IS NULL THEN RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::VARCHAR(20), FALSE, 'Customer or invoice not found'; RETURN; END IF; v_debit_note_number := generate_customer_debit_note_number(p_company_id); FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP v_line_total := (v_item->>'quantity')::DECIMAL * (v_item->>'unit_price')::DECIMAL; v_line_tax := v_line_total * COALESCE((v_item->>'tax_rate')::DECIMAL, 0) / 100; v_subtotal := v_subtotal + v_line_total; v_tax_amount := v_tax_amount + v_line_tax; END LOOP; v_total_amount := v_subtotal + v_tax_amount; SELECT NULLIF(btrim(i.original_currency), '') INTO v_original_currency FROM public.invoices i WHERE i.id = p_source_invoice_id; v_original_currency := COALESCE(v_original_currency, public.erp_company_base_currency(p_company_id)); INSERT INTO customer_debit_notes (company_id, branch_id, cost_center_id, customer_id, debit_note_number, debit_note_date, source_invoice_id, subtotal, tax_amount, total_amount, applied_amount, currency_id, original_currency, original_subtotal, original_tax_amount, original_total_amount, exchange_rate, status, approval_status, reference_type, reason, notes, created_by) VALUES (p_company_id, p_branch_id, p_cost_center_id, p_customer_id, v_debit_note_number, p_debit_note_date, p_source_invoice_id, v_subtotal, v_tax_amount, v_total_amount, 0, p_currency_id, v_original_currency, v_subtotal, v_tax_amount, v_total_amount, p_exchange_rate, 'open', 'draft', p_reference_type, p_reason, p_notes, p_created_by) RETURNING id INTO v_debit_note_id; FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP v_line_total := (v_item->>'quantity')::DECIMAL * (v_item->>'unit_price')::DECIMAL; INSERT INTO customer_debit_note_items (customer_debit_note_id, product_id, description, quantity, unit_price, tax_rate, line_total, item_type) VALUES (v_debit_note_id, (v_item->>'product_id')::UUID, v_item->>'description', (v_item->>'quantity')::DECIMAL, (v_item->>'unit_price')::DECIMAL, COALESCE((v_item->>'tax_rate')::DECIMAL, 0), v_line_total, COALESCE(v_item->>'item_type', 'charge')); END LOOP; RETURN QUERY SELECT v_debit_note_id, v_debit_note_number, v_total_amount, v_approval_status, TRUE, 'Customer debit note created successfully as DRAFT. Submit for approval before applying.'; EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::VARCHAR(20), FALSE, 'Error creating customer debit note: ' || SQLERRM; END; $function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- أمرُ البيع — يُقرَأُ الأساسُ من صفِّ شركةِ الحمولة
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_sales_order_atomic(p_so_data jsonb, p_so_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_so_id     uuid;
  v_so_number text;
  v_item      jsonb;
  v_base      text;
BEGIN
  -- v3.75.57: **ولا تُخترَعُ عملة** — تُقرأُ من صفِّ الشركةِ التى تُنشَأُ لها.
  -- ورقمُ شركةٍ فارغٌ يرفعُ هنا بدَلَ أن يرفعَ فى الإدراج: الرفضُ واحدٌ ولا صفَّ يُكتَب.
  v_base := public.erp_company_base_currency((p_so_data->>'company_id')::uuid);

  INSERT INTO sales_orders (
    company_id, customer_id, so_date, due_date, status,
    subtotal, tax_amount, discount_amount, shipping_charge, shipping_tax,
    adjustment, total, total_amount, currency, exchange_rate, total_base,
    tax_inclusive, discount_type, discount_value, discount_position,
    shipping, shipping_tax_rate, shipping_provider_id, notes,
    branch_id, cost_center_id, warehouse_id, created_by_user_id
  )
  SELECT
    (p_so_data->>'company_id')::uuid,
    NULLIF(p_so_data->>'customer_id', '')::uuid,
    COALESCE((p_so_data->>'so_date')::date, CURRENT_DATE),
    (p_so_data->>'due_date')::date,
    COALESCE(NULLIF(p_so_data->>'status', ''), 'draft'),
    COALESCE((p_so_data->>'subtotal')::numeric, 0),
    COALESCE((p_so_data->>'tax_amount')::numeric, 0),
    COALESCE((p_so_data->>'discount_amount')::numeric, 0),
    COALESCE((p_so_data->>'shipping_charge')::numeric, 0),
    COALESCE((p_so_data->>'shipping_tax')::numeric, 0),
    COALESCE((p_so_data->>'adjustment')::numeric, 0),
    COALESCE((p_so_data->>'total')::numeric, 0),
    COALESCE((p_so_data->>'total_amount')::numeric, 0),
    COALESCE(NULLIF(p_so_data->>'currency', ''), v_base),
    COALESCE(NULLIF((p_so_data->>'exchange_rate')::numeric, 0), 1),
    COALESCE((p_so_data->>'total_base')::numeric, 0),
    COALESCE((p_so_data->>'tax_inclusive')::boolean, FALSE),
    NULLIF(p_so_data->>'discount_type', ''),
    COALESCE((p_so_data->>'discount_value')::numeric, 0),
    NULLIF(p_so_data->>'discount_position', ''),
    COALESCE((p_so_data->>'shipping')::numeric, 0),
    COALESCE((p_so_data->>'shipping_tax_rate')::numeric, 0),
    NULLIF(p_so_data->>'shipping_provider_id', '')::uuid,
    NULLIF(p_so_data->>'notes', ''),
    NULLIF(p_so_data->>'branch_id', '')::uuid,
    NULLIF(p_so_data->>'cost_center_id', '')::uuid,
    NULLIF(p_so_data->>'warehouse_id', '')::uuid,
    NULLIF(p_so_data->>'created_by_user_id', '')::uuid
  RETURNING id, so_number INTO v_so_id, v_so_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_so_items) LOOP
    INSERT INTO sales_order_items (
      sales_order_id, product_id, quantity, unit_price, tax_rate,
      discount_percent, subtotal, tax_amount, total, line_total,
      description, item_type
    ) VALUES (
      v_so_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      COALESCE((v_item->>'quantity')::numeric, 0),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'tax_rate')::numeric, 0),
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      COALESCE((v_item->>'subtotal')::numeric, 0),
      COALESCE((v_item->>'tax_amount')::numeric, 0),
      COALESCE((v_item->>'total')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0),
      NULLIF(v_item->>'description', ''),
      COALESCE(NULLIF(v_item->>'item_type', ''), 'product')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'sales_order_id', v_so_id,
    'so_number', v_so_number
  );
END;
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- إشعارُ الدائنِ اليدوىّ — كذلك، بعدَ حارسَىِ الحمولة
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_vendor_credit_with_items(p_credit jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_id UUID;
  v_item JSONB;
  v_count INT;
  v_base TEXT;
BEGIN
  IF p_credit IS NULL OR jsonb_typeof(p_credit) <> 'object' THEN
    RAISE EXCEPTION 'p_credit must be a JSON object';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  -- v3.75.57: **ولا تُخترَعُ عملة** — تُقرأُ من صفِّ الشركةِ التى يُنشَأُ لها.
  v_base := public.erp_company_base_currency((p_credit->>'company_id')::UUID);

  -- الأعمدة مذكورةٌ بأسمائها لا مُمرَّرة كما جاءت: جسمٌ يُكتب كما هو يسمح
  -- للمُرسِل أن يضع ما لم يُقصد (درس check-request-body-written-raw).
  INSERT INTO public.vendor_credits (
    company_id, supplier_id, credit_number, credit_date,
    subtotal, tax_amount, total_amount,
    discount_type, discount_value, discount_position, tax_inclusive,
    shipping, shipping_tax_rate, adjustment, notes,
    original_currency, original_subtotal, original_tax_amount,
    original_total_amount, exchange_rate_used, exchange_rate_id,
    branch_id, cost_center_id,
    status, applied_amount,
    bill_id, source_purchase_invoice_id, source_purchase_return_id,
    reference_type, reference_id, journal_entry_id,
    created_by_user_id
  ) VALUES (
    (p_credit->>'company_id')::UUID,
    (p_credit->>'supplier_id')::UUID,
     p_credit->>'credit_number',
    (p_credit->>'credit_date')::DATE,
    COALESCE((p_credit->>'subtotal')::NUMERIC, 0),
    COALESCE((p_credit->>'tax_amount')::NUMERIC, 0),
    COALESCE((p_credit->>'total_amount')::NUMERIC, 0),
     p_credit->>'discount_type',
    COALESCE((p_credit->>'discount_value')::NUMERIC, 0),
     p_credit->>'discount_position',
    COALESCE((p_credit->>'tax_inclusive')::BOOLEAN, false),
    COALESCE((p_credit->>'shipping')::NUMERIC, 0),
    COALESCE((p_credit->>'shipping_tax_rate')::NUMERIC, 0),
    COALESCE((p_credit->>'adjustment')::NUMERIC, 0),
     p_credit->>'notes',
    COALESCE(p_credit->>'original_currency', v_base),
    (p_credit->>'original_subtotal')::NUMERIC,
    (p_credit->>'original_tax_amount')::NUMERIC,
    (p_credit->>'original_total_amount')::NUMERIC,
    COALESCE((p_credit->>'exchange_rate_used')::NUMERIC, 1),
    (p_credit->>'exchange_rate_id')::UUID,
    (p_credit->>'branch_id')::UUID,
    (p_credit->>'cost_center_id')::UUID,
    COALESCE(p_credit->>'status', 'open'),
    COALESCE((p_credit->>'applied_amount')::NUMERIC, 0),
    (p_credit->>'bill_id')::UUID,
    (p_credit->>'source_purchase_invoice_id')::UUID,
    (p_credit->>'source_purchase_return_id')::UUID,
     p_credit->>'reference_type',
    (p_credit->>'reference_id')::UUID,
    (p_credit->>'journal_entry_id')::UUID,
    auth.uid()
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.vendor_credit_items (
      vendor_credit_id, product_id, description, quantity, unit_price,
      tax_rate, tax_code_id, discount_percent, account_id, line_total
    ) VALUES (
      v_id,
      (v_item->>'product_id')::UUID,
       v_item->>'description',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE((v_item->>'tax_rate')::NUMERIC, 0),
      (v_item->>'tax_code_id')::UUID,
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0),
      (v_item->>'account_id')::UUID,
      (v_item->>'line_total')::NUMERIC
    );
  END LOOP;

  -- إشعارٌ برأسٍ بلا بند هو ما جاءت هذه الدالة لتمنعه. فإن أُرسلت سطورٌ
  -- ولم تُدرَج، تسقط العملية كلها بدل أن يبقى الرأس مُرحَّلاً وحده.
  SELECT count(*) INTO v_count FROM public.vendor_credit_items WHERE vendor_credit_id = v_id;
  IF jsonb_array_length(p_items) > 0 AND v_count <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'vendor credit % : % line(s) sent but % stored', v_id, jsonb_array_length(p_items), v_count;
  END IF;

  RETURN v_id;
END;
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- تضييقٌ لا توسيع — يُنزَعُ عن الزائرِ وعمومِ الأدوار، والمسجَّلُ يبقى كما هو
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_customer_debit_note(uuid, uuid, uuid, uuid, uuid, date, character varying, text, jsonb, text, uuid, numeric)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_customer_debit_note(uuid, uuid, uuid, uuid, uuid, date, character varying, text, jsonb, text, uuid, numeric, uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_sales_order_atomic(jsonb, jsonb)                                                                                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_vendor_credit_with_items(jsonb, jsonb)                                                                                  FROM PUBLIC, anon;

-- **ولا يُنزَعُ ما تحتاجُه الشاشة**: المستخدِمُ المسجَّلُ يبقى ممنوحاً صراحةً،
-- فلا يعتمدُ بقاؤه على ما ورِثَه من عمومِ الأدوار.
GRANT EXECUTE ON FUNCTION public.create_customer_debit_note(uuid, uuid, uuid, uuid, uuid, date, character varying, text, jsonb, text, uuid, numeric)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_debit_note(uuid, uuid, uuid, uuid, uuid, date, character varying, text, jsonb, text, uuid, numeric, uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order_atomic(jsonb, jsonb)                                                                                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vendor_credit_with_items(jsonb, jsonb)                                                                               TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- فحصُ v3.75.56 — المنحةُ صارت شرطاً لا خبَراً، وما سواه كما هو
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_56_check()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n_invoker int;
  n_rls     int;
  n_open    int;
  n_self    int;
  n_auth    int;
BEGIN
  -- (أ) البيتُ الواحدُ **بصلاحيّاتِ مُنادِيه** — فمن ناداه جرى بحقِّه هو لا بحقِّ
  --     سواه، وحمايةُ الصفوفِ تحكمُه كما تحكمُ قراءتَه المباشرةَ من الجدول.
  SELECT count(*) INTO n_invoker
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'erp_company_base_currency'
    AND NOT p.prosecdef;
  IF n_invoker <> 1 THEN
    RAISE EXCEPTION 'v3.75.56: البيتُ الواحدُ ليس بصلاحيّاتِ مُنادِيه — فمنحُه لمستخدِمٍ يفتحُ له صفوفَ غيرِه';
  END IF;

  -- (ب) وجدولُ الشركاتِ محمىٌّ بحمايةِ الصفوف — **وهى الحارسُ الحقيقىُّ لا المنحة**
  SELECT count(*) INTO n_rls
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relname = 'companies' AND c.relrowsecurity;
  IF n_rls <> 1 THEN
    RAISE EXCEPTION 'v3.75.56: رُفعت حمايةُ الصفوفِ عن companies — فالبيتُ الممنوحُ يصيرُ باباً مفتوحاً';
  END IF;

  -- (ج) ولا يبلغُه زائرٌ ولا عمومُ الأدوار — **والمسجَّلُ وحدَه معلَنٌ ومقصود**
  SELECT count(*) INTO n_open
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'erp_company_base_currency'
    AND grantee IN ('PUBLIC', 'anon');
  IF n_open <> 0 THEN
    RAISE EXCEPTION 'v3.75.56: % صلاحيّةً على البيتِ لزائرٍ أو لعمومِ الأدوار', n_open;
  END IF;

  -- (د) ولا يُمنَحُ هذا الفحصُ نفسُه لأحدٍ سوى مفتاحِ الخدمة
  SELECT count(*) INTO n_self
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'assert_baseline_v3_75_56_check'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n_self <> 0 THEN
    RAISE EXCEPTION 'v3.75.56: % صلاحيّةً مفتوحةً على هذا الفحصِ نفسِه', n_self;
  END IF;

  -- (هـ) **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**: كانت هذه المنحةُ تُعَدُّ وتُعرَضُ ولا
  --     تُشترَط، إذ لم يكن كاتبٌ يعتمدُ عليها. وv3.75.57 جعلت أربعةَ كُتّابٍ
  --     بصلاحيّاتِ مُنادِيهم ينادون البيتَ الواحد، **فنزعُها اليومَ يكسرُ إنشاءَ
  --     أمرِ بيعٍ وإشعارِ دائنٍ وإشعارِ مَدين**. فصارت شرطاً لا خبَراً.
  SELECT count(*) INTO n_auth
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'erp_company_base_currency'
    AND grantee = 'authenticated';
  IF n_auth <> 1 THEN
    RAISE EXCEPTION 'v3.75.57: منحةُ التنفيذِ على البيتِ الواحدِ للمستخدِمِ المسجَّلِ = % لا واحدة — وأربعةُ كُتّابٍ بصلاحيّاتِ مُنادِيهم يعتمدون عليها', n_auth;
  END IF;

  RETURN 'v3.75.56 ok - بصلاحيّاتِ مُنادِيه=' || n_invoker
         || ' · حمايةُ صفوفِ الشركات=' || n_rls
         || ' · لزائرٍ أو لعموم=' || n_open
         || ' · الفحصُ مغلَق=' || n_self
         || ' · وللمستخدِمِ المسجَّل=' || n_auth || ' (مُثبَّتٌ منذ v3.75.57)';
END
$function$
;

-- ───────────────────────────────────────────────────────────────────────────
-- التوكيدُ المولود — يُحاكِمُ الأربعةَ بالخاصّيّةِ لا بالاسم
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_57_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $chk$
DECLARE
  n         int;
  n_invoker int;
  n_open    int;
  n_auth    int;
  n_self    int;
  n_so      bigint; n_so_blank bigint; n_so_bad bigint;
  n_vc      bigint; n_vc_blank bigint; n_vc_bad bigint;
  n_dn      bigint; n_dn_blank bigint; n_dn_bad bigint;
  v_names   text[] := ARRAY['create_customer_debit_note',
                            'create_sales_order_atomic',
                            'create_vendor_credit_with_items'];
BEGIN
  -- (أ) لا جسدَ من الأربعةِ يُسمّى عملةً بعينِها — والتعليقُ محجوبٌ قبلَ الحكم
  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = ANY(v_names)
    AND regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g') ~ '''(EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)''';
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.57: % من الكُتّابِ عادَ يُسمّى عملةً بعينِها', n;
  END IF;

  -- (ب) وكلٌّ ينادى البيتَ **بالوسيطِ الذى يُعطاه هو** — والذِّكرُ ليس نداءً،
  --     **وشكلُ النداءِ خاصّيّةٌ فى صاحبِه لا قالبٌ واحدٌ للجميع**.
  SELECT count(*) INTO n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'create_customer_debit_note'
    AND p.prosrc LIKE '%erp_company_base_currency(p_company_id)%';
  IF n <> 2 THEN
    RAISE EXCEPTION 'v3.75.57: نسختا إشعارِ المَدينِ تناديانِ البيتَ % لا اثنتين', n;
  END IF;

  SELECT count(*) INTO n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'create_sales_order_atomic'
    AND p.prosrc LIKE '%erp_company_base_currency((p_so_data->>''company_id'')::uuid)%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'v3.75.57: أمرُ البيعِ لا ينادى البيتَ برقمِ الشركةِ من حمولتِه';
  END IF;

  SELECT count(*) INTO n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'create_vendor_credit_with_items'
    AND p.prosrc LIKE '%erp_company_base_currency((p_credit->>''company_id'')::UUID)%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'v3.75.57: إشعارُ الدائنِ اليدوىُّ لا ينادى البيتَ برقمِ الشركةِ من حمولتِه';
  END IF;

  -- (ج) ونسختا إشعارِ المَدينِ ترثانِ عملةَ فاتورتِهما، ولا تقرآنِ الجدولَ الفارغ
  SELECT count(*) INTO n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'create_customer_debit_note'
    AND p.prosrc LIKE '%FROM public.invoices i%';
  IF n <> 2 THEN
    RAISE EXCEPTION 'v3.75.57: % من نسختَى إشعارِ المَدينِ ترثُ عملةَ فاتورتِها لا اثنتان', n;
  END IF;

  SELECT count(*) INTO n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'create_customer_debit_note'
    AND regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g') ~ '\mcurrencies\M';
  IF n <> 0 THEN
    RAISE EXCEPTION 'v3.75.57: إشعارُ المَدينِ عادَ يقرأُ الجدولَ الفارغَ currencies — فيكتبُ فراغاً';
  END IF;

  -- (د) والأربعةُ **بصلاحيّاتِ مُنادِيهم**: حمايةُ الصفوفِ تحكمُهم، ونداؤهم للبيتِ
  --     قائمٌ على المنحةِ المُعلَنة. **ولو صاروا بصلاحيّاتٍ كاملةٍ لتغيّرَ الحكمُ كلُّه.**
  SELECT count(*) INTO n_invoker FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY(v_names) AND NOT p.prosecdef;
  IF n_invoker <> 4 THEN
    RAISE EXCEPTION 'v3.75.57: % بصلاحيّاتِ مُنادِيهم لا أربعة — والحكمُ يتغيّرُ بتغيّرِ الخاصّيّة', n_invoker;
  END IF;

  -- (هـ) ولا يبلغُهم زائرٌ ولا عمومُ الأدوار
  SELECT count(*) INTO n_open FROM information_schema.routine_privileges
  WHERE routine_schema = 'public' AND routine_name = ANY(v_names) AND grantee IN ('PUBLIC', 'anon');
  IF n_open <> 0 THEN
    RAISE EXCEPTION 'v3.75.57: % صلاحيّةً على الكُتّابِ لزائرٍ أو لعمومِ الأدوار', n_open;
  END IF;

  -- (هـ٢) **ولا يُنزَعُ ما تحتاجُه الشاشة**: المستخدِمُ المسجَّلُ ما زال يبلغُهم
  --     صراحةً — فالتضييقُ أغلقَ على الزائرِ ولم يكسرْ شاشةً على المسجَّل.
  SELECT count(*) INTO n_auth FROM information_schema.routine_privileges
  WHERE routine_schema = 'public' AND routine_name = ANY(v_names) AND grantee = 'authenticated';
  IF n_auth <> 4 THEN
    RAISE EXCEPTION 'v3.75.57: المستخدِمُ المسجَّلُ يبلغُ % من الكُتّابِ لا أربعةً — فالتضييقُ كسرَ شاشة', n_auth;
  END IF;

  -- (و) والبيتُ محروسٌ بخاصّيّتِه، **ومنحتُه صارت مُثبَّتةً لا مُعلَنةً فحسب** —
  --     يُنادَى بيتٌ واحدٌ للتوكيدِ ولا يُنسَخ.
  PERFORM public.assert_baseline_v3_75_56_check();

  -- (ز) ولا يُمنَحُ هذا الفحصُ نفسُه لأحدٍ سوى مفتاحِ الخدمة
  SELECT count(*) INTO n_self FROM information_schema.routine_privileges
  WHERE routine_schema = 'public' AND routine_name = 'assert_baseline_v3_75_57_check'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF n_self <> 0 THEN
    RAISE EXCEPTION 'v3.75.57: % صلاحيّةً مفتوحةً على هذا الفحصِ نفسِه', n_self;
  END IF;

  -- (ح) وقيدٌ حىٌّ على الصفوفِ كلِّها — **يصرخُ يومَ يقع**: لا مستندَ بعمودِ عملةٍ
  --     فارغ، ولا مستندَ يقولُ عملةً غيرَ أساسِ شركتِه **وحسابُه يقولُ إنّه بالأساس**
  --     (سعرُ صرفٍ واحدٌ وأصلُه يساوى محوَّلَه) — فذلك الوسمُ الكاذبُ بعينِه.
  SELECT count(*),
         count(*) FILTER (WHERE so.currency IS NULL OR btrim(so.currency) = ''),
         count(*) FILTER (WHERE upper(btrim(coalesce(so.currency,''))) <> upper(btrim(co.base_currency))
                            AND coalesce(so.exchange_rate, 1) = 1
                            AND coalesce(so.total_base, so.total_amount) = so.total_amount)
    INTO n_so, n_so_blank, n_so_bad
  FROM public.sales_orders so JOIN public.companies co ON co.id = so.company_id;

  SELECT count(*),
         count(*) FILTER (WHERE vc.original_currency IS NULL OR btrim(vc.original_currency) = ''),
         count(*) FILTER (WHERE upper(btrim(coalesce(vc.original_currency,''))) <> upper(btrim(co.base_currency))
                            AND coalesce(vc.exchange_rate_used, 1) = 1
                            AND coalesce(vc.original_total_amount, vc.total_amount) = vc.total_amount)
    INTO n_vc, n_vc_blank, n_vc_bad
  FROM public.vendor_credits vc JOIN public.companies co ON co.id = vc.company_id;

  SELECT count(*),
         count(*) FILTER (WHERE dn.original_currency IS NULL OR btrim(dn.original_currency) = ''),
         count(*) FILTER (WHERE upper(btrim(coalesce(dn.original_currency,''))) <> upper(btrim(co.base_currency))
                            AND coalesce(dn.exchange_rate, 1) = 1
                            AND coalesce(dn.original_total_amount, dn.total_amount) = dn.total_amount)
    INTO n_dn, n_dn_blank, n_dn_bad
  FROM public.customer_debit_notes dn JOIN public.companies co ON co.id = dn.company_id;

  IF n_so_blank + n_vc_blank + n_dn_blank <> 0 THEN
    RAISE EXCEPTION 'v3.75.57: مستنداتٌ بعمودِ عملةٍ فارغ — أوامرُ بيع % · إشعاراتُ دائن % · إشعاراتُ مَدين %',
      n_so_blank, n_vc_blank, n_dn_blank;
  END IF;
  IF n_so_bad + n_vc_bad + n_dn_bad <> 0 THEN
    RAISE EXCEPTION 'v3.75.57: وسمٌ كاذب — أوامرُ بيع % · إشعاراتُ دائن % · إشعاراتُ مَدين %',
      n_so_bad, n_vc_bad, n_dn_bad;
  END IF;

  RETURN 'v3.75.57 ok - أجسادٌ بلا عملةٍ حرفيّة=4 · تنادى البيت=4 · بصلاحيّاتِ مُنادِيها=' || n_invoker
      || ' · ترثُ عملةَ فاتورتِها=2 · بلا جدولٍ فارغ=0 · لزائرٍ أو لعموم=' || n_open
      || ' · وللمستخدِمِ المسجَّل=' || n_auth
      || ' · الفحصُ مغلَق=' || n_self
      || ' · أوامرُ بيع=' || n_so || ' · إشعاراتُ دائن=' || n_vc || ' · إشعاراتُ مَدين=' || n_dn
      || ' · فارغة=0 · وسمٌ كاذب=0';
END
$chk$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_57_check()  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_57_check() TO service_role;

COMMENT ON FUNCTION public.assert_baseline_v3_75_57_check() IS
  'v3.75.57 — يُثبِتُ أنّ كُتّابَ أمرِ البيعِ وإشعارَىِ الدائنِ والمَدينِ يقرأون عملتَهم ولا يخترعونها: لا عملةَ حرفيّةً فى أجسادهم، وكلٌّ ينادى البيتَ الواحدَ بوسيطِه، ونسختا إشعارِ المَدينِ ترثانِ عملةَ فاتورتِهما ولا تقرآنِ جدولاً فارغاً، والأربعةُ بصلاحيّاتِ مُنادِيهم لا يبلغُهم زائر. ومعه قيدٌ حىٌّ: لا مستندَ بعملةٍ فارغةٍ ولا وسمٌ كاذب.';
