-- =====================================
-- Fixed Assets Depreciation Module
-- موديول إهلاك الأصول الثابتة
-- =====================================

-- =====================================
-- 1️⃣ جدول فئات الأصول (Asset Categories)
-- =====================================
CREATE TABLE IF NOT EXISTS asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- اسم الفئة (معدات، سيارات، أجهزة، مباني)
  code TEXT NOT NULL,                    -- كود الفئة
  description TEXT,
  default_useful_life_months INTEGER DEFAULT 60,  -- العمر الافتراضي بالأشهر
  default_depreciation_method TEXT DEFAULT 'straight_line'
    CHECK (default_depreciation_method IN ('straight_line', 'declining_balance', 'units_of_production', 'sum_of_years')),
  default_asset_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  default_depreciation_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  default_expense_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, code)
);

-- =====================================
-- 2️⃣ جدول الأصول الثابتة (Fixed Assets)
-- =====================================
CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES asset_categories(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,

  -- بيانات الأصل الأساسية
  asset_code TEXT NOT NULL,              -- كود الأصل
  name TEXT NOT NULL,                    -- اسم الأصل
  description TEXT,
  serial_number TEXT,                    -- الرقم التسلسلي

  -- بيانات الشراء
  purchase_date DATE NOT NULL,           -- تاريخ الشراء
  depreciation_start_date DATE NOT NULL, -- تاريخ بدء الإهلاك
  purchase_cost DECIMAL(15, 2) NOT NULL, -- قيمة الشراء
  salvage_value DECIMAL(15, 2) DEFAULT 0,-- القيمة المتبقية
  useful_life_months INTEGER NOT NULL,   -- العمر الإنتاجي بالأشهر

  -- طريقة الإهلاك
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line', 'declining_balance', 'units_of_production', 'sum_of_years')),
  declining_balance_rate DECIMAL(5, 2) DEFAULT 0.20, -- نسبة القسط المتناقص (20% افتراضي)

  -- الحسابات المحاسبية
  asset_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  accumulated_depreciation_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  depreciation_expense_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,

  -- حالة الأصل
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'suspended', 'sold', 'disposed', 'fully_depreciated')),

  -- بيانات البيع/الاستبعاد
  disposal_date DATE,
  disposal_amount DECIMAL(15, 2),
  disposal_reason TEXT,
  disposal_journal_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,

  -- القيم المحسوبة (يتم تحديثها بعد كل إهلاك)
  accumulated_depreciation DECIMAL(15, 2) DEFAULT 0,
  book_value DECIMAL(15, 2),             -- القيمة الدفترية = purchase_cost - accumulated_depreciation

  -- التدقيق
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(company_id, asset_code)
);

-- =====================================
-- 3️⃣ جدول الإهلاك (Depreciation Schedule)
-- =====================================
CREATE TABLE IF NOT EXISTS depreciation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,

  -- بيانات الفترة
  period_number INTEGER NOT NULL,        -- رقم الفترة (1, 2, 3...)
  period_date DATE NOT NULL,             -- تاريخ الإهلاك

  -- القيم
  depreciation_amount DECIMAL(15, 2) NOT NULL,    -- قيمة الإهلاك للفترة
  accumulated_depreciation DECIMAL(15, 2) NOT NULL, -- مجمع الإهلاك حتى هذه الفترة
  book_value DECIMAL(15, 2) NOT NULL,    -- القيمة الدفترية بعد الإهلاك

  -- الحالة
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'posted', 'cancelled')),

  -- القيد المحاسبي
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,

  -- التدقيق
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(asset_id, period_number)
);

-- =====================================
-- 4️⃣ الفهارس (Indexes)
-- =====================================
CREATE INDEX IF NOT EXISTS idx_asset_categories_company ON asset_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_company ON fixed_assets(company_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON fixed_assets(category_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_branch ON fixed_assets(branch_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_cost_center ON fixed_assets(cost_center_id);

-- سياسات asset_categories
DROP POLICY IF EXISTS "asset_categories_company_policy" ON asset_categories;
CREATE POLICY "asset_categories_company_policy" ON asset_categories
  FOR ALL USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

-- سياسات fixed_assets
DROP POLICY IF EXISTS "fixed_assets_company_policy" ON fixed_assets;
CREATE POLICY "fixed_assets_company_policy" ON fixed_assets
  FOR ALL USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

-- سياسات depreciation_schedules
DROP POLICY IF EXISTS "depreciation_schedules_company_policy" ON depreciation_schedules;
CREATE POLICY "depreciation_schedules_company_policy" ON depreciation_schedules
  FOR ALL USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

-- =====================================
-- 6️⃣ دوال الإهلاك (Depreciation Functions)
-- =====================================

-- دالة حساب القسط الثابت (Straight Line)
CREATE OR REPLACE FUNCTION calc_straight_line_depreciation(
  p_purchase_cost DECIMAL,
  p_salvage_value DECIMAL,
  p_useful_life_months INTEGER
) RETURNS DECIMAL AS $$
BEGIN
  IF p_useful_life_months <= 0 THEN
    RETURN 0;
  END IF;
  RETURN ROUND((p_purchase_cost - p_salvage_value) / p_useful_life_months, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- دالة حساب القسط المتناقص (Declining Balance)
CREATE OR REPLACE FUNCTION calc_declining_balance_depreciation(
  p_book_value DECIMAL,
  p_salvage_value DECIMAL,
  p_rate DECIMAL,
  p_useful_life_months INTEGER,
  p_period_number INTEGER
) RETURNS DECIMAL AS $$
DECLARE
  v_depreciation DECIMAL;
  v_annual_rate DECIMAL;
BEGIN
  -- تحويل المعدل السنوي إلى شهري
  v_annual_rate := p_rate / 12;
  v_depreciation := ROUND(p_book_value * v_annual_rate, 2);

  -- التأكد من عدم تجاوز القيمة المتبقية
  IF (p_book_value - v_depreciation) < p_salvage_value THEN
    v_depreciation := p_book_value - p_salvage_value;
  END IF;

  RETURN GREATEST(v_depreciation, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- دالة إنشاء جدول الإهلاك
CREATE OR REPLACE FUNCTION generate_depreciation_schedule(p_asset_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_asset RECORD;
  v_period INTEGER := 1;
  v_current_date DATE;
  v_depreciation DECIMAL;
  v_accumulated DECIMAL := 0;
  v_book_value DECIMAL;
  v_periods_count INTEGER := 0;
BEGIN
  -- جلب بيانات الأصل
  SELECT * INTO v_asset FROM fixed_assets WHERE id = p_asset_id;

  IF v_asset IS NULL THEN
    RAISE EXCEPTION 'Asset not found: %', p_asset_id;
  END IF;

  -- حذف الجدول القديم (فقط الفترات غير المرحلة)
  DELETE FROM depreciation_schedules
  WHERE asset_id = p_asset_id AND status IN ('pending', 'approved');

  -- تهيئة القيم
  v_book_value := v_asset.purchase_cost;
  v_current_date := v_asset.depreciation_start_date;

  -- إنشاء جدول الإهلاك
  WHILE v_book_value > v_asset.salvage_value AND v_period <= v_asset.useful_life_months LOOP
    -- حساب الإهلاك حسب الطريقة
    IF v_asset.depreciation_method = 'straight_line' THEN
      v_depreciation := calc_straight_line_depreciation(
        v_asset.purchase_cost,
        v_asset.salvage_value,
        v_asset.useful_life_months
      );
    ELSIF v_asset.depreciation_method = 'declining_balance' THEN
      v_depreciation := calc_declining_balance_depreciation(
        v_book_value,
        v_asset.salvage_value,
        v_asset.declining_balance_rate,
        v_asset.useful_life_months,
        v_period
      );
    ELSE
      v_depreciation := calc_straight_line_depreciation(
        v_asset.purchase_cost,
        v_asset.salvage_value,
        v_asset.useful_life_months
      );
    END IF;

    -- التأكد من عدم تجاوز القيمة المتبقية
    IF (v_book_value - v_depreciation) < v_asset.salvage_value THEN
      v_depreciation := v_book_value - v_asset.salvage_value;
    END IF;

    -- تحديث القيم
    v_accumulated := v_accumulated + v_depreciation;
    v_book_value := v_asset.purchase_cost - v_accumulated;

    -- إدراج فترة الإهلاك
    INSERT INTO depreciation_schedules (
      company_id, asset_id, period_number, period_date,
      depreciation_amount, accumulated_depreciation, book_value, status
    ) VALUES (
      v_asset.company_id, p_asset_id, v_period, v_current_date,
      v_depreciation, v_accumulated, v_book_value, 'pending'
    );

    v_periods_count := v_periods_count + 1;
    v_period := v_period + 1;
    v_current_date := v_current_date + INTERVAL '1 month';
  END LOOP;

  RETURN v_periods_count;
END;
$$ LANGUAGE plpgsql;
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_depreciation_schedules_asset ON depreciation_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_schedules_status ON depreciation_schedules(status);
CREATE INDEX IF NOT EXISTS idx_depreciation_schedules_date ON depreciation_schedules(period_date);

-- =====================================
-- 5️⃣ سياسات أمان الصفوف (RLS)
-- =====================================
ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE depreciation_schedules ENABLE ROW LEVEL SECURITY;

-- =====================================
-- 7️⃣ دالة ترحيل الإهلاك وإنشاء القيد المحاسبي
-- =====================================
CREATE OR REPLACE FUNCTION post_depreciation(
  p_schedule_id UUID,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_schedule RECORD;
  v_asset RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
BEGIN
  -- جلب بيانات الإهلاك
  SELECT * INTO v_schedule FROM depreciation_schedules WHERE id = p_schedule_id;
  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'Depreciation schedule not found';
  END IF;

  IF v_schedule.status = 'posted' THEN
    RAISE EXCEPTION 'Depreciation already posted';
  END IF;

  -- جلب بيانات الأصل
  SELECT * INTO v_asset FROM fixed_assets WHERE id = v_schedule.asset_id;

  -- إنشاء رقم القيد
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+') AS INTEGER)), 0) + 1
  INTO v_entry_number
  FROM journal_entries
  WHERE company_id = v_asset.company_id;

  v_entry_number := 'JE-' || LPAD(v_entry_number::TEXT, 6, '0');

  -- إنشاء قيد الإهلاك
  INSERT INTO journal_entries (
    company_id, entry_number, entry_date, description,
    reference_type, reference_id, branch_id, cost_center_id,
    created_by
  ) VALUES (
    v_asset.company_id,
    v_entry_number,
    v_schedule.period_date,
    'إهلاك أصل: ' || v_asset.name || ' - فترة ' || v_schedule.period_number,
    'depreciation',
    v_asset.id,
    v_asset.branch_id,
    v_asset.cost_center_id,
    p_user_id
  ) RETURNING id INTO v_journal_id;

  -- إدراج سطور القيد
  -- مدين: مصروف الإهلاك
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, description, debit, credit
  ) VALUES (
    v_journal_id,
    v_asset.depreciation_expense_account_id,
    'مصروف إهلاك: ' || v_asset.name,
    v_schedule.depreciation_amount,
    0
  );

  -- دائن: مجمع الإهلاك
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, description, debit, credit
  ) VALUES (
    v_journal_id,
    v_asset.accumulated_depreciation_account_id,
    'مجمع إهلاك: ' || v_asset.name,
    0,
    v_schedule.depreciation_amount
  );

  -- تحديث جدول الإهلاك
  UPDATE depreciation_schedules SET
    status = 'posted',
    journal_entry_id = v_journal_id,
    posted_by = p_user_id,
    posted_at = CURRENT_TIMESTAMP
  WHERE id = p_schedule_id;

  -- تحديث الأصل
  UPDATE fixed_assets SET
    accumulated_depreciation = v_schedule.accumulated_depreciation,
    book_value = v_schedule.book_value,
    status = CASE
      WHEN v_schedule.book_value <= salvage_value THEN 'fully_depreciated'
      ELSE status
    END,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = p_user_id
  WHERE id = v_asset.id;

  RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 8️⃣ دالة بيع/استبعاد الأصل
-- =====================================
CREATE OR REPLACE FUNCTION dispose_asset(
  p_asset_id UUID,
  p_disposal_date DATE,
  p_disposal_amount DECIMAL,
  p_disposal_reason TEXT,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_asset RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_gain_loss DECIMAL;
  v_gain_loss_account_id UUID;
BEGIN
  -- جلب بيانات الأصل
  SELECT * INTO v_asset FROM fixed_assets WHERE id = p_asset_id;
  IF v_asset IS NULL THEN
    RAISE EXCEPTION 'Asset not found';
  END IF;

  IF v_asset.status IN ('sold', 'disposed') THEN
    RAISE EXCEPTION 'Asset already disposed';
  END IF;

  -- حساب الربح أو الخسارة
  v_gain_loss := p_disposal_amount - v_asset.book_value;

  -- الحصول على حساب الأرباح/الخسائر
  SELECT id INTO v_gain_loss_account_id
  FROM chart_of_accounts
  WHERE company_id = v_asset.company_id
    AND account_code = '4300' -- إيرادات أخرى (يمكن تعديله)
  LIMIT 1;

  -- إنشاء رقم القيد
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+') AS INTEGER)), 0) + 1
  INTO v_entry_number
  FROM journal_entries
  WHERE company_id = v_asset.company_id;

  v_entry_number := 'JE-' || LPAD(v_entry_number::TEXT, 6, '0');

  -- إنشاء قيد الاستبعاد
  INSERT INTO journal_entries (
    company_id, entry_number, entry_date, description,
    reference_type, reference_id, branch_id, cost_center_id,
    created_by
  ) VALUES (
    v_asset.company_id,
    v_entry_number,
    p_disposal_date,
    'استبعاد أصل: ' || v_asset.name || ' - ' || p_disposal_reason,
    'asset_disposal',
    v_asset.id,
    v_asset.branch_id,
    v_asset.cost_center_id,
    p_user_id
  ) RETURNING id INTO v_journal_id;

  -- مدين: البنك/الصندوق بقيمة البيع
  IF p_disposal_amount > 0 THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, description, debit, credit
    ) SELECT
      v_journal_id,
      id,
      'متحصلات بيع أصل: ' || v_asset.name,
      p_disposal_amount,
      0
    FROM chart_of_accounts
    WHERE company_id = v_asset.company_id
      AND account_code = '1110' -- الصندوق
    LIMIT 1;
  END IF;

  -- مدين: مجمع الإهلاك
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, description, debit, credit
  ) VALUES (
    v_journal_id,
    v_asset.accumulated_depreciation_account_id,
    'إقفال مجمع إهلاك: ' || v_asset.name,
    v_asset.accumulated_depreciation,
    0
  );

  -- دائن: حساب الأصل
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, description, debit, credit
  ) VALUES (
    v_journal_id,
    v_asset.asset_account_id,
    'إقفال أصل: ' || v_asset.name,
    0,
    v_asset.purchase_cost
  );

  -- ربح أو خسارة
  IF v_gain_loss > 0 AND v_gain_loss_account_id IS NOT NULL THEN
    -- ربح (دائن)
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, description, debit, credit
    ) VALUES (
      v_journal_id,
      v_gain_loss_account_id,
      'ربح بيع أصل: ' || v_asset.name,
      0,
      v_gain_loss
    );
  ELSIF v_gain_loss < 0 THEN
    -- خسارة (مدين)
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, description, debit, credit
    ) SELECT
      v_journal_id,
      id,
      'خسارة بيع أصل: ' || v_asset.name,
      ABS(v_gain_loss),
      0
    FROM chart_of_accounts
    WHERE company_id = v_asset.company_id
      AND account_code = '5300' -- مصروفات أخرى
    LIMIT 1;
  END IF;

  -- تحديث الأصل
  UPDATE fixed_assets SET
    status = CASE WHEN p_disposal_amount > 0 THEN 'sold' ELSE 'disposed' END,
    disposal_date = p_disposal_date,
    disposal_amount = p_disposal_amount,
    disposal_reason = p_disposal_reason,
    disposal_journal_id = v_journal_id,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = p_user_id
  WHERE id = p_asset_id;

  -- إلغاء الإهلاكات المستقبلية
  UPDATE depreciation_schedules SET
    status = 'cancelled'
  WHERE asset_id = p_asset_id
    AND status IN ('pending', 'approved')
    AND period_date > p_disposal_date;

  RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 9️⃣ Trigger لحساب القيمة الدفترية
-- =====================================
CREATE OR REPLACE FUNCTION update_asset_book_value()
RETURNS TRIGGER AS $$
BEGIN
  NEW.book_value := NEW.purchase_cost - NEW.accumulated_depreciation;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_asset_book_value ON fixed_assets;
CREATE TRIGGER trg_update_asset_book_value
  BEFORE INSERT OR UPDATE ON fixed_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_asset_book_value();

-- =====================================
-- 🔟 إضافة فئات أصول افتراضية
-- =====================================
CREATE OR REPLACE FUNCTION seed_default_asset_categories(p_company_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- المعدات
  INSERT INTO asset_categories (company_id, code, name, description, default_useful_life_months)
  VALUES (p_company_id, 'EQP', 'المعدات', 'Equipment - معدات ومكائن', 60)
  ON CONFLICT (company_id, code) DO NOTHING;
  v_count := v_count + 1;

  -- السيارات
  INSERT INTO asset_categories (company_id, code, name, description, default_useful_life_months)
  VALUES (p_company_id, 'VEH', 'السيارات', 'Vehicles - سيارات ومركبات', 60)
  ON CONFLICT (company_id, code) DO NOTHING;
  v_count := v_count + 1;

  -- الأجهزة الإلكترونية
  INSERT INTO asset_categories (company_id, code, name, description, default_useful_life_months)
  VALUES (p_company_id, 'IT', 'الأجهزة الإلكترونية', 'IT Equipment - أجهزة كمبيوتر وشبكات', 36)
  ON CONFLICT (company_id, code) DO NOTHING;
  v_count := v_count + 1;

  -- الأثاث
  INSERT INTO asset_categories (company_id, code, name, description, default_useful_life_months)
  VALUES (p_company_id, 'FUR', 'الأثاث والتجهيزات', 'Furniture & Fixtures', 84)
  ON CONFLICT (company_id, code) DO NOTHING;
  v_count := v_count + 1;

  -- المباني
  INSERT INTO asset_categories (company_id, code, name, description, default_useful_life_months)
  VALUES (p_company_id, 'BLD', 'المباني', 'Buildings - مباني وإنشاءات', 240)
  ON CONFLICT (company_id, code) DO NOTHING;
  v_count := v_count + 1;

  -- الأراضي (لا يتم إهلاكها)
  INSERT INTO asset_categories (company_id, code, name, description, default_useful_life_months)
  VALUES (p_company_id, 'LND', 'الأراضي', 'Land - أراضي (لا تُهلك)', 0)
  ON CONFLICT (company_id, code) DO NOTHING;
  v_count := v_count + 1;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
