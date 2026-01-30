# 📄 Expenses Module (وحدة المصروفات)

## Overview (نظرة عامة)

وحدة المصروفات هي نظام احترافي لإدارة مصروفات الشركة على مستوى الشركة، الفرع، ومركز التكلفة. تتضمن دورة اعتماد كاملة، حوكمة قوية، وفصل صلاحيات واضح.

## Features (المميزات)

### ✅ Multi-Level Support
- 🏢 Company Level (مستوى الشركة)
- 🏬 Branch Level (مستوى الفرع)
- 🎯 Cost Center Level (مستوى مركز التكلفة)
- 🏭 Warehouse Level (مستوى المستودع)

### ✅ Approval Workflow (دورة الاعتماد)
- **Draft** (مسودة): Initial creation
- **Pending Approval** (بانتظار الاعتماد): Submitted for approval
- **Approved** (معتمد): Approved by Owner/General Manager
- **Rejected** (مرفوض): Rejected with reason
- **Paid** (مدفوع): Payment executed

### ✅ Permissions (الصلاحيات)

| Role | Create | Edit | Delete | Approve | View |
|------|--------|------|--------|---------|------|
| Owner | ✅ | ✅ | ✅ | ✅ | All |
| General Manager | ✅ | ✅ | ✅ | ✅ | All |
| Accountant | ✅ | ✅ (draft/rejected) | ❌ | ❌ | Branch |
| Branch Manager | ✅ | ✅ (draft/rejected) | ❌ | ❌ | Branch |
| Viewer | ❌ | ❌ | ❌ | ❌ | Branch |

### ✅ Governance Rules (قواعد الحوكمة)
1. Only **draft** or **rejected** expenses can be edited
2. Only **draft** or **rejected** expenses can be deleted
3. Any edit after rejection resets status to **draft**
4. Only **Owner** and **General Manager** can approve/reject
5. Rejection requires a reason
6. Notifications sent at each workflow stage

### ✅ Data Visibility (رؤية البيانات)
- **Owner/General Manager**: See all expenses across all branches
- **Accountant/Branch Manager**: See only their branch expenses
- **Viewer**: Read-only access to their branch

## File Structure (هيكل الملفات)

```
app/expenses/
├── page.tsx                    # List page (صفحة القائمة)
├── new/
│   └── page.tsx               # Create new expense (إنشاء مصروف جديد)
├── [id]/
│   ├── page.tsx               # View expense details (عرض التفاصيل)
│   └── edit/
│       └── page.tsx           # Edit expense (تعديل المصروف)
└── README.md                  # This file

scripts/
├── 500_expenses_module.sql           # Database schema
├── 501_expenses_rls_policies.sql     # Row Level Security policies
└── 502_expenses_permissions.sql      # Permissions setup
```

## Database Schema (قاعدة البيانات)

### Table: `expenses`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| company_id | UUID | Company reference |
| branch_id | UUID | Branch reference (optional) |
| cost_center_id | UUID | Cost center reference (optional) |
| warehouse_id | UUID | Warehouse reference (optional) |
| expense_number | TEXT | Auto-generated (EXP-YYYY-0001) |
| expense_date | DATE | Expense date |
| description | TEXT | Expense description |
| notes | TEXT | Additional notes |
| amount | NUMERIC | Expense amount |
| currency_code | TEXT | Currency (EGP, USD, etc.) |
| expense_category | TEXT | Category (رواتب، إيجار، etc.) |
| payment_method | TEXT | Payment method (cash, bank, etc.) |
| status | TEXT | Workflow status |
| approval_status | TEXT | Approval status |
| created_by | UUID | Creator user ID |
| approved_by | UUID | Approver user ID |
| approved_at | TIMESTAMP | Approval timestamp |
| rejected_by | UUID | Rejector user ID |
| rejected_at | TIMESTAMP | Rejection timestamp |
| rejection_reason | TEXT | Rejection reason |
| expense_account_id | UUID | Expense account reference |
| payment_account_id | UUID | Payment account reference |
| journal_entry_id | UUID | Journal entry reference |

## Workflow (دورة العمل)

```
┌─────────┐
│  Draft  │ ◄─── Initial creation
└────┬────┘
     │ Submit for Approval
     ▼
┌──────────────────┐
│ Pending Approval │ ◄─── Notification sent to Owner/GM
└────┬─────────────┘
     │
     ├─── Approve ──► ┌──────────┐
     │                │ Approved │ ◄─── Notification sent to creator
     │                └──────────┘
     │
     └─── Reject ───► ┌──────────┐
                      │ Rejected │ ◄─── Notification sent to creator with reason
                      └────┬─────┘
                           │
                           └─── Can edit/delete/resubmit
```

## Notifications (الإشعارات)

### 1. Submit for Approval
- **Recipients**: Owner, General Manager
- **Severity**: Warning
- **Category**: Approvals
- **Event Key**: `expense:{id}:pending_approval:{timestamp}`

### 2. Approval
- **Recipients**: Creator
- **Severity**: Info
- **Category**: Approvals
- **Event Key**: `expense:{id}:approved:{timestamp}`

### 3. Rejection
- **Recipients**: Creator
- **Severity**: Error
- **Category**: Approvals
- **Event Key**: `expense:{id}:rejected:{timestamp}`
- **Includes**: Rejection reason

## Installation (التثبيت)

1. Run database scripts in order:
```bash
psql -f scripts/500_expenses_module.sql
psql -f scripts/501_expenses_rls_policies.sql
psql -f scripts/502_expenses_permissions.sql
```

2. The UI pages are already created in `app/expenses/`

3. Access the module at `/expenses`

## Usage (الاستخدام)

### Creating an Expense
1. Navigate to `/expenses`
2. Click "مصروف جديد" (New Expense)
3. Fill in the form
4. Click "حفظ" (Save)
5. Expense is created with status **draft**

### Submitting for Approval
1. Open the expense
2. Click "إرسال للاعتماد" (Submit for Approval)
3. Notifications sent to Owner and General Manager

### Approving/Rejecting
1. Owner or General Manager opens the expense
2. Click "اعتماد" (Approve) or "رفض" (Reject)
3. If rejecting, provide a reason
4. Notification sent to creator

### After Rejection
1. Creator can edit the expense
2. Creator can delete the expense
3. Creator can resubmit for approval
4. Any edit resets status to **draft**

## Integration (التكامل)

### With Chart of Accounts
- Expense Account: Links to expense accounts in chart of accounts
- Payment Account: Links to cash/bank accounts

### With Journal Entries
- After approval, a journal entry can be created
- Debit: Expense Account
- Credit: Payment Account

### With Notifications System
- Uses `lib/governance-layer.ts` for notifications
- Event-based with idempotency keys
- Role-based routing

## Security (الأمان)

### Row Level Security (RLS)
- All queries filtered by company membership
- Branch-level isolation for non-admin users
- Creator-based edit/delete permissions

### API Security
- All mutations require authentication
- Permission checks on every action
- Audit trail for all changes

## Future Enhancements (تحسينات مستقبلية)

- [ ] Recurring expenses
- [ ] Expense reports and analytics
- [ ] Budget tracking and alerts
- [ ] Multi-currency exchange rate handling
- [ ] Attachment support (receipts, invoices)
- [ ] Expense categories management
- [ ] Payment integration
- [ ] Export to Excel/PDF

