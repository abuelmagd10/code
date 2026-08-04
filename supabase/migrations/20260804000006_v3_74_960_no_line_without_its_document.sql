-- v3.74.960 — لا بندَ بلا مستنده
-- ============================================================================
-- المقيسُ على الإنتاج: ٢٩ بندَ فاتورةِ شراءٍ و٤٣ بندَ أمرِ شراءٍ تشير إلى
-- مستنداتٍ **غيرِ موجودة**. أُنشئت بين ٢٨ نوفمبر و٣١ ديسمبر ٢٠٢٥، وقيمتُها
-- ١٣٨٬٢٥٠ و١٨١٬٣٠٠ — أى ٣١٩٬٥٥٠ مجتمعةً.
--
-- والمفارقةُ التى حسمت التشخيص: المفتاحان الأجنبيان موجودان، ومُتحقَّقٌ
-- منهما (convalidated = true)، وبـ ON DELETE CASCADE. ولا صفَّ من الاثنين
-- والسبعين يحمل مُعرِّفاً فارغاً — كلُّها تشير إلى مستندٍ حقيقىٍّ غير موجود.
-- وهذا **مستحيلٌ** ما دام المفتاحُ يعمل.
--
-- فالتفسيرُ الوحيدُ الباقى: أنّ أحداً عطّل المُشغِّلات (DISABLE TRIGGER ALL
-- أو session_replication_role = replica) ثمّ حذف المستندات. وتعطيلُ
-- المُشغِّلات يُعطّل معه فرضَ المفاتيح الأجنبية، ولا يمسّ علامةَ التحقّق —
-- فتبقى القاعدةُ تظنّ نفسَها سليمةً وهى ليست كذلك.
--
-- ولذلك لا يكفى الحذفُ: يُحفظ الصفُّ كاملاً قبل حذفه (فالحذفُ الذى لا يُمكن
-- التراجعُ عنه ليس إصلاحاً)، ويُضاف عرضٌ يُظهر الحالةَ إن عادت. ويمنع
-- scripts/check-no-blanket-trigger-disable.js عودةَ السبب نفسِه.
--
-- النتيجةُ بعد التنفيذ: صفرُ يتيم · ٧٢ صفّاً محفوظاً بقيمة ٣١٩٬٥٥٠ ·
-- ١٤ بندَ فاتورةٍ و١٦ بندَ أمرٍ باقيةً، كلُّها معلَّقةٌ بمستنداتٍ قائمة.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orphaned_document_items_archive (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archived_at   timestamptz NOT NULL DEFAULT now(),
  release       text        NOT NULL,
  source_table  text        NOT NULL,
  row_id        uuid        NOT NULL,
  parent_id     uuid,
  row_data      jsonb       NOT NULL
);

ALTER TABLE public.orphaned_document_items_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orphaned_document_items_archive FROM anon, authenticated;
GRANT SELECT ON public.orphaned_document_items_archive TO service_role;

INSERT INTO public.orphaned_document_items_archive (release, source_table, row_id, parent_id, row_data)
SELECT 'v3.74.960', 'bill_items', bi.id, bi.bill_id, to_jsonb(bi)
  FROM public.bill_items bi
 WHERE NOT EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bi.bill_id)
   AND NOT EXISTS (SELECT 1 FROM public.orphaned_document_items_archive a
                    WHERE a.source_table = 'bill_items' AND a.row_id = bi.id);

INSERT INTO public.orphaned_document_items_archive (release, source_table, row_id, parent_id, row_data)
SELECT 'v3.74.960', 'purchase_order_items', poi.id, poi.purchase_order_id, to_jsonb(poi)
  FROM public.purchase_order_items poi
 WHERE NOT EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = poi.purchase_order_id)
   AND NOT EXISTS (SELECT 1 FROM public.orphaned_document_items_archive a
                    WHERE a.source_table = 'purchase_order_items' AND a.row_id = poi.id);

DELETE FROM public.bill_items bi
 WHERE NOT EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bi.bill_id)
   AND EXISTS (SELECT 1 FROM public.orphaned_document_items_archive a
                WHERE a.source_table = 'bill_items' AND a.row_id = bi.id);

DELETE FROM public.purchase_order_items poi
 WHERE NOT EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = poi.purchase_order_id)
   AND EXISTS (SELECT 1 FROM public.orphaned_document_items_archive a
                WHERE a.source_table = 'purchase_order_items' AND a.row_id = poi.id);

-- عرضٌ يُظهر الحالةَ إن عادت — بنفس شكل مراقب السلامة القائم.
CREATE OR REPLACE VIEW public.v_orphaned_document_items AS
SELECT 'orphan_bill_item'::text AS check_type,
       NULL::uuid               AS company_id,
       bi.id                    AS record_id,
       bi.bill_id::text         AS identifier,
       'بندُ فاتورةِ شراءٍ يشير إلى فاتورةٍ غير موجودة'::text AS issue_description,
       COALESCE(bi.line_total, 0) AS severity_value,
       now()                    AS checked_at
  FROM public.bill_items bi
 WHERE NOT EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bi.bill_id)
UNION ALL
SELECT 'orphan_purchase_order_item'::text,
       NULL::uuid,
       poi.id,
       poi.purchase_order_id::text,
       'بندُ أمرِ شراءٍ يشير إلى أمرٍ غير موجود'::text,
       COALESCE(poi.line_total, 0),
       now()
  FROM public.purchase_order_items poi
 WHERE NOT EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = poi.purchase_order_id);

REVOKE ALL ON public.v_orphaned_document_items FROM anon, authenticated;
GRANT SELECT ON public.v_orphaned_document_items TO service_role;
