/**
 * 🔐 Account Balances API - حساب أرصدة الحسابات
 * 
 * ⚠️ CRITICAL ACCOUNTING FUNCTION - FINAL APPROVED LOGIC
 * 
 * ✅ هذا المنطق معتمد نهائيًا ولا يتم تغييره إلا بحذر شديد
 * ✅ مطابق لأنظمة ERP الاحترافية (Odoo / Zoho / SAP)
 * 
 * ✅ القواعد الإلزامية الثابتة:
 * 1. Single Source of Truth:
 *    - جميع الأرصدة تأتي من journal_entries فقط
 *    - لا قيم ثابتة أو محفوظة مسبقًا
 *    - الرصيد = opening_balance + (debit - credit) movements من journal_entry_lines
 *    - التسلسل: journal_entries → journal_entry_lines → account_balances → balance_sheet
 * 
 * 2. Dynamic Calculation:
 *    - كل رقم في الميزانية محسوب ديناميكيًا من القيود
 *    - لا تخزين مؤقت أو قيم ثابتة
 * 
 * 3. Future Compatibility (مضمون):
 *    - إغلاق السنة
 *    - ترحيل الأرباح المحتجزة
 *    - القيود المركبة
 *    - الضرائب
 *    - المخزون
 *    - الإهلاك
 * 
 * ⚠️ DO NOT MODIFY WITHOUT SENIOR ACCOUNTING REVIEW
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان أولاً باستخدام user session
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false, // ✅ أرصدة الحسابات تعرض بيانات الشركة كاملة
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    // ✅ بعد التحقق من الأمان، نستخدم service role key للاستعلامات
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { searchParams } = new URL(req.url)
    const asOf = searchParams.get("asOf") || "9999-12-31"

    // ✅ جلب جميع الحسابات النشطة أولاً (بدون joins معقدة)
    const { data: accountsData, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, opening_balance")
      .eq("company_id", companyId)
      .eq("is_active", true) // 📌 فلترة الحسابات النشطة فقط

    if (accountsError) {
      console.error("Accounts query error:", accountsError)
      return serverError(`خطأ في جلب بيانات الحسابات: ${accountsError.message}`)
    }

    // ✅ جلب القيود المرحّلة فقط (status='posted') لضمان التوافق مع income-statement API
    // ✅ القيود بـ status='draft' يجب ألا تؤثر على الميزانية العمومية
    const { data: journalEntriesData, error: entriesError } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء القيود المحذوفة (is_deleted)
      .is("deleted_at", null) // ✅ استثناء القيود المحذوفة (deleted_at)
      .eq("status", "posted") // ✅ posted فقط — متطابق مع income-statement API
      .lte("entry_date", asOf)

    if (entriesError) {
      console.error("Journal entries query error:", entriesError)
      return serverError(`خطأ في جلب القيود: ${entriesError.message}`)
    }

    const journalEntryIds = (journalEntriesData || []).map((je: any) => je.id)

    // ✅ جلب سطور القيود (بدون joins معقدة)
    let journalLinesData: any[] = []
    if (journalEntryIds.length > 0) {
      const { data: linesData, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .in("journal_entry_id", journalEntryIds)

      if (linesError) {
        console.error("Journal lines query error:", linesError)
        return serverError(`خطأ في جلب بيانات القيود: ${linesError.message}`)
      }
      journalLinesData = linesData || []
    }

    // إنشاء خريطة للحسابات مع الأرصدة الافتتاحية
    const accountsMap: Record<string, {
      code: string
      name: string
      type: string
      opening: number
      balance: number
    }> = {}

    for (const acc of accountsData || []) {
      accountsMap[acc.id] = {
        code: acc.account_code || '',
        name: acc.account_name || '',
        type: acc.account_type || '',
        opening: Number(acc.opening_balance || 0),
        balance: Number(acc.opening_balance || 0)
      }
    }

    // ✅ حساب الحركات من القيود فقط (journal_entries → journal_entry_lines)
    // ✅ هذا هو المصدر الوحيد للأرصدة - لا قيم ثابتة
    for (const row of journalLinesData || []) {
      const aid = String((row as any).account_id || "")
      const debit = Number((row as any).debit_amount || 0)
      const credit = Number((row as any).credit_amount || 0)

      if (accountsMap[aid]) {
        const type = accountsMap[aid].type
        // ✅ حساب الرصيد حسب الطبيعة المحاسبية:
        // - الأصول والمصروفات: رصيدها الطبيعي مدين (debit - credit)
        // - الالتزامات وحقوق الملكية والإيرادات: رصيدها الطبيعي دائن (credit - debit)
        const isDebitNature = type === 'asset' || type === 'expense'
        const movement = isDebitNature ? (debit - credit) : (credit - debit)
        accountsMap[aid].balance += movement
      }
    }

    // ✅ جلب sub_type للحسابات (مطلوب لتحديد الأرباح المحتجزة)
    const { data: accountsWithSubType } = await supabase
      .from("chart_of_accounts")
      .select("id, sub_type")
      .eq("company_id", companyId)
      .in("id", Object.keys(accountsMap))

    const subTypeMap = new Map<string, string>()
    accountsWithSubType?.forEach((acc: any) => {
      if (acc.sub_type) {
        subTypeMap.set(acc.id, acc.sub_type)
      }
    })

    // تحويل إلى مصفوفة مع إضافة sub_type
    const result = Object.entries(accountsMap).map(([account_id, v]) => ({
      account_id,
      account_code: v.code,
      account_name: v.name,
      account_type: v.type,
      sub_type: subTypeMap.get(account_id) || undefined,
      opening_balance: v.opening,
      balance: v.balance
    }))

    return NextResponse.json(result)
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب أرصدة الحسابات: ${e?.message}`)
  }
}