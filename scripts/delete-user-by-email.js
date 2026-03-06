// Script to delete user by email from database
// Usage: node scripts/delete-user-by-email.js <email>

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const email = process.argv[2]

if (!email) {
  console.error('❌ يرجى إدخال البريد الإلكتروني')
  console.log('Usage: node scripts/delete-user-by-email.js <email>')
  process.exit(1)
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('❌ خطأ: SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان في .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function deleteUser() {
  try {
    console.log(`🔍 البحث عن المستخدم: ${email}`)
    
    // 1. Find user by email in auth
    const { data: { users }, error: listError } = await admin.auth.admin.listUsers()
    if (listError) {
      console.error('❌ خطأ في جلب المستخدمين:', listError.message)
      throw new Error(`Failed to list users: ${listError.message}`)
    }

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      console.error(`❌ المستخدم ${email} غير موجود في قاعدة البيانات`)
      throw new Error(`User ${email} not found`)
    }

    console.log(`✅ تم العثور على المستخدم: ${user.id}`)
    console.log(`   - Email: ${user.email}`)
    console.log(`   - Created: ${user.created_at}`)

    const userId = user.id

    // 2. Check company_members FIRST (before deletion)
    const { data: memberships, error: membersError } = await admin
      .from('company_members')
      .select('id, company_id, role')
      .eq('user_id', userId)

    if (membersError) {
      console.error('❌ خطأ في جلب العضويات:', membersError.message)
      throw new Error(`Failed to fetch memberships: ${membersError.message}`)
    }

    // 3. Check for related data using get_user_dependencies function BEFORE deleting memberships
    console.log(`\n🔍 التحقق من البيانات المرتبطة...`)

    if (memberships && memberships.length > 0) {
      console.log(`\n📋 العضويات الموجودة (${memberships.length}):`)
      memberships.forEach((m, i) => {
        console.log(`   ${i + 1}. Company: ${m.company_id}, Role: ${m.role}`)
      })

      // Check dependencies for each company BEFORE deletion
      for (const membership of memberships) {
        console.log(`\n   فحص الشركة: ${membership.company_id}`)
        const { data: depsData, error: depsError } = await admin.rpc('get_user_dependencies', {
          p_company_id: membership.company_id,
          p_user_id: userId,
        })

        if (depsError) {
          console.error(`   ⚠️  خطأ في فحص البيانات المرتبطة:`, depsError.message)
        } else if (depsData && depsData.total > 0) {
          console.log(`   ⚠️  يوجد ${depsData.total} سجل مرتبط بهذا المستخدم`)
          console.log(`   التفاصيل:`, JSON.stringify(depsData, null, 2))
          console.log(`   ⚠️  يجب نقل هذه البيانات إلى مستخدم آخر قبل الحذف`)
        } else {
          console.log(`   ✅ لا توجد بيانات مرتبطة في هذه الشركة`)
        }
      }

      // Delete from company_members AFTER checking dependencies
      console.log(`\n🗑️  حذف العضويات من company_members...`)
      for (const member of memberships) {
        const { error: delError } = await admin
          .from('company_members')
          .delete()
          .eq('id', member.id)

        if (delError) {
          console.error(`❌ خطأ في حذف العضوية ${member.id}:`, delError.message)
          throw new Error(`Failed to delete membership ${member.id}: ${delError.message}`)
        } else {
          console.log(`✅ تم حذف العضوية من الشركة ${member.company_id}`)
        }
      }
    } else {
      console.log('ℹ️  لا توجد عضويات في company_members')
    }

    // 4. Delete from common audit/logging tables
    const auditTables = [
      { table: 'audit_logs', column: 'user_id' },
      { table: 'notifications', column: 'user_id' },
      { table: 'user_notifications', column: 'user_id' },
    ]

    for (const { table, column } of auditTables) {
      const { count, error } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, userId)

      if (!error && count > 0) {
        console.log(`\n   حذف ${count} سجل من ${table}...`)
        const { error: delError } = await admin
          .from(table)
          .delete()
          .eq(column, userId)

        if (delError) {
          console.error(`   ⚠️  خطأ في حذف ${table}:`, delError.message)
        } else {
          console.log(`   ✅ تم حذف ${count} سجل من ${table}`)
        }
      }
    }

    // 4. Delete from additional tables that might reference the user
    console.log(`\n🗑️  حذف البيانات المرتبطة من الجداول الأخرى...`)

    // List of tables and columns that might reference the user
    const tablesToClean = [
      { table: 'audit_logs', column: 'user_id' },
      { table: 'notifications', column: 'user_id' },
      { table: 'notifications', column: 'created_by' },
      { table: 'notifications', column: 'assigned_to_user' },
      { table: 'user_notifications', column: 'user_id' },
      { table: 'user_security_events', column: 'user_id' },
      { table: 'user_branch_access', column: 'user_id' },
      { table: 'user_branch_cost_center', column: 'user_id' },
      { table: 'permission_sharing', column: 'grantor_user_id' },
      { table: 'permission_sharing', column: 'grantee_user_id' },
      { table: 'permission_sharing', column: 'created_by' },
      { table: 'permission_transfers', column: 'from_user_id' },
      { table: 'permission_transfers', column: 'to_user_id' },
      { table: 'permission_transfers', column: 'transferred_by' },
    ]

    for (const { table, column } of tablesToClean) {
      try {
        const { count, error: countError } = await admin
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq(column, userId)

        if (!countError && count > 0) {
          console.log(`   حذف ${count} سجل من ${table}.${column}...`)
          const { error: delError } = await admin
            .from(table)
            .delete()
            .eq(column, userId)

          if (delError) {
            console.error(`   ⚠️  خطأ في حذف ${table}.${column}:`, delError.message)
          } else {
            console.log(`   ✅ تم حذف ${count} سجل من ${table}.${column}`)
          }
        }
      } catch (err) {
        // Table might not exist or have RLS restrictions - skip silently
      }
    }

    // 5. Try to delete from auth
    console.log(`\n🗑️  محاولة حذف المستخدم من Auth...`)
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    
    if (deleteError) {
      console.error('❌ خطأ في حذف المستخدم من Auth:', deleteError.message)
      console.log('\n⚠️  ملاحظة: حذف المستخدم من Auth فشل بسبب بيانات مرتبطة.')
      console.log('   تم حذف العضويات والبيانات المرتبطة من company_members والجداول الأخرى.')
      console.log('   لحذف المستخدم من Auth، يجب حذف جميع البيانات المرتبطة أولاً.')
      console.log('   يمكنك استخدام Supabase Dashboard لحذف المستخدم يدوياً.')
    } else {
      console.log('✅ تم حذف المستخدم من Auth بنجاح')
    }

    console.log(`\n✅ تم حذف المستخدم ${email} من company_members والجداول المرتبطة`)
    if (deleteError) {
      console.log('⚠️  المستخدم لا يزال موجوداً في Auth بسبب بيانات مرتبطة في جداول أخرى')
      console.log('   يمكنك حذفه يدوياً من Supabase Dashboard بعد التأكد من عدم وجود بيانات مرتبطة')
    } else {
      console.log('✅ تم حذف المستخدم بالكامل من قاعدة البيانات')
    }
  } catch (error) {
    console.error('❌ خطأ:', error.message)
    throw error // Re-throw to be caught by promise handler
  }
}

deleteUser().catch((error) => {
  console.error('❌ خطأ غير متوقع:', error.message)
  process.exit(1)
})
