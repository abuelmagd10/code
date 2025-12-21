const fs = require('fs')
const path = require('path')

const fixes = [
  { endpoint: 'aging-ap', resource: 'reports' },
  { endpoint: 'aging-ar-base', resource: 'reports' },
  { endpoint: 'aging-ap-base', resource: 'reports' },
  { endpoint: 'report-purchases', resource: 'reports' },
  { endpoint: 'report-sales-invoices-detail', resource: 'reports' },
  { endpoint: 'simple-report', resource: 'reports' },
  { endpoint: 'journal-amounts', resource: 'reports' },
  { endpoint: 'unbalanced-entries', resource: 'reports' },
  { endpoint: 'inventory-audit', resource: 'inventory' },
  { endpoint: 'account-lines', resource: 'reports' },
  { endpoint: 'income-statement', resource: 'reports' },
  { endpoint: 'my-company', resource: 'company' },
  { endpoint: 'permissions', resource: 'permissions' }
]

fixes.forEach(fix => {
  const filePath = path.join(__dirname, '..', 'app', 'api', fix.endpoint, 'route.ts')
  
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8')
    
    // إصلاح resource name
    content = content.replace(
      /resource: "RESOURCE_NAME"/g,
      `resource: "${fix.resource}"`
    )
    
    // إصلاح request parameter
    content = content.replace(
      /secureApiRequest\(request,/g,
      'secureApiRequest(req,'
    )
    
    // إصلاح admin references
    content = content.replace(/await admin\./g, 'await supabase.')
    
    fs.writeFileSync(filePath, content, 'utf-8')
    console.log(`✅ Fixed: ${fix.endpoint} -> ${fix.resource}`)
  }
})

console.log('🎉 All resource names fixed!')