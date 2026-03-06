# ✅ Security Verification Checklist
## ERP Authorization System - Post-Implementation Verification

**Date**: 2025-01-XX  
**Status**: Ready for Verification

---

## 📋 Pre-Verification Checklist

Before running security tests, ensure:

- [ ] Database indexes have been applied (`scripts/security_improvements_indexes.sql`)
- [ ] Code changes have been deployed
- [ ] Test environment is available
- [ ] Test users with different roles are created

---

## 1️⃣ Database Layer Verification

### Test 1.1: RLS Policies

**Command:**
```sql
-- Run: scripts/security_tests.sql (Test 1)
```

**Expected Results:**
- ✅ All business tables have RLS policies
- ✅ Policies check `company_members` or `companies.user_id`
- ✅ No unrestricted SELECT policies

**Status**: ⬜ Not Tested

---

### Test 1.2: Company Isolation

**Command:**
```sql
-- Run: scripts/security_tests.sql (Test 2)
```

**Expected Results:**
- ✅ All SELECT policies use company isolation
- ✅ Policies prevent cross-company access

**Status**: ⬜ Not Tested

---

### Test 1.3: Indexes

**Command:**
```sql
-- Run: scripts/security_tests.sql (Test 3)
```

**Expected Results:**
- ✅ `idx_company_members_company_user` exists
- ✅ `idx_company_role_permissions_company_role_resource` exists
- ✅ `idx_companies_id_user` exists

**Status**: ⬜ Not Tested

---

### Test 1.4: Constraints

**Command:**
```sql
-- Run: scripts/security_tests.sql (Tests 4, 5, 6)
```

**Expected Results:**
- ✅ All `company_id` columns are NOT NULL
- ✅ All `company_id` columns have foreign keys
- ✅ Role columns have CHECK constraints

**Status**: ⬜ Not Tested

---

## 2️⃣ Application Layer Verification

### Test 2.1: Cross-Company Access Prevention

**Scenario:**
1. User A is member of Company A (role: `staff`)
2. User A attempts to access Company B data via API

**Test Steps:**
```bash
# 1. Login as User A
# 2. Set active_company_id to Company B (via cookie manipulation)
# 3. Attempt to access /api/products
```

**Expected Result:**
- ❌ **ACCESS DENIED** (403 Forbidden)
- Error message: "You are not a member of this company"

**Status**: ⬜ Not Tested

---

### Test 2.2: Role Escalation Prevention

**Scenario:**
1. User with `staff` role in Company A
2. User attempts to perform `admin` operation

**Test Steps:**
```bash
# 1. Login as staff user
# 2. Attempt to delete a product (requires admin permission)
# 3. Attempt to invite a user (requires admin permission)
```

**Expected Result:**
- ❌ **PERMISSION DENIED** (403 Forbidden)
- Error message: "Insufficient permissions"

**Status**: ⬜ Not Tested

---

### Test 2.3: Default Permission Behavior (DENY)

**Scenario:**
1. Create new user with role `staff`
2. No permission records exist for this role
3. User attempts to access any resource

**Test Steps:**
```bash
# 1. Create test user with staff role
# 2. Ensure no permission records in company_role_permissions
# 3. Attempt to access /api/products
```

**Expected Result:**
- ❌ **PERMISSION DENIED** (403 Forbidden)
- Error message: "Insufficient permissions"
- Console warning: `[AUTHZ] No permission record found`

**Status**: ⬜ Not Tested

---

### Test 2.4: Cookie Manipulation Protection

**Scenario:**
1. User A is member of Company A
2. User manually modifies `active_company_id` cookie to Company B
3. User attempts to access Company B data

**Test Steps:**
```bash
# 1. Login as User A (Company A)
# 2. Open browser DevTools
# 3. Modify localStorage: active_company_id = Company B ID
# 4. Attempt to access /api/products
```

**Expected Result:**
- ❌ **ACCESS DENIED** (403 Forbidden)
- `canAccessCompany()` verifies membership before allowing access

**Status**: ⬜ Not Tested

---

## 3️⃣ Permission System Verification

### Test 3.1: Database-Only Permissions

**Scenario:**
1. Check that hardcoded permissions are removed
2. Verify permissions come from database only

**Test Steps:**
```bash
# 1. Check lib/api-security-enhanced.ts
# 2. Verify no hardcoded rolePermissions object
# 3. Verify checkPermission() uses lib/authz.ts
```

**Expected Result:**
- ✅ No hardcoded permissions in code
- ✅ All permissions queried from `company_role_permissions`

**Status**: ✅ **VERIFIED** (Code Review)

---

### Test 3.2: Permission Grant/Revoke

**Scenario:**
1. Grant permission to user
2. Verify access is granted
3. Revoke permission
4. Verify access is denied

**Test Steps:**
```sql
-- 1. Grant permission
INSERT INTO company_role_permissions (company_id, role, resource, can_read, can_write)
VALUES ('company-id', 'staff', 'products', true, true);

-- 2. Test API access (should succeed)

-- 3. Revoke permission
UPDATE company_role_permissions
SET can_read = false, can_write = false
WHERE company_id = 'company-id' AND role = 'staff' AND resource = 'products';

-- 4. Test API access (should fail)
```

**Expected Result:**
- ✅ Access granted when permission exists
- ✅ Access denied when permission revoked

**Status**: ⬜ Not Tested

---

## 4️⃣ Performance Verification

### Test 4.1: Index Performance

**Scenario:**
1. Measure query time before indexes
2. Apply indexes
3. Measure query time after indexes

**Test Steps:**
```sql
-- Before indexes
EXPLAIN ANALYZE
SELECT * FROM company_members
WHERE company_id = 'xxx' AND user_id = 'yyy';

-- After indexes
EXPLAIN ANALYZE
SELECT * FROM company_members
WHERE company_id = 'xxx' AND user_id = 'yyy';
```

**Expected Result:**
- ✅ Index scan used (not sequential scan)
- ✅ Query time reduced by 50-80%

**Status**: ⬜ Not Tested

---

## 5️⃣ Integration Tests

### Test 5.1: Full Authorization Flow

**Scenario:**
1. User makes API request
2. Verify complete authorization chain

**Test Flow:**
```
User Request
  ↓
secureApiRequest()
  ↓
getActiveCompanyId()
  ↓
getCompanyMembership()
  ↓
checkPermission() → company_role_permissions
  ↓
Database Query with company_id filter
```

**Expected Result:**
- ✅ All steps execute successfully
- ✅ No security bypass possible

**Status**: ⬜ Not Tested

---

## 📊 Test Results Summary

| Test Category | Tests | Passed | Failed | Not Tested |
|--------------|-------|--------|--------|------------|
| Database Layer | 4 | ⬜ | ⬜ | 4 |
| Application Layer | 4 | ⬜ | ⬜ | 4 |
| Permission System | 2 | 1 | ⬜ | 1 |
| Performance | 1 | ⬜ | ⬜ | 1 |
| Integration | 1 | ⬜ | ⬜ | 1 |
| **Total** | **12** | **1** | **⬜** | **11** |

---

## 🎯 Next Steps

1. **Run Database Tests**:
   ```bash
   psql < scripts/security_tests.sql
   ```

2. **Run Application Tests**:
   - Manual testing via browser/Postman
   - Automated testing (if test suite exists)

3. **Document Results**:
   - Update this checklist with test results
   - Document any issues found
   - Create follow-up tasks for fixes

---

**Checklist Status**: ⬜ **READY FOR TESTING**  
**Last Updated**: 2025-01-XX
