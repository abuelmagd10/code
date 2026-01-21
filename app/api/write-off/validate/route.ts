/**
 * API Endpoint: التحقق من صحة عناصر الإهلاك
 * =====================================================
 * 
 * يتحقق من:
 * - الرصيد المتاح لكل منتج
 * - الحوكمة (branch_id, warehouse_id, cost_center_id)
 * - صحة البيانات الأساسية
 */

import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)

    if (!companyId) {
      return NextResponse.json(
        { isValid: false, errors: ['Company not found'] },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { items, warehouse_id, branch_id, cost_center_id } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { isValid: false, errors: ['يجب إضافة منتجات للإهلاك'] },
        { status: 400 }
      )
    }

    // 🧾 Governance: التحقق من الحوكمة
    if (!warehouse_id || !branch_id || !cost_center_id) {
      return NextResponse.json(
        { 
          isValid: false, 
          errors: ['الحوكمة مطلوبة: يجب تحديد branch_id, warehouse_id, cost_center_id'] 
        },
        { status: 400 }
      )
    }

    const errors: Array<{
      product_id: string
      product_name?: string
      product_sku?: string
      message: string
    }> = []

    // التحقق من كل عنصر
    for (const item of items) {
      // التحقق الأساسي
      if (!item.product_id) {
        errors.push({
          product_id: item.product_id || '',
          product_name: item.product_name,
          product_sku: item.product_sku,
          message: 'يجب اختيار منتج'
        })
        continue
      }

      if (!item.quantity || item.quantity <= 0) {
        errors.push({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          message: 'الكمية يجب أن تكون أكبر من صفر'
        })
        continue
      }

      // التحقق من الرصيد المتاح
      try {
        const { data: availableQty, error: qtyError } = await supabase.rpc(
          'get_available_inventory_quantity',
          {
            p_company_id: companyId,
            p_branch_id: branch_id,
            p_warehouse_id: warehouse_id,
            p_cost_center_id: cost_center_id,
            p_product_id: item.product_id
          }
        )

        if (qtyError) {
          console.error('Error checking available quantity:', qtyError)
          errors.push({
            product_id: item.product_id,
            product_name: item.product_name,
            product_sku: item.product_sku,
            message: `خطأ في التحقق من الرصيد: ${qtyError.message}`
          })
          continue
        }

        const availableQuantity = Number(availableQty || 0)
        
        if (availableQuantity <= 0) {
          errors.push({
            product_id: item.product_id,
            product_name: item.product_name || 'غير معروف',
            product_sku: item.product_sku,
            message: `لا يوجد رصيد متاح (الرصيد: ${availableQuantity})`
          })
        } else if (availableQuantity < item.quantity) {
          errors.push({
            product_id: item.product_id,
            product_name: item.product_name || 'غير معروف',
            product_sku: item.product_sku,
            message: `الرصيد المتاح (${availableQuantity}) أقل من المطلوب (${item.quantity})`
          })
        }
      } catch (error: any) {
        console.error('Error validating item:', error)
        errors.push({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          message: `خطأ في التحقق: ${error.message || 'خطأ غير معروف'}`
        })
      }
    }

    return NextResponse.json({
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error: any) {
    console.error('Error validating write-off:', error)
    return NextResponse.json(
      { 
        isValid: false, 
        errors: [{ message: error.message || 'خطأ غير متوقع في التحقق' }] 
      },
      { status: 500 }
    )
  }
}
