# Knowledge Base Index

This directory is the project Single Source of Truth for AI assistants and engineers. Read `ai-context.md` first before editing code.

## Start Here

1. `knowledge/ai-context.md` — mandatory pre-code context.
2. `knowledge/ai-memory.md` — high-signal memory and reading order.
3. `knowledge/project-overview.md` — product, stack, modules, deployment.
4. `knowledge/architecture.md` — system architecture and boundaries.
5. `knowledge/security.md` — auth, RBAC, known gaps.
6. `knowledge/business-rules.md` — consolidated business rules across all modules.
7. `knowledge/rbac-permissions-sod.md` — roles, permission matrix, separation-of-duties.
8. `knowledge/database/` — tables, relationships, functions, triggers, RLS, migrations, ER diagram.
9. `knowledge/modules/` — module deep dives and module map.
10. `knowledge/workflows/` — Mermaid workflow descriptions.
11. `knowledge/api/routes.md` — generated API route catalog.
12. `knowledge/decisions/` — architecture decisions.

## Maintenance

Run:

```bash
node scripts/update-knowledge-base.js
```

Then review generated changes manually. The script indexes code; it does not replace human verification of business rules.
