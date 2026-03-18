-- =================================================================================
-- 📈 مصفوفة التصعيد للإشعارات (Notification Escalation Matrix) - pg_cron
-- 
-- الوصف: 
-- هذا السكربت يقوم بإنشاء وظيفة مجدولة (Cron Job) تفحص الإشعارات العاجلة والهامة
-- التي مر عليها أكثر من 24 ساعة ولم يتم قراءتها أو اتخاذ إجراء بشأنها.
-- ثم تقوم بإنشاء إشعار تصعيدي جديد موجه لفئة الإدارة العليا (owner / general_manager).
-- =================================================================================

-- 1️⃣ Enable the pg_cron extension (This requires superuser privileges in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2️⃣ Create the escalation function
CREATE OR REPLACE FUNCTION escalate_overdue_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec RECORD;
    v_new_notification_id UUID;
BEGIN
    -- Loop over urgent/high notifications older than 24 hours that haven't been escalated yet
    -- We join with notification_user_states to ensure they haven't been read or actioned
    FOR rec IN 
        SELECT n.*
        FROM notifications n
        LEFT JOIN notification_user_states nus ON n.id = nus.notification_id
        WHERE n.priority IN ('urgent', 'high')
          -- الأقدم من 24 ساعة
          AND n.created_at < (NOW() - INTERVAL '24 hours')
          -- لم نقم بتصعيدها مسبقا (نتأكد من عدم وجود إشعار بنفس المرجع يحمل تصنيف escalation)
          AND NOT EXISTS (
              SELECT 1 FROM notifications tn 
              WHERE tn.reference_id = n.reference_id 
                AND tn.category = 'escalation'
                AND tn.company_id = n.company_id
          )
          -- لم يتم قراءتها أو إنجازها (إذا كان الإشعار موجهاً لشخص أو دور ولم يهتم به)
          AND (nus.status IS NULL OR nus.status = 'unread')
    LOOP
        -- Insert a new escalated notification targeting the 'owner' or 'admin' or 'general_manager'
        -- We will target 'owner' primarily as it's the highest ERP role
        INSERT INTO notifications (
            company_id,
            title,
            message,
            reference_type,
            reference_id,
            priority,
            category,
            event_key,
            assigned_to_role,   -- موجه للإدارة العليا
            branch_id,
            warehouse_id
        ) VALUES (
            rec.company_id,
            '⚠️ تصعيد: ' || rec.title,
            'هذا الإشعار الهام معلق لأكثر من 24 ساعة بدون استجابة. المرجو مراجعته واتخاذ الإجراء اللازم. التفاصيل الأصلية: ' || rec.message,
            rec.reference_type,
            rec.reference_id,
            'urgent',          -- التصعيد دائماً عاجل
            'escalation',      -- تصنيف جديد للتصعيد لمنع تكرار التصعيد لنفس الإشعار
            rec.event_key,
            'owner',           -- توجيه أوتوماتيكي لمالك الشركة
            rec.branch_id,
            rec.warehouse_id
        ) RETURNING id INTO v_new_notification_id;

        -- We insert directly into notification_user_states to make it 'unread' for everyone initially
        -- This is optional since our GET function assumes 'unread' if no record exists, 
        -- but good for consistency.
        
        RAISE NOTICE 'Escalated notification ID % to new ID %', rec.id, v_new_notification_id;
    END LOOP;
END;
$$;

-- 3️⃣ Schedule the function to run every hour using pg_cron
-- We name the job 'escalate_overdue_notifications_job'
-- The cron schedule '0 * * * *' means it runs at minute 0 of every hour (e.g. 1:00, 2:00, etc.)
SELECT cron.schedule(
    'escalate_overdue_notifications_job', 
    '0 * * * *', 
    'SELECT escalate_overdue_notifications()'
);

-- Note: To unschedule in the future, you can use:
-- SELECT cron.unschedule('escalate_overdue_notifications_job');

SELECT '✅ Escalation Matrix Cron Job Scheduled Successfully' AS status;
