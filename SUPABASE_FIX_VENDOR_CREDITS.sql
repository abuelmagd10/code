-- تشغيل هذا السكريبت في Supabase SQL Editor لإصلاح خطأ vendor_credits

-- التحقق من وجود الجدول أولاً
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'vendor_credits') THEN
    -- إنشاء الجدول
    CREATE TABLE vendor_credits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
      credit_number VARCHAR(50) NOT NULL,
      credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
      total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      applied_amount DECIMAL(15,2) DEFAULT 0,
      remaining_amount DECIMAL(15,2) GENERATED ALWAYS AS (total_amount - applied_amount) STORED,
      status VARCHAR(20) DEFAULT 'active',
      reference_type VARCHAR(50) DEFAULT 'purchase_return',
      reference_id UUID,
      journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- الفهارس
    CREATE INDEX idx_vendor_credits_company ON vendor_credits(company_id);
    CREATE INDEX idx_vendor_credits_supplier ON vendor_credits(supplier_id);
    CREATE INDEX idx_vendor_credits_bill ON vendor_credits(bill_id);

    -- RLS
    ALTER TABLE vendor_credits ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "vendor_credits_select" ON vendor_credits
      FOR SELECT USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

    CREATE POLICY "vendor_credits_insert" ON vendor_credits
      FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

    RAISE NOTICE 'تم إنشاء جدول vendor_credits بنجاح';
  ELSE
    RAISE NOTICE 'جدول vendor_credits موجود بالفعل';
  END IF;
END $$;