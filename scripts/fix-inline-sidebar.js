const fs = require('fs')

const files = [
  'app/sales-returns/page.tsx',
  'app/sales-returns/[id]/page.tsx',
  'app/vendor-credits/page.tsx'
]

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8')
  c = c.replace(/<Sidebar\s*\/>/g, '')
  c = c.replace(/^import\s*\{\s*Sidebar\s*\}\s*from\s*"@\/components\/sidebar"\s*\r?\n/gm, '')
  fs.writeFileSync(f, c, 'utf8')
  console.log('Fixed:', f)
}
