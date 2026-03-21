-- 20260321040000_enterprise_pr_upgrade_phase2.sql

-- ==============================================================================
-- 1. NOTIFICATION ROUTER FUNCTION (Idempotent 100%)
-- ==============================================================================
CREATE OR REPLACE FUNCTION route_system_events_to_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_role VARCHAR;
    v_title VARCHAR;
    v_message VARCHAR;
    v_user_locale VARCHAR := 'ar'; -- Default language, could be fetched from user config ideally
    v_notification_count INT := 0;
    v_admin_roles VARCHAR[] := ARRAY['admin', 'owner', 'general_manager'];
BEGIN
    -- Only process purchase return events in this router for now
    IF NEW.reference_type = 'purchase_return' THEN
        
        -- Event: Pending Admin Approval
        IF NEW.event_type = 'purchase_return.pending_approval' THEN
            v_title := 'طلب اعتماد مرتجع - Pending Return Approval';
            v_message := 'مرتجع جديد ' || (NEW.payload->>'return_number') || ' بحاجة لاعتماد الإدارة.';
            
            FOREACH v_role IN ARRAY v_admin_roles LOOP
                INSERT INTO notifications (
                    company_id, user_id, assigned_to_role, title, message, 
                    reference_type, reference_id, priority, category, event_key
                ) VALUES (
                    NEW.company_id, NEW.user_id, v_role, v_title, v_message,
                    'purchase_return', NEW.reference_id, 'high', 'approvals',
                    NEW.event_key || '.' || v_role
                ) ON CONFLICT (event_key) DO NOTHING;
            END LOOP;

        -- Event: Approved (Requires Warehouse Execution)
        ELSIF NEW.event_type = 'purchase_return.approved' THEN
            v_title := 'مطلوب استلام مخزني للمرتجع - Warehouse Action Required';
            v_message := 'تمت الموافقة على المرتجع ' || (NEW.payload->>'return_number') || '. يرجى اعتماد المخزن وتسليم البضاعة للمورد.';
            
            INSERT INTO notifications (
                company_id, user_id, assigned_to_role, title, message, 
                reference_type, reference_id, priority, category, event_key
            ) VALUES (
                NEW.company_id, NEW.user_id, 'store_manager', v_title, v_message,
                'purchase_return', NEW.reference_id, 'high', 'inventory',
                NEW.event_key || '.store_manager'
            ) ON CONFLICT (event_key) DO NOTHING;
            
            -- Also notify the creator
            INSERT INTO notifications (
                company_id, user_id, title, message, 
                reference_type, reference_id, priority, category, event_key
            )
            SELECT 
                NEW.company_id, created_by, 'تمت الموافقة الدفترية على المرتجع - PR Approved', 'تمت الموافقة على المرتجع ' || (NEW.payload->>'return_number'),
                'purchase_return', NEW.reference_id, 'normal', 'approvals',
                NEW.event_key || '.creator'
            FROM purchase_returns WHERE id = NEW.reference_id
            ON CONFLICT (event_key) DO NOTHING;

        -- Event: Rejected
        ELSIF NEW.event_type = 'purchase_return.rejected' THEN
            v_title := 'تم رفض المرتجع - Purchase Return Rejected';
            v_message := 'تم رفض المرتجع ' || (NEW.payload->>'return_number') || ' بسبب: ' || COALESCE(NEW.payload->>'notes', 'بدون سبب');
            
            INSERT INTO notifications (
                company_id, user_id, title, message, 
                reference_type, reference_id, priority, category, event_key
            ) 
            SELECT 
                NEW.company_id, created_by, v_title, v_message,
                'purchase_return', NEW.reference_id, 'high', 'approvals',
                NEW.event_key || '.creator'
            FROM purchase_returns WHERE id = NEW.reference_id
            ON CONFLICT (event_key) DO NOTHING;

        -- Event: Completed (Warehouse Executed)
        ELSIF NEW.event_type = 'purchase_return.completed' THEN
            v_title := 'اكتمل إرجاع المخزون - PR Completed';
            v_message := 'تم اعتماد استلام المخزن بالكامل للمرتجع ' || (NEW.payload->>'return_number') || ' وتم خصم المخزون والقيود و Vendor credit بنجاح.';
            
            -- Notify Admins
            FOREACH v_role IN ARRAY v_admin_roles LOOP
                INSERT INTO notifications (
                    company_id, user_id, assigned_to_role, title, message, 
                    reference_type, reference_id, priority, category, event_key
                ) VALUES (
                    NEW.company_id, NEW.user_id, v_role, v_title, v_message,
                    'purchase_return', NEW.reference_id, 'normal', 'inventory',
                    NEW.event_key || '.' || v_role
                ) ON CONFLICT (event_key) DO NOTHING;
            END LOOP;

            -- Notify Creator
            INSERT INTO notifications (
                company_id, user_id, title, message, 
                reference_type, reference_id, priority, category, event_key
            ) 
            SELECT 
                NEW.company_id, created_by, v_title, 'لقد اكتمل المرتجع فعلياً في المستودع ' || (NEW.payload->>'return_number'),
                'purchase_return', NEW.reference_id, 'normal', 'inventory',
                NEW.event_key || '.creator'
            FROM purchase_returns WHERE id = NEW.reference_id
            ON CONFLICT (event_key) DO NOTHING;

        END IF;

        -- Mark event as processed
        NEW.status := 'processed';
        NEW.processed_at := NOW();

    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    NEW.status := 'failed';
    NEW.error_message := SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. ATTACH ROUTER TRIGGER TO SYSTEM EVENTS
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_route_system_events ON system_events;
CREATE TRIGGER trg_route_system_events
BEFORE INSERT ON system_events
FOR EACH ROW
EXECUTE FUNCTION route_system_events_to_notifications();
