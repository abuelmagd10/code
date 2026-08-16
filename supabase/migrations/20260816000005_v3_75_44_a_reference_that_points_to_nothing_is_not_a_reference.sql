-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.44 — «ومرجعٌ لا يُشيرُ إلى شىءٍ ليس مرجعاً»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- العطبُ الثانى فى لوحةِ notniche: **لا مالَ ضائع، بل رابطٌ مكسور.**
-- القيدُ JE-000012 «دفعة على فاتورة INV-00002» يحملُ مرجعاً
-- `ebf1cdce-f8a6-4d23-bbbb-9f12b0729558` — **وهذا الرقمُ لا يوجدُ فى أىِّ جدولٍ
-- فى القاعدةِ كلِّها**. فتقريرُ مطابقةِ الذممِ يقرأُ الدفترَ فيقول «١٦٠٠ قائمة»
-- ويقرأُ الفواتيرَ فيقول «صفر» — **والفرقُ ليس عجزاً بل عمًى**.
--
-- ═══ والعددُ الحقيقىُّ عشرةٌ لا ثلاثة ═══
--
-- قِيسَ الأمرُ على الجانبَين لا على جانبِ المبيعاتِ وحدَه:
--
--   قيودُ دفعاتِ العملاء (invoice_payment) .....  ٣ من ٢٤ مرجعُها لا يُحَلّ
--   قيودُ دفعاتِ الموردين (bill_payment) .......  ٧ من ٧  مرجعُها لا يُحَلّ
--
-- **وسبعةٌ من سبعة ليست صدفة**: هى بابٌ كامل. **وما لم يُقَسْ على الجانبَينِ
-- لم يُقَسْ.**
--
-- ═══ والجذر: بابانِ يعنيانِ بـ«المرجع» شيئَينِ مختلفَين ═══
--
-- `auto_create_payment_journal` — المُشغِّلُ الحىُّ — يكتبُ `NEW.invoice_id`
-- و`NEW.bill_id`: **المرجعُ هو المستندُ المدفوع**. وهذا هو الصواب.
--
-- و`create_invoice_payment_entry` و`create_bill_payment_entry` تكتبانِ:
--
--     COALESCE(p_payment_id, p_bill_id)
--
-- **أى رقمَ الدفعةِ لا رقمَ المستند.** فكلُّ قيدٍ خرجَ منهما يحملُ مرجعاً
-- لا يعرفُه أحد. **ومرجعٌ له معنيان ليس له معنى.**
--
-- ولا يُنادى البابانِ من شيفرةٍ ولا من دالّةٍ ولا من عرضٍ ولا من سياسةٍ ولا من
-- قيمةٍ افتراضيّة — **قِيسَ ذلك داخلَ هذه الهجرةِ نفسِها، فإن وُجدَ منادٍ واحدٌ
-- لم يُهدَمْ شىء**. فيُسقَطان. **وبيتٌ لا يُسكَنُ ليس بيتاً.**
--
-- ═══ ولا يُقرأُ الوصفُ ليُعرَفَ المرجع ═══
--
-- وصفُ القيدِ يقولُ «INV-00002» — **ولا يُؤخَذُ منه**. **وشكلُ النصِّ ليس
-- خاصّيّة.** البيتُ الذى يعرفُ الحقيقةَ هو جدولُ `payments`: فيه صفٌّ واحدٌ
-- يحملُ `journal_entry_id` للقيدِ نفسِه، وفيه `invoice_id` أو `bill_id`.
-- **فالرابطُ يُستخرَجُ من القاعدةِ لا من العبارة**، ويُشتَرَطُ فوقَ ذلك أن
-- **يتطابقَ المبلغُ**: مجموعُ مدينِ القيدِ = مبلغُ الدفعة. وإن لم يكنْ صفٌّ
-- واحدٌ بالضبط، أو لم يتطابقِ المبلغ، **رُفِضَ كلُّ شىءٍ ولم يُكتَبْ حرف**.
--
-- ═══ ولا يُصحَّحُ الماضى بقيدٍ هنا ═══
--
-- **الرابطُ ليس واقعةً بل إشارةٌ إليها.** لم يتغيّرْ مبلغٌ ولا حسابٌ ولا تاريخٌ
-- ولا حالةُ قيد — **ولا مليمٌ تحرّك**. غُيِّرَ سهمٌ كان يُشيرُ إلى العدم فصارَ
-- يُشيرُ إلى المستندِ الذى دُفع. ولا يُنشَأُ قيدٌ جديدٌ لأنّ إنشاءَ قيدٍ يُحرِّكُ
-- مالاً، **والمالُ هنا صحيحٌ منذُ اليومِ الأوّل**.
--
-- وحارسُ «لا يُعدَّلُ قيدٌ مُرحَّل» قائمٌ ولم يُنزَع. يُرفَعُ أمامَه **علَمُ
-- الخادمِ الموثوقِ نفسُه** الذى يرفعُه `create_journal_entry_atomic` — ولحظةً
-- واحدةً ولعمودٍ واحد. **ولا يُفتَحُ البابُ إلّا بقدرِ ما يمرّ**: يُبصَمُ القيدُ
-- وسطورُه قبلَ اللمسِ ويُعادُ قياسُهما بعدَه، فإن تغيّرَ حرفٌ سوى المرجعِ
-- **رُفِضَ كلُّ شىء**.
--
-- ═══ وفخٌّ يمنعُ الولادةَ لا يُنظِّفُ بعدَها ═══
--
-- ويُولَدُ مُشغِّلٌ يرفضُ **قبلَ الكتابة** كلَّ قيدِ دفعةٍ مرجعُه لا يُحَلُّ إلى
-- مستندٍ فى شركتِه. **وفخٌّ لا يُشغَّل ليس فخّاً**: تُزرَعُ دفعةٌ حقيقيّةٌ فيمرُّ
-- قيدُها ومرجعُه يُحَلّ، ويُحاوَلُ زرعُ قيدٍ بمرجعٍ وهمىٍّ **فيُرفَض** — ثمّ
-- يُلغى كلُّ ما زُرِع.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- ١ · بيتٌ واحدٌ للسؤال: هل يُحَلُّ مرجعُ قيدِ الدفعةِ إلى مستندٍ فى شركتِه؟
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payment_reference_resolves(
  p_company_id uuid, p_reference_type text, p_reference_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $resolve$
  SELECT CASE
    WHEN p_reference_id IS NULL THEN true
    WHEN p_reference_type = 'invoice_payment' THEN
      EXISTS (SELECT 1 FROM invoices i WHERE i.id = p_reference_id AND i.company_id = p_company_id)
    WHEN p_reference_type = 'bill_payment' THEN
      EXISTS (SELECT 1 FROM bills b WHERE b.id = p_reference_id AND b.company_id = p_company_id)
    ELSE true
  END;
$resolve$;

REVOKE ALL ON FUNCTION public.payment_reference_resolves(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_reference_resolves(uuid, text, uuid) TO service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- ٢ · الرابطُ يُستخرَجُ من القاعدة — ولا يُخمَّن
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.repair_unresolved_payment_references()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fix$
DECLARE
  v_row     record;
  v_pay     record;
  v_n       int;
  v_target  uuid;
  v_debits  numeric;
  v_fp_a    text;
  v_fp_b    text;
  v_lines_a text;
  v_lines_b text;
  v_ref     uuid;
  v_done    int := 0;
  v_names   text[] := ARRAY[]::text[];
BEGIN
  FOR v_row IN
    SELECT je.id, je.company_id, je.reference_type, je.reference_id, je.entry_number
      FROM journal_entries je
     WHERE je.reference_type IN ('invoice_payment', 'bill_payment')
       AND je.reference_id IS NOT NULL
       AND (je.is_deleted IS NULL OR je.is_deleted = false)
       AND NOT public.payment_reference_resolves(je.company_id, je.reference_type, je.reference_id)
     ORDER BY je.company_id, je.entry_number
  LOOP
    SELECT count(*) INTO v_n
      FROM payments p
     WHERE p.journal_entry_id = v_row.id
       AND p.company_id = v_row.company_id
       AND coalesce(p.is_deleted, false) = false;

    IF v_n <> 1 THEN
      RAISE EXCEPTION
        'v3.75.44: entry % has % payment row(s) pointing at it - the link cannot be read from the database, and I do not guess.',
        v_row.entry_number, v_n;
    END IF;

    SELECT p.invoice_id, p.bill_id, p.amount, p.base_currency_amount
      INTO v_pay
      FROM payments p
     WHERE p.journal_entry_id = v_row.id
       AND p.company_id = v_row.company_id
       AND coalesce(p.is_deleted, false) = false;

    v_target := CASE WHEN v_row.reference_type = 'invoice_payment' THEN v_pay.invoice_id ELSE v_pay.bill_id END;

    IF v_target IS NULL THEN
      RAISE EXCEPTION 'v3.75.44: the payment row of entry % names no document of type % - refusing.',
        v_row.entry_number, v_row.reference_type;
    END IF;

    IF NOT public.payment_reference_resolves(v_row.company_id, v_row.reference_type, v_target) THEN
      RAISE EXCEPTION 'v3.75.44: the document % named by the payment row of entry % is not in that company - refusing.',
        v_target, v_row.entry_number;
    END IF;

    -- **والمبلغُ يشهد**: مجموعُ مدينِ القيدِ يساوى مبلغَ الدفعة
    SELECT coalesce(round(sum(l.debit_amount), 2), -1) INTO v_debits
      FROM journal_entry_lines l WHERE l.journal_entry_id = v_row.id;

    IF v_debits NOT IN (round(v_pay.amount, 2), round(coalesce(v_pay.base_currency_amount, v_pay.amount), 2)) THEN
      RAISE EXCEPTION
        'v3.75.44: entry % debits % but its payment row says % - not the same event, refusing.',
        v_row.entry_number, v_debits, v_pay.amount;
    END IF;

    -- **ولا يُفتَحُ البابُ إلّا بقدرِ ما يمرّ**: يُبصَمُ القيدُ وسطورُه قبلَ اللمس،
    -- ويُعادُ قياسُهما بعدَه. فما عدا `reference_id` يجبُ أن يعودَ حرفاً بحرف.
    SELECT md5(row(je.company_id, je.branch_id, je.cost_center_id, je.warehouse_id,
                   je.entry_number, je.entry_date, je.description, je.reference_type,
                   je.status, je.is_deleted)::text)
      INTO v_fp_a FROM journal_entries je WHERE je.id = v_row.id;
    SELECT coalesce(md5(string_agg(l.account_id::text || '|' || l.debit_amount || '|' || l.credit_amount,
                                   E'\n' ORDER BY l.account_id, l.debit_amount, l.credit_amount)), '')
      INTO v_lines_a FROM journal_entry_lines l WHERE l.journal_entry_id = v_row.id;

    -- الرايةُ نفسُها التى يرفعُها البيتُ الواحدُ لإنشاءِ القيود، ولعمودٍ واحدٍ فقط
    PERFORM set_config('app.allow_direct_post', 'true', true);
    UPDATE journal_entries SET reference_id = v_target WHERE id = v_row.id;
    PERFORM set_config('app.allow_direct_post', 'false', true);

    SELECT md5(row(je.company_id, je.branch_id, je.cost_center_id, je.warehouse_id,
                   je.entry_number, je.entry_date, je.description, je.reference_type,
                   je.status, je.is_deleted)::text), je.reference_id
      INTO v_fp_b, v_ref FROM journal_entries je WHERE je.id = v_row.id;
    SELECT coalesce(md5(string_agg(l.account_id::text || '|' || l.debit_amount || '|' || l.credit_amount,
                                   E'\n' ORDER BY l.account_id, l.debit_amount, l.credit_amount)), '')
      INTO v_lines_b FROM journal_entry_lines l WHERE l.journal_entry_id = v_row.id;

    IF v_fp_a IS DISTINCT FROM v_fp_b OR v_lines_a IS DISTINCT FROM v_lines_b THEN
      RAISE EXCEPTION 'v3.75.44: entry % changed in more than its reference - refusing.', v_row.entry_number;
    END IF;
    IF v_ref IS DISTINCT FROM v_target THEN
      RAISE EXCEPTION 'v3.75.44: entry % did not take the reference it was given.', v_row.entry_number;
    END IF;

    v_done  := v_done + 1;
    v_names := v_names || v_row.entry_number;
  END LOOP;

  RETURN jsonb_build_object('repaired', v_done, 'entries', to_jsonb(v_names));
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.allow_direct_post', 'false', true);
  RAISE;
END
$fix$;

REVOKE ALL ON FUNCTION public.repair_unresolved_payment_references() FROM PUBLIC, anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- ٣ · الفخُّ: لا يُولَدُ قيدُ دفعةٍ مرجعُه لا يُشيرُ إلى مستند
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_payment_reference_resolves()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $guard$
BEGIN
  IF NEW.reference_type IN ('invoice_payment', 'bill_payment')
     AND NEW.reference_id IS NOT NULL
     AND NOT public.payment_reference_resolves(NEW.company_id, NEW.reference_type, NEW.reference_id)
  THEN
    RAISE EXCEPTION
      'UNRESOLVED_PAYMENT_REFERENCE: a % entry must reference the document it pays; % is not a document of this company.',
      NEW.reference_type, NEW.reference_id
      USING HINT = 'Set reference_id to the invoice_id (or bill_id) - not to the payment id.';
  END IF;
  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS trg_payment_reference_resolves ON public.journal_entries;
CREATE TRIGGER trg_payment_reference_resolves
  BEFORE INSERT OR UPDATE OF reference_id, reference_type, company_id
  ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_reference_resolves();


-- ───────────────────────────────────────────────────────────────────────────
-- ٤ · الإصلاحُ الحقيقىّ — ثمّ القياس
-- ───────────────────────────────────────────────────────────────────────────
DO $apply$
DECLARE
  v_before int;
  v_after  int;
  v_rows_before int;
  v_rows_after  int;
  v_res    jsonb;
  v_done   int;
BEGIN
  SELECT count(*) INTO v_before
    FROM journal_entries je
   WHERE je.reference_type IN ('invoice_payment', 'bill_payment')
     AND je.reference_id IS NOT NULL
     AND (je.is_deleted IS NULL OR je.is_deleted = false)
     AND NOT public.payment_reference_resolves(je.company_id, je.reference_type, je.reference_id);

  SELECT count(*) INTO v_rows_before FROM journal_entries;

  v_res  := public.repair_unresolved_payment_references();
  v_done := coalesce((v_res->>'repaired')::int, -1);

  IF v_done < 0 THEN
    RAISE EXCEPTION 'v3.75.44: the repairer did not say how many links it mended.';
  END IF;
  IF v_done <> v_before THEN
    RAISE EXCEPTION 'v3.75.44: % broken link(s) were measured but % were mended.', v_before, v_done;
  END IF;

  SELECT count(*) INTO v_after
    FROM journal_entries je
   WHERE je.reference_type IN ('invoice_payment', 'bill_payment')
     AND je.reference_id IS NOT NULL
     AND (je.is_deleted IS NULL OR je.is_deleted = false)
     AND NOT public.payment_reference_resolves(je.company_id, je.reference_type, je.reference_id);

  IF v_after <> 0 THEN
    RAISE EXCEPTION 'v3.75.44: % payment entry/entries still reference nothing after the repair.', v_after;
  END IF;

  -- **ولا صفَّ وُلد ولا صفَّ مات**: العددُ نفسُه قبلَ وبعد
  SELECT count(*) INTO v_rows_after FROM journal_entries;
  IF v_rows_after <> v_rows_before THEN
    RAISE EXCEPTION 'v3.75.44: journal entries went from % to % - a link repair creates and destroys nothing.',
      v_rows_before, v_rows_after;
  END IF;

  RAISE NOTICE 'v3.75.44 APPLIED: % broken payment link(s) mended (%), 0 remain, no row created or destroyed.',
    v_done, coalesce(v_res->>'entries', '[]');
END
$apply$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٥ · البرهانُ الحىُّ: دفعةٌ حقيقيّةٌ تُزرَع، ومرجعٌ وهمىٌّ يُرفَض — ثمّ يُلغى الكلّ
-- ───────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_co uuid; v_cust uuid; v_br uuid; v_cc uuid; v_wh uuid; v_ar uuid; v_rev uuid; v_cash uuid;
  v_user uuid; v_inv uuid; v_pay uuid; v_je uuid; v_out text;
  v_ok int; v_refused int; v_resolved int;
BEGIN
  BEGIN
    -- **ودفعةٌ بلا اسمِ من صنعها لا تُكتب**: فيُسمّى صاحبُ الشركةِ فاعلاً
    SELECT c.id, c.user_id INTO v_co, v_user FROM companies c
     WHERE c.user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM customers x         WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM branches x          WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM cost_centers x      WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM warehouses x        WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.sub_type = 'accounts_receivable')
       AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.sub_type = 'sales_revenue')
       AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.sub_type IN ('cash', 'bank'))
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
    SELECT x.id INTO v_cash FROM chart_of_accounts x WHERE x.company_id = v_co AND x.sub_type IN ('cash', 'bank') ORDER BY x.id LIMIT 1;

    -- فاتورةٌ حقيقيّةٌ وقيدُها
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO invoices (company_id, customer_id, invoice_number, invoice_date, due_date,
                          subtotal, total_amount, status, branch_id, cost_center_id, warehouse_id)
    VALUES (v_co, v_cust, 'ZZ-V3-75-44-R', CURRENT_DATE, CURRENT_DATE, 300, 300, 'sent', v_br, v_cc, v_wh)
    RETURNING id INTO v_inv;

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice', v_inv, CURRENT_DATE, 'v3.75.44 proof invoice', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 300, 0, 'ar'), (v_je, v_rev, 0, 300, 'rev');

    -- (أ) دفعةٌ حقيقيّةٌ تمرُّ بالمسارِ الحىّ: صفُّ دفعةٍ يولدُ قيدَه بنفسِه
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO payments (company_id, customer_id, invoice_id, payment_date, amount,
                          payment_method, account_id, branch_id, cost_center_id, created_by)
    VALUES (v_co, v_cust, v_inv, CURRENT_DATE, 300, 'cash', v_cash, v_br, v_cc, v_user)
    RETURNING id INTO v_pay;

    SELECT count(*) INTO v_ok
      FROM journal_entries je
     WHERE je.company_id = v_co AND je.reference_type = 'invoice_payment' AND je.reference_id = v_inv;

    SELECT count(*) INTO v_resolved
      FROM journal_entries je
     WHERE je.company_id = v_co AND je.reference_type = 'invoice_payment' AND je.reference_id = v_inv
       AND public.payment_reference_resolves(je.company_id, je.reference_type, je.reference_id);

    -- (ب) ومرجعٌ وهمىٌّ يُرفَضُ قبلَ أن يُكتَب
    v_refused := 0;
    BEGIN
      PERFORM set_config('app.allow_direct_post', 'true', true);
      INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
      VALUES (v_co, v_br, 'invoice_payment', gen_random_uuid(), CURRENT_DATE, 'v3.75.44 proof ghost', 'draft');
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ~ 'UNRESOLVED_PAYMENT_REFERENCE' THEN v_refused := 1; ELSE v_refused := -1; END IF;
    END;

    RAISE EXCEPTION 'MEASURED live=% resolved=% refused=%', v_ok, v_resolved, v_refused;
  EXCEPTION WHEN OTHERS THEN
    v_out := SQLERRM;          -- المعاملةُ الفرعيّةُ أُلغيت: لا صفَّ بقى ممّا زُرِع
  END;

  IF v_out = 'NO_SUBJECT' THEN
    RAISE NOTICE 'v3.75.44: no company in this house can carry the planting - no live proof is claimed.';
    RETURN;
  END IF;

  IF v_out !~ '^MEASURED ' THEN
    RAISE EXCEPTION 'v3.75.44: the live proof could not run: %', v_out;
  END IF;

  IF v_out !~ 'live=1 ' THEN
    RAISE EXCEPTION 'v3.75.44 (a): the live payment path no longer writes exactly one payment entry -> %', v_out;
  END IF;
  IF v_out !~ 'resolved=1 ' THEN
    RAISE EXCEPTION 'v3.75.44 (a): the live payment path wrote a reference that resolves to nothing -> %', v_out;
  END IF;
  IF v_out !~ 'refused=1$' THEN
    RAISE EXCEPTION 'v3.75.44 (b): a ghost reference was NOT refused - a trap that does not fire is not a trap -> %', v_out;
  END IF;

  RAISE NOTICE 'v3.75.44 PROOF ok (all planted rows rolled back): %', v_out;
END
$proof$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٦ · البابانِ اللذانِ يعنيانِ بـ«المرجع» رقمَ الدفعة — يُمسَحُ عنهما ثمّ يُسقَطان
-- ───────────────────────────────────────────────────────────────────────────
DO $drop$
DECLARE
  v_callers text[] := ARRAY[]::text[];
BEGIN
  SELECT coalesce(array_agg(x), ARRAY[]::text[]) INTO v_callers FROM (
    SELECT 'function ' || p.proname AS x
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosrc ~ '\m(create_invoice_payment_entry|create_bill_payment_entry)\M'
       AND p.proname NOT IN ('create_invoice_payment_entry', 'create_bill_payment_entry')
    UNION ALL
    SELECT 'view ' || viewname FROM pg_views
     WHERE schemaname = 'public' AND definition ~ '\m(create_invoice_payment_entry|create_bill_payment_entry)\M'
    UNION ALL
    SELECT 'default ' || table_name || '.' || column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_default ~ '(create_invoice_payment_entry|create_bill_payment_entry)'
    UNION ALL
    SELECT 'constraint ' || conname FROM pg_constraint
     WHERE pg_get_constraintdef(oid) ~ '(create_invoice_payment_entry|create_bill_payment_entry)'
    UNION ALL
    SELECT 'policy ' || polname FROM pg_policy
     WHERE coalesce(pg_get_expr(polqual, polrelid), '') ~ '(create_invoice_payment_entry|create_bill_payment_entry)'
        OR coalesce(pg_get_expr(polwithcheck, polrelid), '') ~ '(create_invoice_payment_entry|create_bill_payment_entry)'
  ) q;

  IF array_length(v_callers, 1) > 0 THEN
    RAISE EXCEPTION 'v3.75.44: a caller was found (%) - so nothing is dropped.', array_to_string(v_callers, ', ');
  END IF;
END
$drop$;

DROP FUNCTION IF EXISTS public.create_invoice_payment_entry(uuid, uuid, uuid, date, numeric, text, text);
DROP FUNCTION IF EXISTS public.create_bill_payment_entry(uuid, uuid, uuid, date, numeric, text, text);


-- ───────────────────────────────────────────────────────────────────────────
-- ٧ · الفحصُ المرجعىّ
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_44_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check44$
DECLARE
  k_pinned constant int := 0;
  v_broken int;
  v_dead   int;
BEGIN
  -- (١) لا قيدَ دفعةٍ مرجعُه لا يُشيرُ إلى مستندٍ فى شركتِه
  SELECT count(*) INTO v_broken
    FROM journal_entries je
   WHERE je.reference_type IN ('invoice_payment', 'bill_payment')
     AND je.reference_id IS NOT NULL
     AND (je.is_deleted IS NULL OR je.is_deleted = false)
     AND NOT public.payment_reference_resolves(je.company_id, je.reference_type, je.reference_id);

  IF v_broken > k_pinned THEN
    RAISE EXCEPTION 'v3.75.44 (1): % payment entry/entries reference a document that does not exist, pinned at %.', v_broken, k_pinned;
  END IF;

  -- (٢) والفخُّ معلَّقٌ على الجدولِ نفسِه — **وفحصٌ يمكن تخطّيه ليس فحصاً**
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE p.proname = 'enforce_payment_reference_resolves' AND NOT t.tgisinternal
       AND t.tgrelid = 'public.journal_entries'::regclass
  ) THEN
    RAISE EXCEPTION 'v3.75.44 (2): the guard that refuses an unresolvable payment reference is no longer attached.';
  END IF;

  -- (٣) والبابانِ اللذانِ كانا يكتبانِ رقمَ الدفعةِ مرجعاً لم يعودا
  SELECT count(*) INTO v_dead
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_invoice_payment_entry', 'create_bill_payment_entry');

  IF v_dead > 0 THEN
    RAISE EXCEPTION 'v3.75.44 (3): % door(s) that write the payment id as the reference are back.', v_dead;
  END IF;

  RETURN format('v3.75.44 ok - every payment entry references the document it pays (%s unresolved, pinned at %s), the guard is attached, and the two doors that meant the payment id are gone.', v_broken, k_pinned);
END
$check44$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_44_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_44_check() TO service_role;

SELECT public.assert_baseline_v3_75_44_check();
