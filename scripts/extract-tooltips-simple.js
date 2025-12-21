const fs = require('fs')
const path = require('path')

// مسار المشروع
const projectPath = path.resolve(__dirname, '..')

/**
 * استخراج التعليقات من ملف واحد
 */
function extractCommentsFromFile(filePath) {
  const comments = []
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // البحث عن التعليقات العربية والإنجليزية
      const singleLineComment = line.match(/\/\/\s*(.+)/)
      const multiLineComment = line.match(/\/\*\s*(.+?)\s*\*\//)
      
      if (singleLineComment || multiLineComment) {
        const commentText = singleLineComment?.[1] || multiLineComment?.[1] || ''
        
        // البحث عن اسم الدالة في الأسطر التالية
        let functionName = ''
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim()
          
          // البحث عن تعريف الدالة
          const functionMatch = nextLine.match(/(?:function\s+|const\s+|let\s+|var\s+)(\w+)|(\w+)\s*[:=]\s*(?:\([^)]*\)\s*=>|function)/)
          if (functionMatch) {
            functionName = functionMatch[1] || functionMatch[2]
            break
          }
          
          // البحث عن مكونات React
          const componentMatch = nextLine.match(/(?:export\s+)?(?:default\s+)?(?:function\s+)?(\w+)(?:\s*\([^)]*\))?\s*{/)
          if (componentMatch) {
            functionName = componentMatch[1]
            break
          }
        }
        
        if (functionName && commentText) {
          comments.push({
            functionName,
            description: commentText,
            filePath,
            lineNumber: i + 1
          })
        }
      }
    }
  } catch (error) {
    console.error(`خطأ في قراءة الملف ${filePath}:`, error.message)
  }
  
  return comments
}

/**
 * استخراج التعليقات من مجلد كامل
 */
function extractCommentsFromDirectory(dirPath) {
  const allComments = []
  
  function scanDirectory(currentPath) {
    try {
      const items = fs.readdirSync(currentPath)
      
      for (const item of items) {
        const fullPath = path.join(currentPath, item)
        const stat = fs.statSync(fullPath)
        
        if (stat.isDirectory()) {
          // تجاهل مجلدات معينة
          if (!['node_modules', '.next', '.git', 'dist', 'build'].includes(item)) {
            scanDirectory(fullPath)
          }
        } else if (stat.isFile()) {
          // معالجة الملفات المدعومة
          const ext = path.extname(item).toLowerCase()
          if (['.tsx', '.ts', '.jsx', '.js'].includes(ext)) {
            const comments = extractCommentsFromFile(fullPath)
            allComments.push(...comments)
          }
        }
      }
    } catch (error) {
      console.error(`خطأ في مسح المجلد ${currentPath}:`, error.message)
    }
  }
  
  scanDirectory(dirPath)
  return allComments
}

/**
 * تحويل التعليقات إلى خريطة تلميحات
 */
function convertCommentsToTooltips(comments) {
  const tooltips = {}
  
  for (const comment of comments) {
    // تنظيف اسم الدالة
    const cleanName = comment.functionName.toLowerCase()
    
    // تنظيف النص
    let cleanDescription = comment.description
      .replace(/^\*+\s*/, '') // إزالة النجوم من بداية التعليق
      .replace(/\*+$/, '') // إزالة النجوم من نهاية التعليق
      .trim()
    
    // إضافة معلومات إضافية
    if (cleanDescription) {
      tooltips[cleanName] = cleanDescription
    }
  }
  
  return tooltips
}

/**
 * تحديث ملف التلميحات المحسن
 */
function updateEnhancedTooltipFile(tooltips, componentPath) {
  try {
    const content = fs.readFileSync(componentPath, 'utf-8')
    
    // البحث عن خريطة التلميحات الحالية
    const mapStart = content.indexOf('const tooltipMap: Record<string, string> = {')
    const mapEnd = content.indexOf('}', mapStart) + 1
    
    if (mapStart !== -1 && mapEnd !== -1) {
      // دمج التلميحات الجديدة مع الموجودة
      const existingMapContent = content.substring(mapStart, mapEnd)
      const existingTooltips = {}
      
      try {
        // استخراج التلميحات الموجودة
        const mapContent = existingMapContent.replace('const tooltipMap: Record<string, string> = ', '')
        const parsed = eval('(' + mapContent + ')')
        Object.assign(existingTooltips, parsed)
      } catch (e) {
        console.log('تعذر استخراج التلميحات الموجودة، سيتم استخدام التلميحات الجديدة فقط')
      }
      
      // دمج التلميحات
      const mergedTooltips = { ...existingTooltips, ...tooltips }
      
      // إنشاء خريطة التلميحات الجديدة
      const newMapContent = `const tooltipMap: Record<string, string> = ${JSON.stringify(mergedTooltips, null, 2)}`
      
      // استبدال المحتوى القديم
      const newContent = content.substring(0, mapStart) + newMapContent + content.substring(mapEnd)
      
      fs.writeFileSync(componentPath, newContent, 'utf-8')
      console.log('✅ تم تحديث ملف التلميحات المحسن')
      return Object.keys(mergedTooltips).length
    } else {
      console.log('⚠️ لم يتم العثور على خريطة التلميحات في الملف')
      return 0
    }
  } catch (error) {
    console.error('❌ خطأ في تحديث ملف التلميحات:', error.message)
    return 0
  }
}

/**
 * الدالة الرئيسية لتحديث التلميحات
 */
function updateTooltipsFromComments() {
  console.log('🚀 بدء استخراج التعليقات من المشروع...')
  console.log(`📁 مسار المشروع: ${projectPath}`)
  
  // استخراج التعليقات
  const comments = extractCommentsFromDirectory(projectPath)
  console.log(`📝 تم العثور على ${comments.length} تعليق`)
  
  // تحويل إلى تلميحات
  const tooltips = convertCommentsToTooltips(comments)
  console.log(`💡 تم إنشاء ${Object.keys(tooltips).length} تلميح`)
  
  // حفظ في ملف JSON
  const outputPath = path.join(projectPath, 'tooltips.json')
  try {
    fs.writeFileSync(outputPath, JSON.stringify(tooltips, null, 2), 'utf-8')
    console.log(`💾 تم حفظ التلميحات في: ${outputPath}`)
  } catch (error) {
    console.error('❌ خطأ في حفظ ملف JSON:', error.message)
  }
  
  // تحديث مكون التلميحات المحسن
  const componentPath = path.join(projectPath, 'components', 'ui', 'enhanced-tooltip.tsx')
  const updatedCount = updateEnhancedTooltipFile(tooltips, componentPath)
  
  console.log('✅ تم الانتهاء من تحديث التلميحات')
  console.log(`📊 إجمالي التلميحات: ${updatedCount}`)
  
  // عرض بعض الأمثلة
  const examples = Object.entries(tooltips).slice(0, 5)
  if (examples.length > 0) {
    console.log('\n📋 أمثلة على التلميحات المستخرجة:')
    examples.forEach(([key, value]) => {
      console.log(`  • ${key}: ${value}`)
    })
  }
  
  return tooltips
}

// تشغيل السكريپت
if (require.main === module) {
  try {
    updateTooltipsFromComments()
  } catch (error) {
    console.error('❌ حدث خطأ أثناء تشغيل السكريپت:', error.message)
    process.exit(1)
  }
}

module.exports = { updateTooltipsFromComments }