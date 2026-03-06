# 🔐 تقرير التحليل الأمني والمعماري الشامل
## ERP Authorization System Security & Architecture Audit Report

**التاريخ**: 2025-01-XX  
**النطاق**: نظام التخويل والصلاحيات في ERP VitaSlims  
**الهدف**: تحليل شامل للأمان والبنية المعمارية قبل تطبيق أي تحسينات

---

## 📋 جدول المحتويات

1. [Multi-Company Isolation](#1-multi-company-isolation)
2. [Enterprise Role-Based Access Control (RBAC)](#2-enterprise-role-based-access-control-rbac)
3. [Permission Leakage Prevention](#3-permission-leakage-prevention)
4. [Scalability Analysis](#4-scalability-analysis)
5. [Enterprise-Level Security Evaluation](#5-enterprise-level-security-evaluation)
6. [Security Risks & Vulnerabilities](#6-security-risks--vulnerabilities)
7. [Recommended Improvements](#7-recommended-improvements)

---

## 1️⃣ Multi-Company Isolation

### 1.1 Current Implementation

#### Database Schema Level

**Tables Structure:**
- **`companies`**: Contains `user_id` (owner) and `id` (company identifier)
- **`company_members`**: Links users to companies with roles
  - `company_id` (FK → companies.id)
  - `user_id` (FK → auth.users.id)
  - `role` (TEXT with CHECK constraint)
  - **Single Source of Truth** for role and branch assignment

**RLS Policies Pattern:**
```sql
-- Example from journal_entries RLS policy
USING (
  company_id IN (
    SELECT cm.company_id
    FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id
    FROM public.companies c
    WHERE c.user_id = auth.uid()
  )
)
```

**Key Observations:**
- ✅ RLS policies check both `company_members` membership AND ownership
- ✅ Most business tables have `company_id` column with NOT NULL constraint
- ✅ Foreign keys use `ON DELETE CASCADE` for company deletion

#### Application Layer

**Authorization Helpers:**
- **`lib/company-authorization.ts`**: Centralized authorization functions
  - `getCompanyMembership()`: Verifies membership in specific company
  - `canAccessCompany()`: Checks membership OR ownership
  - `getUserCompanies()`: Lists all companies user is member of

**API Security:**
- **`lib/api-security-enhanced.ts`**: `secureApiRequest()` function
  - Uses `getActiveCompanyId()` to get company (not from user input)
  - Calls `getCompanyMembership()` for membership verification
  - Returns `companyId` that is guaranteed to be user's company

**Example from `app/api/products/route.ts`:**
```typescript
const { user, companyId, member, error } = await secureApiRequest(req, {
  requireAuth: true,
  requireCompany: true,
  requirePermission: { resource: "products", action: "write" }
})

// companyId is automatically filtered - no user input
const productData = {
  ...body,
  company_id: companyId, // ✅ Enforced from system, not user input
}
```

### 1.2 Company ID Enforcement

**✅ Strengths:**
1. **`getActiveCompanyId()`** prevents accepting `companyId` from query parameters
2. **`secureApiRequest()`** always uses system-determined `companyId`
3. **All database queries** include `.eq("company_id", companyId)` filter
4. **RLS policies** provide database-level enforcement

**⚠️ Potential Issues:**
1. **`app/api/my-company/route.ts`** accepts `companyId` from query params (line 41):
   ```typescript
   let companyId = url.searchParams.get('companyId')
   ```
   - **Risk**: User could potentially access another company's data
   - **Mitigation**: Access is verified via `canAccessCompany()` (line 115)
   - **Status**: ⚠️ **ACCEPTABLE** - Access check prevents unauthorized access

2. **Some API routes** use `getActiveCompanyId()` directly without `secureApiRequest()`:
   - Example: `app/api/invoices/route.ts` (line 22)
   - **Risk**: Lower - still uses system-determined company
   - **Recommendation**: Standardize on `secureApiRequest()` for consistency

### 1.3 Cross-Company Access Prevention

**✅ Mechanisms in Place:**
1. **RLS Policies**: Database-level isolation
2. **Authorization Helpers**: Application-level checks
3. **No Direct Company ID Input**: Most APIs don't accept `companyId` from user

**✅ Verified Safe Patterns:**
- `secureApiRequest()` → `getActiveCompanyId()` → `getCompanyMembership()`
- All queries include `.eq("company_id", companyId)`
- RLS policies enforce at database level

**⚠️ Edge Cases:**
- **Ownership Bypass**: `canAccessCompany()` allows owners to access companies even without `company_members` entry
  - **Status**: ✅ **INTENTIONAL** - Owners should access their companies
  - **Risk**: Low - ownership is verified via `companies.user_id = userId`

---

## 2️⃣ Enterprise Role-Based Access Control (RBAC)

### 2.1 Role Definition

**Roles Defined:**
- **Upper Roles**: `["owner", "admin", "manager", "accountant"]`
- **Normal Roles**: `["staff", "viewer"]` and others
- **Source**: `lib/company-authorization.ts` (UPPER_ROLES constant)

**Role Storage:**
- **Primary**: `company_members.role` (Single Source of Truth)
- **CHECK Constraint**: `role IN ('owner','admin','manager','accountant','staff','viewer')`
- **Per-Company**: Each user can have different roles in different companies

### 2.2 Permission Mapping

**Permission Tables:**
1. **`company_role_permissions`**:
   - `company_id`, `role`, `resource`
   - `can_read`, `can_write`, `can_update`, `can_delete`
   - `all_access`, `allowed_actions` (JSON array)

2. **Hardcoded Permissions** (in `lib/api-security-enhanced.ts`):
   ```typescript
   const rolePermissions: Record<string, Record<string, string[]>> = {
     owner: { '*': ['read', 'write', 'delete', 'admin'] },
     admin: { '*': ['read', 'write', 'delete'] },
     manager: { ... },
     accountant: { ... },
     // ...
   }
   ```

**⚠️ Issue**: **Dual Permission Systems**
- Database-based (`company_role_permissions`)
- Code-based (hardcoded in `checkPermission()`)
- **Risk**: Inconsistency between systems
- **Impact**: Medium - Could lead to permission confusion

### 2.3 Role Checks in APIs

**Current Pattern:**
```typescript
// 1. Get membership
const authResult = await getCompanyMembership(supabase, user.id, companyId)

// 2. Check role
const { role, isUpperRole, isNormalRole } = authResult.membership

// 3. Apply restrictions
if (isNormalRole) {
  // Enforce branch/cost_center/warehouse restrictions
}
```

**✅ Strengths:**
- Roles are **per-company** (not global)
- Role checks use `company_members` (Single Source of Truth)
- Role isolation prevents cross-company privilege escalation

**⚠️ Weaknesses:**
1. **Permission Check Inconsistency**:
   - Some APIs use `secureApiRequest()` with `requirePermission`
   - Others use `checkPermission()` from `lib/authz.ts`
   - Some use hardcoded role checks

2. **Default Permissions**:
   - `lib/authz.ts` (line 280-286): Defaults to allow `read/write/update` if no permission record exists
   - **Risk**: New users might have unintended permissions
   - **Mitigation**: Delete requires explicit permission

---

## 3️⃣ Permission Leakage Prevention

### 3.1 Cross-Company Privilege Escalation

**✅ Current Protection:**
1. **`getCompanyMembership()`** always checks specific `companyId`:
   ```typescript
   .eq("company_id", companyId)
   .eq("user_id", userId)
   ```
   - **Result**: Role in Company B cannot be used for Company A

2. **Role Isolation**: Each company membership is independent
   - User with `admin` in Company A and `staff` in Company B
   - When accessing Company B, only `staff` role applies

3. **Authorization Helpers**: All use `companyId` parameter
   - No global role checks
   - All checks are company-specific

**✅ Verified Safe:**
- `app/products/page.tsx`: Uses `getCompanyMembership(supabase, user.id, companyId)`
- `app/api/products/route.ts`: Uses `secureApiRequest()` which enforces company-specific role
- `lib/api-security-enhanced.ts`: `getCompanyMembership()` is company-specific

### 3.2 Ownership Bypass Prevention

**Current Implementation:**
```typescript
// canAccessCompany() logic:
// 1. Check membership first
const membershipResult = await getCompanyMembership(supabase, userId, companyId)
if (membershipResult.authorized) return true

// 2. Check ownership (for owners without membership entry)
const { data: company } = await supabase
  .from("companies")
  .select("id")
  .eq("id", companyId)
  .eq("user_id", userId)
  .maybeSingle()

return !!company
```

**✅ Safe:**
- Ownership check is **company-specific** (`eq("id", companyId)`)
- Ownership doesn't bypass membership - it's a fallback
- RLS policies also check ownership separately

**⚠️ Potential Issue:**
- If a user owns Company A but is `staff` in Company B, they can still access Company A
- **Status**: ✅ **INTENTIONAL** - Owners should access their companies
- **Risk**: Low - Ownership is verified via database query

### 3.3 Authorization Logic Consistency

**✅ All Authorization Checks Use `company_members`:**
- `getCompanyMembership()`: ✅ Uses `company_members`
- `secureApiRequest()`: ✅ Uses `getCompanyMembership()`
- `checkPermission()`: ✅ Uses `company_members` for role lookup
- `canAccessCompany()`: ✅ Uses `getCompanyMembership()` first

**✅ No Bypass Mechanisms Found:**
- No direct role queries from other tables
- No global role checks
- All checks are company-scoped

---

## 4️⃣ Scalability Analysis

### 4.1 Current Architecture

**Authorization Flow:**
```
User Request
  ↓
secureApiRequest()
  ↓
getActiveCompanyId() → getCompanyMembership()
  ↓
Database Query: company_members WHERE company_id = X AND user_id = Y
  ↓
Permission Check: company_role_permissions WHERE company_id = X AND role = Z
```

**Database Queries per Request:**
1. `getActiveCompanyId()`: 1-2 queries (company_members + possibly companies)
2. `getCompanyMembership()`: 1 query (company_members)
3. `checkPermission()`: 1 query (company_role_permissions)
4. **Total**: 3-4 queries per API request

### 4.2 Scalability Concerns

**⚠️ Performance Issues:**

1. **Multiple Database Queries**:
   - Each API request makes 3-4 separate queries
   - No batching or caching at authorization level
   - **Impact**: High latency with many concurrent users

2. **Permission Cache**:
   - `lib/authz.ts` has in-memory cache (line 59-60)
   - TTL: 60 seconds
   - **Issue**: Cache is per-process, not shared across instances
   - **Impact**: Inefficient in multi-instance deployments

3. **No Index Optimization**:
   - `company_members` has indexes on `company_id`, `user_id`, `role`
   - But queries often filter by both `company_id` AND `user_id`
   - **Recommendation**: Composite index on `(company_id, user_id)`

4. **RLS Policy Performance**:
   - RLS policies use subqueries for each row
   - Pattern: `EXISTS (SELECT 1 FROM company_members ...)`
   - **Impact**: Can be slow with large datasets

### 4.3 Scalability for Future Growth

**Current Capacity Estimates:**
- **Companies**: ✅ Can handle hundreds (RLS policies scale)
- **Users per Company**: ⚠️ May struggle with 1000+ users (RLS subquery overhead)
- **Total Users**: ✅ Can handle thousands (indexed queries)
- **Complex Role Hierarchies**: ⚠️ Limited (flat role structure, no inheritance)

**⚠️ Limitations:**

1. **No Role Inheritance**:
   - Roles are flat (no parent-child relationships)
   - Cannot define "Manager inherits from Staff"
   - **Impact**: Must duplicate permissions for similar roles

2. **No Permission Templates**:
   - Each company must configure permissions manually
   - No default permission sets
   - **Impact**: High setup overhead for new companies

3. **No Hierarchical Permissions**:
   - Cannot grant "all products" - must grant per resource
   - No wildcard permissions beyond `all_access`
   - **Impact**: Complex permission management

4. **Single Permission Source Confusion**:
   - Database permissions (`company_role_permissions`)
   - Code permissions (hardcoded in `checkPermission()`)
   - **Impact**: Maintenance complexity, potential inconsistencies

---

## 5️⃣ Enterprise-Level Security Evaluation

### 5.1 Centralized Authorization Helpers

**✅ Strengths:**
1. **`lib/company-authorization.ts`**: Single source for membership checks
2. **`lib/api-security-enhanced.ts`**: Unified API security middleware
3. **Consistent Patterns**: Most APIs use `secureApiRequest()`

**⚠️ Weaknesses:**
1. **Not All APIs Use Helpers**:
   - `app/api/invoices/route.ts`: Uses `getActiveCompanyId()` directly
   - `app/api/sales-orders/route.ts`: Uses `enforceGovernance()` (different pattern)
   - **Impact**: Inconsistent security patterns

2. **Multiple Authorization Systems**:
   - `lib/api-security.ts`: Older system (still used in some places)
   - `lib/api-security-enhanced.ts`: Newer system
   - `lib/company-authorization.ts`: Latest system
   - **Impact**: Confusion, potential security gaps

### 5.2 Backend Enforcement

**✅ Database Level:**
- RLS policies enforce company isolation
- Foreign key constraints prevent orphaned data
- CHECK constraints validate role values

**✅ Application Level:**
- `secureApiRequest()` enforces authentication and membership
- `getCompanyMembership()` verifies company-specific role
- Permission checks prevent unauthorized actions

**⚠️ Gaps:**
1. **Some APIs Bypass `secureApiRequest()`**:
   - Direct `getActiveCompanyId()` calls
   - Manual membership checks
   - **Risk**: Inconsistent enforcement

2. **Frontend-Only Restrictions**:
   - Some UI restrictions not enforced in backend
   - Example: Branch selection disabled for normal roles (frontend only)
   - **Mitigation**: Backend validates in `app/api/products/route.ts` (line 40-69)
   - **Status**: ✅ **PROTECTED** - Backend enforces restrictions

### 5.3 Authorization Bypass Prevention

**✅ Mechanisms:**
1. **No User-Provided Company ID**: `getActiveCompanyId()` uses system state
2. **Membership Verification**: Always checks `company_members` table
3. **RLS Policies**: Database-level enforcement as last line of defense

**✅ Verified Safe:**
- Cannot bypass by manipulating API requests
- Cannot access other companies by changing `companyId` in request
- Cannot escalate privileges by changing role in request

**⚠️ Potential Vulnerabilities:**
1. **Cookie/Storage Manipulation**:
   - `active_company_id` stored in localStorage/cookies
   - **Risk**: User could modify cookie to access different company
   - **Mitigation**: `canAccessCompany()` verifies access before using companyId
   - **Status**: ✅ **PROTECTED** - Access is verified

2. **Race Conditions**:
   - If user changes company between `getActiveCompanyId()` and query
   - **Risk**: Low - Each request is independent
   - **Mitigation**: RLS policies provide final check

### 5.4 Consistency Across API Routes

**✅ Consistent Patterns:**
- Most APIs use `secureApiRequest()`
- All queries include `.eq("company_id", companyId)`
- Role checks use `company_members` table

**⚠️ Inconsistencies:**
1. **Different Authorization Patterns**:
   - `secureApiRequest()` (new)
   - `secureApiRequest()` from `lib/api-security.ts` (old)
   - `enforceGovernance()` (alternative)
   - Direct `getActiveCompanyId()` (minimal)

2. **Permission Check Methods**:
   - `requirePermission` in `secureApiRequest()`
   - `checkPermission()` from `lib/authz.ts`
   - Hardcoded role checks

**Recommendation**: Standardize on single authorization pattern

---

## 6️⃣ Security Risks & Vulnerabilities

### 6.1 Critical Risks

**🔴 HIGH RISK: None Identified**

All critical security mechanisms are in place:
- ✅ Company isolation enforced
- ✅ Role-based access control implemented
- ✅ Cross-company privilege escalation prevented
- ✅ Backend validation present

### 6.2 Medium Risks

**🟡 MEDIUM RISK 1: Dual Permission Systems**

**Issue**: Two permission systems exist:
1. Database: `company_role_permissions` table
2. Code: Hardcoded in `checkPermission()` function

**Impact**:
- Potential inconsistencies
- Maintenance complexity
- Confusion about which system takes precedence

**Location**: `lib/api-security-enhanced.ts` (line 158-195), `lib/authz.ts` (line 270-308)

**Recommendation**: Consolidate to single permission source

---

**🟡 MEDIUM RISK 2: Inconsistent Authorization Patterns**

**Issue**: Multiple authorization systems used across codebase:
- `lib/api-security.ts` (older)
- `lib/api-security-enhanced.ts` (newer)
- `lib/company-authorization.ts` (latest)
- Direct `getActiveCompanyId()` calls

**Impact**:
- Inconsistent security enforcement
- Potential security gaps in older patterns
- Maintenance burden

**Recommendation**: Migrate all APIs to use `secureApiRequest()` from `lib/api-security-enhanced.ts`

---

**🟡 MEDIUM RISK 3: Default Permissions**

**Issue**: `lib/authz.ts` defaults to allow `read/write/update` if no permission record exists (line 280-286)

**Impact**:
- New users might have unintended permissions
- Companies without configured permissions have open access

**Mitigation**: Delete requires explicit permission

**Recommendation**: Default to deny, require explicit permission grants

---

### 6.3 Low Risks

**🟢 LOW RISK 1: Performance with Scale**

**Issue**: Multiple queries per request, RLS subquery overhead

**Impact**: Slower response times with many users

**Recommendation**: Optimize queries, add caching, use composite indexes

---

**🟢 LOW RISK 2: Cookie/Storage Manipulation**

**Issue**: `active_company_id` in localStorage/cookies

**Impact**: User could modify, but access is verified

**Status**: ✅ **PROTECTED** - `canAccessCompany()` verifies access

---

## 7️⃣ Recommended Improvements

### 7.1 Immediate Actions (High Priority)

1. **Consolidate Permission Systems**
   - Remove hardcoded permissions from `checkPermission()`
   - Use only `company_role_permissions` table
   - Create migration script to populate permissions for existing companies

2. **Standardize Authorization Pattern**
   - Migrate all APIs to use `secureApiRequest()` from `lib/api-security-enhanced.ts`
   - Deprecate `lib/api-security.ts`
   - Update documentation

3. **Change Default Permission Behavior**
   - Default to deny if no permission record exists
   - Require explicit permission grants
   - Update `lib/authz.ts` (line 280-286)

### 7.2 Short-Term Improvements (Medium Priority)

4. **Optimize Database Queries**
   - Add composite index on `company_members(company_id, user_id)`
   - Batch authorization queries where possible
   - Implement shared permission cache (Redis)

5. **Enhance RLS Policies**
   - Optimize subqueries in RLS policies
   - Consider materialized views for membership checks
   - Add indexes for RLS policy performance

6. **Improve Error Handling**
   - Consistent error messages across all authorization failures
   - Log security violations for audit
   - Return appropriate HTTP status codes

### 7.3 Long-Term Enhancements (Low Priority)

7. **Role Inheritance System**
   - Implement parent-child role relationships
   - Allow "Manager inherits from Staff" patterns
   - Reduce permission duplication

8. **Permission Templates**
   - Create default permission sets for common roles
   - Allow companies to customize from templates
   - Reduce setup overhead

9. **Hierarchical Permissions**
   - Support wildcard permissions (e.g., "products.*")
   - Implement permission groups
   - Simplify permission management

10. **Audit & Monitoring**
    - Log all authorization checks
    - Monitor for suspicious access patterns
    - Alert on privilege escalation attempts

---

## 📊 Summary

### ✅ Strengths

1. **Strong Company Isolation**: RLS policies + application checks
2. **Per-Company Roles**: No cross-company privilege escalation
3. **Centralized Helpers**: `lib/company-authorization.ts` provides Single Source of Truth
4. **Backend Enforcement**: Critical operations validated server-side
5. **No Critical Vulnerabilities**: All major security mechanisms in place

### ⚠️ Areas for Improvement

1. **Permission System Consolidation**: Remove dual systems
2. **Authorization Pattern Standardization**: Migrate to single pattern
3. **Default Permission Behavior**: Change to deny-by-default
4. **Performance Optimization**: Reduce query overhead
5. **Documentation**: Improve security documentation

### 🎯 Overall Assessment

**Security Level**: ✅ **STRONG**  
**Architecture Quality**: ✅ **GOOD** (with room for improvement)  
**Scalability**: ⚠️ **ADEQUATE** (needs optimization for large scale)  
**Enterprise Readiness**: ✅ **READY** (with recommended improvements)

---

## 📝 Conclusion

The current authorization system demonstrates **strong security fundamentals** with proper company isolation, role-based access control, and backend enforcement. The architecture is **well-designed** with centralized helpers and consistent patterns.

**Key Recommendations:**
1. Consolidate permission systems (high priority)
2. Standardize authorization patterns (high priority)
3. Optimize for scale (medium priority)
4. Enhance documentation (medium priority)

The system is **production-ready** but would benefit from the recommended improvements to achieve **enterprise-grade excellence**.

---

**Report Generated**: 2025-01-XX  
**Next Review**: After implementing high-priority recommendations
