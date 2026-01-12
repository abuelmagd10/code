-- Auto-Fix: Assign Default Warehouse and Cost Center to Branches
-- Run this in Supabase SQL Editor

DO $$ 
DECLARE 
    r RECORD;
    w_id UUID;
    cc_id UUID;
    updated_count INTEGER := 0;
BEGIN 
    -- Iterate through branches that are missing defaults
    FOR r IN SELECT id, name FROM branches WHERE default_warehouse_id IS NULL OR default_cost_center_id IS NULL LOOP 
        
        -- 1. Find a warehouse for this branch (Prioritize main, then active)
        SELECT id INTO w_id 
        FROM warehouses 
        WHERE branch_id = r.id 
        ORDER BY is_main DESC, is_active DESC, created_at ASC 
        LIMIT 1;
        
        -- 2. Find a cost center for this branch
        SELECT id INTO cc_id 
        FROM cost_centers 
        WHERE branch_id = r.id 
        ORDER BY is_active DESC, created_at ASC 
        LIMIT 1;
        
        -- 3. Update if candidates found
        IF w_id IS NOT NULL OR cc_id IS NOT NULL THEN
            UPDATE branches 
            SET 
                default_warehouse_id = COALESCE(default_warehouse_id, w_id),
                default_cost_center_id = COALESCE(default_cost_center_id, cc_id)
            WHERE id = r.id;
            
            updated_count := updated_count + 1;
            RAISE NOTICE '✅ Fixed Branch: % (Warehouse: %, Cost Center: %)', r.name, w_id, cc_id;
        ELSE
            RAISE NOTICE '⚠️ Skipping Branch: % (No warehouse/cost center found assigned to this branch)', r.name;
        END IF;
        
        -- Reset variables
        w_id := NULL;
        cc_id := NULL;
    END LOOP; 
    
    RAISE NOTICE '🎉 Total branches updated: %', updated_count;
END $$;
