-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.38 — «وبابٌ يُسأَلُ: هل له قفل؟ لا: هل يطرقُه أحد؟»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ ما كُشف ═══
--
-- حملةُ «الأبوابِ بلا طارق» كانت تسألُ سؤالاً واحداً: **هل يطرقُ هذا البابَ
-- أحد؟** فإن لم يطرقْه أحدٌ نُزعت منحتُه. وهو سؤالٌ صحيحٌ لكنّه ليس الوحيد.
-- فقد بقىَ سؤالٌ لم يُسأَلْ قطُّ: **وهل لهذا البابِ قفلٌ أصلاً؟**
--
-- وقِيس على الإنتاج، بدورِ authenticated نفسِه، بهُويّةِ عضوٍ فى شركةٍ يطلبُ
-- بياناتِ شركةٍ **ليس عضواً فيها** — وحمايةُ الصفوفِ صامدةٌ تماماً:
--
--     ما تسمحُ حمايةُ الصفوفِ برؤيتِه من تلك الشركة ....  ٠ حساب · ٠ سطرَ يوميّة
--     وما سلّمَتْه الدوالُّ للشخصِ نفسِه فى اللحظةِ نفسِها:
--        get_trial_balance ...  ميزانُ المراجعةِ كاملاً بأسماءِ الحساباتِ وأرصدتِها
--        search_audit_trail ..  ٥٠ صفّاً من سجلِّ التدقيق
--        get_dashboard_kpis ..  الإيراداتُ والمشترياتُ والربح
--        reconcile_fifo_vs_gl   اسمُ منتجٍ وقيمةُ مخزونِه
--
-- **والعلّةُ أنّ الدالّةَ بصلاحيّاتٍ كاملةٍ يملكُها postgres، فهى معفاةٌ من
-- حمايةِ الصفوف، ثمّ لا تسألُ من المُنادى ولا إلى أىِّ شركةٍ ينتمى.** تأخذُ
-- رقمَ الشركةِ وسيطاً وتُصدّق. وأىُّ مستخدِمٍ مسجَّلٍ يبلغُها من متصفِّحِه
-- مباشرةً على /rest/v1/rpc/... بمفتاحِه هو، **بلا مرورٍ بأىِّ شاشة**.
--
-- ═══ ولماذا لم يصرخْ حارسُنا القديم — وهو صادق ═══
--
-- check-exposed-definer-functions.js **يحاكمُ الكاتباتِ وحدَهنّ**: شرطُه أن
-- يكونَ فى الجسدِ INSERT/UPDATE/DELETE. **والقارئاتُ خارجَ ولايتِه أصلاً.**
-- والرقمانِ يشهدان: الكاتباتُ التى لا تسألُ = صفر (الحارسُ يعمل)، والقارئاتُ
-- التى لا تصلُ إلى بوّابةِ سؤالٍ = ١٥٠.
--
-- ═══ ولا تُمَسُّ منحةٌ واحدةٌ فى هذه الهجرة ═══
--
-- **الأقفالُ أوّلاً، ومن يحقُّ له الطَّرْقُ بعدَها.** فنزعُ المنحِ هو ما يقطعُ
-- الطرق، وزرعُ السؤالِ لا يقطعُ شيئاً — وقد بُرهن. ولو نُزعت المنحُ اليومَ
-- لَكان العلاجُ مؤقّتاً: يعودُ الخطرُ فى اللحظةِ التى تحتاجُ فيها شاشةٌ جديدةٌ
-- إحدى هذه الدوالّ فتُمنَحُ من جديدٍ **بلا قفل**. **والقفلُ يبقى.**
--
-- ═══ ولا يُبنى بيتٌ ثانٍ ═══
--
-- لا تُؤلَّفُ هنا قاعدةُ «من يملكُ هذه الشركة» — البيتُ الواحدُ لها
-- public.assert_company_access(uuid) منذ v3.74.730، وهى التى:
--   • **تعودُ صامتةً حين لا هُويّةَ مستخدِمٍ أصلاً** — فمفتاحُ الخدمةِ ومهامُّ
--     الجدولةِ والنداءُ من داخلِ دالّةٍ أخرى **كلُّها تمرُّ كما كانت**؛
--   • وترفعُ الرفضَ برمزٍ **لا يلتقطُه EXCEPTION WHEN OTHERS** — فلا مُعالِجَ
--     متساهلٌ يبتلعُ الرفضَ ويُكمِل.
--
-- ═══ والسبعُ ═══
--
--   get_trial_balance(uuid,date)                 ← تُحوَّلُ من sql إلى plpgsql
--   get_trial_balance(uuid,date,date)
--   get_trial_balance(uuid,date,date,uuid,uuid)
--   get_dashboard_kpis(uuid,date,date)           ← تُحوَّلُ من sql إلى plpgsql
--   reconcile_fifo_vs_gl(uuid)
--   search_audit_trail(uuid,text,integer)
--   check_period_lock_for_date(uuid,date)
--
-- **ونصُّ الاستعلامِ لا يُمَسُّ حرفاً** فى أىٍّ منهنّ — يُزادُ سطرٌ واحدٌ قبلَه.
--
-- ═══ والبرهانُ ثلاثىُّ الاتّجاه ═══
--
-- الهجرةُ **تقيسُ قبلَ الجراحةِ ثمّ تقارنُ بما بعدَها**، وترفضُ نفسَها إن:
--   (أ) نقصَ صفٌّ واحدٌ ممّا كان يراه صاحبُ الشركةِ نفسُه — **وحارسٌ يصرخ على
--       البرىء يُطفأ**؛
--   (ب) أو مرَّ الغريبُ؛
--   (ج) أو انقطعَ طريقُ الخادم.
-- **ولا يُقاسُ الأثرُ بعدَ الحدثِ وحدَه.**
--
-- وتختارُ الهجرةُ موضوعاتِ التجربةِ **من القاعدةِ نفسِها لا من أسماءٍ مكتوبةٍ
-- هنا** — فهى تعملُ على أىِّ بيتٍ وعلى شركةٍ تُولَدُ غداً. وإن لم تجدْ شركتَين
-- **قالت ذلك صراحةً ولم تدّعِ برهاناً** — وبحثٌ لا يجد ليس دليلَ غياب.
--
-- ═══ والسقفُ لا يُثبَّتُ فى فحصٍ يجرى على البيتَين ═══
--
-- البيتانِ يختلفانِ فى عددِ الدوالِّ اختلافاً مشروعاً (قِيسَ اليوم: الإنتاج ١٤٣
-- والتجربة ١٤٥). ورقمٌ واحدٌ مكتوبٌ فى فحصٍ يجرى على الاثنَينِ إمّا أن يكذبَ على
-- أحدِهما وإمّا أن يُسكِتَ نموّاً فى الآخر. **فالشرطُ هنا، والعدُّ فى الحارسِ
-- الذى يقيسُ الإنتاجَ وحدَه — ومعدودٌ لا مسكوتٌ عنه، لكن فى بيتِه الصحيح.**
-- ═══════════════════════════════════════════════════════════════════════════

DO $before$
DECLARE
  v_own uuid; v_uid uuid; v_foreign uuid;
  v_tb int := -1; v_fifo int := -1; v_audit int := -1; v_kpi text := ''; v_lock text := '';
BEGIN
  SELECT cm.company_id, cm.user_id INTO v_own, v_uid
  FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id IS NOT NULL ORDER BY cm.company_id, cm.user_id LIMIT 1;

  IF v_own IS NULL THEN
    PERFORM set_config('erb.v38_subjects', 'none', false);
    RAISE NOTICE 'v3.75.38: no membership in this house - the lock is planted and no live proof is claimed.';
    RETURN;
  END IF;

  SELECT c.id INTO v_foreign FROM public.companies c
  WHERE c.id <> v_own AND (c.user_id IS DISTINCT FROM v_uid)
    AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = c.id AND m.user_id = v_uid)
  ORDER BY c.id LIMIT 1;

  PERFORM set_config('erb.v38_own', v_own::text, false);
  PERFORM set_config('erb.v38_uid', v_uid::text, false);
  PERFORM set_config('erb.v38_foreign', coalesce(v_foreign::text, ''), false);
  PERFORM set_config('erb.v38_subjects', CASE WHEN v_foreign IS NULL THEN 'own_only' ELSE 'both' END, false);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_tb    FROM public.get_trial_balance(v_own, DATE '2999-12-31') t;
  SELECT count(*) INTO v_fifo  FROM public.reconcile_fifo_vs_gl(v_own) t;
  SELECT count(*) INTO v_audit FROM public.search_audit_trail(v_own, '', 50) t;
  SELECT public.get_dashboard_kpis(v_own, DATE '1900-01-01', DATE '2999-12-31')::text INTO v_kpi;
  SELECT public.check_period_lock_for_date(v_own, CURRENT_DATE)::text INTO v_lock;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  PERFORM set_config('erb.v38_tb', v_tb::text, false);
  PERFORM set_config('erb.v38_fifo', v_fifo::text, false);
  PERFORM set_config('erb.v38_audit', v_audit::text, false);
  PERFORM set_config('erb.v38_kpi', v_kpi, false);
  PERFORM set_config('erb.v38_lock', v_lock, false);
  RAISE NOTICE 'v3.75.38 BEFORE: tb=% fifo=% audit=% lock=%', v_tb, v_fifo, v_audit, v_lock;
END
$before$;

CREATE OR REPLACE FUNCTION public.get_trial_balance(p_company_id uuid, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(account_code text, account_name text, account_type text, debit_balance numeric, credit_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  WITH account_balances AS (
    SELECT
      coa.id,
      coa.account_code,
      coa.account_name,
      coa.account_type,
      ROUND((
        COALESCE(coa.opening_balance, 0) +
        COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
      )::NUMERIC, 2) AS net_balance
    FROM public.chart_of_accounts coa
    LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
    LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
      AND je.company_id = p_company_id
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
      AND je.deleted_at IS NULL
      AND je.entry_date <= p_as_of_date
    WHERE coa.company_id = p_company_id
      AND coa.is_active = TRUE
    GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, coa.opening_balance
    HAVING ABS(COALESCE(coa.opening_balance, 0) + COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)) >= 0.01
  )
  SELECT
    ab.account_code,
    ab.account_name,
    ab.account_type,
    CASE WHEN ab.net_balance > 0 THEN ROUND(ab.net_balance, 2) ELSE 0 END AS debit_balance,
    CASE WHEN ab.net_balance < 0 THEN ROUND(ABS(ab.net_balance), 2) ELSE 0 END AS credit_balance
  FROM account_balances ab
  ORDER BY ab.account_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_trial_balance(p_company_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(account_id uuid, account_code text, account_name text, account_type text, total_debit numeric, total_credit numeric, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  SELECT
    coa.id as account_id,
    coa.code as account_code,
    coa.name as account_name,
    coa.account_type,
    COALESCE(SUM(jel.debit_amount), 0) as total_debit,
    COALESCE(SUM(jel.credit_amount), 0) as total_credit,
    (COALESCE(coa.opening_balance, 0) + COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)) as balance
  FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN public.journal_entries je ON jel.journal_entry_id = je.id
  WHERE coa.company_id = p_company_id
    AND coa.is_active = TRUE
    AND (je.id IS NULL OR (
      je.entry_date BETWEEN p_start_date AND p_end_date
      AND je.status = 'posted'
    ))
  GROUP BY coa.id, coa.code, coa.name, coa.account_type, coa.opening_balance
  HAVING (COALESCE(coa.opening_balance, 0) + COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)) != 0 OR COUNT(jel.id) > 0
  ORDER BY coa.code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_trial_balance(p_company_id uuid, p_start_date date, p_end_date date, p_branch_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(account_id uuid, account_code text, account_name text, account_type text, total_debit numeric, total_credit numeric, balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  SELECT
    coa.id as account_id,
    coa.code as account_code,
    coa.name as account_name,
    coa.account_type,
    COALESCE(SUM(jel.debit_amount), 0) as total_debit,
    COALESCE(SUM(jel.credit_amount), 0) as total_credit,
    COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) as balance
  FROM public.chart_of_accounts coa
  LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN public.journal_entries je ON jel.journal_entry_id = je.id
  WHERE coa.company_id = p_company_id
    AND coa.is_active = TRUE
    AND (je.id IS NULL OR (
      je.entry_date BETWEEN p_start_date AND p_end_date
      AND je.status = 'posted'
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
      AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id)
    ))
  GROUP BY coa.id, coa.code, coa.name, coa.account_type
  HAVING SUM(jel.debit_amount - jel.credit_amount) != 0 OR COUNT(jel.id) > 0
  ORDER BY coa.code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(p_company_id uuid, p_from_date date, p_to_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  WITH
  invoice_stats AS (
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN status IN ('paid','partially_paid') THEN paid_amount ELSE 0 END), 0)::NUMERIC, 2) AS paid_amount,
      ROUND(COALESCE(SUM(CASE WHEN status IN ('sent','partially_paid') THEN total_amount - paid_amount ELSE 0 END), 0)::NUMERIC, 2) AS receivables,
      COUNT(*) FILTER (WHERE status NOT IN ('draft','cancelled')) AS invoice_count
    FROM public.invoices
    WHERE company_id = p_company_id
      AND invoice_date BETWEEN p_from_date AND p_to_date
      AND (is_deleted IS NULL OR is_deleted = FALSE)
  ),
  bill_stats AS (
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN status NOT IN ('draft','cancelled') THEN total_amount ELSE 0 END), 0)::NUMERIC, 2) AS total_purchases,
      COUNT(*) FILTER (WHERE status NOT IN ('draft','cancelled')) AS bill_count
    FROM public.bills
    WHERE company_id = p_company_id
      AND bill_date BETWEEN p_from_date AND p_to_date
  ),
  gl_stats AS (
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN coa.account_type IN ('income','revenue') THEN jel.credit_amount - jel.debit_amount ELSE 0 END), 0)::NUMERIC, 2) AS gl_revenue,
      ROUND(COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END), 0)::NUMERIC, 2) AS gl_expenses
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.company_id = p_company_id
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
      AND je.deleted_at IS NULL
      AND je.entry_date BETWEEN p_from_date AND p_to_date
  )
  SELECT jsonb_build_object(
    'revenue',       i.paid_amount,
    'receivables',   i.receivables,
    'invoice_count', i.invoice_count,
    'purchases',     b.total_purchases,
    'bill_count',    b.bill_count,
    'gl_revenue',    g.gl_revenue,
    'gl_expenses',   g.gl_expenses,
    'gl_net_profit', g.gl_revenue - g.gl_expenses,
    'from_date',     p_from_date,
    'to_date',       p_to_date
  )
  INTO v_out
  FROM invoice_stats i, bill_stats b, gl_stats g;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_fifo_vs_gl(p_company_id uuid)
 RETURNS TABLE(product_id uuid, product_name text, fifo_value numeric, gl_inventory_value numeric, difference numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_total_gl_inventory NUMERIC := 0;
  v_total_fifo         NUMERIC := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
  INTO v_total_gl_inventory
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id
    AND je.status = 'posted'
    AND coa.account_type = 'asset'
    AND (coa.sub_type = 'inventory' OR coa.account_name ILIKE '%مخزون%');

  SELECT COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost), 0)
  INTO v_total_fifo
  FROM fifo_cost_lots fcl
  JOIN products p ON p.id = fcl.product_id
  WHERE p.company_id = p_company_id AND fcl.remaining_quantity > 0;

  RETURN QUERY
  SELECT
    p.id::UUID as product_id,
    p.name::TEXT as product_name,
    COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost), 0)::NUMERIC as fifo_value,
    CASE WHEN v_total_fifo > 0
      THEN ROUND((COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost), 0) / v_total_fifo) * v_total_gl_inventory, 4)
      ELSE 0 END::NUMERIC as gl_inventory_value,
    CASE WHEN v_total_fifo > 0
      THEN COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost), 0) -
           ROUND((COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost), 0) / v_total_fifo) * v_total_gl_inventory, 4)
      ELSE COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost), 0) END::NUMERIC as difference,
    CASE
      WHEN ABS(v_total_gl_inventory - v_total_fifo) < 1 THEN 'OK'
      WHEN ABS(v_total_gl_inventory - v_total_fifo) > v_total_gl_inventory * 0.05 THEN 'CRITICAL'
      ELSE 'WARNING'
    END::TEXT as status
  FROM products p
  LEFT JOIN fifo_cost_lots fcl ON fcl.product_id = p.id AND fcl.remaining_quantity > 0
  WHERE p.company_id = p_company_id
  GROUP BY p.id, p.name
  HAVING COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost), 0) > 0
  ORDER BY fifo_value DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_audit_trail(p_company_id uuid, p_search_term text, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, user_name text, action text, target_table text, record_identifier text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  SELECT
    al.id,
    al.user_name,
    al.action,
    al.target_table,
    al.record_identifier,
    al.created_at
  FROM audit_logs al
  WHERE al.company_id = p_company_id
    AND (
      al.record_identifier ILIKE '%' || p_search_term || '%' OR
      al.user_name ILIKE '%' || p_search_term || '%' OR
      al.user_email ILIKE '%' || p_search_term || '%' OR
      al.target_table ILIKE '%' || p_search_term || '%'
    )
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_period_lock_for_date(p_company_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_period RECORD;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT id, period_name, period_start, period_end, status, is_locked INTO v_period
  FROM public.accounting_periods
  WHERE company_id = p_company_id AND p_date BETWEEN period_start AND period_end
    AND (is_locked = TRUE OR status IN ('closed', 'locked')) LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('is_locked', TRUE, 'period_id', v_period.id,
      'period_name', v_period.period_name, 'period_start', v_period.period_start,
      'period_end', v_period.period_end, 'status', v_period.status);
  END IF;
  RETURN jsonb_build_object('is_locked', FALSE);
END;
$function$;

DO $proof$
DECLARE
  v_mode text := current_setting('erb.v38_subjects', true);
  v_own uuid; v_uid uuid; v_foreign uuid;
  v_tb int; v_fifo int; v_audit int; v_kpi text; v_lock text;
  v_leaked text := ''; v_cut text := '';
BEGIN
  BEGIN
    PERFORM public.check_period_lock_for_date(
      coalesce(nullif(current_setting('erb.v38_own', true), '')::uuid,
               '00000000-0000-0000-0000-000000000000'::uuid), CURRENT_DATE);
  EXCEPTION WHEN query_canceled THEN v_cut := v_cut || 'lock ';
  END;
  IF v_cut <> '' THEN
    RAISE EXCEPTION 'v3.75.38: the server path was cut (%) - no server path may ever be cut.', v_cut;
  END IF;

  IF v_mode IS NULL OR v_mode = 'none' THEN
    RAISE NOTICE 'v3.75.38: no membership in this house - lock planted, no live proof claimed.';
    RETURN;
  END IF;

  v_own := current_setting('erb.v38_own')::uuid;
  v_uid := current_setting('erb.v38_uid')::uuid;
  v_foreign := nullif(current_setting('erb.v38_foreign'), '')::uuid;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_tb    FROM public.get_trial_balance(v_own, DATE '2999-12-31') t;
  SELECT count(*) INTO v_fifo  FROM public.reconcile_fifo_vs_gl(v_own) t;
  SELECT count(*) INTO v_audit FROM public.search_audit_trail(v_own, '', 50) t;
  SELECT public.get_dashboard_kpis(v_own, DATE '1900-01-01', DATE '2999-12-31')::text INTO v_kpi;
  SELECT public.check_period_lock_for_date(v_own, CURRENT_DATE)::text INTO v_lock;

  IF v_foreign IS NOT NULL THEN
    BEGIN PERFORM public.get_trial_balance(v_foreign, DATE '2999-12-31');
      v_leaked := v_leaked || 'trial_balance '; EXCEPTION WHEN query_canceled THEN NULL; END;
    BEGIN PERFORM public.reconcile_fifo_vs_gl(v_foreign);
      v_leaked := v_leaked || 'fifo '; EXCEPTION WHEN query_canceled THEN NULL; END;
    BEGIN PERFORM public.search_audit_trail(v_foreign, '', 50);
      v_leaked := v_leaked || 'audit_trail '; EXCEPTION WHEN query_canceled THEN NULL; END;
    BEGIN PERFORM public.get_dashboard_kpis(v_foreign, DATE '1900-01-01', DATE '2999-12-31');
      v_leaked := v_leaked || 'dashboard_kpis '; EXCEPTION WHEN query_canceled THEN NULL; END;
    BEGIN PERFORM public.check_period_lock_for_date(v_foreign, CURRENT_DATE);
      v_leaked := v_leaked || 'period_lock '; EXCEPTION WHEN query_canceled THEN NULL; END;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  IF v_tb <> current_setting('erb.v38_tb')::int
     OR v_fifo <> current_setting('erb.v38_fifo')::int
     OR v_audit <> current_setting('erb.v38_audit')::int
     OR v_kpi <> current_setting('erb.v38_kpi')
     OR v_lock <> current_setting('erb.v38_lock') THEN
    RAISE EXCEPTION 'v3.75.38: the owner lost something after the lock - before(tb=% fifo=% audit=%) after(tb=% fifo=% audit=%).',
      current_setting('erb.v38_tb'), current_setting('erb.v38_fifo'), current_setting('erb.v38_audit'),
      v_tb, v_fifo, v_audit;
  END IF;

  IF v_leaked <> '' THEN
    RAISE EXCEPTION 'v3.75.38: the stranger still passes into: % - the lock closed nothing.', v_leaked;
  END IF;

  IF v_foreign IS NULL THEN
    RAISE NOTICE 'v3.75.38 PROOF: own(tb=% fifo=% audit=%) unchanged - no second company in this house, so no refusal proof is claimed.', v_tb, v_fifo, v_audit;
  ELSE
    RAISE NOTICE 'v3.75.38 PROOF: own(tb=% fifo=% audit=%) unchanged - the stranger was refused by all five - the server path passes.', v_tb, v_fifo, v_audit;
  END IF;
END
$proof$;

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_38_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check$
DECLARE
  k_locked text[] := ARRAY[
    'get_trial_balance(uuid,date)',
    'get_trial_balance(uuid,date,date)',
    'get_trial_balance(uuid,date,date,uuid,uuid)',
    'get_dashboard_kpis(uuid,date,date)',
    'reconcile_fifo_vs_gl(uuid)',
    'search_audit_trail(uuid,text,integer)',
    'check_period_lock_for_date(uuid,date)'
  ];
  v_missing text := ''; v_ungated text := ''; v_caller text := '';
  v_open int; v_gateless int; s text;
BEGIN
  FOREACH s IN ARRAY k_locked LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND pg_get_userbyid(p.proowner) = 'postgres'
        AND replace(p.oid::regprocedure::text, 'public.', '') = s
    ) THEN
      v_missing := v_missing || s || ' ';
    END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'v3.75.38 (1): missing or changed: %', v_missing;
  END IF;

  SELECT string_agg(x.sig, ' ') INTO v_ungated
  FROM (
    SELECT replace(p.oid::regprocedure::text, 'public.', '') AS sig, p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND replace(p.oid::regprocedure::text, 'public.', '') = ANY(k_locked)
  ) x
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc caller
    JOIN pg_namespace cn ON cn.oid = caller.pronamespace,
         LATERAL regexp_matches(caller.prosrc, '([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', 'g') m
    JOIN pg_proc gate ON gate.proname = m[1]
    JOIN pg_namespace gn ON gn.oid = gate.pronamespace AND gn.nspname = 'public'
    WHERE caller.oid = x.oid AND cn.nspname = 'public'
      AND gate.proname IN ('assert_company_access', 'assert_company_access_by_row')
  );
  IF v_ungated IS NOT NULL AND v_ungated <> '' THEN
    RAISE EXCEPTION 'v3.75.38 (2): a door with no lock: %', v_ungated;
  END IF;

  BEGIN
    PERFORM public.assert_company_access('00000000-0000-0000-0000-000000000001'::uuid);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'v3.75.38 (3): the gate refuses a caller with no identity - this cuts every server path.';
  END;

  SELECT string_agg(DISTINCT q.place, ' ') INTO v_caller
  FROM (
    SELECT 'invoker:' || p.proname AS place, p.prosrc AS txt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND NOT p.prosecdef
    UNION ALL
    SELECT 'default:' || cl.relname || '.' || a.attname, pg_get_expr(ad.adbin, ad.adrelid)
      FROM pg_attrdef ad JOIN pg_class cl ON cl.oid = ad.adrelid
      JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    UNION ALL
    SELECT 'check:' || con.conname, pg_get_constraintdef(con.oid)
      FROM pg_constraint con WHERE con.contype = 'c'
  ) q
  WHERE q.txt ~ '(^|[^A-Za-z0-9_])(public\.)?(get_trial_balance|get_dashboard_kpis|reconcile_fifo_vs_gl|search_audit_trail|check_period_lock_for_date)\s*\(';
  IF v_caller IS NOT NULL AND v_caller <> '' THEN
    RAISE EXCEPTION 'v3.75.38 (4): a place evaluated with the caller rights calls a locked door: %', v_caller;
  END IF;

  WITH RECURSIVE fns AS (
    SELECT p.oid, p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  ), tok AS (
    SELECT f.oid AS caller, m[1] AS callee_name
    FROM fns f, LATERAL regexp_matches(f.prosrc, '([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', 'g') m
  ), edges AS (
    SELECT DISTINCT t.caller, f2.oid AS callee FROM tok t JOIN fns f2 ON f2.proname = t.callee_name
  ), gates AS (
    SELECT oid FROM fns WHERE proname IN ('assert_company_access', 'assert_company_access_by_row')
  ), reach AS (
    SELECT g.oid AS f, 0 AS d FROM gates g
    UNION
    SELECT e.caller, r.d + 1 FROM edges e JOIN reach r ON e.callee = r.f WHERE r.d < 4
  ), target AS (
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND pg_get_function_arguments(p.oid) ~ 'p_company_id\s+uuid'
  )
  SELECT count(*), count(*) FILTER (WHERE t.oid NOT IN (SELECT f FROM reach))
  INTO v_open, v_gateless
  FROM target t;

  RETURN format('v3.75.38 ok - 7 doors locked - %s company-scoped and reachable by a logged-in user - %s gateless - the server path passes.',
                v_open, v_gateless);
END
$check$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_38_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_38_check() TO service_role;

SELECT public.assert_baseline_v3_75_38_check();
