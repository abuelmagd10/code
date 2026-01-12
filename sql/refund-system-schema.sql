-- 🔒 Refund System Schema
-- نظام الاسترداد مع الحوكمة والموافقات الكاملة

-- جدول طلبات الاسترداد
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- الحوكمة (إلزامي)
  company_id UUID NOT NULL REFERENCES companies(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  cost_center_id UUID NOT NULL REFERENCES cost_centers(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  
  -- المستند المرتبط
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('invoice', 'sales_return', 'payment')),
  source_id UUID NOT NULL,
  source_number VARCHAR(100) NOT NULL,
  
  -- تفاصيل الاسترداد
  requested_amount DECIMAL(15,2) NOT NULL CHECK (requested_amount > 0),
  approved_amount DECIMAL(15,2),
  reason TEXT NOT NULL,
  attachments JSONB,
  
  -- الحالة والموافقات
  status VARCHAR(50) NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'branch_approved', 'finance_approved', 'approved', 'rejected', 'disbursed', 'cancelled')),
  
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  branch_approved_by UUID REFERENCES auth.users(id),
  branch_approved_at TIMESTAMP,
  
  finance_approved_by UUID REFERENCES auth.users(id),
  finance_approved_at TIMESTAMP,
  
  final_approved_by UUID REFERENCES auth.users(id),
  final_approved_at TIMESTAMP,
  
  rejected_by UUID REFERENCES auth.users(id),
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  
  -- سند الصرف
  disbursement_voucher_id UUID UNIQUE REFERENCES disbursement_vouchers(id),
  disbursed_by UUID REFERENCES auth.users(id),
  disbursed_at TIMESTAMP,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- فهارس للأداء
  CONSTRAINT unique_active_refund_per_source 
    UNIQUE (source_type, source_id, status) 
    WHERE status IN ('pending', 'branch_approved', 'finance_approved', 'approved')
);

-- جدول سندات الصرف
CREATE TABLE IF NOT EXISTS disbursement_vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- الحوكمة (إلزامي)
  company_id UUID NOT NULL REFERENCES companies(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  cost_center_id UUID NOT NULL REFERENCES cost_centers(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  
  -- التفاصيل
  voucher_number VARCHAR(100) UNIQUE,
  voucher_type VARCHAR(50) NOT NULL CHECK (voucher_type IN ('refund', 'expense', 'other')),
  refund_request_id UUID REFERENCES refund_requests(id),
  
  source_type VARCHAR(50),
  source_id UUID,
  
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'check')),
  
  notes TEXT,
  
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- جدول سجل التدقيق
CREATE TABLE IF NOT EXISTS refund_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  refund_request_id UUID NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  
  action VARCHAR(50) NOT NULL CHECK (action IN ('created', 'approved', 'rejected', 'disbursed', 'reopened', 'cancelled')),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  details JSONB,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- الفهارس
CREATE INDEX idx_refund_requests_company ON refund_requests(company_id);
CREATE INDEX idx_refund_requests_branch ON refund_requests(branch_id);
CREATE INDEX idx_refund_requests_status ON refund_requests(status);
CREATE INDEX idx_refund_requests_source ON refund_requests(source_type, source_id);
CREATE INDEX idx_refund_requests_requested_by ON refund_requests(requested_by);

CREATE INDEX idx_disbursement_vouchers_company ON disbursement_vouchers(company_id);
CREATE INDEX idx_disbursement_vouchers_branch ON disbursement_vouchers(branch_id);
CREATE INDEX idx_disbursement_vouchers_refund ON disbursement_vouchers(refund_request_id);

CREATE INDEX idx_refund_audit_logs_request ON refund_audit_logs(refund_request_id);
CREATE INDEX idx_refund_audit_logs_user ON refund_audit_logs(user_id);

-- الترقيم التلقائي لسندات الصرف
CREATE OR REPLACE FUNCTION generate_voucher_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.voucher_number IS NULL THEN
    NEW.voucher_number := 'VCH-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                          LPAD(NEXTVAL('voucher_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS voucher_number_seq;

CREATE TRIGGER set_voucher_number
  BEFORE INSERT ON disbursement_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION generate_voucher_number();

-- تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_refund_requests_updated_at
  BEFORE UPDATE ON refund_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disbursement_vouchers_updated_at
  BEFORE UPDATE ON disbursement_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursement_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_audit_logs ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان (يتم تطبيقها حسب الحوكمة)
CREATE POLICY refund_requests_company_isolation ON refund_requests
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY disbursement_vouchers_company_isolation ON disbursement_vouchers
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY refund_audit_logs_read_only ON refund_audit_logs
  FOR SELECT
  USING (refund_request_id IN (
    SELECT id FROM refund_requests WHERE company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

-- التعليقات
COMMENT ON TABLE refund_requests IS 'طلبات الاسترداد النقدي مع الموافقات والحوكمة الكاملة';
COMMENT ON TABLE disbursement_vouchers IS 'سندات الصرف المرتبطة بطلبات الاسترداد';
COMMENT ON TABLE refund_audit_logs IS 'سجل التدقيق الكامل لجميع عمليات الاسترداد';

COMMENT ON CONSTRAINT unique_active_refund_per_source ON refund_requests IS 'منع إنشاء طلبات استرداد متعددة نشطة لنفس المستند';
