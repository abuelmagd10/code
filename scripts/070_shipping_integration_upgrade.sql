-- =============================================
-- Shipping Integration Upgrade
-- تحسين نظام ربط شركات الشحن
-- =============================================

-- 1. إضافة حقول جديدة لجدول shipping_providers
-- ------------------------------------------------

-- نوع المصادقة (api_key, oauth2, basic, custom)
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS auth_type VARCHAR(50) DEFAULT 'api_key';

-- البيئة (sandbox للاختبار، production للتشغيل الفعلي)
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'sandbox' 
  CHECK (environment IN ('sandbox', 'production'));

-- رابط API للبيئة التجريبية
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS sandbox_url TEXT;

-- بيانات OAuth2 إضافية
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS oauth_token_url TEXT;
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS oauth_scope TEXT;
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS oauth_token TEXT; -- Access token
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT;
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMPTZ;

-- بيانات إضافية للتكامل
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS extra_config JSONB DEFAULT '{}';

-- تشفير البيانات الحساسة (يتم التشفير في التطبيق)
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS credentials_encrypted BOOLEAN DEFAULT FALSE;

-- رابط Webhook السري للتحقق
ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- 2. إضافة حقول لجدول shipments
-- ------------------------------------------------

-- حالة شركة الشحن (منفصلة عن الحالة الداخلية)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS provider_status VARCHAR(100);

-- كود حالة شركة الشحن
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS provider_status_code VARCHAR(50);

-- آخر تحديث من شركة الشحن
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMPTZ;

-- رقم البوليصة من شركة الشحن (AWB)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS awb_number VARCHAR(100);

-- تكلفة الشحن الفعلية من الشركة
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(15,2);

-- بيانات الاستلام
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivered_to VARCHAR(255);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_signature_url TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS proof_of_delivery_url TEXT;

-- محاولات الاستدعاء
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS api_attempts INTEGER DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_api_error TEXT;

-- 3. إنشاء جدول سجل حالات الشحنات
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS shipment_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  
  -- الحالة
  internal_status VARCHAR(50),      -- الحالة الداخلية
  provider_status VARCHAR(100),     -- حالة شركة الشحن
  provider_status_code VARCHAR(50), -- كود الحالة
  
  -- مصدر التحديث
  source VARCHAR(50) NOT NULL DEFAULT 'system', -- system, api, webhook, manual
  
  -- بيانات إضافية
  location VARCHAR(255),            -- الموقع الحالي
  notes TEXT,
  raw_data JSONB,                   -- البيانات الخام من API
  
  -- التدقيق
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_shipment_status_logs_shipment ON shipment_status_logs(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_status_logs_company ON shipment_status_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_shipment_status_logs_created ON shipment_status_logs(created_at DESC);

-- 4. إنشاء جدول Webhook Logs
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES shipping_providers(id) ON DELETE SET NULL,
  shipment_id UUID REFERENCES shipments(id) ON DELETE SET NULL,
  
  -- بيانات الطلب
  request_id VARCHAR(100),
  request_headers JSONB,
  request_body JSONB,
  signature VARCHAR(500),
  signature_valid BOOLEAN,
  
  -- نتيجة المعالجة
  processed BOOLEAN DEFAULT FALSE,
  process_result JSONB,
  error_message TEXT,
  
  -- التدقيق
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider ON shipping_webhook_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_shipment ON shipping_webhook_logs(shipment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received ON shipping_webhook_logs(received_at DESC);

-- 5. RLS Policies
-- ------------------------------------------------
ALTER TABLE shipment_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_webhook_logs ENABLE ROW LEVEL SECURITY;

-- سياسات shipment_status_logs
CREATE POLICY IF NOT EXISTS "shipment_status_logs_select" ON shipment_status_logs
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

CREATE POLICY IF NOT EXISTS "shipment_status_logs_insert" ON shipment_status_logs
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

-- سياسات shipping_webhook_logs (للقراءة فقط للمستخدمين)
CREATE POLICY IF NOT EXISTS "webhook_logs_select" ON shipping_webhook_logs
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

-- 6. تعليقات توضيحية
-- ------------------------------------------------
COMMENT ON COLUMN shipping_providers.auth_type IS 'نوع المصادقة: api_key, oauth2, basic, custom';
COMMENT ON COLUMN shipping_providers.environment IS 'البيئة: sandbox للاختبار، production للتشغيل';
COMMENT ON COLUMN shipments.provider_status IS 'حالة الشحنة من شركة الشحن (منفصلة عن الحالة الداخلية)';
COMMENT ON TABLE shipment_status_logs IS 'سجل تتبع تغيّر حالات الشحنات';
COMMENT ON TABLE shipping_webhook_logs IS 'سجل Webhooks الواردة من شركات الشحن';

