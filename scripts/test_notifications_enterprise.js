/**
 * 🧪 اختبارات نظام الإشعارات Enterprise-grade
 * =====================================================
 * هذا الملف يحتوي على اختبارات للتحقق من:
 * 1. Idempotency (منع التكرار)
 * 2. التوافق الخلفي
 * 3. severity و category
 * =====================================================
 */

import { createClient } from '@supabase/supabase-js'

// ⚠️ يجب تعيين هذه القيم من متغيرات البيئة
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// =====================================================
// Helper Functions
// =====================================================

async function createTestNotification(params) {
  const { data, error } = await supabase.rpc('create_notification', {
    p_company_id: params.companyId,
    p_reference_type: params.referenceType,
    p_reference_id: params.referenceId,
    p_title: params.title,
    p_message: params.message,
    p_created_by: params.createdBy,
    p_branch_id: params.branchId || null,
    p_cost_center_id: params.costCenterId || null,
    p_warehouse_id: params.warehouseId || null,
    p_assigned_to_role: params.assignedToRole || null,
    p_assigned_to_user: params.assignedToUser || null,
    p_priority: params.priority || 'normal',
    p_event_key: params.eventKey || null,
    p_severity: params.severity || 'info',
    p_category: params.category || 'system'
  })

  if (error) throw error
  return data
}

async function getNotificationById(notificationId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', notificationId)
    .single()

  if (error) throw error
  return data
}

async function countNotificationsByEventKey(companyId, eventKey) {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('event_key', eventKey)

  if (error) throw error
  return count
}

// =====================================================
// Test Cases
// =====================================================

async function testIdempotency() {
  console.log('\n🧪 Test 1: Idempotency (منع التكرار)')
  console.log('='.repeat(50))

  const testCompanyId = 'test-company-id' // ⚠️ استبدل بـ company_id حقيقي
  const testUserId = 'test-user-id' // ⚠️ استبدل بـ user_id حقيقي
  const eventKey = `test_event:${Date.now()}:created`

  try {
    // إنشاء إشعار أول مرة
    console.log('📝 Creating first notification...')
    const firstId = await createTestNotification({
      companyId: testCompanyId,
      referenceType: 'test',
      referenceId: 'test-ref-1',
      title: 'Test Notification',
      message: 'This is a test',
      createdBy: testUserId,
      eventKey: eventKey,
      severity: 'info',
      category: 'system'
    })

    console.log(`✅ First notification created: ${firstId}`)

    // محاولة إنشاء نفس الإشعار مرة أخرى
    console.log('📝 Attempting to create duplicate notification...')
    const secondId = await createTestNotification({
      companyId: testCompanyId,
      referenceType: 'test',
      referenceId: 'test-ref-1',
      title: 'Test Notification (Duplicate)',
      message: 'This should not create a new notification',
      createdBy: testUserId,
      eventKey: eventKey, // نفس event_key
      severity: 'warning',
      category: 'system'
    })

    console.log(`✅ Second call returned: ${secondId}`)

    // التحقق من أن نفس ID تم إرجاعه
    if (firstId === secondId) {
      console.log('✅ PASS: Same notification ID returned (idempotency works)')
    } else {
      console.log('❌ FAIL: Different notification IDs returned')
      throw new Error('Idempotency test failed')
    }

    // التحقق من أن هناك إشعار واحد فقط
    const count = await countNotificationsByEventKey(testCompanyId, eventKey)
    if (count === 1) {
      console.log('✅ PASS: Only one notification exists in database')
    } else {
      console.log(`❌ FAIL: Expected 1 notification, found ${count}`)
      throw new Error('Idempotency test failed - duplicate found')
    }

    // التحقق من أن البيانات الأصلية محفوظة (ليست البيانات الجديدة)
    const notification = await getNotificationById(firstId)
    if (notification.title === 'Test Notification' && notification.severity === 'info') {
      console.log('✅ PASS: Original data preserved (not overwritten)')
    } else {
      console.log('❌ FAIL: Original data was overwritten')
      throw new Error('Idempotency test failed - data overwritten')
    }

    return true
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    return false
  }
}

async function testBackwardCompatibility() {
  console.log('\n🧪 Test 2: Backward Compatibility (التوافق الخلفي)')
  console.log('='.repeat(50))

  const testCompanyId = 'test-company-id' // ⚠️ استبدل بـ company_id حقيقي
  const testUserId = 'test-user-id' // ⚠️ استبدل بـ user_id حقيقي

  try {
    // إنشاء إشعار بدون event_key (الطريقة القديمة)
    console.log('📝 Creating notification without event_key (old way)...')
    const oldWayId = await createTestNotification({
      companyId: testCompanyId,
      referenceType: 'test',
      referenceId: 'test-ref-2',
      title: 'Old Way Notification',
      message: 'Created without event_key',
      createdBy: testUserId
      // لا event_key, severity, category
    })

    console.log(`✅ Notification created: ${oldWayId}`)

    // التحقق من أن القيم الافتراضية تم تعيينها
    const notification = await getNotificationById(oldWayId)
    if (notification.severity === 'info' && notification.category === 'system') {
      console.log('✅ PASS: Default values set correctly (severity=info, category=system)')
    } else {
      console.log(`❌ FAIL: Expected defaults, got severity=${notification.severity}, category=${notification.category}`)
      throw new Error('Backward compatibility test failed')
    }

    if (notification.event_key === null) {
      console.log('✅ PASS: event_key is null (as expected for old way)')
    } else {
      console.log(`❌ FAIL: event_key should be null, got ${notification.event_key}`)
      throw new Error('Backward compatibility test failed')
    }

    return true
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    return false
  }
}

async function testSeverityAndCategory() {
  console.log('\n🧪 Test 3: Severity and Category')
  console.log('='.repeat(50))

  const testCompanyId = 'test-company-id' // ⚠️ استبدل بـ company_id حقيقي
  const testUserId = 'test-user-id' // ⚠️ استبدل بـ user_id حقيقي

  try {
    const testCases = [
      { severity: 'critical', category: 'finance' },
      { severity: 'error', category: 'inventory' },
      { severity: 'warning', category: 'sales' },
      { severity: 'info', category: 'approvals' }
    ]

    for (const testCase of testCases) {
      console.log(`📝 Testing severity=${testCase.severity}, category=${testCase.category}...`)
      
      const notificationId = await createTestNotification({
        companyId: testCompanyId,
        referenceType: 'test',
        referenceId: `test-ref-${testCase.severity}`,
        title: `Test ${testCase.severity}`,
        message: 'Test message',
        createdBy: testUserId,
        eventKey: `test:${Date.now()}:${testCase.severity}`,
        severity: testCase.severity,
        category: testCase.category
      })

      const notification = await getNotificationById(notificationId)
      
      if (notification.severity === testCase.severity && notification.category === testCase.category) {
        console.log(`✅ PASS: severity=${testCase.severity}, category=${testCase.category}`)
      } else {
        console.log(`❌ FAIL: Expected severity=${testCase.severity}, category=${testCase.category}, got severity=${notification.severity}, category=${notification.category}`)
        throw new Error('Severity/Category test failed')
      }
    }

    return true
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    return false
  }
}

async function testGetUserNotificationsFiltering() {
  console.log('\n🧪 Test 4: getUserNotifications Filtering')
  console.log('='.repeat(50))

  const testCompanyId = 'test-company-id' // ⚠️ استبدل بـ company_id حقيقي
  const testUserId = 'test-user-id' // ⚠️ استبدل بـ user_id حقيقي

  try {
    // إنشاء إشعارات بseverities مختلفة
    await createTestNotification({
      companyId: testCompanyId,
      referenceType: 'test',
      referenceId: 'test-ref-filter-1',
      title: 'Critical Notification',
      message: 'Test',
      createdBy: testUserId,
      eventKey: `test:${Date.now()}:1`,
      severity: 'critical',
      category: 'finance',
      assignedToUser: testUserId
    })

    await createTestNotification({
      companyId: testCompanyId,
      referenceType: 'test',
      referenceId: 'test-ref-filter-2',
      title: 'Info Notification',
      message: 'Test',
      createdBy: testUserId,
      eventKey: `test:${Date.now()}:2`,
      severity: 'info',
      category: 'inventory',
      assignedToUser: testUserId
    })

    // اختبار الفلترة حسب severity
    console.log('📝 Testing severity filter...')
    const { data: criticalNotifications, error: severityError } = await supabase.rpc('get_user_notifications', {
      p_user_id: testUserId,
      p_company_id: testCompanyId,
      p_severity: 'critical'
    })

    if (severityError) throw severityError

    const hasCritical = criticalNotifications.some(n => n.severity === 'critical')
    const hasInfo = criticalNotifications.some(n => n.severity === 'info')

    if (hasCritical && !hasInfo) {
      console.log('✅ PASS: Severity filtering works correctly')
    } else {
      console.log('❌ FAIL: Severity filtering failed')
      throw new Error('Severity filtering test failed')
    }

    // اختبار الفلترة حسب category
    console.log('📝 Testing category filter...')
    const { data: financeNotifications, error: categoryError } = await supabase.rpc('get_user_notifications', {
      p_user_id: testUserId,
      p_company_id: testCompanyId,
      p_category: 'finance'
    })

    if (categoryError) throw categoryError

    const hasFinance = financeNotifications.some(n => n.category === 'finance')
    const hasInventory = financeNotifications.some(n => n.category === 'inventory')

    if (hasFinance && !hasInventory) {
      console.log('✅ PASS: Category filtering works correctly')
    } else {
      console.log('❌ FAIL: Category filtering failed')
      throw new Error('Category filtering test failed')
    }

    return true
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    return false
  }
}

// =====================================================
// Run All Tests
// =====================================================

async function runAllTests() {
  console.log('\n🚀 Starting Enterprise Notifications Tests')
  console.log('='.repeat(50))

  const results = {
    idempotency: false,
    backwardCompatibility: false,
    severityAndCategory: false,
    filtering: false
  }

  try {
    results.idempotency = await testIdempotency()
    results.backwardCompatibility = await testBackwardCompatibility()
    results.severityAndCategory = await testSeverityAndCategory()
    results.filtering = await testGetUserNotificationsFiltering()

    console.log('\n📊 Test Results Summary')
    console.log('='.repeat(50))
    console.log(`Idempotency: ${results.idempotency ? '✅ PASS' : '❌ FAIL'}`)
    console.log(`Backward Compatibility: ${results.backwardCompatibility ? '✅ PASS' : '❌ FAIL'}`)
    console.log(`Severity & Category: ${results.severityAndCategory ? '✅ PASS' : '❌ FAIL'}`)
    console.log(`Filtering: ${results.filtering ? '✅ PASS' : '❌ FAIL'}`)

    const allPassed = Object.values(results).every(r => r === true)
    
    if (allPassed) {
      console.log('\n✅ All tests passed!')
      process.exit(0)
    } else {
      console.log('\n❌ Some tests failed')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ Test suite failed:', error)
    process.exit(1)
  }
}

// تشغيل الاختبارات
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
}

export { testIdempotency, testBackwardCompatibility, testSeverityAndCategory, testGetUserNotificationsFiltering }
