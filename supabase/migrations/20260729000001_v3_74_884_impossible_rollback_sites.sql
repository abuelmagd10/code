-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.884 — التراجُع الذى قد يُرفض ليس تراجُعاً (إغلاق مواضع الحذف التعويضى)
--
-- **السياق:** `check-impossible-rollback` (880) حصر أربعة مواضع يحذف فيها
-- الكود حذفاً تعويضياً/تنظيفياً من جدولٍ يحرسه مُشغِّلٌ قد يرفع استثناءً.
-- هذه الهجرة تغلق الجذرين اللذين فى القاعدة؛ والباقى فى TS (نفس الإصدار).
--
-- ── الجذر الأول: أمر البيع التلقائى فى POST /api/invoices ────────────────
-- كان المسار: إدراج رأس أمر البيع ثم بنوده، وعند فشل البنود «ينظّف» بحذف
-- الرأس. والرأس يُنشأ بحالة الفاتورة نفسها (قد تكون 'sent')، وبوابة
-- `transactional_document_delete_gate` لا تسمح بالحذف إلا لمسودة ⇒ تراجُعٌ
-- **قد يُرفض**، فيبقى أمر بيعٍ بلا بنود محسوباً فى التقارير.
-- ⇒ العلاج المُثبَت (882): **معاملة واحدة** — `create_sales_order_atomic`
--   تُدرج الرأس والبنود معاً، وأى فشلٍ يُرجع الاثنين معاً بلا استئذان.
--
-- ── الجذر الثانى: تنظيف حسابات الشريك عند حذفه ───────────────────────────
-- منذ 815 يُنشئ `provision_shareholder_accounts` حسابَى الشريك (رأس مال/
-- مسحوبات) بـ`is_system = TRUE`. وصفحة المساهمين كانت «تنظّف» حساب رأس
-- المال بعد حذف الشريك بحذفٍ **غير مفحوص** من المتصفح — يرفضه
-- `prevent_critical_account_changes` (حساب نظام) **فى كل مرة، بصمت**:
-- الشريك يُحذف ويبقى حسابا نظامٍ يتيمان فى كل شركة. (وحساب المسحوبات لم
-- يكن يُنظَّف أصلاً.)
-- ⇒ العلاج: النظام يملك التنظيف لا الواجهة (درس «مالك واحد» 804/815):
--   مُشغِّل `AFTER DELETE` على `shareholders` يحذف — فى نفس معاملة حذف
--   الشريك — كل حسابٍ من حسابَيه **لا قيود عليه ولا شريك آخر يشير إليه**.
--   وحارس الحسابات يفرّق بين حذف الواجهة المباشر (يُرفض للنظامى كما كان)
--   وحذفٍ يبدؤه النظام من داخل مُشغِّل (`pg_trigger_depth() > 1`).
--   الحساب الذى عليه قيود يبقى كما هو — التاريخ لا يُمسّ.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) create_sales_order_atomic — رأس أمر البيع وبنوده فى معاملة واحدة.
--    SECURITY INVOKER عمداً: تعمل تحت نفس RLS وحوارس الحوكمة التى كانت
--    تحكم الإدراج المباشر الذى تستبدله — لا توسيع صلاحيات.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_sales_order_atomic(
  p_so_data  jsonb,
  p_so_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_so_id     uuid;
  v_so_number text;
  v_item      jsonb;
BEGIN
  INSERT INTO sales_orders (
    company_id, customer_id, so_date, due_date, status,
    subtotal, tax_amount, discount_amount, shipping_charge, shipping_tax,
    adjustment, total, total_amount, currency, exchange_rate, total_base,
    tax_inclusive, discount_type, discount_value, discount_position,
    shipping, shipping_tax_rate, shipping_provider_id, notes,
    branch_id, cost_center_id, warehouse_id, created_by_user_id
  )
  SELECT
    (p_so_data->>'company_id')::uuid,
    NULLIF(p_so_data->>'customer_id', '')::uuid,
    COALESCE((p_so_data->>'so_date')::date, CURRENT_DATE),
    (p_so_data->>'due_date')::date,
    COALESCE(NULLIF(p_so_data->>'status', ''), 'draft'),
    COALESCE((p_so_data->>'subtotal')::numeric, 0),
    COALESCE((p_so_data->>'tax_amount')::numeric, 0),
    COALESCE((p_so_data->>'discount_amount')::numeric, 0),
    COALESCE((p_so_data->>'shipping_charge')::numeric, 0),
    COALESCE((p_so_data->>'shipping_tax')::numeric, 0),
    COALESCE((p_so_data->>'adjustment')::numeric, 0),
    COALESCE((p_so_data->>'total')::numeric, 0),
    COALESCE((p_so_data->>'total_amount')::numeric, 0),
    COALESCE(NULLIF(p_so_data->>'currency', ''), 'EGP'),
    COALESCE(NULLIF((p_so_data->>'exchange_rate')::numeric, 0), 1),
    COALESCE((p_so_data->>'total_base')::numeric, 0),
    COALESCE((p_so_data->>'tax_inclusive')::boolean, FALSE),
    NULLIF(p_so_data->>'discount_type', ''),
    COALESCE((p_so_data->>'discount_value')::numeric, 0),
    NULLIF(p_so_data->>'discount_position', ''),
    COALESCE((p_so_data->>'shipping')::numeric, 0),
    COALESCE((p_so_data->>'shipping_tax_rate')::numeric, 0),
    NULLIF(p_so_data->>'shipping_provider_id', '')::uuid,
    NULLIF(p_so_data->>'notes', ''),
    NULLIF(p_so_data->>'branch_id', '')::uuid,
    NULLIF(p_so_data->>'cost_center_id', '')::uuid,
    NULLIF(p_so_data->>'warehouse_id', '')::uuid,
    NULLIF(p_so_data->>'created_by_user_id', '')::uuid
  RETURNING id, so_number INTO v_so_id, v_so_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_so_items) LOOP
    INSERT INTO sales_order_items (
      sales_order_id, product_id, quantity, unit_price, tax_rate,
      discount_percent, subtotal, tax_amount, total, line_total,
      description, item_type
    ) VALUES (
      v_so_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      COALESCE((v_item->>'quantity')::numeric, 0),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'tax_rate')::numeric, 0),
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      COALESCE((v_item->>'subtotal')::numeric, 0),
      COALESCE((v_item->>'tax_amount')::numeric, 0),
      COALESCE((v_item->>'total')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0),
      NULLIF(v_item->>'description', ''),
      COALESCE(NULLIF(v_item->>'item_type', ''), 'product')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'sales_order_id', v_so_id,
    'so_number', v_so_number
  );
END;
$function$;

-- درس 844: CREATE FUNCTION يمنح التنفيذ لـPUBLIC (ومنها anon) تلقائياً.
REVOKE ALL ON FUNCTION public.create_sales_order_atomic(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_atomic(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order_atomic(jsonb, jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) حارس الحسابات: حذف الواجهة المباشر للحساب النظامى يُرفض كما كان؛
--    والحذف الذى يبدؤه النظام من داخل مُشغِّلٍ آخر (pg_trigger_depth > 1)
--    يمرّ إلى فحص القيود: عليه قيود ⇒ أرشفة، نظيف ⇒ حذف.
--    (بقية الدالة كما هى حرفياً — التغيير فى فرع DELETE وحده.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_critical_account_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  has_transactions BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM journal_entry_lines WHERE account_id = OLD.id LIMIT 1
  ) INTO has_transactions;

  IF TG_OP = 'DELETE' THEN
    -- v3.74.884: كان الرفض مطلقاً لكل حساب نظام، فصار مقيَّداً بالحذف
    -- المباشر (من التطبيق/API). حذفٌ يبدؤه النظام من داخل مُشغِّل —
    -- كتنظيف حسابات شريكٍ حُذف — يمرّ إلى فحص القيود أدناه.
    IF OLD.is_system AND pg_trigger_depth() <= 1 THEN
      -- v3.74.810b: bilingual — the DB cannot know the UI language, so the
      -- message carries both (owner: «الرسالة حسب اللغة المختارة»).
      RAISE EXCEPTION 'لا يمكن حذف حساب نظام — مطلوب لعمل المحاسبة التلقائية. | System account cannot be deleted — required for automatic accounting.';
    END IF;

    IF has_transactions THEN
      UPDATE chart_of_accounts
      SET is_archived = TRUE, is_active = FALSE, updated_at = NOW()
      WHERE id = OLD.id;
      RETURN NULL;
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.account_type IS DISTINCT FROM NEW.account_type AND has_transactions THEN
      RAISE EXCEPTION 'لا يمكن تغيير نوع حساب (%) لوجود قيود عليه — يفسد القوائم التاريخية. | Cannot change account type of % — it has transactions.', OLD.account_name, OLD.account_name;
    END IF;

    IF OLD.is_system THEN
      IF OLD.account_code IS DISTINCT FROM NEW.account_code THEN
        RAISE EXCEPTION 'لا يمكن تغيير كود حساب نظام. | System account code cannot be changed.';
      END IF;
      IF OLD.account_type IS DISTINCT FROM NEW.account_type THEN
        RAISE EXCEPTION 'لا يمكن تغيير نوع حساب نظام. | System account type cannot be changed.';
      END IF;
      IF (COALESCE(OLD.is_active, TRUE) = TRUE AND COALESCE(NEW.is_active, TRUE) = FALSE)
         OR (COALESCE(OLD.is_archived, FALSE) = FALSE AND COALESCE(NEW.is_archived, FALSE) = TRUE) THEN
        RAISE EXCEPTION 'لا يمكن تعطيل أو أرشفة حساب نظام (%) — مطلوب لعمل المحاسبة التلقائية. | System account (%) cannot be deactivated or archived.', OLD.account_name, OLD.account_name;
      END IF;
      IF COALESCE(OLD.is_system, FALSE) = TRUE AND COALESCE(NEW.is_system, FALSE) = FALSE THEN
        RAISE EXCEPTION 'لا يمكن إزالة صفة "حساب نظام" من واجهة التطبيق. | The system-account flag cannot be removed from the app.';
      END IF;
    END IF;

    IF OLD.is_archived = TRUE AND NEW.is_archived = FALSE AND has_transactions THEN
      RAISE EXCEPTION 'لا يمكن إلغاء أرشفة حساب له قيود (%). | Cannot unarchive account with transactions (%).', OLD.account_name, OLD.account_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) تنظيف حسابات الشريك — فى نفس معاملة حذفه، بلا استئذانٍ من المتصفح.
--    يُحذف الحساب فقط إن كان: بلا أى قيود، ولا يشير إليه شريكٌ آخر.
--    وإلا يُترك كما هو (التاريخ يبقى). فشل FK غير متوقَّع ⇒ يُترك الحساب
--    مع تحذير، ولا يُفشَل حذف الشريك.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_shareholder_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_acc uuid;
BEGIN
  FOR v_acc IN
    SELECT a FROM unnest(ARRAY[OLD.capital_account_id, OLD.drawings_account_id]) AS a
    WHERE a IS NOT NULL
  LOOP
    -- عليه قيود ⇒ تاريخٌ لا يُمسّ.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM journal_entry_lines WHERE account_id = v_acc LIMIT 1
    );
    -- شريكٌ آخر يستعمله ⇒ ليس لنا.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM shareholders
      WHERE capital_account_id = v_acc OR drawings_account_id = v_acc
      LIMIT 1
    );
    BEGIN
      DELETE FROM chart_of_accounts WHERE id = v_acc;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE WARNING 'cleanup_shareholder_accounts: account % is referenced elsewhere — left in place', v_acc;
    END;
  END LOOP;
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_shareholder_accounts() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_cleanup_shareholder_accounts ON public.shareholders;
CREATE TRIGGER trg_cleanup_shareholder_accounts
  AFTER DELETE ON public.shareholders
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_shareholder_accounts();
