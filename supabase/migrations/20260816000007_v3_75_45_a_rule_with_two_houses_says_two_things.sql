-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.45 — «وقاعدةٌ لها بيتان تقولُ قولَين»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- بعدَ v3.75.44 ظهرَ فى لوحةِ شركةِ **تست** إنذارٌ واحد: **«قيودٌ مكرَّرة —
-- قيدانِ مُرحَّلانِ يُشيرانِ إلى الصفِّ نفسِه»**. وقِيسَ على القاعدةِ الحيّة:
--
--     BILL-0001    JE-000007   ٣ يوليو    مدين ٤.٩٣
--                  JE-000014  ١٢ يوليو    مدين ٢.٤٣
--
-- **دفعتانِ جزئيّتانِ حقيقيّتان**، فى تاريخَينِ مختلفَين، بمبلغَينِ مختلفَين،
-- لكلٍّ منهما صفُّ دفعةٍ خاصٌّ بها. **لا مالَ تكرَّر، ولا صفَّ زاد.**
--
-- ═══ ولماذا ظهرَ الآن ═══
--
-- قبلَ v3.75.44 كان مرجعُ القيدَينِ رقمَينِ وهميَّينِ لا يُشيرانِ إلى شىء، فلم
-- يجدْهما الفحصُ متشابهَين **لأنّه لم يجدْهما أصلاً**. **وبحثٌ لا يجد ليس دليلَ
-- غياب**: كان الفحصُ يمرُّ لأنّه أعمى لا لأنّ الدفترَ نظيف. ولمّا رُمِّمَ
-- الرابطُ صارَ القيدانِ يُشيرانِ إلى فاتورتِهما — وهو الصواب — فرآهما.
--
-- **وإصلاحٌ يكشفُ عطباً كان مستوراً ليس عطباً أحدثَه.**
--
-- ═══ والجذر: بيتانِ يقولانِ فى الشىءِ نفسِه قولَينِ متناقضَين ═══
--
-- الحارسُ عندَ الكتابة `prevent_duplicate_journal_entry_v2` يستثنى صراحةً
-- `invoice_payment` و`bill_payment`، وبنصِّه هو:
--
--     «الدفعاتُ بطبيعتِها واحدةٌ لكلِّ دفعةٍ لا لكلِّ فاتورة.
--      دفعاتٌ متعدّدةٌ على الفاتورةِ نفسِها تُنشئُ قيوداً صحيحةً متعدّدة.»
--
-- والفحصُ الذى يُغذّى اللوحةَ `ic_duplicate_journals` **لا يعرفُ هذا الاستثناء**.
-- فأحدُهما يسمحُ والآخرُ يصرخُ على ما سُمِحَ به. **والصوابُ مع الحارسِ لا مع
-- الفحص** — لأنّ الحارسَ هو الذى يحكمُ على الكتابةِ وقتَ وقوعِها.
--
-- ═══ فيُبنى بيتٌ واحدٌ للقاعدة، ويُنادِيه الاثنان ═══
--
-- `public.payment_journal_reference_types()` — قائمةٌ واحدةٌ لا تُنسَخُ فى
-- موضعَين. **ولا يُبنى بيتٌ ثانٍ.**
--
-- ═══ ولا تُنسَخُ أجسادٌ باليد ═══
--
-- ولا يُعادُ كتابةُ جسدَىِ الحارسِ والفحصِ هنا. **القاعدةُ تقرأُ جسدَها الحىَّ
-- بنفسِها** وتستبدلُ فيه موضعَ القائمةِ بنداءِ البيت، **ثمّ تُعيدُ الاستبدالَ
-- عكسيّاً فيجبُ أن يعودَ الأصلُ حرفاً بحرف** — وإلّا سقطتِ الهجرةُ كلُّها.
-- (وهى أداةُ v3.75.41 نفسُها.)
--
-- ═══ والبرهانُ كتابةٌ حيّةٌ تُلغى — والبرىءُ قبلَ المذنب ═══
--
--   (أ) دفعتانِ حقيقيّتانِ على فاتورةِ شراءٍ واحدة  →  **لا إنذار**
--   (ب) قيدا تكلفةٍ على الفاتورةِ نفسِها ...........  →  **إنذارٌ كما يجب**
--
-- و(ب) تُزرَعُ بتعطيلِ **مُشغِّلٍ بعينِه باسمِه** داخلَ المعاملةِ وحدَها، لأنّ
-- الحارسَ نفسَه يمنعُ ولادتَها — **ثمّ يُعادُ فوراً قبلَ القياس**، ويُلغى كلُّ
-- ما زُرِع. **وحارسٌ يصرخُ على البرىءِ يُطفأ، وفحصٌ يسكتُ عن المذنبِ ليس فحصاً.**
--
-- ═══ ولا تُرفَعُ الحمايةُ عن الجدولِ كلِّه ═══
--
-- **ولا يُفتَحُ البابُ إلّا بقدرِ ما يمرّ.** تعطيلُ الأزندةِ جملةً واحدةً يُسقطُ
-- معه **فرضَ المفاتيحِ الأجنبيّة** ولا يمسُّ علامةَ التحقّق، فتبقى القاعدةُ تظنُّ
-- نفسَها سليمةً وفيها بنودٌ بلا مستندات — وهو بعينِه ما مُنِعَ فى v3.74.960 بعدَ
-- اثنين وسبعينَ صفَّ بندٍ يتيم. **فالمُعطَّلُ مُشغِّلٌ واحدٌ يُسمّى باسمِه**،
-- ويُشهَدُ على عودتِه **قبلَ القياس**: لا مُشغِّلَ واحدٌ يبقى مُعطَّلاً على
-- الجدول، وإلّا سقطتِ الهجرة.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- ١ · البيتُ الواحد
-- ───────────────────────────────────────────────────────────────────────────
-- **ولا تُنزَعُ منحتُها**: الحارسُ عندَ الكتابةِ يجرى بحقِّ من يكتب، فلو لم
-- يستطعِ المستخدِمُ نداءَها لسقطَ كلُّ إدخالِ قيد. وهى ثابتةٌ لا تقرأُ صفّاً،
-- فلا تُفشى شيئاً.
CREATE OR REPLACE FUNCTION public.payment_journal_reference_types()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $types$
  SELECT ARRAY['invoice_payment', 'bill_payment']::text[];
$types$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٢ · القاعدةُ تُبدِّلُ فى جسدَيها بنفسِها — وتُبرهنُ بالعكس
-- ───────────────────────────────────────────────────────────────────────────
DO $inject$
DECLARE
  k_call constant text := 'reference_type = ANY (public.payment_journal_reference_types())';
  v_oid  oid;
  v_old  text;
  v_new  text;
  v_back text;
  v_done int := 0;
BEGIN
  -- (أ) الحارسُ عندَ الكتابة: القائمةُ المكتوبةُ بيدِها تصيرُ نداءً للبيت
  v_oid := 'public.prevent_duplicate_journal_entry_v2()'::regprocedure::oid;
  v_old := pg_get_functiondef(v_oid);
  IF position('NEW.reference_type IN (''invoice_payment'', ''bill_payment'')' in v_old) = 0 THEN
    IF position(k_call in v_old) > 0 THEN
      RAISE NOTICE 'v3.75.45: the write guard already calls the one home.';
    ELSE
      RAISE EXCEPTION 'v3.75.45: the write guard does not carry the list I expected - I do not guess.';
    END IF;
  ELSE
    v_new  := replace(v_old, 'NEW.reference_type IN (''invoice_payment'', ''bill_payment'')',
                             'NEW.' || k_call);
    v_back := replace(v_new, 'NEW.' || k_call,
                             'NEW.reference_type IN (''invoice_payment'', ''bill_payment'')');
    IF v_back IS DISTINCT FROM v_old THEN
      RAISE EXCEPTION 'v3.75.45: the substitution in the write guard is not reversible - refusing.';
    END IF;
    EXECUTE v_new;
    v_done := v_done + 1;
  END IF;

  -- (ب) الفحصُ الذى يُغذّى اللوحة: يتعلَّمُ الاستثناءَ من البيتِ نفسِه
  v_oid := 'public.ic_duplicate_journals(uuid)'::regprocedure::oid;
  v_old := pg_get_functiondef(v_oid);
  IF position(k_call in v_old) > 0 THEN
    RAISE NOTICE 'v3.75.45: the dashboard check already calls the one home.';
  ELSE
    IF position(E'      AND reference_id IS NOT NULL\n' in v_old) = 0 THEN
      RAISE EXCEPTION 'v3.75.45: the dashboard check does not have the line I expected - I do not guess.';
    END IF;
    v_new  := replace(v_old, E'      AND reference_id IS NOT NULL\n',
                             E'      AND reference_id IS NOT NULL\n      AND NOT (' || k_call || E')\n');
    v_back := replace(v_new, E'      AND reference_id IS NOT NULL\n      AND NOT (' || k_call || E')\n',
                             E'      AND reference_id IS NOT NULL\n');
    IF v_back IS DISTINCT FROM v_old THEN
      RAISE EXCEPTION 'v3.75.45: the insertion in the dashboard check is not reversible - refusing.';
    END IF;
    EXECUTE v_new;
    v_done := v_done + 1;
  END IF;

  RAISE NOTICE 'v3.75.45: % body/bodies rewritten by the database itself, each proven reversible.', v_done;
END
$inject$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٣ · البرهانُ الحىّ: البرىءُ يمرّ، والمذنبُ يُرى — ثمّ يُلغى كلُّ ما زُرِع
-- ───────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_co uuid; v_sup uuid; v_cust uuid; v_br uuid; v_cc uuid; v_wh uuid;
  v_ap uuid; v_ar uuid; v_rev uuid; v_cash uuid;
  v_user uuid; v_bill uuid; v_inv uuid; v_je uuid; v_out text;
  v_innocent int; v_guilty int; v_off int;
BEGIN
  BEGIN
    -- **ومستندٌ بلا اسمِ من صنعه لا يُكتب**: فيُسمّى صاحبُ الشركةِ فاعلاً
    SELECT c.id, c.user_id INTO v_co, v_user FROM companies c
     WHERE c.user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM suppliers x         WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM customers x         WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM branches x          WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM cost_centers x      WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM warehouses x        WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.sub_type = 'accounts_payable')
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

    SELECT x.id INTO v_sup  FROM suppliers x         WHERE x.company_id = v_co ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_cust FROM customers x         WHERE x.company_id = v_co ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_br   FROM branches x          WHERE x.company_id = v_co ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_cc   FROM cost_centers x      WHERE x.company_id = v_co ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_wh   FROM warehouses x        WHERE x.company_id = v_co ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_ap   FROM chart_of_accounts x WHERE x.company_id = v_co AND x.sub_type = 'accounts_payable'    ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_ar   FROM chart_of_accounts x WHERE x.company_id = v_co AND x.sub_type = 'accounts_receivable' ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_rev  FROM chart_of_accounts x WHERE x.company_id = v_co AND x.sub_type = 'sales_revenue'       ORDER BY x.id LIMIT 1;
    SELECT x.id INTO v_cash FROM chart_of_accounts x WHERE x.company_id = v_co AND x.sub_type IN ('cash', 'bank')     ORDER BY x.id LIMIT 1;

    -- (أ) البرىء: فاتورةُ شراءٍ عليها دفعتانِ جزئيّتان — قيدانِ صحيحان
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO bills (company_id, supplier_id, bill_number, bill_date, due_date,
                       subtotal, total_amount, status, branch_id, cost_center_id, warehouse_id, created_by)
    VALUES (v_co, v_sup, 'ZZ-V3-75-45-B', CURRENT_DATE, CURRENT_DATE, 100, 100, 'received', v_br, v_cc, v_wh, v_user)
    RETURNING id INTO v_bill;

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'bill_payment', v_bill, CURRENT_DATE, 'v3.75.45 proof pay 1', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ap, 60, 0, 'ap'), (v_je, v_cash, 0, 60, 'cash');

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'bill_payment', v_bill, CURRENT_DATE, 'v3.75.45 proof pay 2', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ap, 40, 0, 'ap'), (v_je, v_cash, 0, 40, 'cash');

    SELECT count(*) INTO v_innocent
      FROM public.ic_duplicate_journals(v_co) d
     WHERE (d.detail->>'reference_id')::uuid = v_bill;

    -- (ب) المذنب: قيدا تكلفةٍ على الفاتورةِ نفسِها.
    --     الحارسُ نفسُه يمنعُ ولادتَهما، **فيُعطَّلُ مُشغِّلٌ واحدٌ باسمِه** لحظةَ
    --     الزرعِ ثمّ يُعادُ فوراً قبلَ القياس — لا تُرفَعُ الحمايةُ عن الجدولِ كلِّه.
    INSERT INTO invoices (company_id, customer_id, invoice_number, invoice_date, due_date,
                          subtotal, total_amount, status, branch_id, cost_center_id, warehouse_id)
    VALUES (v_co, v_cust, 'ZZ-V3-75-45-I', CURRENT_DATE, CURRENT_DATE, 50, 50, 'sent', v_br, v_cc, v_wh)
    RETURNING id INTO v_inv;

    -- **ولا يُزرَعُ ما تمنعُه بنيةُ القاعدةِ نفسُها**: فهرسٌ فريدٌ يمنعُ قيدَ
    -- فاتورةٍ ثانياً على الفاتورةِ نفسِها — وهذا حصنٌ قائمٌ لا يُنقَض. فيُزرَعُ
    -- المذنبُ بنوعٍ لا يحرسُه فهرس: قيدا تكلفةِ بضاعةٍ مباعةٍ على فاتورةٍ واحدة.
    ALTER TABLE public.journal_entries DISABLE TRIGGER trg_prevent_duplicate_journal_entry;
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice_cogs', v_inv, CURRENT_DATE, 'v3.75.45 proof dup 1', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 50, 0, 'ar'), (v_je, v_rev, 0, 50, 'rev');
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice_cogs', v_inv, CURRENT_DATE, 'v3.75.45 proof dup 2', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 50, 0, 'ar'), (v_je, v_rev, 0, 50, 'rev');
    ALTER TABLE public.journal_entries ENABLE TRIGGER trg_prevent_duplicate_journal_entry;

    -- **ولا يُفتَحُ البابُ إلّا بقدرِ ما يمرّ**: يُشهَدُ على عودةِ كلِّ مُشغِّلٍ
    -- **قبلَ القياس** — فلو بقىَ واحدٌ مُعطَّلاً سقطتِ الهجرةُ ولم يُدَّعَ برهان.
    SELECT count(*) INTO v_off
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
     WHERE nsp.nspname = 'public' AND c.relname = 'journal_entries'
       AND NOT t.tgisinternal AND t.tgenabled = 'D';
    IF v_off <> 0 THEN
      RAISE EXCEPTION 'NOT_REARMED %', v_off;
    END IF;

    SELECT count(*) INTO v_guilty
      FROM public.ic_duplicate_journals(v_co) d
     WHERE (d.detail->>'reference_id')::uuid = v_inv;

    RAISE EXCEPTION 'MEASURED innocent=% guilty=%', v_innocent, v_guilty;
  EXCEPTION WHEN OTHERS THEN
    v_out := SQLERRM;          -- المعاملةُ الفرعيّةُ أُلغيت: لا صفَّ بقى ممّا زُرِع
  END;

  IF v_out = 'NO_SUBJECT' THEN
    RAISE NOTICE 'v3.75.45: no company in this house can carry the planting - no live proof is claimed.';
    RETURN;
  END IF;

  IF v_out ~ '^NOT_REARMED ' THEN
    RAISE EXCEPTION 'v3.75.45: a trigger was left disabled on journal_entries (%) - a door is opened only as wide as what passes through it.', v_out;
  END IF;

  IF v_out !~ '^MEASURED ' THEN
    RAISE EXCEPTION 'v3.75.45: the live proof could not run: %', v_out;
  END IF;

  IF v_out !~ 'innocent=0 ' THEN
    RAISE EXCEPTION 'v3.75.45 (a): two real payments on one bill are still called a double-booking -> %', v_out;
  END IF;
  IF v_out !~ 'guilty=1$' THEN
    RAISE EXCEPTION 'v3.75.45 (b): a real duplicate is no longer seen - a check that is silent about the guilty is not a check -> %', v_out;
  END IF;

  RAISE NOTICE 'v3.75.45 PROOF ok (all planted rows rolled back): %', v_out;
END
$proof$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٤ · الفحصُ المرجعىّ
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_45_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check45$
DECLARE
  k_hand constant int := 2;   -- بابا v3.75.44: يُحوَّلانِ فى دفعةٍ تُقاسُ وحدَها
  v_hand int;
  v_types text[];
  v_alerts int;
BEGIN
  -- (١) البيتُ الواحدُ قائمٌ ويقولُ ما يقول
  SELECT public.payment_journal_reference_types() INTO v_types;
  IF v_types IS NULL OR NOT ('invoice_payment' = ANY (v_types)) OR NOT ('bill_payment' = ANY (v_types)) THEN
    RAISE EXCEPTION 'v3.75.45 (1): the one home no longer names both payment reference types.';
  END IF;

  -- (٢) **ومعدودٌ لا مسكوتٌ عنه**: من يكتبُ صيغةَ الاستثناءِ بيدِه بدلَ نداءِ
  --     البيت. الاثنانِ الباقيانِ من v3.75.44 (`enforce_payment_reference_resolves`
  --     و`repair_unresolved_payment_references`) يُحوَّلانِ فى دفعةٍ تُقاسُ وحدَها.
  --     **ونصُّ الفحصِ مواصفةٌ لا صنعة** — فتُستثنى الفحوصُ المرجعيّةُ بالاسم.
  SELECT count(*) INTO v_hand
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~ 'reference_type IN \(''invoice_payment'', ''bill_payment''\)'
     AND p.proname NOT LIKE 'assert_baseline_%';

  IF v_hand > k_hand THEN
    RAISE EXCEPTION 'v3.75.45 (2): % function(s) still write the payment-reference list by hand, pinned at % - a rule with two houses says two things.', v_hand, k_hand;
  END IF;

  -- (٣) **والحكمُ بالأثر**: لا فاتورةَ شراءٍ أو مبيعاتٍ يُنذَرُ عنها لمجرّدِ أنّ
  --     لها أكثرَ من دفعة — يُقاسُ على كلِّ شركةٍ بدالّةِ اللوحةِ نفسِها.
  SELECT count(*) INTO v_alerts FROM (
    SELECT c.id FROM companies c, LATERAL public.ic_duplicate_journals(c.id) d
     WHERE d.detail->>'reference_type' = ANY (public.payment_journal_reference_types())) q;

  IF v_alerts > 0 THEN
    RAISE EXCEPTION 'v3.75.45 (3): % payment group(s) are still reported as a double-booking.', v_alerts;
  END IF;

  RETURN format('v3.75.45 ok - the payment-per-document rule has one home (%s place(s) write it by hand, pinned at %s) and no legitimate payment group is reported as a double-booking.', v_hand, k_hand);
END
$check45$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_45_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_45_check() TO service_role;

SELECT public.assert_baseline_v3_75_45_check();
