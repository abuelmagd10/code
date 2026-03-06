const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hfvsbsizokxontflgdyn.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
    console.log("Fetching one employee to inspect columns...");
    const { data: records, error } = await supabase
        .from('employees')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Query Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Success! Columns:", Object.keys(records[0]));
        console.log("Data:", records[0]);
    }
})();
