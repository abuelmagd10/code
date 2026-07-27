-- ════════════════════════════════════════════════════════════════════════════
-- v3.74.860 — أرشفة ٧٣٣ سطر قيدٍ معلَّقٍ فى الفراغ
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔍 **ما وُجد** (بقياسٍ مباشر على الإنتاج، لا بافتراض):
--
--   • ٧٣٣ سطراً فى `journal_entry_lines` **قيدها الأب غير موجود** (٣٤٩ قيداً).
--   • **والـ٧٣٣ كلها** تشير إلى ٤٠ حساباً **غير موجودة** فى دليل الحسابات.
--   • أى أنها تخالف **مفتاحين أجنبيين مُتحقَّقٍ منهما** فى آنٍ واحد:
--       journal_entry_id → journal_entries(id)  ON DELETE CASCADE
--       account_id       → chart_of_accounts(id)
--     وهذا **مستحيل** إلا إذا عُطِّل فرض القيود أثناء حذفٍ جماعى
--     (مثل `session_replication_role = 'replica'`). القرائن تشير إلى تنظيفٍ
--     جماعىٍّ لبيانات شركةٍ محذوفة — ولا يُجزَم بالسبب.
--
--   • المدين = الدائن = ٢٬٣٦٣٬٢٦٦.٠٨ بالضبط ⇒ قيودٌ **كاملة** حُذفت رؤوسها،
--     لا سطورٌ عشوائية.
--   • المدى: ٢٨ نوفمبر ٢٠٢٥ ← ٢٢ مايو ٢٠٢٦. **ولا سطر جديد منذ أكثر من
--     شهرين** ⇒ الظاهرة توقّفت.
--   • السطور السليمة (لها قيد أب): ٢٧٤.
--
-- 📌 **أثرها على الأرقام: صفر.** كل تقرير يربط السطر بقيده، والسطر بلا قيد
--    يسقط تلقائياً. ولهذا ميزان المراجعة ٠.٠٠٠٠ ورصيد المخزون مطابق لـFIFO.
--    لكنها تُلوِّث أى استعلامٍ يجمع السطور دون ربط — وهو فخٌّ منصوب لمن يأتى.
--
-- 🟢 **القرار (المالك)**: تُؤرشَف — تُنقل بكامل بياناتها إلى جدول أرشيف
--    باسمها وتاريخها، **ثم** تُزال من الجدول الحىّ. **لا يُفقد شىء.**
--
-- 🔒 **ولا حذف قبل إثبات النقل**: تُعدّ السطور والمبالغ قبل وبعد، وأى اختلاف
--    يرفع استثناءً فتتراجع المعاملة كاملةً ولا يُحذف شىء.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ١) جدول الأرشيف — نسخةٌ من بنية السطور، بلا مفاتيح أجنبية (فالمشار إليه زال)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_entry_lines_orphan_archive (
  LIKE public.journal_entry_lines INCLUDING DEFAULTS
);

ALTER TABLE public.journal_entry_lines_orphan_archive
  ADD COLUMN IF NOT EXISTS archived_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_by   TEXT        NOT NULL DEFAULT 'v3.74.860',
  ADD COLUMN IF NOT EXISTS archive_reason TEXT       NOT NULL DEFAULT
    'سطرٌ بلا قيدٍ أب وبلا حساب — بقايا حذفٍ جماعى سابق. أُرشف بقرار المالك.';

COMMENT ON TABLE public.journal_entry_lines_orphan_archive IS
  'v3.74.860 — سطور قيود فقدت قيدها الأب وحساباتها. أُرشفت ولم تُحذف. لا تُستعمل فى أى تقرير.';

-- 🔒 درس v3.74.857: الجدول الجديد يُغلق فى وجه الزائر المجهول من أول يوم.
ALTER TABLE public.journal_entry_lines_orphan_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journal_entry_lines_orphan_archive FROM anon, authenticated;
-- لا سياسات: حساب الخدمة يتخطى الحماية، وغيره لا يصل. أرشيفٌ لا شاشة له.

-- ─────────────────────────────────────────────────────────────────────────────
-- ٢) النقل ثم الإثبات ثم الحذف — بهذا الترتيب حصراً
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_before_orphans   INT;
  v_before_healthy   INT;
  v_before_debit     NUMERIC;
  v_before_credit    NUMERIC;
  v_archived         INT;
  v_arch_debit       NUMERIC;
  v_arch_credit      NUMERIC;
  v_deleted          INT;
  v_after_orphans    INT;
  v_after_healthy    INT;
BEGIN
  SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id=l.journal_entry_id)),
         count(*) FILTER (WHERE     EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id=l.journal_entry_id)),
         coalesce(sum(l.debit_amount)  FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id=l.journal_entry_id)),0),
         coalesce(sum(l.credit_amount) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id=l.journal_entry_id)),0)
    INTO v_before_orphans, v_before_healthy, v_before_debit, v_before_credit
    FROM public.journal_entry_lines l;

  IF v_before_orphans = 0 THEN
    RAISE NOTICE 'لا سطور يتيمة — لا شىء يُؤرشَف.';
    RETURN;
  END IF;

  -- النقل
  INSERT INTO public.journal_entry_lines_orphan_archive
  SELECT l.*, now(), 'v3.74.860',
         'سطرٌ بلا قيدٍ أب وبلا حساب — بقايا حذفٍ جماعى سابق. أُرشف بقرار المالك.'
    FROM public.journal_entry_lines l
   WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = l.journal_entry_id);
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  SELECT coalesce(sum(debit_amount),0), coalesce(sum(credit_amount),0)
    INTO v_arch_debit, v_arch_credit
    FROM public.journal_entry_lines_orphan_archive
   WHERE archived_by = 'v3.74.860';

  -- 🔴 الإثبات قبل الحذف: عدداً ومبلغاً. أى اختلافٍ يُلغى كل شىء.
  IF v_archived <> v_before_orphans THEN
    RAISE EXCEPTION 'أُرشف % سطراً والمتوقع % — لا يُحذف شىء', v_archived, v_before_orphans;
  END IF;
  IF round(v_arch_debit,4) <> round(v_before_debit,4)
     OR round(v_arch_credit,4) <> round(v_before_credit,4) THEN
    RAISE EXCEPTION 'المبالغ لا تطابق (مدين %/% · دائن %/%) — لا يُحذف شىء',
      v_arch_debit, v_before_debit, v_arch_credit, v_before_credit;
  END IF;

  -- الحذف من الجدول الحىّ
  DELETE FROM public.journal_entry_lines l
   WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = l.journal_entry_id);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id=l.journal_entry_id)),
         count(*) FILTER (WHERE     EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id=l.journal_entry_id))
    INTO v_after_orphans, v_after_healthy
    FROM public.journal_entry_lines l;

  IF v_deleted <> v_before_orphans OR v_after_orphans <> 0 THEN
    RAISE EXCEPTION 'حُذف % والمتوقع %، وبقى % يتيماً — تراجُع', v_deleted, v_before_orphans, v_after_orphans;
  END IF;

  -- 🔴 والأهم: السطور السليمة لم تُمَسّ
  IF v_after_healthy <> v_before_healthy THEN
    RAISE EXCEPTION 'تغيّر عدد السطور السليمة من % إلى % — تراجُع فورى',
      v_before_healthy, v_after_healthy;
  END IF;

  RAISE NOTICE 'أُرشف % سطراً (مدين=دائن=%) · السطور السليمة كما هى: %',
    v_archived, v_arch_debit, v_after_healthy;
END $$;

COMMIT;
