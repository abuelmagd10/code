const fs = require('fs')
const path = require('path')

// مسار مجلد API
const apiDir = path.join(__dirname, '..', 'app', 'api')

// قائمة endpoints المهمة التي تحتاج تحديث
const criticalEndpoints = [
  'aging-ap', 'aging-ar-base', 'aging-ap-base', 'report-purchases', 
  'report-sales-invoices-detail', 'simple-report', 'journal-amounts',
  'unbalanced-entries', 'inventory-valuation', 'inventory-audit',
  'account-lines', 'income-statement', 'branches', 'cost-centers',
  'warehouses', 'customers', 'my-company', 'permissions'
]

// النمط القديم للاستبدال
const oldImports = [
  'import { createClient } from "@supabase/supabase-js"',
  'import { secureApiRequest } from "@/lib/api-security"',
  'import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"'
]

// النمط الجديد
const newImports = `import { createClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"`

// الأنماط القديمة للاستبدال
const oldPatterns = [
  {
    old: /const url = process\.env\.SUPABASE_URL.*?\n.*?const serviceKey = process\.env\.SUPABASE_SERVICE_ROLE_KEY.*?\n.*?if \(!url \|\| !serviceKey\) \{[\s\S]*?\}\s*const admin = createClient\(url, serviceKey.*?\)/g,
    new: 'const supabase = createClient()'
  },
  {
    old: /const { user, companyId, member, error } = await secureApiRequest\(.*?\{[\s\S]*?\}\)/g,
    new: `const { user, companyId, branchId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "RESOURCE_NAME", action: "read" }
    })`
  },
  {
    old: /if \(!companyId\) return apiError\(HTTP_STATUS\.NOT_FOUND.*?\)/g,
    new: 'if (!companyId) return badRequestError("معرف الشركة مطلوب")\n    if (!branchId) return badRequestError("معرف الفرع مطلوب")'
  },
  {
    old: /admin\.from\(/g,
    new: 'supabase.from('
  },
  {
    old: /return apiSuccess\((.*?)\)/g,
    new: 'return NextResponse.json({\n      success: true,\n      data: $1\n    })'
  },
  {
    old: /return apiError\(HTTP_STATUS\.INTERNAL_ERROR, "(.*?)", (.*?)\)/g,
    new: 'return serverError(`$1: ${$2}`)'
  },
  {
    old: /return internalError\("(.*?)", (.*?)\)/g,
    new: 'return serverError(`$1: ${$2}`)'
  }
]

function updateEndpoint(endpointPath) {
  const routeFile = path.join(endpointPath, 'route.ts')
  
  if (!fs.existsSync(routeFile)) {
    console.log(`⚠️  ملف غير موجود: ${routeFile}`)
    return false
  }

  try {
    let content = fs.readFileSync(routeFile, 'utf-8')
    let updated = false

    // استبدال imports
    oldImports.forEach(oldImport => {
      if (content.includes(oldImport)) {
        content = content.replace(oldImport, '')
        updated = true
      }
    })

    if (updated) {
      // إضافة imports الجديدة في البداية
      const lines = content.split('\n')
      const firstImportIndex = lines.findIndex(line => line.startsWith('import'))
      if (firstImportIndex !== -1) {
        lines.splice(firstImportIndex, 0, newImports)
        content = lines.join('\n')
      }
    }

    // تطبيق الأنماط
    oldPatterns.forEach(pattern => {
      if (pattern.old.test(content)) {
        content = content.replace(pattern.old, pattern.new)
        updated = true
      }
    })

    // إضافة branch filter إذا لم يكن موجود
    if (content.includes('supabase.from(') && !content.includes('buildBranchFilter')) {
      content = content.replace(
        /const supabase = createClient\(\)/,
        `const supabase = createClient()
    const branchFilter = buildBranchFilter(branchId!, member.role)`
      )
      
      // إضافة match(branchFilter) للاستعلامات
      content = content.replace(
        /\.eq\("company_id", companyId\)/g,
        '.eq("company_id", companyId)\n      .match(branchFilter)'
      )
      updated = true
    }

    if (updated) {
      fs.writeFileSync(routeFile, content, 'utf-8')
      console.log(`✅ تم تحديث: ${endpointPath}`)
      return true
    } else {
      console.log(`ℹ️  لا يحتاج تحديث: ${endpointPath}`)
      return false
    }

  } catch (error) {
    console.error(`❌ خطأ في تحديث ${endpointPath}:`, error.message)
    return false
  }
}

function updateAllEndpoints() {
  console.log('🚀 بدء تحديث API endpoints...')
  
  let totalUpdated = 0
  let totalProcessed = 0

  criticalEndpoints.forEach(endpoint => {
    const endpointPath = path.join(apiDir, endpoint)
    
    if (fs.existsSync(endpointPath)) {
      totalProcessed++
      if (updateEndpoint(endpointPath)) {
        totalUpdated++
      }
    } else {
      console.log(`⚠️  مجلد غير موجود: ${endpoint}`)
    }
  })

  console.log(`\n📊 النتائج:`)
  console.log(`   - تم معالجة: ${totalProcessed} endpoint`)
  console.log(`   - تم تحديث: ${totalUpdated} endpoint`)
  console.log(`   - لا يحتاج تحديث: ${totalProcessed - totalUpdated} endpoint`)
  
  if (totalUpdated > 0) {
    console.log('\n✅ تم تحديث API endpoints بنجاح!')
    console.log('🔧 يرجى مراجعة الملفات المحدثة والتأكد من صحة resource names')
  } else {
    console.log('\nℹ️  جميع endpoints محدثة بالفعل')
  }
}

// تشغيل السكريبت
if (require.main === module) {
  updateAllEndpoints()
}

module.exports = { updateAllEndpoints, updateEndpoint }