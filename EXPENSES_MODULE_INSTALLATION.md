# 📄 Expenses Module Installation Guide
# دليل تثبيت وحدة المصروفات

## ✅ What Has Been Created (ما تم إنشاؤه)

### 1. Database Scripts (سكريبتات قاعدة البيانات)
- ✅ `scripts/500_expenses_module.sql` - Database schema and tables
- ✅ `scripts/501_expenses_rls_policies.sql` - Row Level Security policies
- ✅ `scripts/502_expenses_permissions.sql` - Permissions setup

### 2. UI Pages (صفحات الواجهة)
- ✅ `app/expenses/page.tsx` - List page (صفحة القائمة)
- ✅ `app/expenses/new/page.tsx` - Create new expense (إنشاء مصروف جديد)
- ✅ `app/expenses/[id]/page.tsx` - View expense details (عرض التفاصيل)
- ✅ `app/expenses/[id]/edit/page.tsx` - Edit expense (تعديل المصروف)

### 3. Documentation (التوثيق)
- ✅ `app/expenses/README.md` - Module documentation
- ✅ `EXPENSES_MODULE_INSTALLATION.md` - This file

## 🚀 Installation Steps (خطوات التثبيت)

### Step 1: Run Database Scripts (تشغيل سكريبتات قاعدة البيانات)

Run the following scripts in order using Supabase SQL Editor or psql:

```bash
# 1. Create expenses table and functions
psql -h <your-db-host> -U postgres -d postgres -f scripts/500_expenses_module.sql

# 2. Apply Row Level Security policies
psql -h <your-db-host> -U postgres -d postgres -f scripts/501_expenses_rls_policies.sql

# 3. Setup permissions for all roles
psql -h <your-db-host> -U postgres -d postgres -f scripts/502_expenses_permissions.sql
```

**OR** using Supabase Dashboard:
1. Go to SQL Editor in Supabase Dashboard
2. Copy and paste the content of each script
3. Run them in order (500 → 501 → 502)

### Step 2: Verify Installation (التحقق من التثبيت)

Run this query to verify the expenses table was created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'expenses';
```

Expected result: Should return 1 row with `expenses`

### Step 3: Verify Permissions (التحقق من الصلاحيات)

Run this query to verify permissions were added:

```sql
SELECT r.role_name, p.resource, p.can_read, p.can_write, p.can_approve
FROM company_role_permissions p
JOIN company_roles r ON r.id = p.role_id
WHERE p.resource = 'expenses'
LIMIT 10;
```

Expected result: Should show permissions for different roles

### Step 4: Access the Module (الوصول للوحدة)

1. Navigate to your application: `http://localhost:3000/expenses`
2. You should see the expenses list page
3. Click "مصروف جديد" to create a new expense

## 🔐 Permissions Summary (ملخص الصلاحيات)

| Role | Create | Edit | Delete | Approve | View |
|------|--------|------|--------|---------|------|
| Owner | ✅ | ✅ | ✅ | ✅ | All branches |
| General Manager | ✅ | ✅ | ✅ | ✅ | All branches |
| Accountant | ✅ | ✅ (draft/rejected) | ❌ | ❌ | Own branch |
| Branch Manager | ✅ | ✅ (draft/rejected) | ❌ | ❌ | Own branch |
| Viewer | ❌ | ❌ | ❌ | ❌ | Own branch (read-only) |

## 📊 Workflow States (حالات دورة العمل)

1. **Draft** (مسودة) - Initial creation
2. **Pending Approval** (بانتظار الاعتماد) - Submitted for approval
3. **Approved** (معتمد) - Approved by Owner/GM
4. **Rejected** (مرفوض) - Rejected with reason
5. **Paid** (مدفوع) - Payment executed

## 🔔 Notifications (الإشعارات)

The module automatically sends notifications at these stages:

1. **Submit for Approval** → Notifies Owner and General Manager
2. **Approval** → Notifies creator
3. **Rejection** → Notifies creator with reason

## 🧪 Testing the Module (اختبار الوحدة)

### Test 1: Create an Expense
1. Login as Accountant or Branch Manager
2. Go to `/expenses`
3. Click "مصروف جديد"
4. Fill in the form:
   - Date: Today
   - Description: "Test Expense"
   - Amount: 1000
   - Category: "أخرى"
5. Click "حفظ"
6. Verify expense is created with status "مسودة"

### Test 2: Submit for Approval
1. Open the expense you created
2. Click "إرسال للاعتماد"
3. Verify status changes to "بانتظار الاعتماد"
4. Login as Owner or General Manager
5. Check notifications - should see approval request

### Test 3: Approve Expense
1. Login as Owner or General Manager
2. Go to `/expenses`
3. Open the pending expense
4. Click "اعتماد"
5. Verify status changes to "معتمد"
6. Login as the creator
7. Check notifications - should see approval notification

### Test 4: Reject Expense
1. Create another expense and submit for approval
2. Login as Owner or General Manager
3. Open the pending expense
4. Click "رفض"
5. Enter rejection reason: "Missing receipt"
6. Click "رفض المصروف"
7. Verify status changes to "مرفوض"
8. Login as creator
9. Check notifications - should see rejection with reason
10. Verify you can edit or delete the rejected expense

## 🔧 Troubleshooting (حل المشاكل)

### Problem: Cannot see expenses page
**Solution**: Check that you have the correct permissions:
```sql
SELECT * FROM company_role_permissions 
WHERE resource = 'expenses' 
AND role_id IN (
  SELECT id FROM company_roles 
  WHERE company_id = '<your-company-id>'
);
```

### Problem: Cannot create expense
**Solution**: Verify you have `can_write` permission:
```sql
SELECT r.role_name, p.can_write
FROM company_role_permissions p
JOIN company_roles r ON r.id = p.role_id
WHERE p.resource = 'expenses'
AND r.company_id = '<your-company-id>';
```

### Problem: Cannot approve expense
**Solution**: Only Owner and General Manager can approve. Check your role:
```sql
SELECT role FROM company_members 
WHERE user_id = auth.uid() 
AND company_id = '<your-company-id>';
```

## 📝 Next Steps (الخطوات التالية)

After installation, you may want to:

1. ✅ Customize expense categories in `app/expenses/new/page.tsx`
2. ✅ Add custom fields to the expenses table
3. ✅ Create expense reports and analytics
4. ✅ Integrate with accounting system for journal entries
5. ✅ Add attachment support for receipts

## 🎯 Features Included (المميزات المتضمنة)

- ✅ Multi-level support (Company/Branch/Cost Center/Warehouse)
- ✅ Full approval workflow with notifications
- ✅ Role-based permissions
- ✅ Data visibility control (branch isolation)
- ✅ Real-time updates
- ✅ Multi-currency support
- ✅ Expense categorization
- ✅ Payment method tracking
- ✅ Rejection with reason
- ✅ Edit after rejection
- ✅ Audit trail (created_by, approved_by, rejected_by)

## 📚 Additional Resources (مصادر إضافية)

- Module Documentation: `app/expenses/README.md`
- Database Schema: `scripts/500_expenses_module.sql`
- RLS Policies: `scripts/501_expenses_rls_policies.sql`
- Permissions: `scripts/502_expenses_permissions.sql`

## ✅ Installation Complete! (اكتمل التثبيت!)

Your Expenses Module is now ready to use. Navigate to `/expenses` to start managing your company expenses.

For support or questions, refer to the module documentation in `app/expenses/README.md`.

