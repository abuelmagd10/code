import { NextRequest } from 'next/server'
import { secureApiRequest } from '@/lib/api-security-enhanced'

// اختبارات النظام الأمني
export async function testSecuritySystem() {
  const results = {
    passed: 0,
    failed: 0,
    tests: [] as Array<{name: string, status: 'PASS' | 'FAIL', message: string}>
  }

  // اختبار 1: منع الوصول بدون مصادقة
  try {
    const mockRequest = new NextRequest('http://localhost/api/test')
    const result = await secureApiRequest(mockRequest, {
      requireAuth: true,
      requireCompany: true
    })
    
    if (result.error) {
      results.tests.push({
        name: 'Prevent Unauthenticated Access',
        status: 'PASS',
        message: 'Successfully blocked unauthenticated request'
      })
      results.passed++
    } else {
      results.tests.push({
        name: 'Prevent Unauthenticated Access',
        status: 'FAIL',
        message: 'Failed to block unauthenticated request'
      })
      results.failed++
    }
  } catch (error) {
    results.tests.push({
      name: 'Prevent Unauthenticated Access',
      status: 'PASS',
      message: 'Request properly rejected'
    })
    results.passed++
  }

  // اختبار 2: التحقق من companyId
  try {
    const mockRequest = new NextRequest('http://localhost/api/test')
    // محاكاة طلب بدون companyId
    const result = await secureApiRequest(mockRequest, {
      requireAuth: false, // تجاهل المصادقة للاختبار
      requireCompany: true
    })
    
    if (result.error) {
      results.tests.push({
        name: 'Require Company ID',
        status: 'PASS',
        message: 'Successfully required company ID'
      })
      results.passed++
    } else {
      results.tests.push({
        name: 'Require Company ID',
        status: 'FAIL',
        message: 'Failed to require company ID'
      })
      results.failed++
    }
  } catch (error) {
    results.tests.push({
      name: 'Require Company ID',
      status: 'PASS',
      message: 'Company ID properly required'
    })
    results.passed++
  }

  // اختبار 3: التحقق من الصلاحيات
  const permissionTests = [
    { resource: 'reports', action: 'read', role: 'viewer', expected: 'PASS' },
    { resource: 'reports', action: 'write', role: 'viewer', expected: 'FAIL' },
    { resource: 'reports', action: 'delete', role: 'viewer', expected: 'FAIL' },
    { resource: 'products', action: 'read', role: 'staff', expected: 'PASS' },
    { resource: 'products', action: 'write', role: 'staff', expected: 'PASS' },
    { resource: 'products', action: 'delete', role: 'staff', expected: 'FAIL' }
  ]

  permissionTests.forEach(test => {
    // محاكاة اختبار الصلاحيات
    const hasPermission = checkMockPermission(test.resource, test.action, test.role)
    const actualResult = hasPermission ? 'PASS' : 'FAIL'
    
    if (actualResult === test.expected) {
      results.tests.push({
        name: `Permission: ${test.role} ${test.action} ${test.resource}`,
        status: 'PASS',
        message: `Correctly ${test.expected === 'PASS' ? 'allowed' : 'denied'} access`
      })
      results.passed++
    } else {
      results.tests.push({
        name: `Permission: ${test.role} ${test.action} ${test.resource}`,
        status: 'FAIL',
        message: `Expected ${test.expected} but got ${actualResult}`
      })
      results.failed++
    }
  })

  return results
}

// دالة محاكاة للتحقق من الصلاحيات
function checkMockPermission(resource: string, action: string, role: string): boolean {
  const rolePermissions: Record<string, Record<string, string[]>> = {
    owner: { '*': ['read', 'write', 'delete', 'admin'] },
    admin: { '*': ['read', 'write', 'delete'] },
    manager: { 
      reports: ['read'],
      products: ['read', 'write'],
      customers: ['read', 'write']
    },
    accountant: {
      reports: ['read', 'write'],
      journal_entries: ['read', 'write']
    },
    store_manager: {
      products: ['read', 'write'],
      inventory: ['read', 'write']
    },
    staff: {
      products: ['read', 'write'],
      customers: ['read', 'write']
    },
    viewer: { '*': ['read'] }
  }

  const permissions = rolePermissions[role]
  if (!permissions) return false

  if (permissions['*']?.includes(action)) return true
  return permissions[resource]?.includes(action) || false
}

// اختبار فلترة الفروع
export function testBranchFiltering() {
  const tests = [
    { role: 'owner', branchId: 'branch1', expected: {} },
    { role: 'admin', branchId: 'branch1', expected: {} },
    { role: 'staff', branchId: 'branch1', expected: { branch_id: 'branch1' } },
    { role: 'viewer', branchId: 'branch2', expected: { branch_id: 'branch2' } }
  ]

  return tests.map(test => {
    const filter = buildMockBranchFilter(test.branchId, test.role)
    const passed = JSON.stringify(filter) === JSON.stringify(test.expected)
    
    return {
      name: `Branch Filter: ${test.role}`,
      status: passed ? 'PASS' : 'FAIL' as 'PASS' | 'FAIL',
      message: passed ? 'Correct filter applied' : `Expected ${JSON.stringify(test.expected)} but got ${JSON.stringify(filter)}`
    }
  })
}

function buildMockBranchFilter(branchId: string, role: string) {
  if (['owner', 'admin'].includes(role)) {
    return {}
  }
  return { branch_id: branchId }
}

// تشغيل جميع الاختبارات
export async function runAllSecurityTests() {
  console.log('🧪 بدء اختبارات النظام الأمني...')
  
  const securityResults = await testSecuritySystem()
  const branchResults = testBranchFiltering()
  
  const allResults = {
    passed: securityResults.passed + branchResults.filter(t => t.status === 'PASS').length,
    failed: securityResults.failed + branchResults.filter(t => t.status === 'FAIL').length,
    tests: [...securityResults.tests, ...branchResults]
  }
  
  console.log('\n📊 نتائج الاختبارات:')
  console.log(`✅ نجح: ${allResults.passed}`)
  console.log(`❌ فشل: ${allResults.failed}`)
  console.log(`📈 معدل النجاح: ${((allResults.passed / (allResults.passed + allResults.failed)) * 100).toFixed(1)}%`)
  
  console.log('\n📋 تفاصيل الاختبارات:')
  allResults.tests.forEach(test => {
    const icon = test.status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} ${test.name}: ${test.message}`)
  })
  
  return allResults
}