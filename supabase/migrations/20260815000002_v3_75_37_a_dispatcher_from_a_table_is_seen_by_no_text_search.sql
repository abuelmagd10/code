-- ---------------------------------------------------------------------------
-- v3.75.37 — «والمُرسِلُ من جدولٍ لا يراه باحثٌ فى النصّ»
-- ---------------------------------------------------------------------------
-- سبعٌ وخمسونَ دالّةَ فحصِ سلامةٍ (`ic_*`) بصلاحيّاتٍ كاملةٍ مفتوحةٌ لكلِّ
-- مستخدِمٍ مسجَّل، **ولا يطرقُها أحدٌ من الطارقينَ الخمسة**: لا شاشةَ تناديها،
-- ولا سياسةَ حمايةٍ، ولا عرضاً، ولا إعلانَ ما قبلَ الدخول، **ولا موضعاً يُقيَّمُ
-- بحقِّ صاحبِ العمليّة**.
--
-- ومَن ينادِيها إذن؟ **مُرسِلٌ واحدٌ يقرأُ أسماءَها من جدول**:
--
--     run_all_integrity_checks(p_company_id)
--       └─ FOR ... IN SELECT d.fn_name FROM integrity_check_definitions d WHERE d.active
--            └─ EXECUTE format('SELECT severity, detail FROM %I($1)', v_def_fn)
--
-- **والاسمُ هنا ليس مكتوباً فى شيفرةٍ ولا فى جسمِ دالّة، بل هو صفٌّ فى جدول.**
-- فلا يراه باحثٌ فى النصِّ مهما دقّ — لا فى الشيفرةِ ولا فى القاعدة. ولذلك
-- عدَّها الحارسُ «بلا طارق» وهو صادقٌ فى حكمِه: **المنحةُ فعلاً لا تفتحُ شيئاً
-- لأحدٍ يحتاجُها**، لأنّ `run_all_integrity_checks` **دالّةُ صلاحيّاتٍ كاملةٍ
-- يملكُها `postgres`**، فالنداءُ من داخلِها يجرى بحقِّ مالكِها لا بحقِّ المُنادى.
--
-- **ولا يُصدَّقُ هذا بالوصف.** جُرِّب حيّاً على الإنتاجِ قبلَ كتابةِ هذا الملفّ،
-- بدورِ `authenticated` نفسِه، داخلَ معاملةٍ أُلغيت بالكامل:
--
--     نُزعت المنحُ السبعُ والخمسون ................................  57
--     ثمّ النداءُ المباشرُ لـ ic_trial_balance ....................  42501
--     والمُرسِلُ run_all_integrity_checks(NULL) قبلَ النزع .........  2 صفّاً · 0 خطأ
--     وبعدَ النزع ................................................  2 صفّاً · 0 خطأ
--
-- **والرقمُ الأخيرُ هو البرهان.** فالمُرسِلُ يلتقطُ خطأَ كلِّ فحصٍ ويُعيدُه صفّاً
-- فيه مفتاحُ `error`. فلو انكسرَ النداءُ الداخلىُّ بعدَ النزعِ لَعادَ **صفٌّ لكلِّ
-- فحصٍ فى كلِّ شركة** — أى ٣٤٢ صفَّ خطأ. وعادَ صفرٌ. **فالبوّابةُ وحدَها أُغلقت،
-- والمُرسِلُ يمرُّ كما كان.**
--
-- وشاشةُ سلامةِ النظامِ تنادى `run_all_integrity_checks` وحدَها
-- (`app/api/governance/system-integrity`)، **وهى تبقى مفتوحةً كما هى**.
-- ومنحةُ `service_role` باقيةٌ على السبعِ والخمسين — فلا طريقَ خادمٍ يُقطَع.
-- ---------------------------------------------------------------------------

-- ═══ (١) القياسُ قبلَ النزع ═══════════════════════════════════════════════════
-- **ولا يُقاسُ الأثرُ بعدَ الحدثِ وحدَه.** يُحفَظُ الحالُ قبلَ النزعِ ليُقارَنَ به.
DO $before$
DECLARE v_rows INT; v_err INT;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE detail ? 'error') INTO v_rows, v_err
    FROM public.run_all_integrity_checks(NULL);
  PERFORM set_config('erb.v3_75_37_rows', v_rows::text, false);
  PERFORM set_config('erb.v3_75_37_err',  v_err::text,  false);
END;
$before$;

-- ═══ (٢) تُغلَقُ السبعُ والخمسون ══════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.ic_accounting_equation(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_anon_reachable_readers(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_anon_reachable_writers(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_ap_balance(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_ar_balance(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_attendance_log_stuck(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_backup_stale(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_bank_recon_pending(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_bank_transfer_unbalanced(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_bonus_invoice_orphan(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_bonus_reversal_pending(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_booking_no_invoice(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_branch_isolation(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_branch_no_warehouse(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_chart_of_accounts_structure(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_closed_period_mutations(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_cogs_balance(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_company_no_owner(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_credit_without_journal(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_critical_triggers(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_customer_branch_governance(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_customer_credit(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_customer_duplicate_phone(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_duplicate_journals(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_estimate_orphans(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_expense_no_journal(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_exposed_definer_functions(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_fifo_lot_integrity(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_financial_op_no_audit(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_fx_amount_accuracy(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_fx_draft_stale(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_inventory_cost_drift(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_inventory_gl_vs_fifo(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_inventory_valuation_drift(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_linked_so_no_invoice(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_manufacturing_consumption(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_negative_assets(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_negative_stock(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_orphaned_journals(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_overpaid_no_credit(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_payment_double_allocation(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_payment_no_journal(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_perm_shares_expired(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_return_chain(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_return_exceeds_invoice(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_return_total_mismatch(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_sales_return_no_journal(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_stale_approvals(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_stale_critical_notifications(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_stale_transfers(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_subscription_past_due(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_tax_accuracy(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_template_accounts_missing(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_trial_balance(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_unbalanced_journals(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_vendor_credit(p_company_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ic_workflow_stuck(p_company_id uuid) FROM PUBLIC, anon, authenticated;

-- ═══ (٣) البرهانُ الحىّ ══════════════════════════════════════════════════════
DO $do$
DECLARE
  v_uid    uuid;
  v_direct TEXT;
  v_open   TEXT;
  v_rows   INT;
  v_err    INT;
  b_rows   INT := current_setting('erb.v3_75_37_rows', true)::int;
  b_err    INT := current_setting('erb.v3_75_37_err',  true)::int;
BEGIN
  IF b_rows IS NULL THEN
    RAISE EXCEPTION 'v3.75.37: لم يُحفَظِ القياسُ قبلَ النزع — ولا يُقارَنُ بما لم يُقَسْ.';
  END IF;

  -- (أ) **لا فحصَ من السبعةِ والخمسينَ يبلغُه زائرٌ ولا مستخدِمٌ مسجَّل.**
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (SELECT d.fn_name FROM public.integrity_check_definitions d WHERE d.active)
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.37: فحصُ سلامةٍ ما زال يبلغُه من لا يطرقُه: %', v_open;
  END IF;

  -- (ب) **والنداءُ المباشرُ يُرفَض.**
  SELECT up.user_id INTO v_uid FROM public.user_profiles up
   WHERE up.username IS NOT NULL ORDER BY up.user_id LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'v3.75.37: لا مستخدِمَ حقيقىَّ لأُجرّبَ عليه — فحصٌ صامتٌ لا سليم.';
  END IF;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    PERFORM public.ic_trial_balance(NULL::uuid);
    v_direct := 'ALLOWED';
  EXCEPTION WHEN OTHERS THEN v_direct := SQLSTATE;
  END;
  RESET ROLE;
  IF v_direct <> '42501' THEN
    RAISE EXCEPTION 'v3.75.37: النداءُ المباشرُ لم يُرفَضْ لعدمِ الصلاحيّة، بل (%).', v_direct;
  END IF;

  -- (ج) **والمُرسِلُ يمرُّ كما كان** — وهذا هو البرهان: لو انكسرَ النداءُ الداخلىُّ
  --     لَالتقطَ المُرسِلُ الخطأَ وأعادَ صفّاً فيه مفتاحُ error لكلِّ فحصٍ فى كلِّ شركة.
  --     **وحارسٌ يُغلقُ على البرىء يُطفأ.**
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    SELECT count(*), count(*) FILTER (WHERE detail ? 'error') INTO v_rows, v_err
      FROM public.run_all_integrity_checks(NULL);
  END;
  RESET ROLE;

  IF v_err > b_err THEN
    RAISE EXCEPTION
      'v3.75.37: المُرسِلُ صارَ يُعيدُ أخطاءً بعدَ النزع (% بعدَ أن كانت %) — أُغلق على البرىء.',
      v_err, b_err;
  END IF;
  IF v_rows <> b_rows THEN
    RAISE EXCEPTION
      'v3.75.37: تغيّرَ ما يُعيدُه المُرسِلُ بعدَ النزع (% بعدَ أن كان %) — والنزعُ لا يُغيّرُ نتيجةَ فحص.',
      v_rows, b_rows;
  END IF;
END;
$do$;

-- ═══ (٤) الفحصُ المرجعىُّ الجديد ═════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_37_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_bad TEXT;
  v_n   INT;
BEGIN
  -- (١) **كلُّ فحصِ سلامةٍ فعّالٍ له دالّةٌ موجودة** — ولا إعلانَ يشيرُ إلى لا شىء.
  SELECT string_agg(d.fn_name, ', ' ORDER BY d.fn_name) INTO v_bad
    FROM public.integrity_check_definitions d
   WHERE d.active
     AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.proname = d.fn_name);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.37: إعلانُ فحصٍ يُسمّى دالّةً لا وجودَ لها: %', v_bad;
  END IF;

  -- (٢) **وكلُّها مغلقةٌ فى وجهِ الزائرِ والمستخدِمِ المسجَّل.**
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (SELECT d.fn_name FROM public.integrity_check_definitions d WHERE d.active)
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.37: فحصُ سلامةٍ عادَ يبلغُه من لا يطرقُه: %', v_bad;
  END IF;

  -- (٣) **ولم يُقطَعْ طريقُ الخادم** — **ونصفُ جراحةٍ أسوأُ من لا جراحة.**
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (SELECT d.fn_name FROM public.integrity_check_definitions d WHERE d.active)
     AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.37: نُزعت منحةُ الخدمةِ أيضاً فانقطعَ طريقُ الخادم: %', v_bad;
  END IF;

  -- (٤) **وكلُّها باقيةٌ بصلاحيّاتٍ كاملةٍ يملكُها postgres** — فلو صارت
  --     `SECURITY INVOKER` لَانكسرَ نداءُ المُرسِلِ عليها بعدَ الإغلاق.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (SELECT d.fn_name FROM public.integrity_check_definitions d WHERE d.active)
     AND (NOT p.prosecdef OR pg_get_userbyid(p.proowner) <> 'postgres');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.37: فحصُ سلامةٍ فقدَ صلاحيّاتِه الكاملةَ أو مالكَه: %', v_bad;
  END IF;

  -- (٥) **ولا موضعَ يُقيَّمُ بحقِّ صاحبِ العمليّةِ ينادِيها** — وهو الشرطُ الذى
  --     جعلَ الإغلاقَ آمناً. فلو وُلدَ غداً زنادٌ أو قيمةٌ افتراضيّةٌ أو دالّةٌ
  --     بصلاحيّاتِ مُنادِيها تنادِى فحصاً منها، لَانكسرَ عندَها صامتاً.
  --     **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه.**
  SELECT string_agg(DISTINCT d.fn_name, ', ') INTO v_bad
    FROM public.integrity_check_definitions d
   WHERE d.active
     AND EXISTS (
       SELECT 1 FROM (
         SELECT pg_get_expr(ad.adbin, ad.adrelid) AS txt
           FROM pg_attrdef ad JOIN pg_class c ON c.oid = ad.adrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
         UNION ALL
         SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k
           JOIN pg_namespace n ON n.oid = k.connamespace
          WHERE n.nspname = 'public' AND k.contype = 'c'
         UNION ALL
         SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND (i.indexprs IS NOT NULL OR i.indpred IS NOT NULL)
         UNION ALL
         SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgqual IS NOT NULL
         UNION ALL
         SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND NOT p.prosecdef
       ) s
       WHERE s.txt ~ ('(^|[^A-Za-z0-9_])(public\.)?' || d.fn_name || '\s*\(')
     );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.37: فحصُ سلامةٍ صارَ يُنادَى من موضعٍ يجرى بحقِّ صاحبِ العمليّةِ فينكسرُ: %', v_bad;
  END IF;

  -- (٦) **والمُرسِلُ حىٌّ ويقرأُ أسماءَه من الجدولِ ويبلغُه المستخدِمُ المسجَّل** —
  --     فلو ماتَ أو أُغلق أو صارَ يكتبُ الأسماءَ بيدِه لَانقطعَ الطريقُ الوحيدُ إليها.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'run_all_integrity_checks'
     AND p.prosecdef AND pg_get_userbyid(p.proowner) = 'postgres'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND p.prosrc LIKE '%integrity_check_definitions%'
     AND p.prosrc LIKE '%EXECUTE%';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'v3.75.37: المُرسِلُ run_all_integrity_checks ماتَ أو أُغلق أو لم يعُدْ يقرأُ الجدول.';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_37_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_37_check() TO service_role;

-- ═══ (٥) وفخٌّ لا يُشغَّل ليس فخّاً ═══════════════════════════════════════════
SELECT public.assert_baseline_v3_75_37_check();
