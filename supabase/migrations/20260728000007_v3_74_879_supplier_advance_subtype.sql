-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.879 — تصنيف حساب سلف الموردين: تصحيحٌ لا تغييرُ حساب
--
-- **الحادثة:** حساب `1180` «سلف ومقدمات للموردين» — ونوعه `asset` فى الشركات
-- الخمس — كان يحمل تصنيفاً فرعياً اسمه `vendor_credit_liability`، **فى
-- شركتين فقط**. والثلاث الأخرى بلا تصنيف.
--
-- والاسم نفسه متناقض: «liability» على حسابٍ من نوع `asset`. لكن الأخطر أن
-- الكود يبحث بهذا التصنيف بعينه:
--
--     app/purchase-returns/new/page.tsx:715
--       findAcct("vendor_credit_liability", …) || findAcct("ap_contra", …) || apAccount
--
-- ⇒ فالنتيجة **تختلف بين شركةٍ وأخرى**:
--
--     العصرية للنجارة · تست    ⇒ 1180 سلف ومقدمات للموردين  (أصل)
--     notniche · توب تانك · جريس تاون ⇒ لا تجده ⇒ حساب الموردين (التزام)
--
-- أى أن **نفس المرتجع يُقيَّد على حسابين مختلفين حسب الشركة**.
--
-- ── ولمَ لم يظهر؟ ───────────────────────────────────────────────────────
-- لأن إشعارات الدائن كانت **معطَّلة أصلاً**: عمودٌ وهمى (٨٦٥) ثم منعُ الكتابة
-- المباشرة (٨٧١). فصفر سطرٍ مُرحَّل على `1180` فى الشركات الخمس.
-- ⇒ **الإصلاح الذى فتح المسار كشف التباين قبل أن يُنتج قيداً خاطئاً واحداً.**
--
-- ── العلاج ──────────────────────────────────────────────────────────────
-- يُضبط التصنيف إلى `supplier_advance` — **معناه الحقيقى** — فى الشركات
-- الخمس. فيصير السلوك موحَّداً:
--
--   • زيادة الدفع (v3.74.873) ⇒ تجده بـ`sub_type IN ('supplier_advance', …)`
--     فتُصنّف الزيادة سلفةً لدى المورد — وهو المقصود.
--   • مرتجع المشتريات ⇒ لا يجد `vendor_credit_liability` **فى أىٍّ منها**،
--     فينتقل لحساب الموردين — **بالتساوى فى الخمس**.
--
-- ولا يُمسّ قيدٌ واحد: التصنيف وصفٌ للحساب لا رصيدٌ فيه.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── قبل: صورةٌ للحال، تُسجَّل فى مخرجات الترحيل ────────────────────────
DO $$
DECLARE v_before TEXT;
BEGIN
  SELECT string_agg(c.name || '=' || coalesce(a.sub_type, 'NULL'), ' | ' ORDER BY c.name)
    INTO v_before
    FROM public.chart_of_accounts a
    JOIN public.companies c ON c.id = a.company_id
   WHERE a.account_code = '1180';
  RAISE NOTICE 'v3.74.879 BEFORE: %', coalesce(v_before, '(no 1180 accounts)');
END $$;

-- ── التصحيح ────────────────────────────────────────────────────────────
-- مقيَّدٌ بالنوع `asset` وبالكود معاً: فلو وُجد فى شركةٍ ما حسابٌ بالكود نفسه
-- من نوعٍ آخر (وهو ما لا يقع اليوم) فلن يُمسّ.
UPDATE public.chart_of_accounts
   SET sub_type = 'supplier_advance'
 WHERE account_code = '1180'
   AND account_type = 'asset'
   AND coalesce(sub_type, '') IS DISTINCT FROM 'supplier_advance';

-- ── تحقُّق: لا حسابَ أصلٍ يحمل تصنيف التزامٍ بعد الآن ──────────────────
DO $$
DECLARE
  v_wrong  INT;
  v_after  TEXT;
  v_lines  INT;
BEGIN
  SELECT count(*) INTO v_wrong
    FROM public.chart_of_accounts
   WHERE account_type = 'asset'
     AND sub_type = 'vendor_credit_liability';

  IF v_wrong > 0 THEN
    RAISE EXCEPTION
      'v3.74.879: % asset account(s) still carry a liability sub_type', v_wrong;
  END IF;

  SELECT count(*) INTO v_wrong
    FROM public.chart_of_accounts
   WHERE account_code = '1180' AND account_type = 'asset'
     AND coalesce(sub_type, '') <> 'supplier_advance';

  IF v_wrong > 0 THEN
    RAISE EXCEPTION
      'v3.74.879: % supplier-advance account(s) were not reclassified', v_wrong;
  END IF;

  -- التصنيف وصفٌ لا رصيد: لا سطر قيدٍ يتأثر.
  SELECT count(*) INTO v_lines
    FROM public.journal_entry_lines l
    JOIN public.chart_of_accounts a ON a.id = l.account_id
   WHERE a.account_code = '1180';

  SELECT string_agg(c.name || '=' || coalesce(a.sub_type, 'NULL'), ' | ' ORDER BY c.name)
    INTO v_after
    FROM public.chart_of_accounts a
    JOIN public.companies c ON c.id = a.company_id
   WHERE a.account_code = '1180';

  RAISE NOTICE 'v3.74.879 AFTER: % (journal lines on 1180: %)', v_after, v_lines;
END $$;
