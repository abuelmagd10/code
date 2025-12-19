import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // تنفيذ الإصلاحات مباشرة
    const fixSQL = `
      -- إصلاح شامل لدالة post_depreciation
      -- يضمن عدم وجود أي أعمدة غير موجودة

      -- أولاً: حذف الدالة إذا كانت موجودة
      DROP FUNCTION IF EXISTS post_depreciation(UUID, UUID);

      -- ثانياً: إنشاء الدالة من الصفر بأعمدة محددة
      CREATE OR REPLACE FUNCTION post_depreciation(
        p_schedule_id UUID,
        p_user_id UUID
      ) RETURNS UUID AS $$
      DECLARE
        -- متغيرات depreciation_schedules - أعمدة موجودة فعلاً
        v_schedule_id UUID;
        v_asset_id UUID;
        v_period_number INTEGER;
        v_period_date DATE;
        v_depreciation_amount DECIMAL(15,2);
        v_accumulated_depreciation DECIMAL(15,2);
        v_book_value DECIMAL(15,2);
        v_status TEXT;

        -- متغيرات fixed_assets - أعمدة موجودة فعلاً
        v_asset_company_id UUID;
        v_asset_name TEXT;
        v_asset_depreciation_expense_account_id UUID;
        v_asset_accumulated_depreciation_account_id UUID;
        v_asset_salvage_value DECIMAL(15,2);

        -- متغيرات أخرى
        v_journal_id UUID;
      BEGIN
        -- جلب بيانات depreciation_schedules - أعمدة محددة موجودة
        SELECT
          id, asset_id, period_number, period_date,
          depreciation_amount, accumulated_depreciation, book_value, status
        INTO
          v_schedule_id, v_asset_id, v_period_number, v_period_date,
          v_depreciation_amount, v_accumulated_depreciation, v_book_value, v_status
        FROM depreciation_schedules
        WHERE id = p_schedule_id;

        IF v_schedule_id IS NULL THEN
          RAISE EXCEPTION 'Depreciation schedule not found';
        END IF;

        IF v_status = 'posted' THEN
          RAISE EXCEPTION 'Depreciation already posted';
        END IF;

        -- جلب بيانات fixed_assets - أعمدة محددة موجودة
        SELECT
          company_id, name,
          depreciation_expense_account_id, accumulated_depreciation_account_id, salvage_value
        INTO
          v_asset_company_id, v_asset_name,
          v_asset_depreciation_expense_account_id, v_asset_accumulated_depreciation_account_id, v_asset_salvage_value
        FROM fixed_assets
        WHERE id = v_asset_id;

        -- التحقق من الحسابات
        IF v_asset_depreciation_expense_account_id IS NULL THEN
          RAISE EXCEPTION 'Depreciation expense account not specified for asset: %', v_asset_name;
        END IF;

        IF v_asset_accumulated_depreciation_account_id IS NULL THEN
          RAISE EXCEPTION 'Accumulated depreciation account not specified for asset: %', v_asset_name;
        END IF;

        -- التحقق من وجود الحسابات في chart_of_accounts
        IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE id = v_asset_depreciation_expense_account_id AND company_id = v_asset_company_id) THEN
          RAISE EXCEPTION 'Depreciation expense account not found in chart of accounts for asset: %', v_asset_name;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE id = v_asset_accumulated_depreciation_account_id AND company_id = v_asset_company_id) THEN
          RAISE EXCEPTION 'Accumulated depreciation account not found in chart of accounts for asset: %', v_asset_name;
        END IF;

        -- إنشاء قيد محاسبي - أعمدة موجودة في journal_entries فقط
        INSERT INTO journal_entries (
          company_id, entry_date, description,
          reference_type, reference_id
        ) VALUES (
          v_asset_company_id,
          v_period_date,
          'إهلاك أصل: ' || v_asset_name || ' - فترة ' || v_period_number,
          'depreciation',
          v_asset_id
        ) RETURNING id INTO v_journal_id;

        -- إدراج سطور القيد - أعمدة موجودة في journal_entry_lines فقط
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description, debit_amount, credit_amount
        ) VALUES (
          v_journal_id,
          v_asset_depreciation_expense_account_id,
          'مصروف إهلاك: ' || v_asset_name,
          v_depreciation_amount,
          0
        );

        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description, debit_amount, credit_amount
        ) VALUES (
          v_journal_id,
          v_asset_accumulated_depreciation_account_id,
          'مجمع إهلاك: ' || v_asset_name,
          0,
          v_depreciation_amount
        );

        -- تحديث depreciation_schedules - أعمدة موجودة فقط
        UPDATE depreciation_schedules SET
          status = 'posted',
          journal_entry_id = v_journal_id,
          posted_by = p_user_id,
          posted_at = CURRENT_TIMESTAMP
        WHERE id = p_schedule_id;

        -- تحديث fixed_assets - أعمدة موجودة فقط
        UPDATE fixed_assets SET
          accumulated_depreciation = v_accumulated_depreciation,
          book_value = v_book_value,
          status = CASE
            WHEN v_book_value <= v_asset_salvage_value THEN 'fully_depreciated'
            ELSE 'active'
          END,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = p_user_id
        WHERE id = v_asset_id;

        RETURN v_journal_id;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      -- منح الصلاحيات
      GRANT EXECUTE ON FUNCTION post_depreciation(UUID, UUID) TO authenticated;
      GRANT EXECUTE ON FUNCTION post_depreciation(UUID, UUID) TO anon;
    `

    // تنفيذ الإصلاحات SQL واحدة تلو الأخرى
    const statements = fixSQL.split(';').filter(stmt => stmt.trim().length > 0)

    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.trim().substring(0, 50) + '...')
        const { error } = await supabase.rpc('exec_sql', { sql: statement.trim() + ';' })

        if (error) {
          console.error('Error executing statement:', error)
          return NextResponse.json({
            error: 'Failed to apply fixes',
            details: error.message,
            statement: statement.trim().substring(0, 100)
          }, { status: 500 })
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Fixed Assets depreciation fixes applied successfully to database'
    })
  } catch (error: any) {
    console.error('Error in apply fixes:', error)
    return NextResponse.json({
      error: 'Failed to apply fixes',
      details: error?.message
    }, { status: 500 })
  }
}