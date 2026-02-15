-- Create attendance_records table if it doesn't exist
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    day_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('present', 'absent', 'leave', 'sick', 'late', 'early_leave')),
    check_in TIME,
    check_out TIME,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, employee_id, day_date)
);

-- Enable RLS
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_company_date ON attendance_records(company_id, day_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id);

-- RLS Policies
-- 1. Owners and Admins can do everything
CREATE POLICY "Owners and Admins full access" ON attendance_records
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM company_members cm
            WHERE cm.company_id = attendance_records.company_id
            AND cm.user_id = auth.uid()
            AND cm.role IN ('owner', 'admin')
        )
    );

-- 2. Managers can view and manage attendance for their branch (if branch logic applies, otherwise simple manager access)
CREATE POLICY "Managers full access" ON attendance_records
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM company_members cm
            WHERE cm.company_id = attendance_records.company_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'manager'
        )
    );

-- 3. Employees can view their own records
CREATE POLICY "Employees view own records" ON attendance_records
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            WHERE e.id = attendance_records.employee_id
            AND e.user_id = auth.uid()
        )
    );

-- 4. HR/Accountants might need read access (optional, can add later)
