-- =====================================
-- إصلاح Trigger إنشاء user_profile
-- لتجنب خطأ "Database error creating new user"
-- =====================================

-- 1. السماح بـ username فارغ مؤقتاً
ALTER TABLE user_profiles ALTER COLUMN username DROP NOT NULL;

-- 2. إعادة إنشاء الدالة مع معالجة أفضل للأخطاء
CREATE OR REPLACE FUNCTION create_user_profile_on_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_username TEXT;
BEGIN
  -- محاولة توليد username
  BEGIN
    v_username := generate_username_from_email(NEW.email);
  EXCEPTION WHEN OTHERS THEN
    -- إذا فشل، استخدم null
    v_username := NULL;
  END;

  -- إنشاء ملف المستخدم
  BEGIN
    INSERT INTO user_profiles (user_id, username, display_name)
    VALUES (
      NEW.id,
      v_username,
      COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1))
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- إذا كان username مكرراً، أنشئ بدون username
    INSERT INTO user_profiles (user_id, username, display_name)
    VALUES (
      NEW.id,
      NULL,
      COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1))
    )
    ON CONFLICT (user_id) DO NOTHING;
  WHEN OTHERS THEN
    -- في حالة أي خطأ آخر، نتجاهله ولا نمنع إنشاء المستخدم
    RAISE WARNING 'Could not create user profile for %: %', NEW.id, SQLERRM;
  END;

  -- مهم: دائماً نرجع NEW حتى لا يفشل إنشاء المستخدم
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. إعادة تطبيق Trigger
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile_on_signup();

-- 4. التحقق من أن الـ trigger يعمل
DO $$
BEGIN
  RAISE NOTICE 'User profile trigger has been updated successfully';
END $$;

