-- =============================================
-- Script: 107_single_branch_migration.sql
-- Purpose: Migrate users from multiple branches to single branch
-- 🎯 قرار معماري إلزامي: المستخدم الواحد يجب أن ينتمي إلى فرع واحد فقط
-- =============================================

-- =====================================
-- 1️⃣ معالجة المستخدمين الحاليين الذين لديهم أكثر من فرع
-- =====================================

-- ✅ اختيار فرع افتراضي لكل مستخدم متعدد الفروع
-- القاعدة: استخدام الفرع الأساسي (is_primary = true) أو أول فرع نشط

UPDATE company_members cm
SET branch_id = (
  SELECT uba.branch_id
  FROM user_branch_access uba
  WHERE uba.user_id = cm.user_id
    AND uba.company_id = cm.company_id
    AND uba.is_active = true
  ORDER BY 
    uba.is_primary DESC,  -- الفرع الأساسي أولاً
    uba.created_at ASC    -- ثم أقدم فرع
  LIMIT 1
)
WHERE cm.branch_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM user_branch_access uba
    WHERE uba.user_id = cm.user_id
      AND uba.company_id = cm.company_id
      AND uba.is_active = true
  );

-- ✅ تحديث company_members.branch_id للمستخدمين الذين لديهم فرع في user_branch_access
-- لكن branch_id في company_members مختلف أو NULL
UPDATE company_members cm
SET branch_id = (
  SELECT uba.branch_id
  FROM user_branch_access uba
  WHERE uba.user_id = cm.user_id
    AND uba.company_id = cm.company_id
    AND uba.is_active = true
  ORDER BY 
    uba.is_primary DESC,
    uba.created_at ASC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM user_branch_access uba
  WHERE uba.user_id = cm.user_id
    AND uba.company_id = cm.company_id
    AND uba.is_active = true
    AND (cm.branch_id IS NULL OR cm.branch_id != uba.branch_id)
);

-- =====================================
-- 2️⃣ تحديث user_branch_access لضمان فرع واحد فقط لكل مستخدم
-- =====================================

-- ✅ تعطيل جميع الفروع غير الأساسية (الاحتفاظ بالفرع الأساسي فقط)
UPDATE user_branch_access uba
SET is_active = false
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT 
      user_id,
      company_id,
      branch_id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, company_id 
        ORDER BY is_primary DESC, created_at ASC
      ) as rn
    FROM user_branch_access
    WHERE is_active = true
  ) ranked
  WHERE ranked.user_id = uba.user_id
    AND ranked.company_id = uba.company_id
    AND ranked.rn > 1  -- كل شيء بعد الفرع الأول
    AND uba.branch_id = ranked.branch_id
);

-- ✅ إذا لم يكن هناك فرع أساسي، جعل أول فرع نشط كأساسي
UPDATE user_branch_access uba
SET is_primary = true
WHERE is_active = true
  AND is_primary = false
  AND NOT EXISTS (
    SELECT 1
    FROM user_branch_access uba2
    WHERE uba2.user_id = uba.user_id
      AND uba2.company_id = uba.company_id
      AND uba2.is_active = true
      AND uba2.is_primary = true
      AND uba2.id != uba.id
  )
  AND EXISTS (
    SELECT 1
    FROM (
      SELECT 
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, company_id 
          ORDER BY created_at ASC
        ) as rn
      FROM user_branch_access
      WHERE is_active = true
        AND user_id = uba.user_id
        AND company_id = uba.company_id
    ) ranked
    WHERE ranked.id = uba.id
      AND ranked.rn = 1
  );

-- =====================================
-- 3️⃣ التحقق من النتائج
-- =====================================

-- ✅ عرض المستخدمين الذين لا يزالون بدون فرع
SELECT 
  cm.user_id,
  cm.company_id,
  cm.role,
  COUNT(uba.id) as active_branches_count
FROM company_members cm
LEFT JOIN user_branch_access uba 
  ON uba.user_id = cm.user_id 
  AND uba.company_id = cm.company_id 
  AND uba.is_active = true
WHERE cm.branch_id IS NULL
GROUP BY cm.user_id, cm.company_id, cm.role
HAVING COUNT(uba.id) = 0;

-- ✅ عرض المستخدمين الذين لديهم أكثر من فرع نشط (يجب أن يكون 0)
SELECT 
  user_id,
  company_id,
  COUNT(*) as active_branches_count
FROM user_branch_access
WHERE is_active = true
GROUP BY user_id, company_id
HAVING COUNT(*) > 1;

-- =====================================
-- 4️⃣ إضافة Constraint لمنع التعدد مستقبلياً (اختياري)
-- =====================================

-- ✅ إنشاء Unique Index على user_branch_access لضمان فرع واحد نشط فقط
-- ملاحظة: هذا يتطلب حذف السجلات المعطلة أولاً أو استخدام Partial Index

-- خيار 1: Partial Unique Index (فقط للسجلات النشطة)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_branch_access_one_active_per_user
ON user_branch_access(user_id, company_id)
WHERE is_active = true;

-- خيار 2: Constraint على company_members (فرع واحد فقط)
-- ملاحظة: branch_id يمكن أن يكون NULL، لكن إذا كان موجوداً يجب أن يكون واحداً فقط
-- هذا مضمون بالفعل لأن branch_id هو column واحد وليس array

-- =====================================
-- 5️⃣ ملاحظات مهمة
-- =====================================

-- ✅ بعد تنفيذ هذا الـ Script:
-- 1. كل مستخدم سيكون له فرع واحد فقط في company_members.branch_id
-- 2. كل مستخدم سيكون له فرع واحد نشط فقط في user_branch_access
-- 3. الفرع الأساسي (is_primary = true) سيكون هو الفرع الوحيد النشط
-- 4. جميع الفروع الأخرى ستكون معطلة (is_active = false)
-- 5. Unique Index يمنع إضافة أكثر من فرع نشط في المستقبل

-- ✅ للتحقق من نجاح الـ Migration:
-- SELECT 
--   cm.user_id,
--   cm.company_id,
--   cm.branch_id as company_member_branch,
--   uba.branch_id as user_branch_access_branch,
--   uba.is_primary,
--   uba.is_active
-- FROM company_members cm
-- LEFT JOIN user_branch_access uba 
--   ON uba.user_id = cm.user_id 
--   AND uba.company_id = cm.company_id 
--   AND uba.is_active = true
-- WHERE cm.branch_id IS NOT NULL
-- ORDER BY cm.user_id, cm.company_id;
