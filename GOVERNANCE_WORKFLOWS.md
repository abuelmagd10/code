# 🔄 Governance Layer - Workflow Diagrams
# مخططات تدفق العمليات - نظام الحوكمة

**Version:** 1.0.0  
**Date:** 2026-01-09

---

## 1️⃣ Refund Request Workflow
## سير عمل طلب الاسترداد النقدي

```
┌─────────────────────────────────────────────────────────────────┐
│                    REFUND REQUEST WORKFLOW                       │
│                   سير عمل طلب الاسترداد النقدي                  │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   START      │
│   البداية    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Create Refund Request (DRAFT)                             │
│    إنشاء طلب استرداد (مسودة)                                 │
│    - Source: Sales Return / Purchase Return / Other          │
│    - Amount: Requested Amount                                │
│    - Reason: Required                                        │
│    - Creator: User ID                                        │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Submit for Approval                                       │
│    تقديم للموافقة                                            │
│    Status: DRAFT → PENDING_BRANCH_APPROVAL                   │
│    ✅ Notification sent to Branch Manager                    │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
         ┌─────┴─────┐
         │           │
         ▼           ▼
    ┌────────┐  ┌────────┐
    │ REJECT │  │APPROVE │
    │  رفض   │  │ موافقة │
    └────┬───┘  └───┬────┘
         │          │
         │          ▼
         │  ┌──────────────────────────────────────────────────┐
         │  │ 3. Branch Manager Approval                       │
         │  │    موافقة مدير الفرع                            │
         │  │    Status: PENDING_FINAL_APPROVAL                │
         │  │    - Can adjust amount (≤ requested)             │
         │  │    - Cannot approve own request                  │
         │  │    ✅ Notification sent to Owner                 │
         │  └──────────────┬───────────────────────────────────┘
         │                 │
         │                 ▼
         │           ┌─────┴─────┐
         │           │           │
         │           ▼           ▼
         │      ┌────────┐  ┌────────┐
         │      │ REJECT │  │APPROVE │
         │      │  رفض   │  │ موافقة │
         │      └────┬───┘  └───┬────┘
         │           │          │
         │           │          ▼
         │           │  ┌──────────────────────────────────────┐
         │           │  │ 4. Final Approval (Owner)            │
         │           │  │    الموافقة النهائية (المالك)        │
         │           │  │    Status: APPROVED                  │
         │           │  │    - Cannot approve own request      │
         │           │  │    ✅ Notification sent to Creator   │
         │           │  └──────────────┬───────────────────────┘
         │           │                 │
         │           │                 ▼
         │           │  ┌──────────────────────────────────────┐
         │           │  │ 5. Create Payment Voucher            │
         │           │  │    إنشاء سند الصرف                   │
         │           │  │    - Links to Refund Request         │
         │           │  │    - Amount ≤ Approved Amount        │
         │           │  │    - Status: EXECUTED                │
         │           │  └──────────────┬───────────────────────┘
         │           │                 │
         │           │                 ▼
         │           │         ┌──────────────┐
         │           │         │   SUCCESS    │
         │           │         │    نجح       │
         │           │         └──────────────┘
         │           │
         ▼           ▼
    ┌────────────────────┐
    │    REJECTED        │
    │     مرفوض          │
    │  - Reason logged   │
    │  - Notification    │
    └────────────────────┘
```

---

## 2️⃣ Customer Debit Note Workflow
## سير عمل إشعار مدين عميل

```
┌─────────────────────────────────────────────────────────────────┐
│              CUSTOMER DEBIT NOTE WORKFLOW                        │
│                سير عمل إشعار مدين عميل                          │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   START      │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Create Debit Note (DRAFT)                                │
│    إنشاء إشعار مدين (مسودة)                                 │
│    - Customer: Required                                      │
│    - Amount: Total Amount                                    │
│    - Reason: Required                                        │
│    ✅ Auto Notification to Manager                           │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Submit for Approval                                       │
│    تقديم للموافقة                                            │
│    Status: DRAFT → PENDING_APPROVAL                          │
│    ✅ Notification sent to Manager                           │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
         ┌─────┴─────┐
         │           │
         ▼           ▼
    ┌────────┐  ┌────────┐
    │ REJECT │  │APPROVE │
    └────┬───┘  └───┬────┘
         │          │
         │          ▼
         │  ┌──────────────────────────────────────────────────┐
         │  │ 3. Manager Approval                              │
         │  │    موافقة المدير                                 │
         │  │    Status: APPROVED                              │
         │  │    - Cannot approve own request                  │
         │  │    ✅ Notification sent to Creator               │
         │  └──────────────┬───────────────────────────────────┘
         │                 │
         │                 ▼
         │  ┌──────────────────────────────────────────────────┐
         │  │ 4. Apply to Invoice                              │
         │  │    تطبيق على الفاتورة                           │
         │  │    - Increases customer balance                  │
         │  │    - Updates invoice                             │
         │  │    - Status: EXECUTED                            │
         │  └──────────────┬───────────────────────────────────┘
         │                 │
         ▼                 ▼
    ┌────────┐      ┌──────────┐
    │REJECTED│      │ SUCCESS  │
    └────────┘      └──────────┘
```

---

## 3️⃣ Vendor Credit Workflow
## سير عمل إشعار دائن مورد

```
┌─────────────────────────────────────────────────────────────────┐
│                VENDOR CREDIT WORKFLOW                            │
│                 سير عمل إشعار دائن مورد                         │
└─────────────────────────────────────────────────────────────────┘

[Similar structure to Customer Debit Note]

1. Create Vendor Credit (DRAFT)
2. Submit for Approval → PENDING_APPROVAL
3. Manager Approval → APPROVED
4. Apply to Bill/Payment → EXECUTED
```

---

## 4️⃣ Notification Flow
## تدفق الإشعارات

```
┌─────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION FLOW                             │
│                      تدفق الإشعارات                             │
└─────────────────────────────────────────────────────────────────┘

Event Occurs
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│ Trigger Fires                                                │
│ - Customer Debit Note Created                                │
│ - Vendor Credit Created                                      │
│ - Refund Request Submitted                                   │
│ - Approval Request Created                                   │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ Create Notification                                          │
│ - Determine recipient (role/user)                            │
│ - Set priority based on amount/type                          │
│ - Link to source document                                    │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ User Receives Notification                                   │
│ - Status: UNREAD                                             │
│ - Shows in notification center                               │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ User Actions                                                 │
│ - Mark as Read                                               │
│ - Take Action (Approve/Reject)                               │
│ - Archive                                                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 5️⃣ Audit Trail Flow
## تدفق سجل التدقيق

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUDIT TRAIL FLOW                              │
│                    تدفق سجل التدقيق                             │
└─────────────────────────────────────────────────────────────────┘

Any Database Operation (INSERT/UPDATE/DELETE)
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│ Trigger: log_audit_trail()                                   │
│ - Captures OLD and NEW values                                │
│ - Identifies changed fields                                  │
│ - Records user, timestamp, IP                                │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ Insert into audit_trail                                      │
│ - action_type: create/update/delete                          │
│ - resource_type: table name                                  │
│ - resource_id: record ID                                     │
│ - old_values: JSONB                                          │
│ - new_values: JSONB                                          │
│ - changed_fields: TEXT[]                                     │
│ - is_deleted: FALSE (永久保存)                                │
└──────────────────────────────────────────────────────────────┘
```

---

**✅ All workflows are IFRS + SOX + Anti-Fraud Compliant**

**آخر تحديث:** 2026-01-09  
**الإصدار:** 1.0.0
