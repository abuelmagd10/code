/**
 * 🔒 API العملاء مع الحوكمة الإلزامية
 * 
 * GET /api/customers - جلب العملاء مع تطبيق الحوكمة
 * POST /api/customers - إنشاء عميل جديد مع الحوكمة
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  enforceGovernance,
  applyGovernanceFilters,
  validateGovernanceData,
  addGovernanceData
} from "@/lib/governance-middleware"

/**
 * GET /api/customers
 * جلب العملاء مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const supabase = await createClient()
    
    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    let query = supabase
      .from("customers")
      .select("*")
    
    // 3️⃣ تطبيق فلاتر الحوكمة (إلزامي)
    query = applyGovernanceFilters(query, governance)
    query = query.order("name")

    const { data: customers, error: dbError } = await query

    if (dbError) {
      console.error("[API /customers] Database error:", dbError)
      return NextResponse.json({
        error: dbError.message,
        error_ar: "خطأ في جلب العملاء"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: customers || [],
      meta: {
        total: (customers || []).length,
        role: governance.role,
        governance: {
          companyId: governance.companyId,
          branchIds: governance.branchIds,
          warehouseIds: governance.warehouseIds,
          costCenterIds: governance.costCenterIds
        }
      }
    })

  } catch (error: any) {
    console.error("[API /customers] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, { 
      status: error.message.includes('Unauthorized') ? 401 : 403 
    })
  }
}

/**
 * POST /api/customers
 * إنشاء عميل جديد مع التحقق من الحوكمة ورقم التليفون المكرر
 */
export async function POST(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()
    
    const body = await request.json()
    
    // 2️⃣ إضافة بيانات الحوكمة تلقائياً
    const dataWithGovernance = addGovernanceData(body, governance)
    
    // 3️⃣ التحقق من صحة البيانات (إلزامي)
    validateGovernanceData(dataWithGovernance, governance)
    
    const supabase = await createClient()

    // 4️⃣ التحقق من طول رقم التليفون (11 رقم على الأقل) ثم تكراره
    if (dataWithGovernance.phone) {
      const { normalizePhone } = await import('@/lib/phone-utils')
      const normalizedPhone = normalizePhone(dataWithGovernance.phone)
      
      if (normalizedPhone && normalizedPhone.length < 11) {
        return NextResponse.json({
          error: "Phone number must be at least 11 digits",
          error_ar: "رقم الهاتف يجب أن يكون 11 رقم على الأقل"
        }, { status: 400 })
      }
      
      if (normalizedPhone) {
        // جلب جميع العملاء في نفس الشركة
        const { data: existingCustomers, error: fetchError } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("company_id", governance.companyId)
        
        if (fetchError) {
          console.error("[API /customers POST] Error fetching existing customers:", fetchError)
          return NextResponse.json({
            error: "Failed to check for duplicate phone number",
            error_ar: "فشل في التحقق من تكرار رقم التليفون"
          }, { status: 500 })
        }
        
        // البحث عن عميل بنفس رقم التليفون (بعد التطبيع)
        const duplicateCustomer = existingCustomers?.find((c: any) => {
          if (!c.phone) return false
          const existingNormalized = normalizePhone(c.phone)
          return existingNormalized === normalizedPhone
        })
        
        if (duplicateCustomer) {
          console.error("[API /customers POST] Duplicate phone found:", duplicateCustomer)
          return NextResponse.json({
            error: "Phone number already exists",
            error_ar: `رقم الهاتف مستخدم بالفعل لعميل آخر: ${duplicateCustomer.name}`,
            duplicate_customer: {
              id: duplicateCustomer.id,
              name: duplicateCustomer.name
            }
          }, { status: 400 })
        }
      }
    }
    
    // 5️⃣ الإدخال في قاعدة البيانات
    const { data: newCustomer, error: insertError } = await supabase
      .from("customers")
      .insert(dataWithGovernance)
      .select()
      .single()

    if (insertError) {
      console.error("[API /customers POST] Insert error:", insertError)
      
      // التحقق من خطأ تكرار رقم التليفون من قاعدة البيانات
      if (insertError.message?.includes('DUPLICATE_PHONE') || insertError.message?.includes('duplicate')) {
        return NextResponse.json({
          error: "Phone number already exists",
          error_ar: "رقم الهاتف مستخدم بالفعل لعميل آخر"
        }, { status: 400 })
      }
      
      return NextResponse.json({
        error: insertError.message,
        error_ar: "فشل في إنشاء العميل"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: newCustomer,
      message: "Customer created successfully",
      message_ar: "تم إنشاء العميل بنجاح",
      governance: {
        enforced: true,
        companyId: governance.companyId,
        branchId: dataWithGovernance.branch_id,
        warehouseId: dataWithGovernance.warehouse_id,
        costCenterId: dataWithGovernance.cost_center_id
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error("[API /customers POST] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, { 
      status: error.message.includes('Violation') ? 403 : 500 
    })
  }
}
