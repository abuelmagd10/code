import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from "@/lib/api-error-handler"

export async function POST(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      permissions: ['purchases:write']
    })

    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===

    const body = await req.json()
    const { purchaseOrderId } = body || {}

    if (!purchaseOrderId) {
      return badRequestError("معرف أمر الشراء مطلوب", ["purchaseOrderId"])
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    }

    const supabase = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // Get purchase order with supplier details
    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .select(`
        *,
        suppliers (id, name, email, phone, address)
      `)
      .eq("id", purchaseOrderId)
      .single()

    if (poError || !po) {
      return notFoundError("أمر الشراء", "Purchase order not found")
    }

    const supplierEmail = po.suppliers?.email
    if (!supplierEmail) {
      return badRequestError("المورد ليس لديه بريد إلكتروني مسجل", ["supplier"])
    }

    // Get purchase order items
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select(`
        *,
        products (id, name, sku)
      `)
      .eq("purchase_order_id", purchaseOrderId)

    // Get company details
    const { data: company } = await supabase
      .from("companies")
      .select("name, email, phone, address, logo_url")
      .eq("id", companyId)
      .single()

    // Build email content
    const itemsHtml = (items || []).map((item: any) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.products?.name || 'منتج'}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${Number(item.unit_price).toFixed(2)}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${Number(item.line_total).toFixed(2)}</td>
      </tr>
    `).join('')

    const emailSubject = `أمر شراء جديد - ${po.po_number} من ${company?.name || 'الشركة'}`
    const emailHtml = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .footer { background: #f3f4f6; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #f3f4f6; padding: 10px; border: 1px solid #ddd; }
          .total { font-size: 18px; font-weight: bold; color: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>أمر شراء</h1>
            <p>رقم: ${po.po_number}</p>
          </div>
          <div class="content">
            <p><strong>من:</strong> ${company?.name || 'الشركة'}</p>
            <p><strong>إلى:</strong> ${po.suppliers?.name}</p>
            <p><strong>التاريخ:</strong> ${new Date(po.po_date).toLocaleDateString('ar-EG')}</p>
            ${po.due_date ? `<p><strong>تاريخ الاستحقاق:</strong> ${new Date(po.due_date).toLocaleDateString('ar-EG')}</p>` : ''}

            <h3>البنود:</h3>
            <table>
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <p class="total">الإجمالي: ${Number(po.total_amount || po.total).toFixed(2)} ${po.currency || 'EGP'}</p>

            ${po.notes ? `<p><strong>ملاحظات:</strong> ${po.notes}</p>` : ''}
          </div>
          <div class="footer">
            <p>${company?.name || ''} | ${company?.phone || ''} | ${company?.email || ''}</p>
          </div>
        </div>
      </body>
      </html>
    `

    // Send email using Resend API
    const resendApiKey = process.env.RESEND_API_KEY

    if (resendApiKey) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || "7ESAB <noreply@7esab.com>",
            to: [supplierEmail],
            subject: emailSubject,
            html: emailHtml,
          }),
        })

        const emailResult = await emailRes.json()

        if (emailRes.ok && emailResult.id) {
          return apiSuccess({
            ok: true,
            emailSent: true,
            emailId: emailResult.id,
            message: "تم إرسال أمر الشراء بنجاح"
          })
        } else {
          console.error("Resend API error:", emailResult)
          return apiSuccess({
            ok: true,
            emailSent: false,
            error: emailResult.message || "فشل إرسال الإيميل",
            message: "تم تحديث الحالة لكن فشل إرسال الإيميل"
          })
        }
      } catch (emailErr: any) {
        console.error("Email send error:", emailErr)
        return apiSuccess({
          ok: true,
          emailSent: false,
          error: String(emailErr),
          message: "تم تحديث الحالة لكن حدث خطأ في الإرسال"
        })
      }
    }

    // If no Resend API key configured
    return apiSuccess({
      ok: true,
      emailSent: false,
      supplierEmail,
      message: "تم تحديث الحالة - خدمة الإيميل غير مفعلة"
    })
  } catch (e: any) {
    console.error("Send PO email error:", e)
    return internalError("حدث خطأ أثناء إرسال أمر الشراء", e?.message || String(e))
  }
}

