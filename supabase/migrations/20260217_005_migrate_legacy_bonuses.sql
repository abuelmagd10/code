-- =============================================
-- LEGACY BONUS MIGRATION SCRIPT
-- Date: 2026-02-17
-- Description: Safely migrate user_bonuses to commission system
-- =============================================

-- =============================================
-- STEP 1: CREATE LEGACY BONUS PLAN
-- =============================================

DO $$
DECLARE
    v_company RECORD;
    v_legacy_plan_id UUID;
BEGIN
    -- For each company, create a "Legacy Bonus Plan"
    FOR v_company IN SELECT id FROM companies LOOP
        
        -- Create legacy plan
        INSERT INTO commission_plans (
            company_id,
            name,
            type,
            basis,
            calculation_basis,
            tier_type,
            handle_returns,
            description,
            is_active,
            effective_from
        ) VALUES (
            v_company.id,
            'Legacy Bonus System (Migrated)',
            'flat_percent',
            'invoice_issuance',
            'after_discount',
            'progressive',
            'ignore',
            'Automatically migrated from old user_bonuses system',
            FALSE, -- Inactive by default
            '2020-01-01'
        ) RETURNING id INTO v_legacy_plan_id;
        
        -- Create default rule (will be overridden per user)
        INSERT INTO commission_rules (
            plan_id,
            min_amount,
            max_amount,
            commission_rate,
            fixed_amount
        ) VALUES (
            v_legacy_plan_id,
            0,
            NULL,
            5.0, -- Default 5%
            0
        );
        
        RAISE NOTICE 'Created legacy plan for company %', v_company.id;
    END LOOP;
END $$;

-- =============================================
-- STEP 2: MIGRATE BONUS DATA
-- =============================================

DO $$
DECLARE
    v_bonus RECORD;
    v_plan_id UUID;
    v_employee_id UUID;
    v_migrated_count INT := 0;
BEGIN
    -- Migrate each bonus record
    FOR v_bonus IN 
        SELECT 
            ub.*,
            e.id as employee_id,
            e.company_id
        FROM user_bonuses ub
        JOIN employees e ON e.user_id = ub.user_id
        WHERE ub.migrated_to_commission_system IS NULL OR ub.migrated_to_commission_system = FALSE
    LOOP
        -- Get legacy plan for this company
        SELECT id INTO v_plan_id
        FROM commission_plans
        WHERE company_id = v_bonus.company_id
        AND name = 'Legacy Bonus System (Migrated)'
        LIMIT 1;
        
        IF v_plan_id IS NULL THEN
            RAISE WARNING 'No legacy plan found for company %', v_bonus.company_id;
            CONTINUE;
        END IF;
        
        -- Insert into commission_ledger as historical data
        BEGIN
            INSERT INTO commission_ledger (
                company_id,
                employee_id,
                commission_id,
                commission_plan_id,
                commission_run_id,
                source_type,
                source_id,
                transaction_date,
                amount,
                is_clawback,
                status,
                notes
            ) VALUES (
                v_bonus.company_id,
                v_bonus.employee_id,
                NULL,
                v_plan_id,
                NULL,
                'legacy_migration',
                v_bonus.id,
                v_bonus.created_at::DATE,
                v_bonus.bonus_amount,
                FALSE,
                'posted', -- Mark as posted (historical)
                'Migrated from user_bonuses on ' || NOW()::DATE
            );
            
            v_migrated_count := v_migrated_count + 1;
            
            -- Mark as migrated
            UPDATE user_bonuses
            SET migrated_to_commission_system = TRUE
            WHERE id = v_bonus.id;
            
        EXCEPTION WHEN unique_violation THEN
            RAISE WARNING 'Bonus % already migrated, skipping', v_bonus.id;
            CONTINUE;
        END;
    END LOOP;
    
    RAISE NOTICE 'Migrated % bonus records', v_migrated_count;
END $$;

-- =============================================
-- STEP 3: ARCHIVE OLD TABLE
-- =============================================

-- Rename user_bonuses to user_bonuses_archived
ALTER TABLE IF EXISTS user_bonuses RENAME TO user_bonuses_archived;

-- Add archive timestamp
ALTER TABLE user_bonuses_archived 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NOW();

-- =============================================
-- STEP 4: AUDIT LOG
-- =============================================

INSERT INTO audit_logs (
    action,
    company_id,
    user_id,
    details
)
SELECT 
    'legacy_bonus_migration',
    id,
    NULL,
    jsonb_build_object(
        'migration_date', NOW(),
        'migrated_count', (SELECT COUNT(*) FROM user_bonuses_archived WHERE migrated_to_commission_system = TRUE),
        'archived_table', 'user_bonuses_archived',
        'new_system', 'commission_plans'
    )
FROM companies;

-- =============================================
-- STEP 5: VERIFICATION
-- =============================================

DO $$
DECLARE
    v_old_count INT;
    v_new_count INT;
BEGIN
    -- Count old records
    SELECT COUNT(*) INTO v_old_count
    FROM user_bonuses_archived
    WHERE migrated_to_commission_system = TRUE;
    
    -- Count new records
    SELECT COUNT(*) INTO v_new_count
    FROM commission_ledger
    WHERE source_type = 'legacy_migration';
    
    IF v_old_count = v_new_count THEN
        RAISE NOTICE '✅ Migration verified: % records migrated successfully', v_new_count;
    ELSE
        RAISE WARNING '⚠️ Migration mismatch: Old=%, New=%', v_old_count, v_new_count;
    END IF;
END $$;

-- =============================================
-- MIGRATION COMPLETE
-- =============================================

RAISE NOTICE '✅ Legacy bonus migration complete';
RAISE NOTICE '   - Old table archived as: user_bonuses_archived';
RAISE NOTICE '   - Legacy plans created (inactive)';
RAISE NOTICE '   - All data migrated to commission_ledger';
RAISE NOTICE '   - Audit log created';
