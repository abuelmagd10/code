#!/usr/bin/env node

const { updateTooltipsFromComments } = require('../lib/tooltip-extractor')
const path = require('path')

// مسار المشروع
const projectPath = path.resolve(__dirname, '..')

console.log('🚀 بدء عملية استخراج التلميحات من التعليقات...')
console.log(`📁 مسار المشروع: ${projectPath}`)

try {
  const tooltips = updateTooltipsFromComments(projectPath)
  
  console.log('✅ تم الانتهاء بنجاح!')
  console.log(`📊 إجمالي التلميحات المستخرجة: ${Object.keys(tooltips).length}`)
  
  // عرض بعض الأمثلة
  const examples = Object.entries(tooltips).slice(0, 5)
  if (examples.length > 0) {
    console.log('\n📝 أمثلة على التلميحات المستخرجة:')
    examples.forEach(([key, value]) => {
      console.log(`  • ${key}: ${value}`)
    })
  }
  
} catch (error) {
  console.error('❌ حدث خطأ أثناء استخراج التلميحات:', error.message)
  process.exit(1)
}