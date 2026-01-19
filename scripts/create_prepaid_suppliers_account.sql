-- =====================================================
-- إنشاء حساب "مدفوعات مسبقة للموردين" (Prepaid Expenses - Suppliers)
-- =====================================================
-- هذا السكريبت ينشئ حساب محاسبي جديد للمدفوعات المسبقة للموردين

DO $$
DECLARE
  v_company_id UUID;
  v_account_id UUID;
  v_account_code VARCHAR(50);
  v_company_name VARCHAR(255);
  v_account_exists BOOLEAN;
BEGIN
  -- معالجة كل شركة
  FOR v_company_id IN SELECT DISTINCT id FROM companies WHERE id IS NOT NULL
  LOOP
    BEGIN
      -- جلب اسم الشركة
      SELECT name INTO v_company_name FROM companies WHERE id = v_company_id;
      
      -- البحث عن كود حساب متاح (1200 أو أي كود متاح)
      v_account_code := '1200';
      
      -- التحقق من وجود الحساب
      SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE company_id = v_company_id
          AND account_code = v_account_code
      ) INTO v_account_exists;
      
      -- إذا كان الحساب موجوداً، البحث عن كود آخر
      IF v_account_exists THEN
        -- البحث عن كود متاح بين 1200-1299
        SELECT account_code INTO v_account_code
        FROM (
          SELECT LPAD(CAST(1200 + generate_series AS VARCHAR), 4, '0') AS account_code
        ) codes
        WHERE NOT EXISTS (
          SELECT 1 FROM chart_of_accounts
          WHERE company_id = v_company_id AND account_code = codes.account_code
        )
        LIMIT 1;
        
        IF v_account_code IS NULL THEN
          RAISE NOTICE '⚠️ لم يتم العثور على كود حساب متاح للشركة %', v_company_name;
          CONTINUE;
        END IF;
      END IF;
      
      -- إنشاء الحساب
      INSERT INTO chart_of_accounts (
        company_id,
        account_code,
        account_name,
        account_type,
        sub_type,
        opening_balance,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        v_company_id,
        v_account_code,
        'مدفوعات مسبقة للموردين',
        'asset',
        'prepaid_expenses',
        0,
        true,
        NOW(),
        NOW()
      ) RETURNING id INTO v_account_id;
      
      RAISE NOTICE '✅ تم إنشاء حساب "مدفوعات مسبقة للموردين" للشركة % (كود: %, ID: %)', 
                   v_company_name, v_account_code, v_account_id;
      
    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE '⚠️ الحساب موجود بالفعل للشركة %', v_company_name;
      WHEN OTHERS THEN
        RAISE NOTICE '❌ خطأ في إنشاء الحساب للشركة %: %', v_company_name, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'اكتمل إنشاء حسابات "مدفوعات مسبقة للموردين"';
  RAISE NOTICE '========================================';
END $$;

-- التحقق من النتيجة
SELECT
  'Verification' AS check_type,
  c.name AS company_name,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.sub_type
FROM chart_of_accounts coa
JOIN companies c ON c.id = coa.company_id
WHERE coa.account_name ILIKE '%مدفوعات مسبقة%'
  OR coa.sub_type = 'prepaid_expenses'
ORDER BY c.name, coa.account_code;
