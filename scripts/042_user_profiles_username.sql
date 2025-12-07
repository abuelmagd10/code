-- =============================================
-- نظام ملفات المستخدمين مع Username
-- =============================================
-- يوفر:
-- 1. جدول user_profiles لتخزين معلومات المستخدمين الإضافية
-- 2. Username فريد مع validations
-- 3. دوال مساعدة للتحقق والتوليد
-- =============================================

-- =====================================
-- 1. جدول ملفات المستخدمين
-- =====================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  bio TEXT,

  -- تفضيلات المستخدم
  language TEXT DEFAULT 'ar',
  theme TEXT DEFAULT 'light',
  notifications_enabled BOOLEAN DEFAULT TRUE,

  -- معلومات إضافية
  last_login_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================
-- 2. الفهارس
-- =====================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- =====================================
-- 3. قيود التحقق
-- =====================================
-- username يجب أن يكون:
-- - بين 3 و 30 حرف
-- - لا يحتوي على مسافات
-- - أحرف صغيرة فقط وأرقام وشرطة سفلية
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS check_username_format;
ALTER TABLE user_profiles ADD CONSTRAINT check_username_format
  CHECK (
    username IS NULL OR (
      LENGTH(username) >= 3 AND
      LENGTH(username) <= 30 AND
      username ~ '^[a-z0-9_]+$'
    )
  );

-- =====================================
-- 4. دالة توليد username من البريد
-- =====================================
CREATE OR REPLACE FUNCTION generate_username_from_email(p_email TEXT)
RETURNS TEXT AS $$
DECLARE
  v_base TEXT;
  v_username TEXT;
  v_counter INTEGER := 0;
BEGIN
  -- استخراج الجزء قبل @ وتحويله إلى lowercase
  v_base := LOWER(SPLIT_PART(p_email, '@', 1));

  -- إزالة الأحرف غير المسموحة
  v_base := REGEXP_REPLACE(v_base, '[^a-z0-9_]', '', 'g');

  -- تقصير إذا كان طويلاً جداً
  IF LENGTH(v_base) > 25 THEN
    v_base := LEFT(v_base, 25);
  END IF;

  -- إضافة أحرف إذا كان قصيراً
  IF LENGTH(v_base) < 3 THEN
    v_base := v_base || 'user';
  END IF;

  -- محاولة إيجاد username فريد
  v_username := v_base;
  WHILE EXISTS (SELECT 1 FROM user_profiles WHERE username = v_username) LOOP
    v_counter := v_counter + 1;
    v_username := v_base || v_counter::TEXT;
    IF v_counter > 1000 THEN
      -- fallback: استخدام timestamp
      v_username := v_base || EXTRACT(EPOCH FROM now())::BIGINT::TEXT;
      EXIT;
    END IF;
  END LOOP;

  RETURN v_username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 5. دالة التحقق من توفر username
-- =====================================
CREATE OR REPLACE FUNCTION check_username_available(p_username TEXT, p_exclude_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_clean TEXT;
  v_exists BOOLEAN;
BEGIN
  -- تنظيف وتحويل إلى lowercase
  v_clean := LOWER(TRIM(p_username));

  -- التحقق من الطول
  IF LENGTH(v_clean) < 3 THEN
    RETURN jsonb_build_object('available', false, 'error', 'اسم المستخدم قصير جداً (3 أحرف على الأقل)');
  END IF;

  IF LENGTH(v_clean) > 30 THEN
    RETURN jsonb_build_object('available', false, 'error', 'اسم المستخدم طويل جداً (30 حرف كحد أقصى)');
  END IF;

  -- التحقق من الأحرف المسموحة
  IF v_clean !~ '^[a-z0-9_]+$' THEN
    RETURN jsonb_build_object('available', false, 'error', 'يُسمح فقط بالأحرف الإنجليزية الصغيرة والأرقام والشرطة السفلية');
  END IF;

  -- التحقق من عدم وجود username مكرر
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE username = v_clean
    AND (p_exclude_user_id IS NULL OR user_id != p_exclude_user_id)
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('available', false, 'error', 'اسم المستخدم مستخدم بالفعل');
  END IF;

  RETURN jsonb_build_object('available', true, 'username', v_clean);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 6. RLS Policies
-- =====================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- المستخدم يمكنه قراءة ملفه الشخصي
DROP POLICY IF EXISTS user_profiles_select_own ON user_profiles;
CREATE POLICY user_profiles_select_own ON user_profiles FOR SELECT
  USING (user_id = auth.uid());

-- المستخدم يمكنه إدراج ملفه
DROP POLICY IF EXISTS user_profiles_insert_own ON user_profiles;
CREATE POLICY user_profiles_insert_own ON user_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- المستخدم يمكنه تحديث ملفه
DROP POLICY IF EXISTS user_profiles_update_own ON user_profiles;
CREATE POLICY user_profiles_update_own ON user_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =====================================
-- 7. Trigger لإنشاء ملف تلقائي عند التسجيل
-- =====================================
CREATE OR REPLACE FUNCTION create_user_profile_on_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_username TEXT;
BEGIN
  -- توليد username من البريد
  v_username := generate_username_from_email(NEW.email);

  -- إنشاء ملف المستخدم
  INSERT INTO user_profiles (user_id, username, display_name)
  VALUES (
    NEW.id,
    v_username,
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تطبيق Trigger
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile_on_signup();

-- =====================================
-- 8. دالة تحديث username
-- =====================================
CREATE OR REPLACE FUNCTION update_username(p_user_id UUID, p_new_username TEXT)
RETURNS JSONB AS $$
DECLARE
  v_check JSONB;
  v_clean TEXT;
BEGIN
  -- تنظيف
  v_clean := LOWER(TRIM(p_new_username));

  -- التحقق من التوفر
  v_check := check_username_available(v_clean, p_user_id);

  IF NOT (v_check->>'available')::BOOLEAN THEN
    RETURN v_check;
  END IF;

  -- تحديث
  UPDATE user_profiles SET username = v_clean, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'username', v_clean);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 9. دالة البحث عن مستخدم بـ username أو email
-- =====================================
CREATE OR REPLACE FUNCTION find_user_by_login(p_login TEXT)
RETURNS TABLE(user_id UUID, email TEXT, username TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::TEXT,
    up.username
  FROM auth.users u
  LEFT JOIN user_profiles up ON u.id = up.user_id
  WHERE
    LOWER(u.email) = LOWER(p_login) OR
    LOWER(up.username) = LOWER(p_login)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 10. إنشاء ملفات للمستخدمين الحاليين
-- =====================================
DO $$
DECLARE
  r RECORD;
  v_username TEXT;
BEGIN
  FOR r IN
    SELECT id, email
    FROM auth.users
    WHERE id NOT IN (SELECT user_id FROM user_profiles)
  LOOP
    v_username := generate_username_from_email(r.email);
    INSERT INTO user_profiles (user_id, username, display_name)
    VALUES (r.id, v_username, SPLIT_PART(r.email, '@', 1))
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;

-- =====================================
-- 11. إضافة صلاحيات user_profiles
-- =====================================
INSERT INTO permissions (resource, action, description, category)
VALUES
  ('user_profiles', 'access', 'Access user profiles page', 'settings'),
  ('user_profiles', 'read', 'View user profiles', 'settings'),
  ('user_profiles', 'update', 'Update own profile', 'settings')
ON CONFLICT (resource, action) DO NOTHING;

-- =====================================
-- 12. View لعرض بيانات المستخدم مع الملف
-- =====================================
CREATE OR REPLACE VIEW user_with_profile AS
SELECT
  u.id,
  u.email,
  u.created_at AS user_created_at,
  u.last_sign_in_at,
  up.username,
  up.display_name,
  up.avatar_url,
  up.phone,
  up.language,
  up.theme
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.user_id;

-- منح صلاحية الوصول
GRANT SELECT ON user_with_profile TO authenticated;

SELECT 'تم إنشاء نظام Username بنجاح!' AS result;

