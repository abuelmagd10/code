-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.42 — «ولا يُعكَسُ قيدٌ عُكِسَ مرّة»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ ما ظهرَ لعميلٍ حقيقىّ ═══
--
-- لوحةُ تحكّمِ شركةِ notniche أظهرت انحرافَين حرجَين:
--   • «أرصدةٌ سالبةٌ فى الأصول» — حساب ١١٣٠ العملاء = ‎-١٦٠٠
--   • «توازنُ الذممِ المدينة» — فرقٌ ١٦٠٠
--
-- والرقمانِ متساويانِ صدفةً، **والعطبانِ مختلفان**. هذه الهجرةُ تُعالجُ الأوّلَ
-- وجذرَه؛ والثانى (رابطٌ مكسورٌ فى مرجعِ دفعة) دفعةٌ تالية.
--
-- ═══ الجذر: بيتانِ يعكسانِ نفسَ الفاتورة، ولا يسألُ أحدُهما هل سبقَه الآخر ═══
--
-- الفاتورةُ INV-00005 (١٦٠٠) أُلغيت قبلَ الشحنِ وكان العميلُ دفعَ ١٥٠٠:
--
--   JE-000034   ٢١ يونيو   عكسُ الإيراد — من مسارِ «الاسترداد قبلَ الشحن»
--   JE-000058   ٩ أغسطس    [إلغاء] إيرادُ المبيعات — من هذا المُشغِّل
--
--   وكلاهما بالحرف:  مدين ٤١٠٠ إيرادات ١٦٠٠  /  دائن ١١٣٠ عملاء ١٦٠٠
--
-- **فالأثرُ مضاعف**: الذممُ صارت سالبةً بمقدارِ فاتورةٍ كاملة، **والإيرادُ نقصَ
-- ١٦٠٠ أيضاً** — أى أنّ ربحَ صاحبِ العملِ المعروضَ أقلُّ من الحقيقة.
--
-- والمُشغِّلُ `handle_invoice_cancellation_reversal` يعكسُ **كلَّ** قيدِ فاتورةٍ
-- حينَ تتحوّلُ الحالةُ من `sent` إلى `cancelled`، **بلا أن ينظرَ هل لذلك القيدِ
-- عكسٌ قائمٌ سلفاً**. ولا ذنبَ لمسارِ الاسترداد: كلاهما يفعلُ الصوابَ وحدَه.
--
-- ═══ والحكمُ بالأثرِ لا بالاسم ═══
--
-- لا يُتخطّى الأصلُ لأنّ اسمَ نوعِ الآخرِ فيه كلمةُ «عكس» — بل **لأنّه يعكسُه
-- سطراً بسطر**: نفسُ الحسابات، ونفسُ المبالغ، ومدينٌ مكانَ دائنٍ ودائنٌ مكانَ
-- مدين. فلو وُلد غداً مسارُ عكسٍ ثالثٌ باسمٍ لم يُكتَبْ هنا، **رآه هذا الشرطُ
-- كما يرى الاثنَين** — وشكلُ النصِّ ليس خاصّيّة.
--
-- ═══ والبرهانُ كتابةٌ حيّةٌ تُلغى، لا قراءة ═══
--
-- قفلٌ فى طريقِ مُشغِّلٍ لا يُبرهَنُ بقراءةِ نصّ. فالهجرةُ **تُنشئُ فاتورتَين
-- حقيقيّتَين وتُلغيهما فعلاً** ثمّ تقيسُ، ثمّ تُلغى كلَّ ما كتبت:
--
--   (أ) فاتورةٌ عُكِست سلفاً ثمّ تُلغى ....  يجبُ أن يبقى عكسٌ **واحد** والذممُ صفر
--   (ب) فاتورةٌ لم تُعكَسْ ثمّ تُلغى ......  يجبُ أن يُخلَقَ عكسٌ **واحد** والذممُ صفر
--
-- **و(ب) هى الأهمّ**: تُثبتُ أنّ العلاجَ لم يُعطِّلْ إلغاءَ الفواتيرِ السليم.
-- وقِيس قبلَ العلاجِ على قاعدةِ الاختبارِ فكان (أ) = عكسان والذممُ ‎-١٠٠٠،
-- **فالفخُّ يُشغَّلُ قبلَ أن يُنصَب**.
--
-- وإن لم تجدِ الهجرةُ فى البيتِ شركةً بعميلٍ وفرعٍ ومركزِ تكلفةٍ ومخزنٍ وحسابَى
-- ذممٍ وإيراد، **قالت ذلك صراحةً ولم تدّعِ برهاناً** — وبحثٌ لا يجد ليس دليلَ غياب.
--
-- ═══ ولا يُصحَّحُ دفترُ العميلِ هنا ═══
--
-- **الأهمُّ ثمّ الأهمّ**: البابُ يُغلَقُ أوّلاً. أمّا الـ١٦٠٠ القائمةُ فى دفترِ
-- notniche فتُصحَّحُ بقيدٍ يمرُّ بالبيتِ الواحدِ لإنشاءِ القيود، فى دفعةٍ تالية
-- لها برهانُها. **ولا يُحذَفُ JE-000058**: السجلُّ يحكى ما كان، والخطأُ يُصحَّحُ
-- بقيدٍ لا بمحو. والفحصُ المرجعىُّ هنا **يعدُّ الفواتيرَ المعكوسةَ مرّتَين
-- ويُثبِّتُها عند واحدة** — فلا تزيدُ، ومعدودٌ لا مسكوتٌ عنه.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_invoice_cancellation_reversal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
DECLARE
  v_original_je  RECORD;
  v_reversal_id  UUID;
BEGIN
  -- Only fire when sent → cancelled
  IF NOT (OLD.status = 'sent' AND NEW.status = 'cancelled') THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.allow_direct_post', 'true', true);

  BEGIN
    -- Find and reverse all JEs linked to this invoice (revenue + cogs)
    FOR v_original_je IN
      SELECT je.id, je.reference_type, je.description
      FROM journal_entries je
      WHERE je.company_id = NEW.company_id
        AND je.reference_id = NEW.id
        AND je.reference_type IN ('invoice', 'invoice_cogs')
        AND (je.is_deleted IS NULL OR je.is_deleted = false)
    LOOP
      -- v3.75.42 — **ولا يُعكَسُ قيدٌ عُكِسَ مرّة.**
      --
      -- مسارُ «الاسترداد قبلَ الشحن» يعكسُ الإيرادَ بنفسِه، ثمّ تتحوّلُ الحالةُ
      -- إلى ملغاة فيعكسُ هذا المُشغِّلُ القيدَ الأصلىَّ ثانيةً — فيصيرُ للفاتورةِ
      -- عكسان: الذممُ سالبةٌ والإيرادُ ناقصٌ بلا سبب (قِيس على عميلٍ حقيقىّ).
      --
      -- **والحكمُ بالأثرِ لا بالاسم**: لا يُنظَرُ إلى نوعِ القيدِ الآخرِ ولا إلى
      -- مَن كتبَه، بل هل يعكسُ هذا الأصلَ **سطراً بسطر** — نفسُ الحسابات ونفسُ
      -- المبالغ ومدينٌ مكانَ دائن. فمسارُ عكسٍ ثالثٌ يُولَدُ غداً بأىِّ اسمٍ
      -- يراه هذا الشرطُ كما يرى الاثنَين.
      IF EXISTS (
        SELECT 1
        FROM journal_entries r
        WHERE r.company_id = NEW.company_id
          AND r.reference_id = NEW.id
          AND r.id <> v_original_je.id
          AND r.status = 'posted'
          AND (r.is_deleted IS NULL OR r.is_deleted = false)
          AND NOT EXISTS (
            SELECT 1 FROM (
              SELECT l.account_id, l.debit_amount AS d, l.credit_amount AS c
                FROM journal_entry_lines l WHERE l.journal_entry_id = v_original_je.id
              EXCEPT ALL
              SELECT l.account_id, l.credit_amount, l.debit_amount
                FROM journal_entry_lines l WHERE l.journal_entry_id = r.id
            ) missing_from_the_mirror
          )
          AND NOT EXISTS (
            SELECT 1 FROM (
              SELECT l.account_id, l.credit_amount AS d, l.debit_amount AS c
                FROM journal_entry_lines l WHERE l.journal_entry_id = r.id
              EXCEPT ALL
              SELECT l.account_id, l.debit_amount, l.credit_amount
                FROM journal_entry_lines l WHERE l.journal_entry_id = v_original_je.id
            ) extra_in_the_mirror
          )
      ) THEN
        CONTINUE;   -- عُكِسَ سلفاً بالأثر — فلا يُعكَسُ ثانية
      END IF;

      -- Create reversal JE as draft
      INSERT INTO journal_entries (
        company_id, branch_id, reference_type, reference_id,
        entry_date, description, status
      ) VALUES (
        NEW.company_id, NEW.branch_id,
        v_original_je.reference_type || '_reversal',
        NEW.id,
        CURRENT_DATE,
        '[إلغاء] ' || v_original_je.description,
        'draft'
      ) RETURNING id INTO v_reversal_id;

      -- Mirror all lines with debit↔credit swapped
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id
      )
      SELECT
        v_reversal_id,
        jel.account_id,
        jel.credit_amount,   -- swap: original credit → reversal debit
        jel.debit_amount,    -- swap: original debit  → reversal credit
        '[عكس] ' || jel.description,
        jel.branch_id
      FROM journal_entry_lines jel
      WHERE jel.journal_entry_id = v_original_je.id;

      -- Post the reversal
      UPDATE journal_entries SET status = 'posted' WHERE id = v_reversal_id;
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.allow_direct_post', 'false', true);
    RAISE WARNING 'Cancellation reversal failed for invoice %: %', NEW.invoice_number, SQLERRM;
    -- Don't block the cancellation, just warn
  END;

  PERFORM set_config('app.allow_direct_post', 'false', true);
  RETURN NEW;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- البرهان: فاتورتانِ تُنشآنِ وتُلغيانِ فعلاً، ثمّ يُلغى كلُّ ما كُتب
-- ───────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_co uuid; v_cust uuid; v_br uuid; v_cc uuid; v_wh uuid; v_ar uuid; v_rev uuid;
  v_a uuid; v_b uuid; v_je uuid; v_out text; v_na int; v_nb int; v_sa numeric; v_sb numeric;
BEGIN
  BEGIN
    SELECT c.id INTO v_co FROM companies c
     WHERE EXISTS (SELECT 1 FROM customers x WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM branches x WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM cost_centers x WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM warehouses x WHERE x.company_id = c.id)
       AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.sub_type = 'accounts_receivable')
       AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id AND x.sub_type = 'sales_revenue')
     ORDER BY (SELECT count(*) FROM journal_entries je WHERE je.company_id = c.id) DESC
     LIMIT 1;

    IF v_co IS NULL THEN
      RAISE EXCEPTION 'NO_SUBJECT';
    END IF;

    SELECT x.id INTO v_cust FROM customers x           WHERE x.company_id = v_co LIMIT 1;
    SELECT x.id INTO v_br   FROM branches x            WHERE x.company_id = v_co LIMIT 1;
    SELECT x.id INTO v_cc   FROM cost_centers x        WHERE x.company_id = v_co LIMIT 1;
    SELECT x.id INTO v_wh   FROM warehouses x          WHERE x.company_id = v_co LIMIT 1;
    SELECT x.id INTO v_ar   FROM chart_of_accounts x   WHERE x.company_id = v_co AND x.sub_type = 'accounts_receivable' LIMIT 1;
    SELECT x.id INTO v_rev  FROM chart_of_accounts x   WHERE x.company_id = v_co AND x.sub_type = 'sales_revenue' LIMIT 1;

    -- (أ) فاتورةٌ عُكِست سلفاً قبلَ الشحن، ثمّ تُلغى
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO invoices (company_id, customer_id, invoice_number, invoice_date, due_date,
                          subtotal, total_amount, status, branch_id, cost_center_id, warehouse_id)
    VALUES (v_co, v_cust, 'ZZ-V3-75-42-A', CURRENT_DATE, CURRENT_DATE, 1000, 1000, 'sent', v_br, v_cc, v_wh)
    RETURNING id INTO v_a;
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice', v_a, CURRENT_DATE, 'v3.75.42 proof A', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 1000, 0, 'ar'), (v_je, v_rev, 0, 1000, 'rev');
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice_revenue_reversal_pre_shipment', v_a, CURRENT_DATE, 'v3.75.42 proof A reversal', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 0, 1000, 'ar rev'), (v_je, v_rev, 1000, 0, 'rev rev');
    UPDATE invoices SET status = 'cancelled' WHERE id = v_a;

    -- (ب) فاتورةٌ لم تُعكَسْ قطُّ، ثمّ تُلغى — الإلغاءُ السليمُ يجبُ ألّا يُعطَّل
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO invoices (company_id, customer_id, invoice_number, invoice_date, due_date,
                          subtotal, total_amount, status, branch_id, cost_center_id, warehouse_id)
    VALUES (v_co, v_cust, 'ZZ-V3-75-42-B', CURRENT_DATE, CURRENT_DATE, 1000, 1000, 'sent', v_br, v_cc, v_wh)
    RETURNING id INTO v_b;
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'invoice', v_b, CURRENT_DATE, 'v3.75.42 proof B', 'posted') RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je, v_ar, 1000, 0, 'ar'), (v_je, v_rev, 0, 1000, 'rev');
    UPDATE invoices SET status = 'cancelled' WHERE id = v_b;

    SELECT count(*) INTO v_na FROM journal_entries je WHERE je.reference_id = v_a AND je.reference_type ~ 'reversal';
    SELECT count(*) INTO v_nb FROM journal_entries je WHERE je.reference_id = v_b AND je.reference_type ~ 'reversal';
    SELECT coalesce(round(sum(jel.debit_amount - jel.credit_amount), 2), 0) INTO v_sa
      FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
     WHERE je.reference_id = v_a AND jel.account_id = v_ar;
    SELECT coalesce(round(sum(jel.debit_amount - jel.credit_amount), 2), 0) INTO v_sb
      FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
     WHERE je.reference_id = v_b AND jel.account_id = v_ar;

    RAISE EXCEPTION 'MEASURED a_rev=% a_ar=% b_rev=% b_ar=%', v_na, v_sa, v_nb, v_sb;
  EXCEPTION WHEN OTHERS THEN
    v_out := SQLERRM;            -- المعاملةُ الفرعيّةُ أُلغيت: لا صفَّ بقى
  END;

  IF v_out = 'NO_SUBJECT' THEN
    RAISE NOTICE 'v3.75.42: no company in this house has customer+branch+cost centre+warehouse+AR+revenue - the lock is planted and no live proof is claimed.';
    RETURN;
  END IF;

  IF v_out !~ '^MEASURED ' THEN
    RAISE EXCEPTION 'v3.75.42: the live proof could not run: %', v_out;
  END IF;

  IF v_out !~ 'a_rev=1 ' THEN
    RAISE EXCEPTION 'v3.75.42 (أ): an invoice already reversed was reversed again -> %', v_out;
  END IF;
  IF v_out !~ 'a_ar=0(\.00)? ' THEN
    RAISE EXCEPTION 'v3.75.42 (أ): receivables did not come back to zero -> %', v_out;
  END IF;
  IF v_out !~ 'b_rev=1 ' THEN
    RAISE EXCEPTION 'v3.75.42 (ب): a clean cancellation no longer reverses exactly once -> %', v_out;
  END IF;
  IF v_out !~ 'b_ar=0(\.00)?$' THEN
    RAISE EXCEPTION 'v3.75.42 (ب): a clean cancellation left receivables behind -> %', v_out;
  END IF;

  RAISE NOTICE 'v3.75.42 PROOF ok (all planted rows rolled back): %', v_out;
END
$proof$;

-- ───────────────────────────────────────────────────────────────────────────
-- الفحصُ المرجعىّ
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_42_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check$
DECLARE
  k_pinned constant int := 1;   -- INV-00005 لدى notniche — تُصحَّحُ فى دفعةٍ تالية
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

  -- (٣) ومعدودٌ لا مسكوتٌ عنه: فواتيرُ لها أكثرُ من عكسٍ مطابقٍ بالأثر
  SELECT count(*) INTO v_dup FROM (
    SELECT o.reference_id
    FROM journal_entries o
    WHERE o.status = 'posted' AND o.reference_type IN ('invoice', 'invoice_cogs')
      AND (o.is_deleted IS NULL OR o.is_deleted = false)
      AND (
        SELECT count(*) FROM journal_entries r
        WHERE r.company_id = o.company_id AND r.reference_id = o.reference_id
          AND r.id <> o.id AND r.status = 'posted'
          AND (r.is_deleted IS NULL OR r.is_deleted = false)
          AND NOT EXISTS (
            SELECT 1 FROM (
              SELECT l.account_id, l.debit_amount AS d, l.credit_amount AS c FROM journal_entry_lines l WHERE l.journal_entry_id = o.id
              EXCEPT ALL
              SELECT l.account_id, l.credit_amount, l.debit_amount FROM journal_entry_lines l WHERE l.journal_entry_id = r.id
            ) q1)
          AND NOT EXISTS (
            SELECT 1 FROM (
              SELECT l.account_id, l.credit_amount AS d, l.debit_amount AS c FROM journal_entry_lines l WHERE l.journal_entry_id = r.id
              EXCEPT ALL
              SELECT l.account_id, l.debit_amount, l.credit_amount FROM journal_entry_lines l WHERE l.journal_entry_id = o.id
            ) q2)
      ) > 1
    GROUP BY o.reference_id
  ) dup;

  IF v_dup > k_pinned THEN
    RAISE EXCEPTION 'v3.75.42 (3): % invoice(s) carry more than one mirror reversal, pinned at % - a debt that is written and not paid becomes a habit.', v_dup, k_pinned;
  END IF;

  RETURN format('v3.75.42 ok - a cancelled invoice is never reversed twice (judged by effect, not by name; proven by a live write that was rolled back) - %s invoice(s) still carry a duplicate reversal, pinned at %s and corrected in a later release.', v_dup, k_pinned);
END
$check$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_42_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_42_check() TO service_role;

SELECT public.assert_baseline_v3_75_41_check();
SELECT public.assert_baseline_v3_75_42_check();
