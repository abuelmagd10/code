-- ════════════════════════════════════════════════════════════════════════════
-- v3.74.863 — عمودان مفقودان أسقطا ميزتين بصمت
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 **ما كُشف** بعد إعادة بناء `check-phantom-columns` (كانت تُبلّغ عن ٥١
--    موضعاً، تسعةُ أعشارها إنذاراتٌ كاذبة — انظر رأس السكربت):
--
--    ١) `commission_plans` بلا عمود `updated_at`، والكود يكتبه عند التعديل.
--       ⇒ **تعديل خطة عمولة يفشل بالكامل**. لا جزئياً: الجملة كلها تُرفض،
--         فلا يُحفظ اسمٌ ولا نسبةٌ ولا شريحة. والمستخدم يرى «فشل» بلا سبب.
--
--    ٢) `fifo_lot_consumptions` بلا `updated_at`، والكود يكتبه عند **التحديث
--       الجزئى** لاستهلاك دفعة FIFO فى مرتجع الشراء.
--       ⇒ فيفشل ذلك التحديث، ويبقى سجل الاستهلاك على كميته القديمة.
--
-- 🟢 **القرار (المالك): تُضاف الأعمدة لا تُحذف الكتابة** — «تعديل خطة العمولة
--    يجب أن يُسجَّل وقته». وهو الأصحّ: الوقت معلومةُ مساءلةٍ لا زينة.
--
-- ⚠️ إضافةٌ محضة: لا تمسّ صفاً قائماً ولا تكسر استعلاماً. والقيمة الابتدائية
--    `created_at` لا `now()` — حتى لا يُقال إن سجلاً قديماً عُدِّل اليوم.
--
-- ويُتبع نمط المشروع القائم: مُشغِّلٌ يضبط العمود تلقائياً عند كل تحديث،
-- فلا يعتمد صدقُ الحقل على تذكُّر كل كاتبٍ أن يملأه.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ١) العمودان
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commission_plans
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.fifo_lot_consumptions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- القيمة الابتدائية = تاريخ الإنشاء. الصفّ الذى لم يُعدَّل قط لا يُقال إنه
-- عُدِّل لحظة الترحيل.
UPDATE public.commission_plans      SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE public.fifo_lot_consumptions SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE public.commission_plans      ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.fifo_lot_consumptions ALTER COLUMN updated_at SET DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- ٢) مُشغِّلٌ يضبطه تلقائياً — فلا يعتمد صدقُ الحقل على تذكُّر الكاتب
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- ⚠️ `CREATE FUNCTION` يمنح التنفيذ لـPUBLIC تلقائياً — وPUBLIC تشمل الزائر
--    (درس v3.74.844). ودالة المُشغِّل لا يناديها أحدٌ مباشرةً.
REVOKE ALL ON FUNCTION public.fn_touch_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.commission_plans;
CREATE TRIGGER trg_touch_updated_at
  BEFORE UPDATE ON public.commission_plans
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.fifo_lot_consumptions;
CREATE TRIGGER trg_touch_updated_at
  BEFORE UPDATE ON public.fifo_lot_consumptions
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

COMMENT ON COLUMN public.commission_plans.updated_at IS
  'v3.74.863 — غيابه كان يُسقط تعديل خطة العمولة بالكامل.';
COMMENT ON COLUMN public.fifo_lot_consumptions.updated_at IS
  'v3.74.863 — غيابه كان يُسقط التحديث الجزئى لاستهلاك الدفعة عند مرتجع الشراء.';

COMMIT;
