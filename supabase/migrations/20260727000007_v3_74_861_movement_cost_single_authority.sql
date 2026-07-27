-- ════════════════════════════════════════════════════════════════════════════
-- v3.74.861 — تكلفة حركة المخزون: سلطةٌ واحدة لا اثنتان
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 **الفجوة**: تُحسب تكلفة واقعة الشراء الواحدة **مرّتين، بطريقتين مختلفتين**:
--
--   | الجهة        | المصدر                                              | صحيحة؟ |
--   |--------------|-----------------------------------------------------|--------|
--   | الدفاتر      | `bills.subtotal + bills.shipping`                    | ✔      |
--   | FIFO         | `fn_bill_item_landed_unit_cost()` (مُشغِّل فى القاعدة) | ✔      |
--   | سجل الحركة   | `bill_items.unit_price` الخام من TypeScript          | ✘      |
--
--   و`lib/purchase-posting.ts:287` **لا يجلب `discount_percent` أصلاً**، فالخصم
--   غير مرئىٍّ لذلك المسار بنيوياً. النتيجة على الإنتاج:
--
--     فاتورة بخصم  ⇒ فارق دائماً   (٦.٠٠ · ٤.٠٨ · ١.١٠ · ٠.٥٦)
--     فاتورة بلا خصم ⇒ مطابقة تامة  (٦٠٬٠٠٠ = ٦٠٬٠٠٠)
--
-- ⇒ **الدفاتر سليمة**؛ المختلّ هو **سجل الحركة**. فأى تقرير يقرأ تكلفة الحركة
--   مباشرةً يُظهر تكلفة مشتريات مبالغاً فيها، والخصم يختفى من سجل الصنف.
--
-- 🟢 **الحل — لا نُصلح النسخة الثانية، بل نُلغى وجودها**
--
--   مُشغِّل `BEFORE INSERT` يملأ التكلفة من **نفس الدالة** التى تستعملها FIFO.
--   فتصير سلطةً واحدة يستحيل أن تتفرّق عنها نسخة.
--
--   ومزيّته الحاسمة: يعمل على **كل** مسارات الشراء — وقد وُجدت ثلاثة، اثنان
--   منها لا يسجّلان تكلفة إطلاقاً (`process_goods_receipt_atomic` و
--   `post_purchase_transaction`) — بلا تعديل سطرٍ واحد فى كود التطبيق.
--
-- ⚠️ **وما لا يُمَسّ عمداً**: خصم رأس الفاتورة يُسجَّل ائتماناً منفصلاً على
--    حساب «خصم مشتريات مكتسب» ولا يدخل تكلفة المخزون — وهذا **قرارٌ مقصود**
--    موثَّق بتعليقٍ صريح فى `lib/purchase-posting.ts`، ولو نُقص من التكلفة
--    لازدوج الخصم. تبقى السياسة كما هى.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ١) السلطة الواحدة
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_set_purchase_movement_landed_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_cost NUMERIC;
BEGIN
  -- يخصّ الشراء وحده. باقى الأنواع لها مصادر تكلفتها.
  IF NEW.transaction_type <> 'purchase' THEN
    RETURN NEW;
  END IF;

  IF NEW.reference_id IS NULL OR NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- نفس الدالة التى يستعملها مُشغِّل FIFO حرفياً. لا صيغة ثانية.
  BEGIN
    v_cost := public.fn_bill_item_landed_unit_cost(NEW.reference_id, NEW.product_id);
  EXCEPTION WHEN OTHERS THEN
    -- تعذّر حلّ الفاتورة (مثلاً `reference_id` يشير إلى إذن استلام لا فاتورة):
    -- تُترك القيمة كما وصلت. لا نُخمّن.
    RETURN NEW;
  END;

  IF v_cost IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.unit_cost  := v_cost;
  NEW.total_cost := ROUND(COALESCE(NEW.quantity_change, 0) * v_cost, 6);
  RETURN NEW;
END;
$function$;

-- ⚠️ `CREATE FUNCTION` يمنح التنفيذ لـPUBLIC تلقائياً — وPUBLIC تشمل الزائر
--    (درس v3.74.844). ودالة المُشغِّل لا يناديها أحدٌ مباشرةً.
REVOKE ALL ON FUNCTION public.fn_set_purchase_movement_landed_cost() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_purchase_movement_landed_cost ON public.inventory_transactions;
CREATE TRIGGER trg_set_purchase_movement_landed_cost
  BEFORE INSERT ON public.inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_purchase_movement_landed_cost();

COMMENT ON FUNCTION public.fn_set_purchase_movement_landed_cost() IS
  'v3.74.861 — تكلفة حركة الشراء تُشتقّ من نفس دالة التكلفة المحمَّلة التى تستعملها FIFO والدفاتر. سلطةٌ واحدة.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ٢) 🔴 ولماذا **لا** تُصحَّح السجلات القديمة الثمانية
--
--    عُرضت على المالك ووافق على تصحيحها. وعند التنفيذ رفضت القاعدة:
--
--      prevent_linked_inventory_modification:
--      «Cannot modify/delete inventory transaction linked to a posted journal»
--
--    وفحصتُ الدالة: **لا مَخرج لها ولا بوابة**. الحماية مطلقة عن قصد — حركةُ
--    مخزونٍ ارتبطت بقيدٍ مُرحَّل لا تُعدَّل ولا تُحذف. وهى نفس فلسفة المشروع
--    فى القيود: **يُعكَس ولا يُحرَّر**.
--
--    ⇒ **ولن تُضعَّف.** والقاعدة التى سُجّلت اليوم فى الدليل تنطبق هنا حرفياً:
--      «إن اضطرّك الإصلاح لإضعاف حماية، فالإصلاح خاطئ لا الحماية.»
--
--    ⇒ والأثر مقبولٌ محاسبياً: الدفاتر صحيحة، وFIFO صحيحة، والمبالغة محصورة
--      فى **سجل الحركة التاريخى** بمقدار ١١.٧٤ على ثمانية سجلات، موثَّقةً هنا
--      وفى سجل التغييرات. أما كل شراءٍ بعد هذا الترحيل فيُسجَّل صحيحاً.
--
--    ⇒ ولذلك يبدأ حارس `check:movement-cost` من **تاريخ هذا الترحيل**: خط
--      أساسه صفر لما يحكمه المُشغِّل الجديد، ولا يُخفى عطباً جديداً خلف رقمٍ
--      ثابت يتعوّد القارئ على تجاهله.
-- ─────────────────────────────────────────────────────────────────────────────

COMMIT;
