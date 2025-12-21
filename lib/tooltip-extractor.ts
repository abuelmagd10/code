import fs from 'fs'
import path from 'path'

interface CommentData {
  functionName: string
  description: string
  filePath: string
  lineNumber: number
}

interface TooltipData {
  [key: string]: string
}

/**
 * استخراج التعليقات من ملف واحد
 */
export function extractCommentsFromFile(filePath: string): CommentData[] {
  const comments: CommentData[] = []
  
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
    console.error(`خطأ في قراءة الملف ${filePath}:`, error)
  }
  
  return comments
}

/**
 * استخراج التعليقات من مجلد كامل
 */
export function extractCommentsFromDirectory(dirPath: string): CommentData[] {
  const allComments: CommentData[] = []
  
  function scanDirectory(currentPath: string) {
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
      console.error(`خطأ في مسح المجلد ${currentPath}:`, error)
    }
  }
  
  scanDirectory(dirPath)
  return allComments
}

/**
 * تحويل التعليقات إلى خريطة تلميحات
 */
export function convertCommentsToTooltips(comments: CommentData[]): TooltipData {
  const tooltips: TooltipData = {}
  
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
 * حفظ التلميحات في ملف JSON
 */
export function saveTooltipsToFile(tooltips: TooltipData, outputPath: string) {
  try {
    const jsonContent = JSON.stringify(tooltips, null, 2)
    fs.writeFileSync(outputPath, jsonContent, 'utf-8')
    console.log(`تم حفظ التلميحات في: ${outputPath}`)
  } catch (error) {
    console.error('خطأ في حفظ ملف التلميحات:', error)
  }
}

/**
 * تحديث ملف التلميحات المحسن
 */
export function updateEnhancedTooltipFile(tooltips: TooltipData, componentPath: string) {
  try {
    const content = fs.readFileSync(componentPath, 'utf-8')
    
    // البحث عن خريطة التلميحات الحالية
    const mapStart = content.indexOf('const tooltipMap: Record<string, string> = {')
    const mapEnd = content.indexOf('}', mapStart) + 1
    
    if (mapStart !== -1 && mapEnd !== -1) {
      // إنشاء خريطة التلميحات الجديدة
      const newMapContent = `const tooltipMap: Record<string, string> = ${JSON.stringify(tooltips, null, 2)}`
      
      // استبدال المحتوى القديم
      const newContent = content.substring(0, mapStart) + newMapContent + content.substring(mapEnd)
      
      fs.writeFileSync(componentPath, newContent, 'utf-8')
      console.log('تم تحديث ملف التلميحات المحسن')
    }
  } catch (error) {
    console.error('خطأ في تحديث ملف التلميحات:', error)
  }
}

/**
 * الدالة الرئيسية لتحديث التلميحات
 */
export function updateTooltipsFromComments(projectPath: string) {
  console.log('بدء استخراج التعليقات من المشروع...')
  
  // استخراج التعليقات
  const comments = extractCommentsFromDirectory(projectPath)
  console.log(`تم العثور على ${comments.length} تعليق`)
  
  // تحويل إلى تلميحات
  const tooltips = convertCommentsToTooltips(comments)
  console.log(`تم إنشاء ${Object.keys(tooltips).length} تلميح`)
  
  // حفظ في ملف JSON
  const outputPath = path.join(projectPath, 'tooltips.json')
  saveTooltipsToFile(tooltips, outputPath)
  
  // تحديث مكون التلميحات المحسن
  const componentPath = path.join(projectPath, 'components', 'ui', 'enhanced-tooltip.tsx')
  updateEnhancedTooltipFile(tooltips, componentPath)
  
  console.log('تم الانتهاء من تحديث التلميحات')
  return tooltips
}