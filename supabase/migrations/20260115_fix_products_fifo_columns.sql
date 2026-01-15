-- Fix: Add missing columns to products and fifo_cost_lots tables
-- Date: 2026-01-15
-- Issue: 42703 column not found errors

-- 1. Add track_inventory to products table
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'track_inventory'
    ) THEN
        ALTER TABLE products ADD COLUMN track_inventory BOOLEAN DEFAULT true;
        RAISE NOTICE '✅ Added track_inventory column to products table';
    ELSE
        RAISE NOTICE '⏭️ track_inventory column already exists in products table';
    END IF;
END $$;

-- 2. Add item_type to products table
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'item_type'
    ) THEN
        ALTER TABLE products ADD COLUMN item_type TEXT DEFAULT 'product';
        RAISE NOTICE '✅ Added item_type column to products table';
    ELSE
        RAISE NOTICE '⏭️ item_type column already exists in products table';
    END IF;
END $$;

-- 3. Add purchase_date to fifo_cost_lots table (if table exists)
DO $$ 
BEGIN 
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'fifo_cost_lots'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'fifo_cost_lots' AND column_name = 'purchase_date'
        ) THEN
            ALTER TABLE fifo_cost_lots ADD COLUMN purchase_date DATE DEFAULT CURRENT_DATE;
            -- Update existing records with created_at date
            UPDATE fifo_cost_lots SET purchase_date = created_at::DATE WHERE purchase_date IS NULL;
            RAISE NOTICE '✅ Added purchase_date column to fifo_cost_lots table';
        ELSE
            RAISE NOTICE '⏭️ purchase_date column already exists in fifo_cost_lots table';
        END IF;
    ELSE
        RAISE NOTICE '⏭️ fifo_cost_lots table does not exist - skipping';
    END IF;
END $$;

-- 4. Verify the changes
SELECT 'products' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('track_inventory', 'item_type')
UNION ALL
SELECT 'fifo_cost_lots' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'fifo_cost_lots' 
AND column_name = 'purchase_date';
