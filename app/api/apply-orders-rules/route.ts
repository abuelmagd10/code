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

    const results: {
      functions_created: number
      triggers_created: number
      steps: string[]
      errors: string[]
    } = {
      functions_created: 0,
      triggers_created: 0,
      steps: [],
      errors: []
    }

    // 1. إنشاء دالة منع تعديل أمر البيع
    try {
      const { error: rpcErr } = await supabase.rpc('execute_sql', {
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
      // v3.75.83 — **الوعدُ ليس فعلاً**: نداءُ supabase لا يرمى استثناءً عندَ الفشل،
      // بل يُرجِعُ الخطأَ فى الكائن. وكان الخطأُ لا يُقرَأُ هنا إطلاقاً، فتُزادُ العدّادُ
      // ويُكتَبُ «تم إنشاء…» **وما أُنشئ شىء**. فيُقرَأُ الخطأُ الآن ويُرفَعُ إلى المصيدة.
      if (rpcErr) throw new Error(rpcErr.message)
      results.functions_created++
      results.steps.push("تم إنشاء دالة منع تعديل أمر البيع")
    } catch (error: any) {
      results.errors.push(`خطأ في إنشاء دالة أمر البيع: ${error.message}`)
    }

    // 2. إنشاء دالة منع تعديل أمر الشراء
    try {
      const { error: rpcErr } = await supabase.rpc('execute_sql', {
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
      // v3.75.83 — **الوعدُ ليس فعلاً**: نداءُ supabase لا يرمى استثناءً عندَ الفشل،
      // بل يُرجِعُ الخطأَ فى الكائن. وكان الخطأُ لا يُقرَأُ هنا إطلاقاً، فتُزادُ العدّادُ
      // ويُكتَبُ «تم إنشاء…» **وما أُنشئ شىء**. فيُقرَأُ الخطأُ الآن ويُرفَعُ إلى المصيدة.
      if (rpcErr) throw new Error(rpcErr.message)
      results.functions_created++
      results.steps.push("تم إنشاء دالة منع تعديل أمر الشراء")
    } catch (error: any) {
      results.errors.push(`خطأ في إنشاء دالة أمر الشراء: ${error.message}`)
    }

    // 3. إنشاء Triggers لأوامر البيع
    try {
      const { error: rpcErr } = await supabase.rpc('execute_sql', {
        sql_query: `
          DROP TRIGGER IF EXISTS prevent_so_edit_trigger ON sales_orders;
          CREATE TRIGGER prevent_so_edit_trigger
            BEFORE UPDATE ON sales_orders
            FOR EACH ROW
            EXECUTE FUNCTION prevent_sales_order_edit_after_sent();
        `
      })
      if (rpcErr) throw new Error(rpcErr.message)
      results.triggers_created++
      results.steps.push("تم إنشاء Trigger لمنع تعديل أوامر البيع")
    } catch (error: any) {
      results.errors.push(`خطأ في إنشاء Trigger أوامر البيع: ${error.message}`)
    }

    // 4. إنشاء Triggers لأوامر الشراء
    try {
      const { error: rpcErr } = await supabase.rpc('execute_sql', {
        sql_query: `
          DROP TRIGGER IF EXISTS prevent_po_edit_trigger ON purchase_orders;
          CREATE TRIGGER prevent_po_edit_trigger
            BEFORE UPDATE ON purchase_orders
            FOR EACH ROW
            EXECUTE FUNCTION prevent_purchase_order_edit_after_sent();
        `
      })
      if (rpcErr) throw new Error(rpcErr.message)
      results.triggers_created++
      results.steps.push("تم إنشاء Trigger لمنع تعديل أوامر الشراء")
    } catch (error: any) {
      results.errors.push(`خطأ في إنشاء Trigger أوامر الشراء: ${error.message}`)
    }

    // 5. إنشاء دالة المزامنة (اختياري)
    try {
      const { error: rpcErr } = await supabase.rpc('execute_sql', {
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
      // v3.75.83 — **الوعدُ ليس فعلاً**: نداءُ supabase لا يرمى استثناءً عندَ الفشل،
      // بل يُرجِعُ الخطأَ فى الكائن. وكان الخطأُ لا يُقرَأُ هنا إطلاقاً، فتُزادُ العدّادُ
      // ويُكتَبُ «تم إنشاء…» **وما أُنشئ شىء**. فيُقرَأُ الخطأُ الآن ويُرفَعُ إلى المصيدة.
      if (rpcErr) throw new Error(rpcErr.message)
      results.functions_created++
      results.steps.push("تم إنشاء دالة مزامنة أوامر البيع")
    } catch (error: any) {
      results.errors.push(`خطأ في إنشاء دالة المزامنة: ${error.message}`)
    }

    // v3.75.83 — **ولا تُعلَنُ حالةُ التزامٍ لم تُقَسْ.** كانت هذه الحقولُ الأربعةُ
    // مكتوبةً `true` ثابتةً فى النصِّ مهما جرى، فتقولُ الشاشةُ لصاحبِ الشأنِ إنَّ
    // «الأوامرَ مقفولةٌ بعدَ الإرسال» و«ضوابطَ الفاتورةِ مفعَّلة» — **وقد قِيسَ يومَ
    // ٢٢ أغسطس ٢٠٢٦ أنَّ لا مُشغِّلاً واحداً على `sales_orders` ولا على
    // `purchase_orders` يمنعُ التعديلَ بعدَ إرسالِ الفاتورةِ المرتبطة**. فالحقولُ
    // الآن تُشتَقُّ ممّا وقعَ فعلاً فى هذا الطلب، لا من نيّةٍ مكتوبةٍ سلفاً.
    //
    // وبناءُ هذا الضابطِ نفسِه ليس من هذه الدفعة: مُشغِّلٌ جديدٌ يمنعُ تعديلاً
    // مسموحاً اليومَ يُغيّرُ عملَ الناسِ فعلاً، ويُقاسُ فى دفعتِه ولا يُخلَطُ بنزعِ
    // ادّعاء. وهو مُسمّىً ومعدودٌ فى حارسِ `check-every-rpc-call-has-a-door.js`.
    const success = results.functions_created > 0 && results.triggers_created > 0

    return apiSuccess({
      ...results,
      success,
      message: success
        ? `✅ تم تطبيق النمط المحاسبي الصارم بنجاح. تم إنشاء ${results.functions_created} دالة و ${results.triggers_created} trigger`
        : "⚠️ لم يُطبَّق شيء. راجع الأخطاء أدناه — ولا تُعتبَر القواعد مفعَّلة",
      compliance_status: {
        draft_orders_editable: true,
        sent_orders_locked: results.triggers_created > 0,
        invoice_controls_after_sent: results.triggers_created > 0,
        automatic_sync: results.functions_created > 0
      }
    })

  } catch (err: any) {
    return internalError("حدث خطأ أثناء تطبيق القواعد", err?.message)
  }
}