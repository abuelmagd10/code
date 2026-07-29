import { NextRequest, NextResponse } from 'next/server'
import { secureApiRequest } from '@/lib/api-security'

/**
 * v3.74.891 — 🔒 كان هذا المسار بلا أى مصادقة: POST يشغّل سكربت
 * استخراج التلميحات من ملفات المشروع ويكتب tooltips.json، وGET يقرأه —
 * وكلاهما متاح لأى زائر. من فرز ملاحظات الحوكمة (73 ملاحظة أمنية).
 * المستهلك الوحيد شاشة الإعدادات (TooltipManager) — فصار المسار خلف
 * مصادقة + دور إدارى، بنفس أسلوب بقية مسارات الإعدادات.
 */
const ALLOWED_ROLES = ['owner', 'admin', 'general_manager']

async function requireAdmin(request: NextRequest) {
  const { user, member, error } = await secureApiRequest(request, {
    requireAuth: true,
    requireCompany: true,
  })
  if (error) return { error }
  if (!user || !member || !ALLOWED_ROLES.includes(String(member.role || '').toLowerCase())) {
    return {
      error: NextResponse.json(
        { success: false, error: 'غير مصرح — هذه الأداة للأدوار الإدارية فقط' },
        { status: 403 }
      ),
    }
  }
  return { error: null }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (gate.error) return gate.error
  try {
    console.log('🚀 بدء تحديث التلميحات من API...')

    // تشغيل عملية استخراج التلميحات
    const { updateTooltipsFromComments } = require('@/scripts/extract-tooltips-simple')
    const tooltips = updateTooltipsFromComments()

    console.log('✅ تم تحديث التلميحات بنجاح من API')

    return NextResponse.json({
      success: true,
      message: 'تم تحديث التلميحات بنجاح',
      count: Object.keys(tooltips).length,
      tooltips: Object.keys(tooltips).slice(0, 10)
    })

  } catch (error) {
    console.error('❌ خطأ في API تحديث التلميحات:', error)

    return NextResponse.json({
      success: false,
      error: 'حدث خطأ أثناء تحديث التلميحات',
      details: error instanceof Error ? error.message : 'خطأ غير معروف'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (gate.error) return gate.error
  try {
    const fs = require('fs')
    const path = require('path')

    const tooltipsPath = path.join(process.cwd(), 'tooltips.json')

    if (!fs.existsSync(tooltipsPath)) {
      return NextResponse.json({
        success: false,
        error: 'ملف التلميحات غير موجود'
      }, { status: 404 })
    }

    const tooltips = JSON.parse(fs.readFileSync(tooltipsPath, 'utf8'))

    return NextResponse.json({
      success: true,
      count: Object.keys(tooltips).length,
      tooltips
    })

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'حدث خطأ أثناء قراءة التلميحات',
      details: error instanceof Error ? error.message : 'خطأ غير معروف'
    }, { status: 500 })
  }
}
