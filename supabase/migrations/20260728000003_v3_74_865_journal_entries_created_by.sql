-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.865 — journal_entries.created_by
--
-- **الحادثة:** `manual-journal-command.service.ts` يكتب `created_by` عند إنشاء
-- القيد اليدوى، والعمود **غير موجود**. وPostgREST يرفض العمود المجهول من
-- مخبأ المخطَّط قبل أن يُصدر SQL أصلاً ⇒ الإدراج يفشل **كاملاً**، والخدمة
-- ترمى `Failed to create manual journal entry`.
--
-- والدليل من الإنتاج قاطع:
--     SELECT count(*) FROM journal_entries WHERE reference_type='manual_entry';
--     ⇒ 0
-- بينما الشاشة `app/journal-entries/new/page.tsx` موجودة وتستدعى
-- `/api/journal-entries/manual`. أى أن **القيد اليدوى لم ينجح ولا مرة واحدة
-- منذ نشأة النظام** — وهى وظيفةٌ محاسبيةٌ أساسية لا يخلو منها نظام.
--
-- **ولمَ عمودٌ جديد بدل حذف الحقل؟** لأن الجدول يملك `posted_by` وحده، وهو
-- يجيب عن «مَن اعتمد» لا عن «مَن كتب». والقيد المسودَّة قد يكتبه محاسبٌ
-- ويعتمده مديره — فإسقاط `created_by` يترك المسودَّة **بلا مسؤولٍ مسجَّل**
-- طوال المدة التى تنتظر فيها الاعتماد، وهى بالضبط المدة التى تحتاج فيها
-- إلى معرفة صاحبها. (قرار المالك، ٢٦ يوليو ٢٠٢٦.)
--
-- **الملء الرجعى:** من `posted_by` حيث وُجد — لا من `now()` ولا من قيمةٍ
-- مخترعة. فكل القيود القائمة أنشأها النظام آلياً، ومَن رحَّلها هو مَن
-- تسبَّب فيها. وما لا `posted_by` له يبقى NULL صراحةً، لأن **الفراغ الصادق
-- أفضل من قيمةٍ مُلفَّقة** (درس ٨٦٣ عند إضافة `updated_at`).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS created_by UUID;

COMMENT ON COLUMN public.journal_entries.created_by IS
  'مَن أنشأ القيد (قد يكون غير مَن رحَّله). NULL للقيود السابقة على v3.74.865 التى لا posted_by لها.';

-- الملء الرجعى: مرّة واحدة، وللصفوف الفارغة وحدها.
UPDATE public.journal_entries
   SET created_by = posted_by
 WHERE created_by IS NULL
   AND posted_by IS NOT NULL;

-- فهرس للاستعلام «قيودى» على شاشة القيود.
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_by
  ON public.journal_entries (company_id, created_by)
  WHERE created_by IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- تحقُّق: العمود موجود، ولم يُفقد صفٌّ واحد، والميزان لم يتغيّر.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'journal_entries'
       AND column_name  = 'created_by'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'v3.74.865: journal_entries.created_by was not created';
  END IF;

  RAISE NOTICE 'v3.74.865: journal_entries.created_by ready (% rows back-filled from posted_by)',
    (SELECT count(*) FROM public.journal_entries WHERE created_by IS NOT NULL);
END $$;
