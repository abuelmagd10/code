const fs = require('fs')
const path = require('path')

function getAllTsxFiles(dir) {
  const results = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue
        results.push(...getAllTsxFiles(fullPath))
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        results.push(fullPath)
      }
    }
  } catch (e) {}
  return results
}

const appDir = path.join(process.cwd(), 'app')
const files = getAllTsxFiles(appDir)

let fixed = 0
for (const file of files) {
  let c = fs.readFileSync(file, 'utf8')
  const orig = c
  // Remove standalone Sidebar import (with or without semicolon)
  c = c.replace(/^import\s*\{\s*Sidebar\s*\}\s*from\s*["']@\/components\/sidebar["'];?\s*\r?\n/gm, '')
  if (c !== orig) {
    fs.writeFileSync(file, c, 'utf8')
    console.log('Cleaned import:', path.relative(process.cwd(), file))
    fixed++
  }
}
console.log(`\nFixed ${fixed} files`)
