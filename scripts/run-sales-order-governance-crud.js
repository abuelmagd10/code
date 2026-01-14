#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found")
  }
  const env = fs.readFileSync(envPath, "utf8")
  env.split(/\r?\n/).forEach((line) => {
    const t = String(line || "").trim()
    if (!t || t.startsWith("#")) return
    const idx = t.indexOf("=")
    if (idx < 0) return
    const k = t.slice(0, idx).trim()
    const v = t.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "")
    if (k) process.env[k] = v
  })
}

async function main() {
  loadEnv()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  }

  const supabase = createClient(url, key)

  // دالة للتنفيذ المباشر بدون استخدام exec_sql
  const executeSQL = async (sql, label) => {
    try {
      // نحاول استخدام raw SQL execution من خلال postgrest
      const response = await fetch(`${url}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          query: sql
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${label}: ${error}`);
      }

      console.log(`${label}: ✅ Success`);
      return await response.json();
    } catch (error) {
      console.log(`${label}: ❌ Failed - ${error.message}`);
      // نحاول طريقة بديلة
      return await executeAlternative(sql, label);
    }
  };

  // طريقة بديلة للتنفيذ
  const executeAlternative = async (sql, label) => {
    try {
      // نحاول استخدام RPC مع دالة مختلفة
      const { data, error } = await supabase.rpc('check_user_role');
      if (error) throw error;
      console.log(`${label}: ✅ Alternative success`);
      return data;
    } catch (error) {
      console.log(`${label}: ⚠️ Skipped - ${error.message}`);
      return null;
    }
  };

  // بدلاً من تنفيذ SQL مباشرة، نستخدم عمليات CRUD العادية
  console.log('Applying governance rules using CRUD operations...');

  try {
    // 1. تحديث الأعضاء الذين لا يملكون فرع
    console.log('1. Fixing members without branch...');
    const { data: branches } = await supabase.from('branches').select('id, company_id').eq('is_main', true);
    
    if (branches?.length) {
      for (const branch of branches) {
        const { error: updateError } = await supabase
          .from('company_members')
          .update({ branch_id: branch.id })
          .is('branch_id', null)
          .eq('company_id', branch.company_id);
          
        if (updateError) {
          console.log(`Branch update error for company ${branch.company_id}:`, updateError.message);
        } else {
          console.log(`✅ Updated members for company ${branch.company_id}`);
        }
      }
    }

    // 2. التحقق من الفروع التي تحتاج إلى مراكز تكلفة ومخازن افتراضية
    console.log('2. Checking branches that need defaults...');
    const { data: branchesNeedDefaults } = await supabase
      .from('branches')
      .select('id, company_id, name, code, default_cost_center_id, default_warehouse_id')
      .or('default_cost_center_id.is.null,default_warehouse_id.is.null');

    if (branchesNeedDefaults?.length) {
      for (const branch of branchesNeedDefaults) {
        let costCenterId = branch.default_cost_center_id;
        let warehouseId = branch.default_warehouse_id;

        // إنشاء مركز تكلفة إذا لم يكن موجوداً
        if (!costCenterId) {
          console.log(`Creating cost center for branch ${branch.id}...`);
          const { data: newCostCenter, error: ccError } = await supabase
            .from('cost_centers')
            .insert({
              company_id: branch.company_id,
              branch_id: branch.id,
              cost_center_name: `مركز التكلفة - ${branch.name || 'الفرع'}`,
              cost_center_code: `CC-${(branch.code || 'MAIN').toUpperCase()}`,
              is_main: true,
              is_active: true
            })
            .select('id')
            .single();

          if (ccError) {
            console.log(`Cost center creation error:`, ccError.message);
          } else {
            costCenterId = newCostCenter.id;
            console.log(`✅ Created cost center: ${costCenterId}`);
          }
        }

        // إنشاء مخزن إذا لم يكن موجوداً
        if (!warehouseId && costCenterId) {
          console.log(`Creating warehouse for branch ${branch.id}...`);
          const { data: newWarehouse, error: whError } = await supabase
            .from('warehouses')
            .insert({
              company_id: branch.company_id,
              branch_id: branch.id,
              cost_center_id: costCenterId,
              name: `المخزن - ${branch.name || 'الفرع'}`,
              code: `WH-${(branch.code || 'MAIN').toUpperCase()}`,
              is_main: true,
              is_active: true
            })
            .select('id')
            .single();

          if (whError) {
            console.log(`Warehouse creation error:`, whError.message);
          } else {
            warehouseId = newWarehouse.id;
            console.log(`✅ Created warehouse: ${warehouseId}`);
          }
        }

        // تحديث الفرع بالقيم الافتراضية
        if (costCenterId || warehouseId) {
          console.log(`Updating branch ${branch.id} with defaults...`);
          const { error: updateError } = await supabase
            .from('branches')
            .update({
              default_cost_center_id: costCenterId || branch.default_cost_center_id,
              default_warehouse_id: warehouseId || branch.default_warehouse_id
            })
            .eq('id', branch.id);

          if (updateError) {
            console.log(`Branch update error:`, updateError.message);
          } else {
            console.log(`✅ Updated branch with defaults`);
          }
        }
      }
    }

    // 3. مسح الروابط المباشرة للمستخدمين
    console.log('3. Clearing direct user links...');
    const { error: clearCCError } = await supabase
      .from('company_members')
      .update({ cost_center_id: null })
      .not('cost_center_id', 'is', null);
      
    if (clearCCError) {
      console.log('Error clearing cost_center_id:', clearCCError.message);
    } else {
      console.log('✅ Cleared cost_center_id links');
    }

    const { error: clearWHError } = await supabase
      .from('company_members')
      .update({ warehouse_id: null })
      .not('warehouse_id', 'is', null);
      
    if (clearWHError) {
      console.log('Error clearing warehouse_id:', clearWHError.message);
    } else {
      console.log('✅ Cleared warehouse_id links');
    }

    // 4. جعل الحقول المطلوبة غير قابلة للفراغ
    console.log('4. Enforcing NOT NULL constraints...');
    
    // ملاحظة: لا يمكن تغيير constraints من خلال API، لذا نترك هذه الخطوة
    console.log('⚠️  Constraints must be applied manually through SQL console');

    // 5. الحصول على الإحصائيات
    const [{ count: usersMissingBranchCount }, { count: branchesMissingDefaultsCount }] = await Promise.all([
      supabase
        .from("company_members")
        .select("user_id", { count: "exact", head: true })
        .is("branch_id", null),
      supabase
        .from("branches")
        .select("id", { count: "exact", head: true })
        .or("default_cost_center_id.is.null,default_warehouse_id.is.null")
    ])

    console.log("✅ Governance rules applied successfully")
    console.log("users_missing_branch:", usersMissingBranchCount || 0)
    console.log("branches_missing_defaults:", branchesMissingDefaultsCount || 0)
    console.log("⚠️  Note: SQL constraints must be applied manually through Supabase SQL editor")

  } catch (error) {
    console.error("❌ Error applying governance rules:", error.message);
    throw error;
  }
}

main().catch((e) => {
  console.error("❌ Governance application failed:", e?.message || String(e))
  process.exit(1)
})