import { NextRequest, NextResponse } from 'next/server'
import path from 'path'

export async function POST(request: NextRequest) {
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
    
    const tooltipsContent = fs.readFileSync(tooltipsPath, 'utf-8')
    const tooltips = JSON.parse(tooltipsContent)
    
    return NextResponse.json({
      success: true,
      count: Object.keys(tooltips).length,
      tooltips
    })
    
  } catch (error) {
    console.error('❌ خطأ في قراءة التلميحات:', error)
    
    return NextResponse.json({
      success: false,
      error: 'حدث خطأ أثناء قراءة التلميحات',
      details: error instanceof Error ? error.message : 'خطأ غير معروف'
    }, { status: 500 })
  }
}