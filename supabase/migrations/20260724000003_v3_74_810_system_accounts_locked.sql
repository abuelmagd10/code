-- ============================================================================
-- v3.74.810 — الحسابات الحرجة إلزامية الوجود: لا حذف، لا تعطيل، لا أرشفة
-- ============================================================================
-- طلب المالك: «الحسابات التى تؤثر على العمليات المحاسبية وقد تؤدى إلى
-- تعطيل التطبيق فى حالة عدم وجودها أن تكون إلزامية الوجود مع عدم
-- إمكانية حذفها» + «الرسالة حسب اللغة المختارة فى التطبيق» — القاعدة
-- لا تعرف لغة الواجهة، فالرسائل ثنائية (عربى | إنجليزى).
--
-- الواقع قبل الإصلاح:
--   * الشركات القائمة أُنشئت قبل علامة is_system — حساباتها الحرجة
--     كانت قابلة للحذف من الواجهة.
--   * الحارس القديم منع الحذف فقط؛ تعطيل الحساب (is_active=false)
--     يكسر الترحيل تماماً كحذفه — وكان مسموحاً.
--
-- تحقق (اختبار ثم إنتاج): التعطيل مصدود، الحذف مصدود، الشركات الأربع
-- علّمت حساباتها.
-- ============================================================================

UPDATE chart_of_accounts SET is_system = TRUE, updated_at = NOW()
WHERE sub_type IN (
  'accounts_receivable','accounts_payable','sales_revenue','inventory',
  'cogs','cost_of_goods_sold','cash','bank','vat_output','vat_input',
  'customer_advance','supplier_advance','write_off_expense',
  'sales_discounts','purchase_discounts','purchases',
  'sales_returns','purchase_returns'
) AND COALESCE(is_system, FALSE) = FALSE;

CREATE OR REPLACE FUNCTION public.prevent_critical_account_changes()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  has_transactions BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM journal_entry_lines WHERE account_id = OLD.id LIMIT 1
  ) INTO has_transactions;

  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
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
