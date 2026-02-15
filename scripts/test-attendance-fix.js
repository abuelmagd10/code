const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testAttendanceAPI() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials in .env.local');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get a test company and employee
    const { data: companies, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .limit(1);

    if (companyError || !companies || companies.length === 0) {
        console.error('Error fetching company:', companyError);
        return;
    }

    const companyId = companies[0].id;
    console.log('Testing with Company ID:', companyId);

    // Check if employees exist
    let { data: employees, error: employeeError } = await supabase
        .from('employees')
        .select('id')
        .eq('company_id', companyId)
        .limit(1);

    let employeeId;
    if (employeeError || !employees || employees.length === 0) {
        console.log('No employees found, creating a dummy employee for testing...');
        const dummyEmployee = {
            company_id: companyId,
            full_name: 'Test Employee',
            base_salary: 5000 // Required field
        };

        const { data: newEmployee, error: createError } = await supabase
            .from('employees')
            .insert(dummyEmployee)
            .select('id')
            .single();

        if (createError) {
            console.error('Failed to create dummy employee:', createError);
            return;
        }
        employeeId = newEmployee.id;
        console.log('Created dummy employee:', employeeId);
    } else {
        employeeId = employees[0].id;
    }
    console.log('Testing with Employee ID:', employeeId);

    // 2. Insert attendance record via direct DB call first to ensure table works
    const dayDate = new Date().toISOString().split('T')[0];
    const testRecord = {
        company_id: companyId,
        employee_id: employeeId,
        day_date: dayDate,
        status: 'present',
        notes: 'Test record via script'
    };

    const { data: inserted, error: insertError } = await supabase
        .from('attendance_records')
        .upsert(testRecord, { onConflict: 'company_id,employee_id,day_date' })
        .select();

    if (insertError) {
        console.error('Direct DB Insert Failed:', insertError);
    } else {
        console.log('Direct DB Insert Success:', inserted);
    }

    // 3. (Optional) Simulate API call structure if needed, but direct DB check confirms table exists and constraints work.
}

testAttendanceAPI();
