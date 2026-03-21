/**
 * Script: remove-sidebar-from-pages.js
 * يحذف <Sidebar /> و import { Sidebar } من جميع صفحات app/
 *
 * يعالج:
 * 1. import { Sidebar } from "@/components/sidebar" (standalone import)
 * 2. import { Sidebar, X } from "@/components/sidebar" (multi-import)
 * 3. <Sidebar /> بأي مسافة بادئة
 * 4. حالات متعددة في نفس الملف (multiple return branches)
 */

const fs = require('fs')
const path = require('path')

function getAllTsxFiles(dir) {
  const results = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // تجاهل node_modules و .next
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      results.push(...getAllTsxFiles(fullPath))
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      results.push(fullPath)
    }
  }
  return results
}

const appDir = path.join(process.cwd(), 'app')
const files = getAllTsxFiles(appDir)

let totalModified = 0
let totalSidebarRemoved = 0

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8')
  const original = content

  // 1. إزالة standalone import: import { Sidebar } from "@/components/sidebar"
  //    يشمل: import { Sidebar } و import {Sidebar} و import { Sidebar }
  content = content.replace(
    /^import\s*\{\s*Sidebar\s*\}\s*from\s*["']@\/components\/sidebar["']\s*\r?\n/gm,
    ''
  )

  // 2. إزالة Sidebar من multi-imports عندما يكون أولاً:
  //    import { Sidebar, X, Y } → import { X, Y }
  content = content.replace(
    /^(import\s*\{)\s*Sidebar\s*,\s*/gm,
    '$1 '
  )

  // 3. إزالة Sidebar من multi-imports عندما يكون آخراً:
  //    import { X, Y, Sidebar } → import { X, Y }
  content = content.replace(
    /,\s*Sidebar\s*(\})/g,
    '$1'
  )

  // 4. إزالة <Sidebar /> مع مسافاتها البادئة (أي عدد من الأسطر)
  //    يُزيل السطر بأكمله ويُبقي السطر الفارغ لتجنب إفساد التنسيق
  const sidebarLinesBefore = (content.match(/<Sidebar\s*\/>/g) || []).length
  content = content.replace(/^[^\S\n]*<Sidebar\s*\/>\s*\r?\n/gm, '')
  const sidebarLinesAfter = (content.match(/<Sidebar\s*\/>/g) || []).length
  const removed = sidebarLinesBefore - sidebarLinesAfter
  totalSidebarRemoved += removed

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8')
    console.log(`✅ Modified: ${path.relative(process.cwd(), file)} (removed ${removed} <Sidebar /> instances)`)
    totalModified++
  }
}

console.log(`\n📊 Summary:`)
console.log(`   Files modified: ${totalModified}`)
console.log(`   <Sidebar /> instances removed: ${totalSidebarRemoved}`)
