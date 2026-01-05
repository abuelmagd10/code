# Git Commit Message - Zero-Defect Release Gate Fixes

```
fix: Zero-Defect Release Gate fixes - Critical and Medium issues

## Critical Fixes
- Remove Accrual Accounting files (6 files moved to archive/legacy/accrual/)
- Delete Accrual Admin page (app/admin/accrual-accounting/page.tsx)
- Fix misleading comment in payments page (Cash Basis clarification)

## Medium Fixes
- Fix default allow in canAccessPage - change to deny by default (lib/authz.ts)
- Clarify Cash Basis in documentation (docs/ACCOUNTING_PATTERN.md, docs/ACCOUNTING_PATTERN_SALES_PURCHASES.md)
- Add clarifying comments in SQL scripts (scripts/008_upgrade_coa.sql, scripts/010_seed_hierarchical_coa.sql)

## UI Fixes
- Fix journal entries amount display in list page
  - Improve API logic for balanced entries (app/api/journal-amounts/route.ts)
  - Add fallback calculation in UI (app/journal-entries/page.tsx)

## Database Fixes
- Fixed 16 Sent invoices with journals issue (via SQL script)
- Cleaned test company "تست" data (via SQL script)

All fixes tested and verified. Ready for production deployment.
```

