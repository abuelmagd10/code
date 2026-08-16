-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.43 — «ودَينٌ لا يستطيعُ أن يبلغَ الصفرَ ليس دَيناً بل عادة»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- v3.75.42 أغلقَ البابَ فلا تُعكَسُ فاتورةٌ مرّتَين، **وأبقى الأثرَ القائمَ فى
-- دفترِ عميلٍ حقيقىّ**: شركةُ notniche، حسابُ العملاءِ ١١٣٠ = ‎-١٦٠٠، والإيرادُ
-- أقلُّ من الحقيقةِ بـ١٦٠٠. وثبّتَ العددَ عندَ ١ وقال: «تُصحَّحُ فى دفعةٍ تالية».
--
-- وهذه هى الدفعةُ التالية.
--
-- ═══ والرقمُ المُثبَّتُ كان لا يستطيعُ أن يبلغَ الصفر ═══
--
-- فحصُ v3.75.42 كان يعدُّ **فواتيرَ لها أكثرُ من عكسٍ مطابقٍ بالأثر**. وهذا
-- عددٌ **لا ينزلُ أبداً**: القيدانِ JE-000034 وJE-000058 يبقيانِ فى السجلِّ إلى
-- الأبد — **والسجلُّ يحكى ما كان ولا يُمحى**. فلو صُحِّحَ الدفترُ اليومَ لظلَّ
-- الفحصُ يقولُ «١»، ولظلَّ الرقمُ المُثبَّتُ ١ إلى الأبد.
--
-- **ورقمٌ لا يستطيعُ أن يبلغَ الصفرَ ليس دَيناً يُسدَّد، بل عادةٌ تُتعايَشُ معها.**
--
-- فيُعادُ التعبيرُ عن الفحصِ بما **يُقاسُ ويُشفى**: لا «كم فاتورةً عُكِست مرّتَين»
-- بل **«كم فاتورةً عُكِست مرّتَينِ ولم يُعوَّضْ عنها»**. فالسجلُّ يبقى كما كان،
-- والأثرُ يزول، والعددُ يبلغُ الصفرَ ويُثبَّتُ عندَه.
--
-- ═══ ولا يُبنى بيتٌ ثانٍ للسؤالِ نفسِه ═══
--
-- سؤالُ «هل يعكسُ هذا القيدُ ذاك؟» كان مكتوباً بيدِه فى ثلاثةِ مواضع. فيُولَدُ له
-- بيتٌ واحد: `public.je_lines_mirror(a, b)` — ومعه `je_lines_identical(a, b)`.
-- ويُنادِيهما الفحصانِ والمُصحِّح. **وبقىَ موضعٌ واحدٌ يكتبُ الشرطَ بنفسِه**:
-- جسدُ المُشغِّلِ `handle_invoice_cancellation_reversal` — **ولا يُنسَخُ جسدٌ
-- باليدِ فى هذه الدفعة**، فيُعَدُّ ويُثبَّتُ عندَ ١ ويُحوَّلُ بأداةِ الإدراجِ
-- الداخلىِّ فى دفعةٍ تُقاسُ وحدَها. **ومعدودٌ لا مسكوتٌ عنه.**
--
-- ═══ والقيدُ يمرُّ بالبيتِ الواحدِ لإنشاءِ القيود ═══
--
-- لا `INSERT` مباشر. **`create_journal_entry_atomic`** هى البابُ: تسألُ عن
-- الشركة، وتمنعُ التكرار، وترفضُ غيرَ المتوازن، وتُخضِعُ التاريخَ لقفلِ الفترة
-- بمُشغِّلِ القاعدةِ نفسِه. **ولو رفضَ البابُ رفضتِ الهجرةُ كلُّها ولم تكتبْ شيئاً.**
--
-- ═══ والبرهانُ كتابةٌ حيّةٌ تُلغى ═══
--
-- تُزرَعُ فاتورتان: واحدةٌ عُكِست **مرّتَين** (وهى شكلُ العطبِ بعينِه)، وواحدةٌ
-- عُكِست **مرّةً واحدةً** — **وهى البريئة**. ثمّ يُشغَّلُ المُصحِّحُ فعلاً.
-- ويجبُ أن يُصحِّحَ الأولى ولا يمسَّ الثانيةَ بحرف. **وحارسٌ يصرخُ على البرىءِ
-- يُطفأ.** ثمّ يُلغى كلُّ ما زُرِع.
--
-- ═══ ولا يُقاسُ الشفاءُ بغيابِ الشكوى ═══
--
-- بعدَ التصحيحِ تُنادَى **الدالّتانِ اللتانِ تُغذِّيانِ لوحةَ العميلِ نفسَها**:
-- `ic_negative_assets` و`ic_ar_balance`. فإن بقىَ صفٌّ واحدٌ لدى شركةٍ صُحِّحت،
-- **رفضتِ الهجرةُ نفسَها وأُلغىَ كلُّ شىء**.
--
-- ولا يُحذَفُ JE-000058 ولا JE-000034. **الخطأُ يُصحَّحُ بقيدٍ لا بمحو.**
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- ١ · بيتٌ واحدٌ للسؤال: هل يعكسُ هذا القيدُ ذاك؟
-- ───────────────────────────────────────────────────────────────────────────
-- **وشكلُ النصِّ ليس خاصّيّة**: لا يُنظَرُ إلى اسمِ نوعِ المرجع، بل إلى السطور
-- سطراً بسطر — نفسُ الحسابات، ونفسُ المبالغ، ومدينٌ مكانَ دائن.
-- **وفراغانِ لا يعكسُ أحدُهما الآخر**: قيدٌ بلا سطورٍ لا يُطابِقُ ولا يَعكِس.

CREATE OR REPLACE FUNCTION public.je_lines_mirror(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $mirror$
  SELECT EXISTS (SELECT 1 FROM journal_entry_lines l WHERE l.journal_entry_id = p_a)
     AND NOT EXISTS (
       SELECT 1 FROM (
         SELECT l.account_id, l.debit_amount AS d, l.credit_amount AS c
           FROM journal_entry_lines l WHERE l.journal_entry_id = p_a
         EXCEPT ALL
         SELECT l.account_id, l.credit_amount, l.debit_amount
           FROM journal_entry_lines l WHERE l.journal_entry_id = p_b
       ) missing_from_the_mirror)
     AND NOT EXISTS (
       SELECT 1 FROM (
         SELECT l.account_id, l.credit_amount AS d, l.debit_amount AS c
           FROM journal_entry_lines l WHERE l.journal_entry_id = p_b
         EXCEPT ALL
         SELECT l.account_id, l.debit_amount, l.credit_amount
           FROM journal_entry_lines l WHERE l.journal_entry_id = p_a
       ) extra_in_the_mirror);
$mirror$;

CREATE OR REPLACE FUNCTION public.je_lines_identical(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $same$
  SELECT EXISTS (SELECT 1 FROM journal_entry_lines l WHERE l.journal_entry_id = p_a)
     AND NOT EXISTS (
       SELECT 1 FROM (
         SELECT l.account_id, l.debit_amount AS d, l.credit_amount AS c
           FROM journal_entry_lines l WHERE l.journal_entry_id = p_a
         EXCEPT ALL
         SELECT l.account_id, l.debit_amount, l.credit_amount
           FROM journal_entry_lines l WHERE l.journal_entry_id = p_b
       ) missing_from_the_copy)
     AND NOT EXISTS (
       SELECT 1 FROM (
         SELECT l.account_id, l.debit_amount AS d, l.credit_amount AS c
           FROM journal_entry_lines l WHERE l.journal_entry_id = p_b
         EXCEPT ALL
         SELECT l.account_id, l.debit_amount, l.credit_amount
           FROM journal_entry_lines l WHERE l.journal_entry_id = p_a
       ) extra_in_the_copy);
$same$;

REVOKE ALL ON FUNCTION public.je_lines_mirror(uuid, uuid)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.je_lines_identical(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.je_lines_mirror(uuid, uuid)    TO service_role;
GRANT EXECUTE ON FUNCTION public.je_lines_identical(uuid, uuid) TO service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- ٢ · بيتٌ واحدٌ للإصلاح — لا مفتاحُ خدمةٍ يكتبُ قيداً بيدِه
-- ───────────────────────────────────────────────────────────────────────────
-- **ولا يُخمَّن**: إن وجدَ فائضاً أكبرَ من عكسٍ واحدٍ رفضَ ولم يكتبْ شيئاً.
-- ولا يبلغُه مستخدِمٌ مسجَّلٌ ولا زائر — **مفتاحُ الخدمةِ وحدَه**. ويُعادُ بلا
-- ضرر: إن لم يجدْ فائضاً لم يكتبْ شيئاً وقال «صفر».

CREATE OR REPLACE FUNCTION public.repair_uncompensated_duplicate_reversals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fix$
DECLARE
  v_row      record;
  v_lines    jsonb;
  v_res      jsonb;
  v_label    text;
  v_done     int := 0;
  v_names    text[] := ARRAY[]::text[];
  v_companies uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR v_row IN
    SELECT o.id AS orig_id, o.company_id, o.reference_id, o.reference_type,
           o.branch_id, o.cost_center_id,
           (SELECT count(*) FROM journal_entries r
             WHERE r.company_id = o.company_id AND r.reference_id = o.reference_id
               AND r.id <> o.id AND r.status = 'posted'
               AND (r.is_deleted IS NULL OR r.is_deleted = false)
               AND public.je_lines_mirror(o.id, r.id)) AS mirrors,
           (SELECT count(*) FROM journal_entries c
             WHERE c.company_id = o.company_id AND c.reference_id = o.reference_id
               AND c.id <> o.id AND c.status = 'posted'
               AND (c.is_deleted IS NULL OR c.is_deleted = false)
               AND public.je_lines_identical(o.id, c.id)) AS copies
    FROM journal_entries o
    WHERE o.status = 'posted'
      AND o.reference_type IN ('invoice', 'invoice_cogs')
      AND o.reference_id IS NOT NULL
      AND (o.is_deleted IS NULL OR o.is_deleted = false)
    ORDER BY o.company_id, o.reference_id, o.id
  LOOP
    CONTINUE WHEN v_row.mirrors - v_row.copies <= 1;

    IF v_row.mirrors - v_row.copies > 2 THEN
      RAISE EXCEPTION
        'v3.75.43: entry % of company % carries % mirror reversal(s) and % compensation(s) - more than one surplus, and I do not guess.',
        v_row.orig_id, v_row.company_id, v_row.mirrors, v_row.copies;
    END IF;

    SELECT coalesce(i.invoice_number, v_row.reference_id::text) INTO v_label
      FROM invoices i WHERE i.id = v_row.reference_id;
    v_label := coalesce(v_label, v_row.reference_id::text);

    -- **ولا يُؤلَّفُ رقم**: سطورُ التصحيحِ هى سطورُ القيدِ الأصلىِّ بعينِها.
    SELECT jsonb_agg(jsonb_build_object(
             'account_id',    l.account_id,
             'debit_amount',  l.debit_amount,
             'credit_amount', l.credit_amount,
             'description',   'تصحيح عكس مكرر - ' || v_label,
             'branch_id',     l.branch_id,
             'cost_center_id', l.cost_center_id)
           ORDER BY l.account_id)
      INTO v_lines
      FROM journal_entry_lines l
     WHERE l.journal_entry_id = v_row.orig_id;

    IF v_lines IS NULL OR jsonb_array_length(v_lines) = 0 THEN
      RAISE EXCEPTION 'v3.75.43: the original entry % has no lines - nothing to compensate with.', v_row.orig_id;
    END IF;

    v_res := public.create_journal_entry_atomic(
               v_row.company_id,
               'invoice_duplicate_reversal_correction',
               v_row.reference_id,
               CURRENT_DATE,
               'تصحيح عكس مكرر - ' || v_label,
               v_row.branch_id,
               v_row.cost_center_id,
               NULL,
               v_lines);

    IF coalesce((v_res->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'v3.75.43: the one home refused to create the correcting entry for % : %',
        v_label, coalesce(v_res->>'error', '(no error text)');
    END IF;

    v_done      := v_done + 1;
    v_names     := v_names || v_label;
    v_companies := v_companies || v_row.company_id;
  END LOOP;

  RETURN jsonb_build_object('corrected', v_done,
                            'labels', to_jsonb(v_names),
                            'companies', to_jsonb(v_companies));
END
$fix$;

REVOKE ALL ON FUNCTION public.repair_uncompensated_duplicate_reversals() FROM PUBLIC, anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- ٣ · البرهانُ الحىُّ: فاتورةٌ مُصابةٌ وفاتورةٌ بريئة — تُزرَعانِ وتُقاسانِ وتُلغَيان
-- ───────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_co uuid; v_cust uuid; v_br uuid; v_cc uuid; v_wh uuid; v_ar uuid; v_rev uuid;
  v_p uuid; v_q uuid; v_je uuid; v_out text;
  v_pc int; v_qc int; v_pn numeric; v_qn numeric; v_pr numeric; v_qr int;
BEGIN
  BEGIN
    SELECT c.id INTO v_co FROM companies c
     WHERE EXISTS (SELECT 1 FROM customers x         WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM branches x          WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM cost_centers x      WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM warehouses x        WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.sub_type = 'accounts_receivable')
       AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.sub_type = 'sales_revenue')
       AND EXISTS (SELECT 1 FROM accounting_periods p
                    WHERE p.company_id = c.id AND p.period_start <= CURRENT_DATE
                      AND p.period_end >= CURRENT_DATE AND p.status = 'open'
                      AND coalesce(p.is_locked, false) = false)
     ORDER BY (SELECT count(*) FROM journal_entries je WHERE je.company_id = c.id) DESC, c.id
     LIMIT 1;

    IF v_co IS NULL THEN RAISE EXCEPTION 'NO_SUBJECT'; END IF;

    SELECT x.id INTO v_cust FROM customers x         WHERE x.company_id = v_co ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_br   FROM branches x          WHERE x.company_id = v_co ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_cc   FROM cost_centers x      WHERE x.company_id = v_co ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_wh   FROM warehouses x        WHERE x.company_id = v_co ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_ar   FROM chart_of_accounts x WHERE x.company_id = v_co AND x.sub_type = 'accounts_receivable' ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_rev  FROM chart_of_accounts x WHERE x.company_id = v_co AND x.sub_type = 'sales_revenue' ORDER BY x.id LIMIT 1;

    -- (أ) المُصابة: قيدٌ أصلىٌّ وعكسانِ مطابقان — وهو شكلُ INV-00005 بعينِه
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO invoices (company_id, customer_id, invoice_number, invoice_date, due_date,
                          subtotal, total_amount, status, branch_id, cost_center_id, warehouse_id)
    VALUES (v_co, v_cust, 'ZZ-V3-75-43-P', CURRENT_DATE, CURRENT_DATE, 700, 700, 'sent', v_br, v_cc, v_wh)
    RETURNING id INTO v_p;

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice', v_p, CURRENT_DATE, 'v3.75.43 proof P original', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 700, 0, 'ar'), (v_je, v_rev, 0, 700, 'rev');

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice_revenue_reversal_pre_shipment', v_p, CURRENT_DATE, 'v3.75.43 proof P reversal 1', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 0, 700, 'ar rev'), (v_je, v_rev, 700, 0, 'rev rev');

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice_reversal', v_p, CURRENT_DATE, 'v3.75.43 proof P reversal 2', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 0, 700, 'ar rev'), (v_je, v_rev, 700, 0, 'rev rev');

    PERFORM set_config('app.allow_direct_post', 'true', true);
    UPDATE invoices SET status = 'cancelled' WHERE id = v_p;

    -- (ب) البريئة: قيدٌ أصلىٌّ وعكسٌ واحدٌ — لا شىءَ فيها يُصحَّح
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO invoices (company_id, customer_id, invoice_number, invoice_date, due_date,
                          subtotal, total_amount, status, branch_id, cost_center_id, warehouse_id)
    VALUES (v_co, v_cust, 'ZZ-V3-75-43-Q', CURRENT_DATE, CURRENT_DATE, 500, 500, 'sent', v_br, v_cc, v_wh)
    RETURNING id INTO v_q;

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice', v_q, CURRENT_DATE, 'v3.75.43 proof Q original', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 500, 0, 'ar'), (v_je, v_rev, 0, 500, 'rev');

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice_revenue_reversal_pre_shipment', v_q, CURRENT_DATE, 'v3.75.43 proof Q reversal', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 0, 500, 'ar rev'), (v_je, v_rev, 500, 0, 'rev rev');

    PERFORM set_config('app.allow_direct_post', 'true', true);
    UPDATE invoices SET status = 'cancelled' WHERE id = v_q;

    -- والآنَ يُشغَّلُ المُصحِّحُ فعلاً
    PERFORM public.repair_uncompensated_duplicate_reversals();

    SELECT count(*) INTO v_pc FROM journal_entries je
      WHERE je.reference_id = v_p AND je.reference_type = 'invoice_duplicate_reversal_correction';
    SELECT count(*) INTO v_qc FROM journal_entries je
      WHERE je.reference_id = v_q AND je.reference_type = 'invoice_duplicate_reversal_correction';
    SELECT count(*) INTO v_qr FROM journal_entries je
      WHERE je.reference_id = v_q AND je.status = 'posted';
    SELECT coalesce(round(sum(l.debit_amount - l.credit_amount), 2), 0) INTO v_pn
      FROM journal_entries je JOIN journal_entry_lines l ON l.journal_entry_id = je.id
     WHERE je.reference_id = v_p AND je.status = 'posted' AND l.account_id = v_ar;
    SELECT coalesce(round(sum(l.debit_amount - l.credit_amount), 2), 0) INTO v_pr
      FROM journal_entries je JOIN journal_entry_lines l ON l.journal_entry_id = je.id
     WHERE je.reference_id = v_p AND je.status = 'posted' AND l.account_id = v_rev;
    SELECT coalesce(round(sum(l.debit_amount - l.credit_amount), 2), 0) INTO v_qn
      FROM journal_entries je JOIN journal_entry_lines l ON l.journal_entry_id = je.id
     WHERE je.reference_id = v_q AND je.status = 'posted' AND l.account_id = v_ar;

    RAISE EXCEPTION 'MEASURED p_corr=% p_ar=% p_rev=% q_corr=% q_rows=% q_ar=%',
      v_pc, v_pn, v_pr, v_qc, v_qr, v_qn;
  EXCEPTION WHEN OTHERS THEN
    v_out := SQLERRM;          -- المعاملةُ الفرعيّةُ أُلغيت: لا صفَّ بقى ممّا زُرِع
  END;

  IF v_out = 'NO_SUBJECT' THEN
    RAISE NOTICE 'v3.75.43: no company in this house has customer+branch+cost centre+warehouse+AR+revenue+an open period today - no live proof is claimed.';
    RETURN;
  END IF;

  IF v_out !~ '^MEASURED ' THEN
    RAISE EXCEPTION 'v3.75.43: the live proof could not run: %', v_out;
  END IF;

  -- (أ) المُصابةُ صُحِّحت مرّةً واحدةً، وعادَ أثرُها إلى الصفرِ فى الطرفَين
  IF v_out !~ 'p_corr=1 ' THEN
    RAISE EXCEPTION 'v3.75.43 (a): the damaged invoice was not compensated exactly once -> %', v_out;
  END IF;
  IF v_out !~ 'p_ar=0(\.00)? ' THEN
    RAISE EXCEPTION 'v3.75.43 (a): receivables did not come back to zero -> %', v_out;
  END IF;
  IF v_out !~ 'p_rev=0(\.00)? ' THEN
    RAISE EXCEPTION 'v3.75.43 (a): revenue did not come back to zero -> %', v_out;
  END IF;

  -- (ب) والبريئةُ لم تُمسَّ بحرف — **وحارسٌ يصرخ على البرىء يُطفأ**
  IF v_out !~ 'q_corr=0 ' THEN
    RAISE EXCEPTION 'v3.75.43 (b): an invoice reversed exactly once was touched -> %', v_out;
  END IF;
  IF v_out !~ 'q_rows=2 ' THEN
    RAISE EXCEPTION 'v3.75.43 (b): the innocent invoice did not keep exactly its two entries -> %', v_out;
  END IF;
  IF v_out !~ 'q_ar=0(\.00)?$' THEN
    RAISE EXCEPTION 'v3.75.43 (b): the innocent invoice left receivables behind -> %', v_out;
  END IF;

  RAISE NOTICE 'v3.75.43 PROOF ok (all planted rows rolled back): %', v_out;
END
$proof$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٤ · التصحيحُ الحقيقىّ — ثمّ القياسُ بالدالّتَينِ اللتَينِ تُغذِّيانِ لوحةَ العميل
-- ───────────────────────────────────────────────────────────────────────────
DO $apply$
DECLARE
  v_before_posted int;
  v_after_posted  int;
  v_res      jsonb;
  v_done     int;
  v_co       uuid;
  v_left     int;
  v_residue  int;
  v_alerts   int;
BEGIN
  SELECT count(*) INTO v_before_posted FROM journal_entries WHERE status = 'posted';

  v_res  := public.repair_uncompensated_duplicate_reversals();
  v_done := coalesce((v_res->>'corrected')::int, -1);

  IF v_done < 0 THEN
    RAISE EXCEPTION 'v3.75.43: the corrector did not say how many entries it wrote.';
  END IF;

  -- (١) لا فاتورةَ بقىَ عكسُها المكرَّرُ بلا تعويض
  SELECT count(*) INTO v_left FROM (
    SELECT o.reference_id
      FROM journal_entries o
     WHERE o.status = 'posted' AND o.reference_type IN ('invoice', 'invoice_cogs')
       AND o.reference_id IS NOT NULL
       AND (o.is_deleted IS NULL OR o.is_deleted = false)
       AND (SELECT count(*) FROM journal_entries r
             WHERE r.company_id = o.company_id AND r.reference_id = o.reference_id
               AND r.id <> o.id AND r.status = 'posted'
               AND (r.is_deleted IS NULL OR r.is_deleted = false)
               AND public.je_lines_mirror(o.id, r.id))
         - (SELECT count(*) FROM journal_entries c
             WHERE c.company_id = o.company_id AND c.reference_id = o.reference_id
               AND c.id <> o.id AND c.status = 'posted'
               AND (c.is_deleted IS NULL OR c.is_deleted = false)
               AND public.je_lines_identical(o.id, c.id)) > 1
     GROUP BY o.reference_id) q;

  IF v_left <> 0 THEN
    RAISE EXCEPTION 'v3.75.43: % invoice(s) still carry an uncompensated duplicate reversal after the correction.', v_left;
  END IF;

  -- (٢) ولا فاتورةً مُلغاةً تتركُ أثراً فى أىِّ حساب
  SELECT count(DISTINCT n.id) INTO v_residue FROM (
    SELECT i.id, l.account_id, round(sum(l.debit_amount - l.credit_amount), 2) AS net
      FROM invoices i
      JOIN journal_entries je ON je.reference_id = i.id AND je.company_id = i.company_id
       AND je.status = 'posted' AND (je.is_deleted IS NULL OR je.is_deleted = false)
      JOIN journal_entry_lines l ON l.journal_entry_id = je.id
     WHERE i.status = 'cancelled'
     GROUP BY i.id, l.account_id) n
   WHERE n.net <> 0;

  IF v_residue <> 0 THEN
    RAISE EXCEPTION 'v3.75.43: % cancelled invoice(s) still leave a residue on some account.', v_residue;
  END IF;

  -- (٣) ولوحةُ كلِّ شركةٍ صُحِّحت صارت خاليةً من الإنذارَين — **بدالّتِها هى**
  FOREACH v_co IN ARRAY coalesce(
      (SELECT array_agg(DISTINCT x::uuid) FROM jsonb_array_elements_text(v_res->'companies') AS t(x)),
      ARRAY[]::uuid[])
  LOOP
    SELECT (SELECT count(*) FROM public.ic_negative_assets(v_co))
         + (SELECT count(*) FROM public.ic_ar_balance(v_co))
      INTO v_alerts;
    IF v_alerts <> 0 THEN
      RAISE EXCEPTION 'v3.75.43: company % still raises % integrity alert(s) after the correction - half a surgery is worse than none.', v_co, v_alerts;
    END IF;
  END LOOP;

  -- (٤) ولا صفَّ حُذف: عددُ القيودِ المرحَّلةِ زادَ بعددِ التصحيحاتِ لا أقلَّ ولا أكثر
  SELECT count(*) INTO v_after_posted FROM journal_entries WHERE status = 'posted';
  IF v_after_posted <> v_before_posted + v_done THEN
    RAISE EXCEPTION 'v3.75.43: posted entries went from % to % while % correction(s) were written - something else moved.',
      v_before_posted, v_after_posted, v_done;
  END IF;

  RAISE NOTICE 'v3.75.43 APPLIED: % correcting entry/entries written (%), 0 uncompensated duplicates, 0 cancelled-invoice residue.',
    v_done, coalesce(v_res->>'labels', '[]');
END
$apply$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٥ · فحصُ v3.75.42 يُعادُ التعبيرُ عنه بما يستطيعُ أن يبلغَ الصفر
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_42_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check42$
DECLARE
  k_pinned constant int := 0;   -- v3.75.43: صُحِّحَ الأثرُ، فبلغَ العددُ الصفر
  v_dup int;
BEGIN
  -- (١) الشرطُ حىٌّ فى المُشغِّل، ويحكمُ بالأثرِ لا بالاسم
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_invoice_cancellation_reversal'
      AND p.prosrc ~ 'missing_from_the_mirror' AND p.prosrc ~ 'extra_in_the_mirror'
  ) THEN
    RAISE EXCEPTION 'v3.75.42 (1): the cancellation trigger no longer refuses to reverse what is already reversed.';
  END IF;

  -- (٢) والمُشغِّلُ نفسُه ما زال معلّقاً على الفواتير
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.proname = 'handle_invoice_cancellation_reversal' AND NOT t.tgisinternal
      AND t.tgrelid = 'public.invoices'::regclass
  ) THEN
    RAISE EXCEPTION 'v3.75.42 (2): the cancellation trigger is no longer attached to invoices.';
  END IF;

  -- (٣) **ومعدودٌ لا مسكوتٌ عنه** — والعددُ الآنَ هو الأثرُ لا السجلّ:
  --     فواتيرُ عُكِست أكثرَ من مرّةٍ **ولم يُعوَّضْ عن الزيادة**.
  --     السجلُّ يبقى كما كان — والقيدُ المكرَّرُ لا يُمحى — لكنَّ الأثرَ يبلغُ الصفر.
  SELECT count(*) INTO v_dup FROM (
    SELECT o.reference_id
      FROM journal_entries o
     WHERE o.status = 'posted' AND o.reference_type IN ('invoice', 'invoice_cogs')
       AND o.reference_id IS NOT NULL
       AND (o.is_deleted IS NULL OR o.is_deleted = false)
       AND (SELECT count(*) FROM journal_entries r
             WHERE r.company_id = o.company_id AND r.reference_id = o.reference_id
               AND r.id <> o.id AND r.status = 'posted'
               AND (r.is_deleted IS NULL OR r.is_deleted = false)
               AND public.je_lines_mirror(o.id, r.id))
         - (SELECT count(*) FROM journal_entries c
             WHERE c.company_id = o.company_id AND c.reference_id = o.reference_id
               AND c.id <> o.id AND c.status = 'posted'
               AND (c.is_deleted IS NULL OR c.is_deleted = false)
               AND public.je_lines_identical(o.id, c.id)) > 1
     GROUP BY o.reference_id) dup;

  IF v_dup > k_pinned THEN
    RAISE EXCEPTION 'v3.75.42 (3): % invoice(s) carry an uncompensated duplicate reversal, pinned at % - a debt that is written and not paid becomes a habit.', v_dup, k_pinned;
  END IF;

  RETURN format('v3.75.42 ok - a cancelled invoice is never reversed twice, and %s invoice(s) carry an uncompensated duplicate reversal (pinned at %s; the record is kept, the effect is repaired).', v_dup, k_pinned);
END
$check42$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_42_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_42_check() TO service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- ٦ · وفحصُ هذه الدفعةِ نفسِها
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_43_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check43$
DECLARE
  k_handwritten constant int := 1;  -- جسدُ مُشغِّلِ الإلغاء — يُحوَّلُ بأداةِ الإدراجِ الداخلىِّ لاحقاً
  v_residue int;
  v_hand    int;
  v_open    int;
BEGIN
  -- (١) **فاتورةٌ مُلغاةٌ لا تتركُ أثراً**: صافى كلِّ حسابٍ عبرَ قيودِها صفر
  SELECT count(DISTINCT n.id) INTO v_residue FROM (
    SELECT i.id, l.account_id, round(sum(l.debit_amount - l.credit_amount), 2) AS net
      FROM invoices i
      JOIN journal_entries je ON je.reference_id = i.id AND je.company_id = i.company_id
       AND je.status = 'posted' AND (je.is_deleted IS NULL OR je.is_deleted = false)
      JOIN journal_entry_lines l ON l.journal_entry_id = je.id
     WHERE i.status = 'cancelled'
     GROUP BY i.id, l.account_id) n
   WHERE n.net <> 0;

  IF v_residue > 0 THEN
    RAISE EXCEPTION 'v3.75.43 (1): % cancelled invoice(s) leave a residue on some account - a cancelled invoice must leave nothing behind.', v_residue;
  END IF;

  -- (٢) **وللسؤالِ بيتٌ واحد**: من يكتبُ شرطَ المرآةِ بيدِه معدودٌ ومُثبَّت.
  --     **والذِّكرُ ليس صنعاً**، وسقطَ الفحصُ فى ذلك مرّتَينِ قبلَ أن يُطبَّق:
  --     عدَّ أوّلاً كلَّ دالّةٍ يردُ فيها اسمُ `missing_from_the_mirror` فعدَّ
  --     نفسَه وأختَه، ثمّ عدَّ كلَّ دالّةٍ يردُ فيها `EXCEPT ALL` **فعدَّ نفسَه
  --     مرّةً أخرى** — لأنّ نصَّ البحثِ يقعُ داخلَ نصِّ الباحث.
  --     **ونصُّ الفحصِ مواصفةٌ لا صنعة**: فتُستثنى الفحوصُ المرجعيّةُ بالاسم،
  --     ويبقى المقياسُ على من يقارنُ سطورَ قيدَينِ فعلاً.
  SELECT count(*) INTO v_hand
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~ 'EXCEPT ALL'
     AND p.prosrc ~ 'journal_entry_lines'
     AND p.proname NOT IN ('je_lines_mirror', 'je_lines_identical')
     AND p.proname NOT LIKE 'assert_baseline_%';

  IF v_hand > k_handwritten THEN
    RAISE EXCEPTION 'v3.75.43 (2): % function(s) write the mirror test by hand, pinned at % - no second house is built.', v_hand, k_handwritten;
  END IF;

  -- (٣) **ولا يُسلَّمُ البيتُ لمن لا يحتاجُه**: لا يبلغُ هذه الأبوابَ مستخدِمٌ مسجَّل
  SELECT count(*) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('je_lines_mirror', 'je_lines_identical', 'repair_uncompensated_duplicate_reversals')
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('anon', p.oid, 'EXECUTE'));

  IF v_open > 0 THEN
    RAISE EXCEPTION 'v3.75.43 (3): % door(s) of this batch are reachable by a logged-in or anonymous user.', v_open;
  END IF;

  RETURN format('v3.75.43 ok - no cancelled invoice leaves a residue, the mirror test has one home (%s place(s) still write it by hand, pinned at %s), and its doors are service-role only.', v_hand, k_handwritten);
END
$check43$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_43_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_43_check() TO service_role;

SELECT public.assert_baseline_v3_75_42_check();
SELECT public.assert_baseline_v3_75_43_check();
