-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.64 — «والصفُّ يُولَدُ بعملةِ صاحبِه»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ما كان قائماً
-- ─────────────
-- تسعةٌ وعشرون عموداً فى خمسةٍ وعشرين جدولاً من جداولِ الشركاتِ تحملُ قيمةً
-- افتراضيّةً تُسمّى عملةً بعينِها: من سكتَ عن العملةِ يومَ الإدخالِ خُتِمَ
-- صفُّه بجنيهٍ (أو دولارٍ أو ريالٍ) لم يخترْه أحد. فشركةٌ أساسُها الريالُ
-- يُولَدُ قيدُها الصامتُ جنيهاً — والقاعدةُ نفسُها هى من اخترعَتْه.
-- وبعدَ أن كفَّت دوالُّ القاعدةِ كلُّها عن افتراضِ العملةِ (v3.75.63) بقيتِ
-- القيمُ الافتراضيّةُ آخرَ فمٍ يخترع.
--
-- العلاجُ الواحد
-- ──────────────
-- «إن سكتَ الصفُّ سُئلَ البيتُ يومَ الميلاد»: مُشغِّلٌ واحدٌ
-- (erp_currency_is_asked_at_birth) يقفُ قبلَ الإدخالِ على الجداولِ الخمسةِ
-- والعشرين، فإن جاءتِ العملةُ صريحةً صُدِّقَتْ ولم تُمَسّ، وإن جاءت صمتاً
-- (فراغاً أو لا شيئاً) سُئلَ البيتُ الواحدُ erp_company_base_currency
-- بعملةِ الشركةِ صاحبةِ الصفِّ — والبيتُ يصرخُ ولا يخترع. ثمّ نُزِعَتِ
-- القيمُ الافتراضيّةُ التسعُ والعشرون كلُّها، فلا فمَ يخترعُ بعدَ اليوم.
--
-- وقيدُ إشعارِ المَدينِ (chk_customer_debit_currency) كان يحكمُ بالاسمِ:
-- «بلا صفِّ عملةٍ لا عملةَ إلّا الجنيه» — فصارَ يحكمُ بالسؤال: بلا صفِّ
-- عملةٍ لا سعرَ صرفٍ غيرَ الواحد، وحارسٌ (erp_debit_note_no_foreign_without_fx)
-- يسألُ البيتَ ويرفضُ عملةً أجنبيّةً بلا صفِّ صرفٍ مُعلَن.
--
-- ومعدودٌ لا مسكوتٌ عنه
-- ─────────────────────
-- عمودٌ ثلاثون (company_seats.display_currency) ليس عملةَ دفاترِ شركةٍ بل
-- عملةُ عرضِ تسعيرِ المنصّةِ نفسِها لمقاعدِها (كما subscription_plans) —
-- يُعلَنُ باسمِه وسببِه وشرطِ رفعِه فى حارسِ القاعدةِ ولا يُسكَتُ عنه.
-- ولا صفَّ قائمٌ يُمَسُّ: الهجرةُ تحكمُ المواليدَ ولا تُعيدُ كتابةَ التاريخ.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- (١) بيتُ الختمِ الواحد: إن سكتَ الصفُّ سُئلَ البيتُ يومَ الميلاد
--     (بصلاحيّاتٍ كاملةٍ محفوظةٍ كسوابقِه fill_*_fx_from_source ومُبلِّغى
--      v3.75.63، ولا يبلغُه مستخدِمٌ رأساً — فالنداءُ من المُشغِّلِ وحدَه.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_currency_is_asked_at_birth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row   jsonb := to_jsonb(NEW);
  v_patch jsonb := '{}'::jsonb;
  v_home  text  := NULL;
  v_col   text;
  v_val   text;
BEGIN
  IF (v_row ->> 'company_id') IS NULL THEN
    RETURN NEW;
  END IF;

  FOR i IN 0 .. TG_NARGS - 1 LOOP
    v_col := TG_ARGV[i];
    v_val := v_row ->> v_col;
    IF v_val IS NULL OR btrim(v_val) = '' THEN
      IF v_home IS NULL THEN
        v_home := public.erp_company_base_currency((v_row->>'company_id')::uuid);
      END IF;
      v_patch := v_patch || jsonb_build_object(v_col, v_home);
    END IF;
  END LOOP;

  IF v_patch <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, v_patch);
  END IF;
  RETURN NEW;
END
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- (٢) حارسُ إشعارِ المَدين: لا عملةَ أجنبيّةً بلا صفِّ صرفٍ يُسمّى صفَّه
--     (كان القيدُ يحكمُ بالاسمِ فصارَ الحارسُ يحكمُ بالسؤال.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_debit_note_no_foreign_without_fx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_home text;
BEGIN
  IF NEW.currency_id IS NULL
     AND NEW.original_currency IS NOT NULL
     AND btrim(NEW.original_currency) <> '' THEN
    v_home := public.erp_company_base_currency(NEW.company_id);
    IF upper(btrim(NEW.original_currency)) <> v_home THEN
      RAISE EXCEPTION 'إشعارُ مَدينٍ بعملةِ % بلا صفِّ عملةٍ مُعلَن، وعملةُ البيتِ %. لا عملةَ أجنبيّةً بلا سعرِ صرفٍ يُسمّى صفَّه.',
        NEW.original_currency, v_home
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- (٣) خمسةٌ وعشرون مُشغِّلاً يقفون قبلَ الإدخال — والاسمُ يبدأُ بـ ab_ كى
--     يجرىَ الختمُ بعدَ حارسِ فصلِ المهامِّ (aa_) وقبلَ كلِّ من يقرأُ العملة.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.approval_workflows
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.bank_voucher_requests
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code', 'original_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.booking_payments
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.chart_of_accounts
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('original_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.customer_debit_notes
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('original_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.customer_refund_requests
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('balance_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.estimates
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.inventory_write_offs
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code', 'original_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code', 'original_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code', 'original_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('original_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.purchase_requests
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.purchase_returns
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('original_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.services
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.shareholder_drawings
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency_code');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('balance_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.user_bonuses
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('bonus_currency');

CREATE OR REPLACE TRIGGER ab_currency_asked_at_birth
BEFORE INSERT ON public.vendor_refund_requests
FOR EACH ROW EXECUTE FUNCTION public.erp_currency_is_asked_at_birth('currency');

-- ─────────────────────────────────────────────────────────────────────────
-- (٤) قيدُ إشعارِ المَدينِ يكفُّ عن تسميةِ عملةٍ: يبقى حكمُ السعرِ الواحدِ
--     قيداً، ويصيرُ حكمُ العملةِ سؤالاً للبيتِ عبرَ الحارسِ (٢).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.customer_debit_notes DROP CONSTRAINT chk_customer_debit_currency;
ALTER TABLE public.customer_debit_notes ADD CONSTRAINT chk_customer_debit_currency
  CHECK (((currency_id IS NOT NULL) OR (exchange_rate = (1)::numeric)));

CREATE OR REPLACE TRIGGER ac_debit_note_no_foreign_without_fx
BEFORE INSERT OR UPDATE ON public.customer_debit_notes
FOR EACH ROW EXECUTE FUNCTION public.erp_debit_note_no_foreign_without_fx();

-- ─────────────────────────────────────────────────────────────────────────
-- (٥) تسعٌ وعشرون قيمةً افتراضيّةً تُنزَع — فلا فمَ فى القاعدةِ يخترعُ عملةً
--     بعدَ اليوم. (ولا صفَّ قائمٌ يُمَسّ.)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.approval_workflows ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.bank_voucher_requests ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.bills ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.bills ALTER COLUMN original_currency DROP DEFAULT;
ALTER TABLE public.booking_payments ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.bookings ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.chart_of_accounts ALTER COLUMN original_currency DROP DEFAULT;
ALTER TABLE public.customer_debit_notes ALTER COLUMN original_currency DROP DEFAULT;
ALTER TABLE public.customer_refund_requests ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.customers ALTER COLUMN balance_currency DROP DEFAULT;
ALTER TABLE public.estimates ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.expenses ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.inventory_write_offs ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.invoices ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.invoices ALTER COLUMN original_currency DROP DEFAULT;
ALTER TABLE public.journal_entries ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.journal_entries ALTER COLUMN original_currency DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN original_currency DROP DEFAULT;
ALTER TABLE public.products ALTER COLUMN original_currency DROP DEFAULT;
ALTER TABLE public.purchase_orders ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.purchase_requests ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.purchase_returns ALTER COLUMN original_currency DROP DEFAULT;
ALTER TABLE public.sales_orders ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.services ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.shareholder_drawings ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.suppliers ALTER COLUMN balance_currency DROP DEFAULT;
ALTER TABLE public.user_bonuses ALTER COLUMN bonus_currency DROP DEFAULT;
ALTER TABLE public.vendor_refund_requests ALTER COLUMN currency DROP DEFAULT;

-- ─────────────────────────────────────────────────────────────────────────
-- (٦) الفحصُ المرجعىّ — يقيسُ فى كلِّ تشغيلٍ أنّ المكسبَ قائم:
--     (أ)  لا قيمةَ افتراضيّةً تُسمّى عملةً خارجَ المُعلَناتِ الأربع.
--     (أ٢) والمُعلَناتُ الأربعُ حيّةٌ بأسمائِها لا أقلَّ ولا أكثر.
--     (ب)  والخمسةُ والعشرون مُشغِّلاً واقفون قبلَ الإدخالِ كلٌّ بأعمدتِه.
--     (ج)  وبيتُ الختمِ واحدٌ بصلاحيّاتِه الكاملةِ المحفوظةِ يسألُ البيت.
--     (د)  وقيدُ إشعارِ المَدينِ لا يُسمّى عملةً وحارسُه يصرخُ ويسأل.
--     (هـ) والبيتُ الواحدُ قائمٌ كما وُلد.
--     (أسماءُ المُشغِّلاتِ المبنيّةُ هنا تُقطَعُ وصلاً كدرسِ v3.75.63 —
--      فذِكرُ اسمٍ بشكلِ نداءٍ يُحسَبُ عندَ حارسِ الأبوابِ طرقاً.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_64_check()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $function$
DECLARE
  v_ccy     text := '(EGP|USD|SAR|EUR|GBP|AED|KWD|JOD|QAR|BHD|OMR)';
  v_n       int;
  v_names   text;
  v_missing text := '';
  v_secdef  int; v_home_call int;
  v_txt     text;
  v_home_n int; v_home_secdef int; v_home_screams int; v_rls int;
  r record;
BEGIN
  -- (أ) لا قيمةَ افتراضيّةً تُسمّى عملةً خارجَ المُعلَناتِ الأربع
  SELECT count(*), string_agg(c.relname || '.' || a.attname, ' · ')
    INTO v_n, v_names
  FROM pg_attrdef d
  JOIN pg_class c ON c.oid = d.adrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  WHERE ns.nspname = 'public'
    AND pg_get_expr(d.adbin, d.adrelid) ~ ('''' || v_ccy || '''')
    AND (c.relname || '.' || a.attname) NOT IN
        ('companies.base_currency', 'pending_companies.currency',
         'subscription_plans.base_currency', 'company_seats.display_currency');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'v3.75.64: % عموداً عادَ يخترعُ عملةً بقيمةٍ افتراضيّة: % — والمقيسُ يومَ الشحنِ صفر.', v_n, v_names;
  END IF;

  -- (أ٢) والمُعلَناتُ الأربعُ حيّةٌ بأسمائِها
  SELECT count(*) INTO v_n
  FROM pg_attrdef d
  JOIN pg_class c ON c.oid = d.adrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  WHERE ns.nspname = 'public'
    AND pg_get_expr(d.adbin, d.adrelid) ~ ('''' || v_ccy || '''')
    AND (c.relname || '.' || a.attname) IN
        ('companies.base_currency', 'pending_companies.currency',
         'subscription_plans.base_currency', 'company_seats.display_currency');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'v3.75.64: المُعلَناتُ الأربعُ ليست أربعاً (وُجد %) — إعلانٌ ماتَ أو وُلدَ خلسةً.', v_n;
  END IF;

  -- (ب) الخمسةُ والعشرون مُشغِّلاً واقفون قبلَ الإدخالِ كلٌّ بأعمدتِه
  FOR r IN
    SELECT * FROM (VALUES
      ('approval_workflows', '''currency_code'''),
      ('bank_voucher_requests', '''currency'''),
      ('bills', '''currency_code'', ''original_currency'''),
      ('booking_payments', '''currency_code'''),
      ('bookings', '''currency_code'''),
      ('chart_of_accounts', '''original_currency'''),
      ('customer_debit_notes', '''original_currency'''),
      ('customer_refund_requests', '''currency'''),
      ('customers', '''balance_currency'''),
      ('estimates', '''currency_code'''),
      ('expenses', '''currency_code'''),
      ('inventory_write_offs', '''currency_code'''),
      ('invoices', '''currency_code'', ''original_currency'''),
      ('journal_entries', '''currency_code'', ''original_currency'''),
      ('payments', '''currency_code'', ''original_currency'''),
      ('products', '''original_currency'''),
      ('purchase_orders', '''currency'''),
      ('purchase_requests', '''currency'''),
      ('purchase_returns', '''original_currency'''),
      ('sales_orders', '''currency'''),
      ('services', '''currency_code'''),
      ('shareholder_drawings', '''currency_code'''),
      ('suppliers', '''balance_currency'''),
      ('user_bonuses', '''bonus_currency'''),
      ('vendor_refund_requests', '''currency''')
    ) AS v(tbl, args)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relname = r.tbl
        AND t.tgname = 'ab_currency_asked_at_birth'
        AND NOT t.tgisinternal AND t.tgenabled = 'O'
        AND (t.tgtype::int & 7) = 7
        AND position('erp_currency_is_' || 'asked_at_birth(' || r.args || ')' IN pg_get_triggerdef(t.oid)) > 0
    ) THEN
      v_missing := v_missing || r.tbl || ' · ';
    END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'v3.75.64: مُشغِّلُ الختمِ غائبٌ أو مُطفأٌ أو بغيرِ أعمدتِه على: %', v_missing;
  END IF;

  -- (ج) بيتُ الختمِ واحدٌ بصلاحيّاتِه الكاملةِ المحفوظةِ يسألُ البيت
  SELECT count(*),
         count(*) FILTER (WHERE p.prosecdef),
         count(*) FILTER (WHERE position('erp_company_base_currency((v_row' IN p.prosrc) > 0)
    INTO v_n, v_secdef, v_home_call
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'erp_currency_is_' || 'asked_at_birth';
  IF v_n <> 1 OR v_secdef <> 1 OR v_home_call <> 1 THEN
    RAISE EXCEPTION 'v3.75.64: بيتُ الختمِ تبدَّل (نسخ % · بصلاحيّاتٍ كاملة % · يسألُ البيت %).', v_n, v_secdef, v_home_call;
  END IF;

  -- (د) قيدُ إشعارِ المَدينِ لا يُسمّى عملةً، وحارسُه يصرخُ ويسأل
  SELECT pg_get_constraintdef(con.oid) INTO v_txt
  FROM pg_constraint con
  WHERE con.conrelid = 'public.customer_debit_notes'::regclass
    AND con.conname = 'chk_customer_debit_currency';
  IF v_txt IS NULL THEN
    RAISE EXCEPTION 'v3.75.64: قيدُ إشعارِ المَدينِ غاب.';
  END IF;
  IF v_txt ~ ('''' || v_ccy || '''') THEN
    RAISE EXCEPTION 'v3.75.64: قيدُ إشعارِ المَدينِ عادَ يُسمّى عملةً بعينِها.';
  END IF;
  IF position('exchange_rate' IN v_txt) = 0 THEN
    RAISE EXCEPTION 'v3.75.64: قيدُ إشعارِ المَدينِ فقدَ حكمَ السعرِ الواحد.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.customer_debit_notes'::regclass
      AND t.tgname = 'ac_debit_note_no_foreign_without_fx'
      AND NOT t.tgisinternal AND t.tgenabled = 'O'
      AND (t.tgtype::int & 23) = 23
  ) THEN
    RAISE EXCEPTION 'v3.75.64: حارسُ إشعارِ المَدينِ غائبٌ أو مُطفأٌ أو بغيرِ وقتِه.';
  END IF;
  SELECT count(*),
         count(*) FILTER (WHERE p.prosecdef),
         count(*) FILTER (WHERE position('RAISE EXCEPTION' IN p.prosrc) > 0
                            AND position('erp_company_base_currency(NEW.company_id)' IN p.prosrc) > 0)
    INTO v_n, v_secdef, v_home_call
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'erp_debit_note_' || 'no_foreign_without_fx';
  IF v_n <> 1 OR v_secdef <> 1 OR v_home_call <> 1 THEN
    RAISE EXCEPTION 'v3.75.64: حارسُ إشعارِ المَدينِ تبدَّل (نسخ % · بصلاحيّاتٍ كاملة % · يصرخُ ويسأل %).', v_n, v_secdef, v_home_call;
  END IF;

  -- (هـ) والبيتُ الواحدُ قائمٌ كما وُلد
  SELECT count(*),
         count(*) FILTER (WHERE p.prosecdef),
         count(*) FILTER (WHERE position('RAISE EXCEPTION' IN p.prosrc) > 0)
    INTO v_home_n, v_home_secdef, v_home_screams
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'erp_company_base_currency';
  IF v_home_n <> 1 OR v_home_secdef <> 0 OR v_home_screams <> 1 THEN
    RAISE EXCEPTION 'v3.75.64: بيتُ العملةِ الواحدُ تبدَّل (نسخ % · كاملُ الصلاحيّات % · يصرخ %).', v_home_n, v_home_secdef, v_home_screams;
  END IF;
  SELECT count(*) INTO v_rls FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relname = 'companies' AND c.relrowsecurity;
  IF v_rls <> 1 THEN
    RAISE EXCEPTION 'v3.75.64: حمايةُ صفوفِ جدولِ الشركاتِ رُفعت.';
  END IF;

  RETURN 'v3.75.64 ok — لا قيمةَ افتراضيّةً تخترعُ عملةً فى جدولِ شركةٍ، والصفُّ الصامتُ يُختَمُ بعملةِ صاحبِه يومَ ميلادِه، وإشعارُ المَدينِ لا يقبلُ أجنبيّةً بلا صفِّ صرفٍ، والبيتُ قائمٌ يصرخُ ولا يخترع';
END
$function$;

REVOKE ALL ON FUNCTION public.erp_currency_is_asked_at_birth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_debit_note_no_foreign_without_fx() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_64_check() FROM PUBLIC, anon, authenticated;
