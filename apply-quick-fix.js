#!/usr/bin/env node

/**
 * 🚀 تطبيق الإصلاح السريع لمشكلة عدم ظهور أوامر البيع
 * 
 * هذا السكريپت سيقوم بـ:
 * 1. نسخ احتياطي من ملف الحوكمة الحالي
 * 2. استبداله بالإصدار المبسط
 * 3. إعادة تشغيل الخادم
 */

const fs = require('fs')
const path = require('path')

console.log('🚀 بدء تطبيق الإصلاح السريع...')

const originalFile = 'lib/data-visibility-control.ts'
const tempFixFile = 'lib/data-visibility-control-temp-fix.ts'
const backupFile = 'lib/data-visibility-control-backup.ts'

try {
  // 1️⃣ إنشاء نسخة احتياطية
  if (fs.existsSync(originalFile)) {
    console.log('📋 إنشاء نسخة احتياطية...')
    fs.copyFileSync(originalFile, backupFile)
    console.log('✅ تم إنشاء النسخة الاحتياطية')
  }

  // 2️⃣ استبدال الملف بالإصدار المبسط
  if (fs.existsSync(tempFixFile)) {
    console.log('🔄 استبدال ملف الحوكمة...')
    fs.copyFileSync(tempFixFile, originalFile)
    console.log('✅ تم استبدال ملف الحوكمة')
  } else {
    console.error('❌ ملف الإصلاح المؤقت غير موجود')
    process.exit(1)
  }

  console.log('\n🎉 تم تطبيق الإصلاح السريع بنجاح!')
  console.log('\n📝 الخطوات التالية:')
  console.log('1. أعد تشغيل الخادم: npm run dev')
  console.log('2. سجل دخول مرة أخرى')
  console.log('3. تحقق من ظهور أوامر البيع')
  console.log('4. إذا ظهرت الأوامر، شغل سكريپت الإصلاح الكامل')
  console.log('\n⚠️  هذا إصلاح مؤقت - يجب تطبيق الإصلاح الكامل لاحقاً')

} catch (error) {
  console.error('❌ خطأ في تطبيق الإصلاح:', error.message)
  
  // استعادة النسخة الاحتياطية في حالة الخطأ
  if (fs.existsSync(backupFile)) {
    console.log('🔄 استعادة النسخة الاحتياطية...')
    fs.copyFileSync(backupFile, originalFile)
    console.log('✅ تم استعادة النسخة الاحتياطية')
  }
  
  process.exit(1)
}