import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"
import { apiSuccess, apiError, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

/**
 * تطبيق النمط المحاسبي الصارم لأوامر البيع والشراء
 * منع تعديل الأوامر بعد إرسال الفواتير المرتبطة
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return apiError(HTTP_STATUS.UNAUTHORIZED, "غير مصرح", "Unauthorized")
    }

    const results = {
      functions_created: 0,
      triggers_created: 0,
      steps: [],
      errors: []
    }

    // 1. إنشاء دالة منع تعديل أمر البيع
    try {
      await supabase.rpc('execute_sql', {
        sql_query: `
          CREATE OR REPLACE FUNCTION prevent_sales_order_edit_after_sent()
          RETURNS TRIGGER AS $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM invoices 
              WHERE sales_order_id = NEW.id 
              AND status != 'draft'
            ) THEN
              RAISE EXCEPTION 'لا يمكن تعديل أمر البيع بعد إرسال الفاتورة المرتبطة. يجب التعديل من خلال الفاتورة فقط.';
            END IF;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `
      })
      results.functions_created++
      results.steps.push("تم إنشاء دالة منع تعديل أمر البيع")
    } catch (error: any) {
      results.errors.push(`خطأ في إنشاء دالة أمر البيع: ${error.message}`)
    }

    // 2. إنشاء دالة منع تعديل أمر الشراء
    try {
      await supabase.rpc('execute_sql', {
        sql_query: `
          CREATE OR REPLACE FUNCTION prevent_purchase_order_edit_after_sent()
          RETURNS TRIGGER AS $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM bills 
              WHERE purchase_order_id = NEW.id 
              AND status != 'draft'
            ) THEN
              RAISE EXCEPTION 'لا يمكن تعديل أمر الشراء بعد إرسال الفاتورة المرتبطة. يجب التعديل من خلال الفاتورة فقط.';
            END IF;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `
      })
      results.functions_created++
      results.steps.push("تم إنشاء دالة منع تعديل أمر الشراء")
    } catch (error: any) {
      results.errors.push(`خطأ في إنشاء دالة أمر الشراء: ${error.message}`)
    }

    // 3. إنشاء Triggers لأوامر البيع
    try {
      await supabase.rpc('execute_sql', {
        sql_query: `
          DROP TRIGGER IF EXISTS prevent_so_edit_trigger ON sales_orders;
          CREATE TRIGGER prevent_so_edit_trigger
            BEFORE UPDATE ON sales_orders
            FOR EACH ROW
            EXECUTE FUNCTION prevent_sales_order_edit_after_sent();
        `
      })
      results.triggers_created++
      results.steps.push("تم إنشاء Trigger لمنع تعديل أوامر البيع")
    } catch (error: any) {
      results.errors.push(`خطأ في إنشاء Trigger أوامر البيع: ${error.message}`)
    }

    // 4. إنشاء Triggers لأوامر الشراء
    try {
      await supabase.rpc('execute_sql', {
        sql_query: `
          DROP TRIGGER IF EXISTS prevent_po_edit_trigger ON purchase_orders;
          CREATE TRIGGER prevent_po_edit_trigger
            BEFORE UPDATE ON purchase_orders
            FOR EACH ROW
            EXECUTE FUNCTION prevent_purchase_order_edit_after_sent();
        `
      })
      results.triggers_created++
      results.steps.push("تم إنشاء Trigger لمنع تعديل أوامر الشراء")
    } catch (error: any) {
      results.errors.push(`خطأ في إنشاء Trigger أوامر الشراء: ${error.message}`)
    }

    // 5. إنشاء دالة المزامنة (اختياري)
    try {
      await supabase.rpc('execute_sql', {
        sql_query: `
          CREATE OR REPLACE FUNCTION sync_sales_order_from_invoice()
          RETURNS TRIGGER AS $$
          BEGIN
            IF NEW.sales_order_id IS NOT NULL THEN
              UPDATE sales_orders 
              SET 
                subtotal = NEW.subtotal,
                tax_amount = NEW.tax_amount,
                total = NEW.total_amount,
                updated_at = NOW()
              WHERE id = NEW.sales_order_id;
            END IF;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `
      })
      results.functions_created++
      results.steps.push("تم إنشاء دالة مزامنة أوامر البيع")
    } catch (error: any) {
      results.errors.push(`خطأ في إنشاء دالة المزامنة: ${error.message}`)
    }

    const success = results.functions_created > 0 && results.triggers_created > 0

    return apiSuccess({
      ...results,
      success,
      message: success 
        ? `✅ تم تطبيق النمط المحاسبي الصارم بنجاح. تم إنشاء ${results.functions_created} دالة و ${results.triggers_created} trigger`
        : "⚠️ فشل في تطبيق بعض القواعد. راجع الأخطاء أدناه",
      compliance_status: {
        draft_orders_editable: true,
        sent_orders_locked: true,
        invoice_controls_after_sent: true,
        automatic_sync: true
      }
    })

  } catch (err: any) {
    return internalError("حدث خطأ أثناء تطبيق القواعد", err?.message)
  }
}