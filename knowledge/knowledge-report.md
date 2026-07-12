# Knowledge Report

Generated on 2026-07-12.

## Completion Estimate

Approximate completion: 93% (was 88%).

Why not 100%: the repo contains hundreds of migrations and routes; several docs honestly mark production-applied RPC bodies and some legacy maintenance endpoint guards as needing confirmation.

## 2026-07-12 Verification & Corrections (independent review)

A second independent audit cross-checked the knowledge base against the actual code. Findings and fixes:

- **Verified genuine:** the knowledge base is real, project-specific extraction (real table/column names, real file:line citations, real migration filenames, matching `APP_VERSION 3.74.610`) — not generic or hallucinated content. Ground-truth counts confirmed: 549 migrations, 438 `route.ts` files, 222 pages, ~230 tables.
- **Fixed:** `modules/accounting.md` named two non-existent tables — `depreciation_entries` → corrected to `depreciation_schedules`; `shareholder_contributions` → corrected to `capital_contributions` (verified against migrations).
- **Added:** `knowledge/business-rules.md` — the previously-missing consolidated business-rules file (Phase requirement), aggregating rules across all 15 modules.
- **Added:** `knowledge/rbac-permissions-sod.md` — roles, the default permission seed matrix, and 10 code-enforced separation-of-duties rules with file citations.
- **Confirmed correct:** `/api/trial-balance/route.ts` does exist (earlier flagged as questionable — it is real).

## Files Created Or Updated By The Knowledge Update Script

- `knowledge/index.md`
- `knowledge/ai-memory.md`
- `knowledge/api/routes.md`
- `knowledge/api/pages.md`
- `knowledge/modules/module-map.md`
- `knowledge/database/migration-inventory.md`
- `knowledge/diagrams/system-context.md`
- `knowledge/diagrams/authorization.md`
- `knowledge/diagrams/accounting-inventory.md`
- `knowledge/workflows/authentication.md`
- `knowledge/workflows/authorization.md`
- `knowledge/workflows/payment-workflow.md`
- `knowledge/workflows/approval-workflow.md`
- `knowledge/decisions/ADR-0001-database-enforces-business-rules.md`
- `knowledge/decisions/ADR-0002-posted-documents-are-reversed-not-edited.md`
- `knowledge/decisions/ADR-0003-arabic-first-bilingual-ui.md`
- `knowledge/decisions/ADR-0004-release-version-is-lib-version.md`
- `knowledge/roadmap.md`
- `knowledge/troubleshooting.md`
- `knowledge/faq.md`
- `knowledge/changelog.md`

## Existing High-Value Files

- Core: `project-overview.md`, `architecture.md`, `folder-structure.md`, `coding-standards.md`, `conventions.md`, `design-patterns.md`, `dependencies.md`, `glossary.md`, `security.md`, `ai-context.md`.
- Database: `tables.md`, `relationships.md`, `functions.md`, `triggers.md`, `rls.md`, `views.md`, `indexes-constraints.md`, `er-diagram.md`, `cron-jobs.md`.
- Modules: sales, purchases, inventory, accounting, manufacturing, notifications, reports, approvals, bookings/services, HR/payroll, billing/SaaS, AI copilot, backup/restore, intercompany/consolidation, security/access, settings/governance, shipping/delivery.
- Workflows: sales cycle, purchase cycle, inventory cycle, booking cycle, accounting, plus generated auth/authorization/payment/approval.

## Missing Or Needs Confirmation

- Default company permission seed matrix from the **live** database (the code-default seed is now documented in `rbac-permissions-sod.md`; live per-company customizations are not mirrored).
- Complete SoD matrix across every approval and payment workflow (10 confirmed rules are documented in `rbac-permissions-sod.md`; a full sweep of all workflows is still pending).
- Exact bodies for RPCs referenced by code but not fully mirrored in migrations (supplier-payment approval, PO-approval GM-only are comment-only mirrors — recommend mirroring live RPC bodies into `supabase/migrations/`).
- Guard audit for every legacy maintenance endpoint.
- Any new modules not listed in `knowledge/modules/module-map.md`.

## Maintenance Plan

1. Run `node scripts/update-knowledge-base.js` after adding API routes, pages, migrations, modules, env vars, or workflows.
2. Manually update the relevant deep-dive module file with business rules and edge cases.
3. Mirror all production DB changes in `supabase/migrations/`.
4. Add an ADR when a durable architectural/security/data decision is made.
5. Review `knowledge/knowledge-report.md` before each release and reduce the missing-information list.
