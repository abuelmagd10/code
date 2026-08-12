-- ============================================================================
-- v3.75.20 — «وشبكةُ أمانٍ مقطوعةٌ من طرفَيها أسوأُ من لا شبكة»
-- ============================================================================
--
-- ═══ (أ) لغمٌ فى البيتِ الثانى: زنادٌ يُوقِفُ العمل ═══
--
-- على قاعدةِ الاختبارِ زنادٌ حىٌّ اسمُه `trg_auto_inventory_vendor_credit_item`
-- على بنودِ إشعاراتِ الدائن، **لا وجودَ له على الإنتاجِ أصلاً**. وهو يكتبُ حركةَ
-- مخزنٍ **بلا فرعٍ ولا مخزنٍ ولا مركزِ تكلفة** — والأعمدةُ الثلاثةُ
-- **NOT NULL وبلا قيمةٍ افتراضيّةٍ على القاعدتَين معاً**.
--
-- وأُثبت حيّاً لا نظريّاً، بإدخالٍ تجريبىٍّ داخلَ معاملةٍ أُلغيت:
--
--     Branch is required (inventory_transactions.branch_id is null)
--
-- فالزنادُ **ليس حركةَ مخزنٍ زائدةً بل لغمٌ يُوقِفُ العمل**: أىُّ محاولةٍ لإضافةِ
-- صنفٍ إلى إشعارِ دائنٍ غيرِ مرتبطٍ بمرتجعِ مشترياتٍ **تُرفَضُ ولا تتمّ**. ولم
-- يقعْ ذلك قطُّ لأنّ `vendor_credit_items` هناك **فارغٌ (صفرُ صفوف)**.
--
-- ═══ (ب) وأكبرُ منه: شبكةُ أمانٍ لا تُمسك أحداً ═══
--
-- على **القاعدتَين معاً** زنادٌ اسمُه `trg_inherit_branch_warehouse_inventory`
-- وظيفتُه المُعلَنةُ أن **يملأ الفرعَ والمخزنَ إذا نُسِيا**. وهو **لا يستطيعُ ذلك
-- أبداً**:
--
--   • كلاهما «قبلَ الإدخال»، وترتيبُ التنفيذِ **بالحروفِ الأبجديّة**، و
--     `enforce_governance_inventory` تسبقُ `trg_inherit_...`؛
--   • وحارسُ النطاقِ يرفعُ الاستثناءَ عند **أىِّ** فراغٍ فى الثلاثة؛
--   • وجسدُ دالّةِ الوراثةِ كلُّه داخلَ `IF ... IS NULL` — فإن لم يكنْ فراغٌ
--     **لم تفعلْ شيئاً**.
--
-- **فبرهانٌ منطقىٌّ كامل: لا حالةَ واحدةً تستطيعُ فيها هذه الدالّةُ أن تغيّرَ
-- صفّاً.** إن كان فراغٌ صرخَ الحارسُ قبلَها، وإن لم يكنْ لم يكنْ لها عمل.
-- ونزعُها **محايدٌ برهاناً لا ظنّاً**.
--
-- ومع ذلك كانت تطمئنُ من يقرؤها: «الفرعُ يُملأُ تلقائيّاً إن نُسى» — **ولا
-- يُملأ**. **والطمأنينةُ الكاذبة أسوأُ من الغياب.**
--
-- وقِيس أثرُها على الواقع: **٥٧ حركةَ مخزنٍ على الإنتاج، صفرٌ منها بلا فرع** —
-- فكلُّ مسارٍ حقيقىٍّ يُسمّى فرعَه صراحةً، ولا أحدَ يتّكئُ على الشبكةِ المقطوعة.
--
-- ═══ ولماذا نُزع ولم يُصلَّح ═══
--
-- الطريقُ الآخرُ كان تقديمَ الوراثةِ على الحارسِ لتعملَ فعلاً. ومعناه أنّ حركةً
-- نُسىَ فرعُها **تُنسَبُ تلقائيّاً إلى الفرعِ الرئيسىِّ** لا إلى الفرعِ الذى خرجت
-- منه البضاعةُ حقّاً. **وسكوتٌ ينسبُ بضاعةً إلى فرعٍ لم تخرجْ منه أخطرُ من رفضٍ
-- يقولُ لماذا.** فبقىَ الحكمُ صريحاً: **من لا يُسمّى فرعَه يُرفَض.**
--
-- ═══ وما لم يُحذَف ═══
--
-- تُنزَعُ **الزنادان** فقط. أمّا الدالّتانِ فتبقيانِ بلا مُستدعٍ و**تُعَدّانِ
-- دَيناً معلوماً**: حذفُ دالّةٍ يمرُّ على حارسِ لقطةِ المخطَّطِ ويحتاجُ تسجيلاً
-- فيه، وهذه دفعتُها الخاصّة. **معدودٌ لا مسكوتٌ عنه.**
--
-- **ولا صفَّ بياناتٍ يُلمَس، ولا شاشةَ تتغيّر، ولا حركةَ مخزنٍ واحدةٍ تتبدّل.**
-- ============================================================================

DROP TRIGGER IF EXISTS trg_auto_inventory_vendor_credit_item ON public.vendor_credit_items;
DROP TRIGGER IF EXISTS trg_inherit_branch_warehouse_inventory ON public.inventory_transactions;


-- ============================================================================
-- الفحصُ المرجعىُّ — يسكنُ القاعدةَ فيحرسُ أىَّ بيتٍ يُركَّبُ فيه
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_20_check()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_bad      int;
  v_co       uuid;
  v_prod     uuid;
  v_refused  boolean;
BEGIN
  -- (أ) لا يعودُ زنادٌ يكتبُ حركةَ مخزنٍ بلا نطاق، ولا شبكةُ أمانٍ مقطوعة
  SELECT count(*) INTO v_bad
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal
     AND t.tgname IN ('trg_auto_inventory_vendor_credit_item',
                      'trg_inherit_branch_warehouse_inventory');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: عادَ % زناداً نُزع فى v3.75.20 (لغمُ إشعارِ الدائن أو شبكةُ الوراثةِ المقطوعة)', v_bad;
  END IF;

  -- (ب) **وفخٌّ لا يُشغَّل ليس فخّاً**: يُجرَّبُ إدخالُ حركةِ مخزنٍ بلا فرعٍ فعلاً،
  --     ويجب أن تُرفَض. والإدخالُ داخلَ معاملةٍ فرعيّةٍ تُلغى فى الحالتَين.
  SELECT id INTO v_co FROM public.companies LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE 'v3.75.20 · لا شركةَ تُقاسُ عليها — لم يُدَّعَ قياس.';
    RETURN;
  END IF;
  SELECT id INTO v_prod FROM public.products WHERE company_id = v_co LIMIT 1;
  IF v_prod IS NULL THEN
    RAISE NOTICE 'v3.75.20 · لا منتجَ يُقاسُ عليه — لم يُدَّعَ قياس.';
    RETURN;
  END IF;

  v_refused := FALSE;
  BEGIN
    INSERT INTO public.inventory_transactions
      (company_id, product_id, transaction_type, quantity_change, notes)
    VALUES (v_co, v_prod, 'purchase_return', -1, 'zz_probe_v3_75_20');
    -- وصلَ إلى هنا يعنى أنّ الإدخالَ نجحَ بلا فرع — يُلغى ثمّ يُصرَخُ عليه.
    RAISE EXCEPTION 'ZZ_ROLLBACK_PROBE_37520';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ZZ_ROLLBACK_PROBE_37520' THEN v_refused := TRUE; END IF;
  END;

  IF NOT v_refused THEN
    RAISE EXCEPTION 'BASELINE FAIL: حركةُ مخزنٍ بلا فرعٍ قُبِلت — والنطاقُ لم يعُدْ مطلوباً (v3.75.20)';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.assert_baseline_v3_75_20_check() IS
  'v3.75.20 — وشبكةُ أمانٍ مقطوعةٌ من طرفَيها أسوأُ من لا شبكة.';

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_20_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_20_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_20_check() FROM authenticated;
