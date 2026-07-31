-- ═══════════════════════════════════════════════════════════════════
-- v3.74.915 — أى المنتجات يراها عضو الفرع: فرعُه، وما وصل إليه
-- ═══════════════════════════════════════════════════════════════════
--
-- الشق الثانى من طلب المالك (31/7): «المنتجات غير المرتبطة بفرع لا يراها
-- مستخدمو الفروع أصلاً… وبعد نقل المشترى إلى فرعٍ يمكنهم البيع عليه
-- ولا يرون سعر شرائه».
--
-- ونصُّه فى النقل حاسم: **يبقى المنتج بلا فرع وتتحرك الكمية وحدها**. أى
-- أن بطاقة المنتج لا تتغير بالنقل. وهذا يجعل قاعدةً ساذجة («يرى منتجات
-- فرعه») تُخفى عنه ما نُقل إليه — فلا يبيعه أصلاً. ولهذا:
--
--   **الرؤية** = منتجُ فرعى **أو** ما تحرّك فى فرعى.
--   **التكلفة** = منتجُ فرعى وحده (914) — فالمنقول يُباع بلا تكلفته.
--
-- والقاعدة تُكتب فى **سياسة صفوف** لا فى فلترة تطبيقٍ: الفلترة فى الكود
-- تُنسى فى شاشة، وتُتجاوز بنداءٍ مباشر للجدول. وهذه هى الفجوة القائمة
-- اليوم حرفياً: `products_select` تقول `is_company_member(company_id)`
-- وحدها — أى أن **كل عضوٍ يقرأ كل منتجات الشركة** من القاعدة، والفلترة
-- بالفرع تعيش فى `/api/products-list` وتسع شاشاتٍ أخرى، كلٌّ بصيغته.
--
-- ومن يبقى بلا قيد: المالك المسجَّل (بسياسته القائمة)، وكل عضوٍ **بلا
-- فرعٍ فى عضويته** (عضو الشركة كلها)، والأدوار العامة (`owner`/`admin`/
-- `general_manager`).
--
-- ⚠️ قِيس قبل الكتابة: ٥٤ حركة مخزونٍ على ٣ فروع، و**صفر** منتجٍ تحرّك
--    خارج فرعه حتى اليوم — فلا صفَّ واحدٌ يتغيّر حالُه بهذه السياسة الآن؛
--    وإنما تُغلق الفجوة قبل أول نقل. والفهرس اللازم قائمٌ بالفعل
--    (`idx_inventory_tx_branch_warehouse` على company_id, branch_id,
--    warehouse_id, product_id). وقِيس كذلك: **صفر** منتجٍ بلا فرع على
--    الإنتاج (١٣/١٣ لها فرع)، فلا صنفَ يختفى اليوم بالشق الأول.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════ (أ) الرؤية: منتج فرعى، أو ما تحرّك فى فرعى ═══════════

DROP POLICY IF EXISTS products_select ON public.products;

CREATE POLICY products_select ON public.products
FOR SELECT
USING (
  public.is_company_member(company_id)
  AND (
    -- (١) عضوٌ على مستوى الشركة: بلا فرعٍ فى عضويته، أو بدورٍ عام.
    EXISTS (
      SELECT 1 FROM company_members cm
       WHERE cm.company_id = products.company_id
         AND cm.user_id = auth.uid()
         AND (cm.branch_id IS NULL
              OR lower(btrim(cm.role)) IN ('owner', 'admin', 'general_manager', 'gm', 'generalmanager'))
    )
    -- (٢) أو المنتج منتجُ فرعه.
    OR EXISTS (
      SELECT 1 FROM company_members cm
       WHERE cm.company_id = products.company_id
         AND cm.user_id = auth.uid()
         AND cm.branch_id IS NOT NULL
         AND cm.branch_id = products.branch_id
    )
    -- (٣) أو وصلت منه حركةٌ إلى فرعه — ولو بقيت بطاقتُه لفرعٍ آخر أو بلا
    --     فرع. وبها يبيع المنقولَ إليه. و**أى حركة** تكفى، لا رصيدٌ قائم:
    --     لو اشترُط الرصيد لاختفى الصنف لحظة نفاده، فانكسرت مرتجعاتُه
    --     وفواتيرُه القديمة (قرار المالك صراحةً).
    OR EXISTS (
      SELECT 1
        FROM inventory_transactions t
        JOIN company_members cm
          ON cm.company_id = products.company_id
         AND cm.user_id = auth.uid()
       WHERE t.product_id = products.id
         AND cm.branch_id IS NOT NULL
         AND t.branch_id = cm.branch_id
    )
  )
);

COMMENT ON POLICY products_select ON public.products IS
  'v3.74.915 — عضو الفرع يرى منتجات فرعه وما تحرّك فى فرعه (فالنقل يحرّك الكمية ولا يمسّ البطاقة). وعضو الشركة والأدوار العامة بلا قيد.';

-- ═══════════ (ب) وحارسُ عزل الفروع يُصلَح مرتين ═══════════
--
-- `validate_product_branch_isolation` حارسٌ قائم منذ زمن: يرفض بندَ مستندٍ
-- فرعُه يخالف فرع المنتج («Branch Isolation Violation»). وهو مُعلَّق على
-- ستة جداول بنود. وللشق (أ) أثران عليه، كلاهما يوجب تعديله **فى نفس
-- الإصدار** — لا بعده:
--
-- ١) **كان يعمى بالسياسة الجديدة**. الدالة `SECURITY INVOKER`: تقرأ
--    `products` بعين المستخدم نفسه. وبعد (أ) لا يرى عضو الفرع منتجَ فرعٍ
--    آخر — فيعود `SELECT branch_id INTO v_pb` بـ NULL، و`NULL` تعنى فى
--    منطق الدالة «منتج الشركة، لا فرع له» فتمرّ! أى أن الحارس ينقلب
--    **مُجيزاً** لأخطر حالةٍ يحرسها. ولذلك يصير `SECURITY DEFINER`
--    (بمالكه postgres) فيقرأ الحقيقة لا ما يُسمح للمستخدم برؤيته.
--    ⚠️ وهذا وحده سببٌ كافٍ: لولاه لكان (أ) **يفكّ** حارساً محاسبياً
--    قائماً وهو يظنّ نفسه يشدّ الرباط.
--
-- ٢) **وكان يمنع البيع بعد النقل**. نصُّ المالك: «بعد نقل المشترى إلى فرع
--    يمكنهم تنفيذ البيع عليه». وبطاقة المنتج لا تتغيّر بالنقل، فبيعُه على
--    فاتورة الفرع المستلِم كان يُرفض حتماً. فيُستثنى **البيع وحده**
--    (`invoice_items` و`sales_order_items`) وبشرطٍ يُقاس لا يُفترض:
--    **دخلت بضاعةٌ من هذا الصنف فعلاً إلى هذا الفرع** (حركةٌ موجبة).
--    ولا يُمسّ جانب الشراء (`purchase_order_items`, `bill_items`,
--    `purchase_return_items`, `vendor_credit_items`): لم يطلب المالك
--    توسعتَه، وسياسة الشراء لها إصدارها.
--
-- وما عدا ذلك يبقى حرفاً بحرف كما كان.
CREATE OR REPLACE FUNCTION public.validate_product_branch_isolation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_pb UUID;
  v_db UUID;
  v_tn TEXT := TG_TABLE_NAME;
  v_p  UUID;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  CASE v_tn
    WHEN 'purchase_order_items'  THEN v_p := NEW.purchase_order_id;  SELECT branch_id INTO v_db FROM purchase_orders  WHERE id = v_p;
    WHEN 'bill_items'            THEN v_p := NEW.bill_id;            SELECT branch_id INTO v_db FROM bills            WHERE id = v_p;
    WHEN 'sales_order_items'     THEN v_p := NEW.sales_order_id;     SELECT branch_id INTO v_db FROM sales_orders     WHERE id = v_p;
    WHEN 'invoice_items'         THEN v_p := NEW.invoice_id;         SELECT branch_id INTO v_db FROM invoices         WHERE id = v_p;
    WHEN 'purchase_return_items' THEN v_p := NEW.purchase_return_id; SELECT branch_id INTO v_db FROM purchase_returns WHERE id = v_p;
    WHEN 'vendor_credit_items'   THEN v_p := NEW.vendor_credit_id;   SELECT branch_id INTO v_db FROM vendor_credits   WHERE id = v_p;
    ELSE RETURN NEW;
  END CASE;

  IF v_db IS NULL THEN RETURN NEW; END IF;

  SELECT branch_id INTO v_pb FROM products WHERE id = NEW.product_id;

  IF v_pb IS NULL OR v_pb = v_db THEN RETURN NEW; END IF;

  -- v3.74.915 — البيع على ما وصل بالنقل: يُسمح حين تكون بضاعةٌ من هذا
  -- الصنف قد **دخلت هذا الفرع فعلاً** (حركة موجبة: transfer_in أو شراء
  -- أو إنتاج). لا نيّةٌ ولا أمر نقلٍ معلَّق — دخولٌ مسجَّل.
  IF v_tn IN ('invoice_items', 'sales_order_items')
     AND EXISTS (
       SELECT 1 FROM inventory_transactions t
        WHERE t.product_id = NEW.product_id
          AND t.branch_id  = v_db
          AND t.quantity_change > 0
     )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Branch Isolation Violation';
END;
$function$;

COMMENT ON FUNCTION public.validate_product_branch_isolation() IS
  'v3.74.915 — SECURITY DEFINER ليقرأ فرع المنتج حقيقةً بعد تضييق products_select (وإلا لعاد NULL فمرّ ما يحرسه). ويُستثنى البيع وحده على صنفٍ دخل هذا الفرع بحركةٍ موجبة — وهو المنقول.';
