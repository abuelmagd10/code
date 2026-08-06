-- ============================================================================
-- v3.74.966 — مَن كتب لا يوقّع: بيتٌ واحدٌ لقاعدة فصلِ المهامّ
-- ============================================================================
-- المرض:
--   فى المشروع ثلاثةُ حرّاسٍ لفصلِ المهامّ، كلٌّ مكتوبٌ بيده:
--     expense_sod_guard · bank_voucher_sod_guard · mmia_sod_guard
--   يحمون ثلاثةَ جداول: المصروفات، السنداتِ البنكية، صرفَ موادِّ التصنيع.
--   وبقيت **٢٢ دورةَ اعتمادٍ أخرى بلا حارس** — أمرُ الشراء، فاتورةُ الشراء،
--   مرتجعُ الشراء، مرتجعُ البيع، أوامرُ الإنتاج، الخصومات، الإهلاك،
--   التحويلاتُ المخزنية، مسحوباتُ الشركاء، أجورُ العمالة… فيها كلِّها
--   يستطيع مَن أنشأ المستندَ أن يعتمدَه بنفسه.
--
--   وقاعدةٌ واحدةٌ فى ثلاثة بيوت تفترق. وقد افترقت فعلاً: نصُّ الرسالة
--   يختلف، وشرطُ الاستثناء مكرَّرٌ ثلاثَ مرات.
--
-- الدواء — بيتٌ واحد:
--   دالّةٌ واحدة public.erp_sod_guard() تقرأ أسماءَ العمودين والرسالةَ من
--   وسائطِ المُشغِّل (TG_ARGV). فالقاعدةُ مكتوبةٌ مرّةً واحدة، والجداولُ
--   تختلف فى الأعمدة لا فى القاعدة. والثلاثةُ القدامى يُهدمون ويُستبدَلون
--   بها — فلا يبقى بيتٌ ثانٍ.
--
-- وما اُستُثنى **بقياسٍ لا بظنّ** — وهذا أهمُّ ما فى الدفعة:
--   • payments (created_by → approved_by): من عشرين صفّاً، **أربعةَ عشرَ
--     خُتم فيها approved_by لحظةَ الإنشاء نفسِها** (فرقٌ أقلُّ من ٣ ثوانٍ).
--     أى أنّ العمودَ ليس قرارَ شخصٍ ثانٍ، بل خَتمٌ تلقائىّ. ولو ربطتُ به
--     الحارسَ لتعطّل إنشاءُ كلِّ مدفوعةٍ عادية.
--   • journal_entries (created_by → posted_by): ستةٌ من ثمانية خُتمت لحظةَ
--     الإنشاء — قيودٌ تُولَّد تلقائياً. نفسُ الخطر.
--   • invoices: لا عمودَ approved_at فيها أصلاً، فلا سبيلَ للتمييز، وفيها
--     ثلاثةُ صفوفٍ مخالفةٍ سلفاً.
--   • purchase_returns (created_by → confirmed_by): صفٌّ واحدٌ مخالفٌ سلفاً،
--     وقد يكون تأكيدُ الإخراجِ من صلاحيةِ مسؤولِ المخزن نفسِه بحكمِ العمل.
--   هذه الأربعةُ تُعرَض على المالك ولا تُقرَّر من عندى.
--
-- وأثرُ اليوم صفر، عن قصد:
--   الشرطُ الموروثُ من الحرّاس الثلاثة يقول: لا فصلَ مهامٍّ إلا إذا كان فى
--   الشركة أكثرُ من مسؤولٍ أعلى (مالك/إدارى/مدير عام). وكلُّ الشركات الخمس
--   اليوم فيها مسؤولٌ أعلى واحد. فالحارسُ لا يمنع شيئاً الآن — **ويمنع
--   يومَ يُعيَّن مديرٌ عام**. وهذا هو المقصود: لا نُصلح ما انكسر فحسب،
--   بل نمنع انكسارَه.
--
-- وقِيس قبل التركيب: صفرُ صفوفٍ مخالفةٍ فى الأربعةِ والعشرين زوجاً كلِّها.
-- ============================================================================

BEGIN;

-- ── (١) البيتُ الوحيد للقاعدة ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_sod_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_row     jsonb := to_jsonb(NEW);
  v_company uuid;
  v_spec    text;
  v_parts   text[];
  v_earlier uuid;
  v_later   uuid;
BEGIN
  v_company := nullif(v_row->>'company_id','')::uuid;
  IF v_company IS NULL THEN
    RETURN NEW;   -- صفٌّ بلا شركة: ليس لنا فيه حكم
  END IF;

  -- الاستثناءُ الموروث: شركةٌ بمسؤولٍ أعلى واحد لا تستطيع الفصلَ أصلاً،
  -- فإلزامُها به إقفالٌ لا حماية.
  IF public.erp_company_senior_count(v_company) <= 1 THEN
    RETURN NEW;
  END IF;

  FOREACH v_spec IN ARRAY TG_ARGV LOOP
    v_parts := string_to_array(v_spec, '|');
    IF array_length(v_parts, 1) IS DISTINCT FROM 3 THEN
      RAISE EXCEPTION 'v3.74.966: وصفُ فصلِ المهامّ معطوبٌ على %: %', TG_TABLE_NAME, v_spec;
    END IF;

    -- عمودٌ باسمٍ خاطئ يجعل الحارسَ صامتاً بلا أن يشعر أحد. فيُصاح به.
    IF NOT jsonb_exists(v_row, v_parts[1]) OR NOT jsonb_exists(v_row, v_parts[2]) THEN
      RAISE EXCEPTION 'v3.74.966: عمودٌ غيرُ موجودٍ فى % — % أو %',
        TG_TABLE_NAME, v_parts[1], v_parts[2];
    END IF;

    v_earlier := nullif(v_row->>v_parts[1], '')::uuid;
    v_later   := nullif(v_row->>v_parts[2], '')::uuid;

    IF v_earlier IS NOT NULL
       AND v_later IS NOT NULL
       AND v_earlier = v_later
       AND NOT public.erp_is_company_owner(v_company, v_earlier) THEN
      RAISE EXCEPTION 'SoD violation: %', v_parts[3] USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.erp_sod_guard() IS
  'v3.74.966: البيتُ الوحيد لقاعدة فصلِ المهامّ. وسائطُ المُشغِّل: '
  '"عمودُ الأوّل|عمودُ الثانى|الرسالة". لا تُكتب دالّةُ فصلِ مهامٍّ ثانية.';

-- ── (٢) هدمُ البيوت الثلاثة القديمة ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_expense_sod_guard       ON public.expenses;
DROP TRIGGER IF EXISTS trg_bank_voucher_sod_guard  ON public.bank_voucher_requests;
DROP TRIGGER IF EXISTS trg_mmia_sod_guard          ON public.manufacturing_material_issue_approvals;

DROP FUNCTION IF EXISTS public.expense_sod_guard();
DROP FUNCTION IF EXISTS public.bank_voucher_sod_guard();
DROP FUNCTION IF EXISTS public.mmia_sod_guard();

-- ── (٣) التركيب — الوصفُ يُتحقَّق منه قبل أن يُركَّب ───────────────────────
DO $do$
DECLARE
  r      record;
  v_col  text;
  v_n    int := 0;
  specs  text[][] := ARRAY[
    -- الثلاثةُ القدامى، بنفسِ حكمِهم حرفاً بحرف
    ARRAY['expenses','created_by|approved_by|مُعتَمِدُ المَصروف لا يَجوزُ أن يكون هو نفسَه مُنشِئَه.,approved_by|paid_by|مُنَفِّذُ الصَّرف لا يَجوزُ أن يكون هو نفسَه مُعتَمِدَ المَصروف.'],
    ARRAY['bank_voucher_requests','created_by|reviewed_by|مُعتَمِدُ السَّنَد لا يَجوزُ أن يكون هو نفسَه مُنشِئَه.,reviewed_by|posted_by|مُنَفِّذُ السَّنَد لا يَجوزُ أن يكون هو نفسَه مُعتَمِدَه.'],
    ARRAY['manufacturing_material_issue_approvals','requested_by|approved_by|مُعتَمِدُ طلبِ صرفِ المواد لا يَجوزُ أن يكون هو نفسَه مُقدِّمَ الطلب.'],
    -- والاثنان والعشرون الجدد
    ARRAY['purchase_orders','created_by_user_id|approved_by|مُعتَمِدُ أمرِ الشراء لا يَجوزُ أن يكون هو نفسَه مُنشِئَه.'],
    ARRAY['purchase_returns','created_by|approved_by|مُعتَمِدُ مرتجعِ الشراء لا يَجوزُ أن يكون هو نفسَه مُنشِئَه.'],
    ARRAY['sales_returns','created_by_user_id|approved_by|مُعتَمِدُ مرتجعِ البيع لا يَجوزُ أن يكون هو نفسَه مُنشِئَه.'],
    ARRAY['bills','created_by|approved_by|مُعتَمِدُ فاتورةِ الشراء لا يَجوزُ أن يكون هو نفسَه مُنشِئَها.'],
    ARRAY['inventory_write_offs','created_by|approved_by|مُعتَمِدُ الإهلاك لا يَجوزُ أن يكون هو نفسَه مُنشِئَه.'],
    ARRAY['inventory_transfers','created_by|approved_by|مُعتَمِدُ التحويلِ المخزنى لا يَجوزُ أن يكون هو نفسَه مُنشِئَه.'],
    ARRAY['manufacturing_production_orders','submitted_by|approved_by|مُعتَمِدُ أمرِ الإنتاج لا يَجوزُ أن يكون هو نفسَه مُقدِّمَه.'],
    ARRAY['manufacturing_bom_versions','submitted_by|approved_by|مُعتَمِدُ نسخةِ هيكلِ المواد لا يَجوزُ أن يكون هو نفسَه مُقدِّمَها.'],
    ARRAY['manufacturing_routing_versions','submitted_by|approved_by|مُعتَمِدُ نسخةِ مسارِ التشغيل لا يَجوزُ أن يكون هو نفسَه مُقدِّمَها.'],
    ARRAY['manufacturing_product_receive_approvals','requested_by|approved_by|مُعتَمِدُ استلامِ المنتَج لا يَجوزُ أن يكون هو نفسَه طالبَه.'],
    ARRAY['discount_approvals','requested_by|decided_by|مَن يَبُتُّ فى الخصم لا يَجوزُ أن يكون هو نفسَه طالبَه.'],
    ARRAY['booking_stock_withdrawals','requested_by|decided_by|مَن يَبُتُّ فى سحبِ مخزونِ الحجز لا يَجوزُ أن يكون هو نفسَه طالبَه.'],
    ARRAY['sales_return_requests','requested_by|reviewed_by|مُراجِعُ طلبِ مرتجعِ البيع لا يَجوزُ أن يكون هو نفسَه طالبَه.'],
    ARRAY['vendor_payment_correction_requests','requested_by|approved_by|مُعتَمِدُ تصحيحِ دفعةِ المورّد لا يَجوزُ أن يكون هو نفسَه طالبَه.'],
    ARRAY['shareholder_drawings','created_by|approved_by|مُعتَمِدُ مسحوباتِ الشريك لا يَجوزُ أن يكون هو نفسَه مُنشِئَها.'],
    ARRAY['vendor_refund_requests','created_by|approved_by|مُعتَمِدُ طلبِ استردادِ المورّد لا يَجوزُ أن يكون هو نفسَه مُنشِئَه.'],
    ARRAY['customer_refund_requests','requested_by|approved_by|مُعتَمِدُ استردادِ العميل لا يَجوزُ أن يكون هو نفسَه طالبَه.'],
    ARRAY['customer_debit_notes','created_by|approved_by|مُعتَمِدُ إشعارِ المدين لا يَجوزُ أن يكون هو نفسَه مُنشِئَه.'],
    ARRAY['credit_notes','created_by|approved_by|مُعتَمِدُ الإشعارِ الدائن لا يَجوزُ أن يكون هو نفسَه مُنشِئَه.'],
    ARRAY['purchase_requests','requested_by|approved_by|مُعتَمِدُ طلبِ الشراء لا يَجوزُ أن يكون هو نفسَه طالبَه.'],
    ARRAY['budgets','created_by|approved_by|مُعتَمِدُ الموازنة لا يَجوزُ أن يكون هو نفسَه مُنشِئَها.'],
    ARRAY['production_labour_payments','submitted_by|approved_by|مُعتَمِدُ أجورِ العمالة لا يَجوزُ أن يكون هو نفسَه مُقدِّمَها.,approved_by|paid_by|مُنَفِّذُ صرفِ الأجور لا يَجوزُ أن يكون هو نفسَه مُعتَمِدَها.'],
    ARRAY['commission_runs','created_by|approved_by|مُعتَمِدُ دفعةِ العمولات لا يَجوزُ أن يكون هو نفسَه مُنشِئَها.,approved_by|paid_by|مُنَفِّذُ صرفِ العمولات لا يَجوزُ أن يكون هو نفسَه مُعتَمِدَها.']
  ];
  v_tbl   text;
  v_specs text;
  v_pair  text;
  v_args  text;
  i       int;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    v_tbl   := specs[i][1];
    v_specs := specs[i][2];

    -- الجدولُ موجود؟
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=v_tbl) THEN
      RAISE EXCEPTION 'v3.74.966: الجدولُ % غيرُ موجود.', v_tbl;
    END IF;
    -- عمودُ الشركة موجود؟
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=v_tbl AND column_name='company_id') THEN
      RAISE EXCEPTION 'v3.74.966: % بلا company_id — لا يصلح للحارس.', v_tbl;
    END IF;
    -- كلُّ عمودٍ فى كلِّ زوجٍ موجود؟
    FOREACH v_pair IN ARRAY string_to_array(v_specs, ',') LOOP
      FOREACH v_col IN ARRAY (string_to_array(v_pair, '|'))[1:2] LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name=v_tbl AND column_name=v_col) THEN
          RAISE EXCEPTION 'v3.74.966: العمودُ %.% غيرُ موجود.', v_tbl, v_col;
        END IF;
      END LOOP;
    END LOOP;

    -- الوسائطُ: كلُّ زوجٍ وسيطٌ مستقلّ
    SELECT string_agg(quote_literal(x), ', ')
      INTO v_args
      FROM unnest(string_to_array(v_specs, ',')) AS x;

    EXECUTE format('DROP TRIGGER IF EXISTS aa_erp_sod_guard ON public.%I', v_tbl);
    EXECUTE format(
      'CREATE TRIGGER aa_erp_sod_guard BEFORE INSERT OR UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.erp_sod_guard(%s)', v_tbl, v_args);
    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.966: رُكّب حارسُ فصلِ المهامّ على % جدولاً.', v_n;
END
$do$;

-- ── (٤) إثباتٌ داخلَ نفس المعاملة ──────────────────────────────────────────
DO $do$
DECLARE
  v_new int;
  v_old int;
BEGIN
  SELECT count(*) INTO v_new
    FROM pg_trigger tg
    JOIN pg_proc p ON p.oid = tg.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE NOT tg.tgisinternal AND n.nspname='public' AND p.proname='erp_sod_guard';

  SELECT count(*) INTO v_old
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname ~ '_sod_guard$' AND p.proname <> 'erp_sod_guard';

  IF v_new <> 26 THEN
    RAISE EXCEPTION 'v3.74.966: المتوقَّع ٢٦ مُشغِّلاً والموجود %.', v_new;
  END IF;
  IF v_old <> 0 THEN
    RAISE EXCEPTION 'v3.74.966: بقيت % دالّةَ فصلِ مهامٍّ قديمة — البيتُ ليس واحداً.', v_old;
  END IF;
  RAISE NOTICE 'v3.74.966: ٢٦ مُشغِّلاً على دالّةٍ واحدة، ولا بيتَ ثانٍ.';
END
$do$;

COMMIT;
