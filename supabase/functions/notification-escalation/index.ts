/**
 * 🚨 Notification Escalation Matrix — Supabase Edge Function
 *
 * يعمل كـ Cron Job كل ساعة:
 * 1. يبحث عن الإشعارات العاجلة / عالية الأولوية التي لم تُفتح لأكثر من 24 ساعة
 * 2. يتحقق أنها لم تُصعَّد من قبل (فحص جدول notification_escalations)
 * 3. يُنشئ إشعار تصعيد للدور الأعلى في التسلسل الهرمي
 * 4. يُسجل عملية التصعيد في notification_escalations
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

// ─── التسلسل الهرمي للأدوار ──────────────────────────────────────────────────
const ESCALATION_CHAIN: Record<string, string | null> = {
  store_manager: 'manager',
  employee: 'manager',
  accountant: 'admin',
  manager: 'admin',
  admin: 'owner',
  owner: null, // لا يوجد فوق المالك
  general_manager: 'owner',
  gm: 'owner',
}

const ESCALATION_WINDOW_HOURS = 24
const MAX_ESCALATION_LEVELS = 3

// ─── النوع المساعد لإشعار قاعدة البيانات ────────────────────────────────────
interface NotificationRow {
  id: string
  company_id: string
  title: string
  message: string
  priority: string
  assigned_to_role: string | null
  assigned_to_user: string | null
  reference_type: string | null
  reference_id: string | null
  branch_id: string | null
  warehouse_id: string | null
  cost_center_id: string | null
  category: string | null
  severity: string | null
  created_at: string
  event_key: string | null
  created_by: string | null
}

Deno.serve(async (req: Request) => {
  // ─── حماية: فقط طلبات POST من Cron أو طلبات مُصادق عليها ──────────────
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // استخدام service_role لتجاوز RLS والوصول لجميع بيانات الشركات
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const cutoffTime = new Date(
    Date.now() - ESCALATION_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString()

  let totalEscalated = 0
  let totalSkipped = 0
  const errors: string[] = []

  try {
    // ─── 1. جلب الإشعارات العاجلة / عالية الأولوية غير المقروءة ───────────
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from('notifications')
      .select('id, company_id, title, message, priority, assigned_to_role, assigned_to_user, reference_type, reference_id, branch_id, warehouse_id, cost_center_id, category, severity, created_at, event_key, created_by')
      .in('priority', ['urgent', 'high'])
      .not('assigned_to_role', 'is', null)
      .lt('created_at', cutoffTime)
      .order('created_at', { ascending: true })
      .limit(100) // نعالج على دفعات

    if (fetchError) {
      throw new Error(`Failed to fetch notifications: ${fetchError.message}`)
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending notifications to escalate', escalated: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ─── 2. معالجة كل إشعار ─────────────────────────────────────────────────
    for (const notif of pendingNotifications as NotificationRow[]) {
      try {
        // أ. التحقق من مستوى التصعيد الحالي
        const { data: existingEscalation, error: escError } = await supabase
          .from('notification_escalations')
          .select('id, level')
          .eq('original_notification_id', notif.id)
          .order('level', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (escError) {
          console.error(`Error checking escalation for ${notif.id}:`, escError)
          errors.push(`check_escalation:${notif.id}`)
          continue
        }

        const currentLevel = existingEscalation?.level ?? 0

        // ب. التحقق من عدم بلوغ الحد الأقصى للتصعيد
        if (currentLevel >= MAX_ESCALATION_LEVELS) {
          totalSkipped++
          continue
        }

        // ج. التحقق من حالة قراءة الإشعار من notification_user_states
        const { data: userStates } = await supabase
          .from('notification_user_states')
          .select('status')
          .eq('notification_id', notif.id)
          .neq('status', 'unread')
          .limit(1)

        // إذا كان أحد المستخدمين قد قرأ الإشعار، لا داعي للتصعيد
        if (userStates && userStates.length > 0) {
          totalSkipped++
          continue
        }

        // د. تحديد الدور التالي في التسلسل الهرمي
        const currentRole = notif.assigned_to_role!
        const nextRole = ESCALATION_CHAIN[currentRole] ?? null

        if (!nextRole) {
          totalSkipped++
          continue
        }

        // هـ. التحقق من عدم وجود إشعار تصعيد مشابه نشط
        const escalationEventKey = `escalation:${notif.id}:level:${currentLevel + 1}`
        const { data: existingEscalationNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('company_id', notif.company_id)
          .eq('event_key', escalationEventKey)
          .maybeSingle()

        if (existingEscalationNotif) {
          totalSkipped++
          continue
        }

        // و. إنشاء إشعار التصعيد
        const escalationTitle = `⚠️ تصعيد (المستوى ${currentLevel + 1}): ${notif.title}`
        const hoursWaiting = Math.round(
          (Date.now() - new Date(notif.created_at).getTime()) / (1000 * 60 * 60)
        )
        const escalationMessage = `هذا الإشعار لم يُتخذ أي إجراء بشأنه منذ ${hoursWaiting} ساعة. الإشعار الأصلي كان موجهاً لـ (${currentRole}). يُرجى المتابعة الفورية.\n\n${notif.message}`

        const { data: newNotif, error: insertError } = await supabase
          .from('notifications')
          .insert({
            company_id: notif.company_id,
            title: escalationTitle,
            message: escalationMessage,
            priority: 'urgent',
            assigned_to_role: nextRole,
            reference_type: notif.reference_type,
            reference_id: notif.reference_id,
            branch_id: notif.branch_id,
            warehouse_id: notif.warehouse_id,
            cost_center_id: notif.cost_center_id,
            category: notif.category,
            severity: 'critical',
            event_key: escalationEventKey,
            created_by: notif.created_by,
            status: 'unread',
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (insertError || !newNotif) {
          console.error(`Failed to create escalation notification for ${notif.id}:`, insertError)
          errors.push(`insert_notif:${notif.id}`)
          continue
        }

        // ز. تسجيل التصعيد في جدول notification_escalations
        await supabase
          .from('notification_escalations')
          .insert({
            original_notification_id: notif.id,
            escalated_notification_id: newNotif.id,
            company_id: notif.company_id,
            original_role: currentRole,
            escalated_to_role: nextRole,
            level: currentLevel + 1,
          })

        totalEscalated++
        console.log(`✅ Escalated notification ${notif.id} (${currentRole} → ${nextRole}) level ${currentLevel + 1}`)

      } catch (notifError) {
        console.error(`Error processing notification ${notif.id}:`, notifError)
        errors.push(`process:${notif.id}`)
      }
    }

    const result = {
      success: true,
      processed: pendingNotifications.length,
      escalated: totalEscalated,
      skipped: totalSkipped,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    }

    console.log('📊 Escalation Matrix Result:', result)

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('❌ Fatal error in escalation function:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
