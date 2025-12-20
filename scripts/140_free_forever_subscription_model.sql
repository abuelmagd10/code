-- تحديث نموذج الاشتراك للنسخة المجانية ونظام الدفع لكل مستخدم إضافي
-- Free Forever + Pay Per Additional User Model

-- إضافة أعمدة جديدة لجدول الشركات
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS monthly_cost DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS subscription_id TEXT,
ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP;

-- تحديث الشركات الموجودة للنموذج الجديد
UPDATE companies 
SET 
  subscription_plan = 'free',
  subscription_status = 'active',
  max_users = 1,
  monthly_cost = 0.00
WHERE subscription_plan IS NULL OR subscription_plan = 'trial';

-- إنشاء جدول أحداث الاشتراك
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'signup', 'users_added', 'users_removed', 'payment_success', 'payment_failed'
  additional_users INTEGER DEFAULT 0,
  monthly_cost DECIMAL(10,2) DEFAULT 0.00,
  plan TEXT,
  billing_cycle TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- إنشاء فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_subscription_events_company_id ON subscription_events(company_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON subscription_events(created_at);

-- إنشاء جدول معاملات الدفع
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL, -- 'pending', 'completed', 'failed', 'refunded'
  payment_method TEXT, -- 'stripe', 'paypal', etc.
  transaction_id TEXT, -- External payment provider transaction ID
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- إنشاء فهارس لجدول المعاملات
CREATE INDEX IF NOT EXISTS idx_payment_transactions_company_id ON payment_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at);

-- دالة للتحقق من حد المستخدمين
CREATE OR REPLACE FUNCTION check_user_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  max_allowed INTEGER;
BEGIN
  -- عد المستخدمين الحاليين
  SELECT COUNT(*) INTO current_count
  FROM company_members
  WHERE company_id = NEW.company_id;
  
  -- جلب الحد الأقصى المسموح
  SELECT max_users INTO max_allowed
  FROM companies
  WHERE id = NEW.company_id;
  
  -- التحقق من عدم تجاوز الحد
  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'تم الوصول للحد الأقصى من المستخدمين (%). يرجى ترقية اشتراكك لإضافة المزيد.', max_allowed;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إنشاء trigger للتحقق من حد المستخدمين
DROP TRIGGER IF EXISTS trigger_check_user_limit ON company_members;
CREATE TRIGGER trigger_check_user_limit
  BEFORE INSERT ON company_members
  FOR EACH ROW
  EXECUTE FUNCTION check_user_limit();

-- دالة لحساب التكلفة الشهرية
CREATE OR REPLACE FUNCTION calculate_monthly_cost(company_uuid UUID)
RETURNS DECIMAL AS $$
DECLARE
  user_count INTEGER;
  additional_users INTEGER;
  cost DECIMAL;
BEGIN
  -- عد المستخدمين الحاليين
  SELECT COUNT(*) INTO user_count
  FROM company_members
  WHERE company_id = company_uuid;
  
  -- حساب المستخدمين الإضافيين (المستخدم الأول مجاني)
  additional_users := GREATEST(user_count - 1, 0);
  
  -- حساب التكلفة ($5 لكل مستخدم إضافي)
  cost := additional_users * 5.00;
  
  RETURN cost;
END;
$$ LANGUAGE plpgsql;

-- دالة لتحديث إحصائيات الاشتراك
CREATE OR REPLACE FUNCTION update_subscription_stats()
RETURNS TRIGGER AS $$
DECLARE
  new_cost DECIMAL;
  new_max_users INTEGER;
BEGIN
  -- حساب التكلفة الجديدة
  new_cost := calculate_monthly_cost(NEW.company_id);
  
  -- جلب الحد الأقصى الحالي
  SELECT max_users INTO new_max_users
  FROM companies
  WHERE id = NEW.company_id;
  
  -- تحديث بيانات الشركة
  UPDATE companies
  SET 
    monthly_cost = new_cost,
    subscription_plan = CASE 
      WHEN new_cost > 0 THEN 'paid'
      ELSE 'free'
    END,
    updated_at = NOW()
  WHERE id = NEW.company_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إنشاء trigger لتحديث الإحصائيات
DROP TRIGGER IF EXISTS trigger_update_subscription_stats ON company_members;
CREATE TRIGGER trigger_update_subscription_stats
  AFTER INSERT OR DELETE ON company_members
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_stats();

-- إدراج حدث التسجيل للشركات الموجودة
INSERT INTO subscription_events (company_id, event_type, additional_users, monthly_cost, plan)
SELECT 
  id,
  'migration_to_free_model',
  0,
  0.00,
  'free'
FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_events 
  WHERE company_id = companies.id 
  AND event_type = 'migration_to_free_model'
);

-- تحديث RLS policies للجداول الجديدة
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- سياسة الأمان لأحداث الاشتراك
CREATE POLICY "Users can view their company subscription events" ON subscription_events
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid()
    )
  );

-- سياسة الأمان لمعاملات الدفع
CREATE POLICY "Users can view their company payment transactions" ON payment_transactions
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid()
    )
  );

-- إنشاء view لإحصائيات الاشتراك
CREATE OR REPLACE VIEW subscription_summary AS
SELECT 
  c.id as company_id,
  c.name as company_name,
  c.subscription_plan,
  c.subscription_status,
  c.max_users,
  c.monthly_cost,
  COUNT(cm.id) as current_users,
  (c.max_users - COUNT(cm.id)) as available_slots,
  CASE 
    WHEN COUNT(cm.id) >= c.max_users THEN true
    ELSE false
  END as at_user_limit
FROM companies c
LEFT JOIN company_members cm ON c.id = cm.company_id
GROUP BY c.id, c.name, c.subscription_plan, c.subscription_status, c.max_users, c.monthly_cost;

SELECT 'Free Forever subscription model implemented successfully' as status;