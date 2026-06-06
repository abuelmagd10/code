# Shareholders Module — Roadmap & Gap Analysis

> **Status:** Authored at v3.74.68 (2026-06-06). This is a documentation-only artifact — **no code or schema changes ship with this file.** The audit was performed during the pre-launch hardening window; we deliberately chose not to touch live tables (`shareholders`, `capital_contributions`, `dividend_payments`, `shareholder_drawings`, `shareholder_percentage_history`) or the atomic RPCs that depend on them.
>
> **Owner:** ERB platform team. Update this file as priorities land.

---

## 1. What we have today

### Database (5 tables, all in production)

| Table | Columns | Purpose |
|---|---:|---|
| `shareholders` | 15 | Identity + ownership %, linked capital + drawings accounts, join/exit dates |
| `capital_contributions` | 7 | Lump-sum capital injections per shareholder |
| `dividend_payments` | 16 | Posted dividend payments queue |
| `shareholder_drawings` | 26 | Detailed drawings ledger |
| `shareholder_percentage_history` | 10 | Snapshot of % each time it changes |

### Core service & RPCs

- `lib/equity-transaction-service.ts` — `EquityTransactionService` with atomic operations.
- DB RPC `distribute_dividends_atomic` — single transaction that posts JE + writes `dividend_payments` rows + enforces governance (sum of shareholder splits = total).
- UI: `app/shareholders/page.tsx` (~1,707 lines, includes Tabs: list, distribution by %, payment queue).
- API: `app/api/shareholders/contributions/route.ts`.

### What works well

- Atomic dividend distribution — no torn writes.
- Per-shareholder auto-created capital and drawings accounts in the chart of accounts.
- Governance check that ownership percentages add up to 100% before allowing distribution.
- Percentage-change history preserved (`shareholder_percentage_history`).
- Sound base for SMBs with 2–5 founders and simple cash dividends.

---

## 2. Gap analysis vs enterprise ERPs (Oracle Fusion / SAP / NetSuite)

Each gap below is rated:

- **Severity** — Critical / High / Medium / Low
- **Compliance impact** — does shipping without it create a legal or tax risk?
- **Blast radius** — how many tables, RPCs, and pages get touched

### 2.1 Share economics

| # | Gap | Sev | Compliance | Blast radius |
|---|---|---|---|---|
| 1 | **Number of shares + nominal value** — ownership is stored as a percentage only, never as a count × par value | High | Limited Liability Company filings reference share count, not %. Mismatch with commercial register. | Schema: add `share_count`, `nominal_value` to `shareholders`. Migration to backfill from percentage. |
| 2 | **Share certificates** — no certificate number, issue date, signing director, or PDF artifact | High | Required by Egyptian Companies Law for joint-stock companies | New table `share_certificates`, PDF template, certificate counter per company |
| 3 | **Authorized vs Issued vs Outstanding** | Medium | Commercial register filings split these | New columns on `companies` + per-event tracking |
| 4 | **Share classes** — common / preferred / voting / non-voting / Class A/B | Medium | Not blocking SMBs; blocking for any startup that takes investment | New `share_classes` table; `shareholders` becomes a join through holdings |
| 5 | **Treasury shares** — company buying its own shares | Low | Rare in SMBs | Buyback ledger + treasury account |

### 2.2 Compliance and tax

| # | Gap | Sev | Compliance | Blast radius |
|---|---|---|---|---|
| 6 | **Withholding tax on dividends** — Egypt charges 10% on listed dividends, 5% on unlisted, with certificate issuance | Critical | **Filing the dividend gross without withholding is a tax violation.** Accountant currently has to manually adjust via journal entry. | Add `withholding_tax_rate`, `withholding_tax_amount`, `tax_certificate_number` to `dividend_payments`. Modify `distribute_dividends_atomic` JE to post 3 lines (net + tax + accrual) instead of 2. Add CoA template entry for the tax payable account. |
| 7 | **Statutory reserves** — 5% legal reserve until reaching 50% of capital, plus optional reserves | Critical | Companies Law mandates this before declaring dividends | New columns on `dividend_distributions` to record reserve allocations. Pre-distribution governance check refuses to distribute if legal reserve below threshold. |
| 8 | **Beneficial ownership (UBO)** — disclosure of natural persons behind corporate shareholders | High | FATCA, CRS, anti-money-laundering filings | New `beneficial_owners` table per `shareholders` row (where shareholder is an entity) |
| 9 | **Capital reduction** — formal court-approved process | Medium | Required by Companies Law when used | New workflow with multi-step approval |
| 10 | **Capital increase paths** — bonus issue (free), rights issue, private placement | Medium | Each has its own accounting + filing | Workflow per path + audit trail |

### 2.3 Governance & operations

| # | Gap | Sev | Compliance | Blast radius |
|---|---|---|---|---|
| 11 | **Cap Table point-in-time snapshot** | High | Investors and due-diligence reviewers ask for this | New `cap_table_snapshots` table, scheduled snapshot job |
| 12 | **Share transfer workflow** — formal transfer between shareholders with approval | High | Required for any change of ownership; current path is a manual % edit | New `share_transfers` table + approval workflow + percentage update transaction |
| 13 | **AGM / EGM meetings** — Annual / Extraordinary General Meeting records, minutes, resolutions, attendance, voting outcomes | Medium | Required by the Financial Regulatory Authority for joint-stock companies | New `shareholder_meetings` + `meeting_resolutions` + `attendance` tables |
| 14 | **Voting rights & ballots** — recording individual votes, computing outcomes | Low | Tied to AGM/EGM | Voting subsystem |
| 15 | **Vesting schedules** — for founder equity that vests over time | Low | Important for tech startups, irrelevant for established SMBs | New `vesting_schedules` table |

### 2.4 Reporting

| # | Gap | Sev | Compliance | Blast radius |
|---|---|---|---|---|
| 16 | **Statement of Changes in Equity** — one of the four primary financial statements | Critical | Required by Egyptian Accounting Standard 1 | New report aggregating `capital_contributions`, `dividend_payments`, retained earnings deltas, reserve movements |
| 17 | **Retained earnings tracking by type** — legal reserve, statutory, voluntary, retained | High | Tied to reserves rule above | New columns / aux table; report follow-up |
| 18 | **Per-shareholder annual statement** — like a 1099-DIV for the US | Medium | Useful for the shareholder's personal tax filing | Report generator |

### 2.5 Dividend mechanics

| # | Gap | Sev | Compliance | Blast radius |
|---|---|---|---|---|
| 19 | **Dividend types** — currently cash-only. Missing: stock dividend (bonus issue), property dividend, liquidating dividend, special dividend | Medium | Required if the company ever wants to issue anything other than cash | Type enum on `dividend_payments` + per-type accounting templates |
| 20 | **Dividend reinvestment plan (DRIP)** | Low | Nice-to-have | Optional feature |

---

## 3. Scorecard

Across these 20 gaps, where the current module sits today:

| Axis | Score | Notes |
|---|---:|---|
| Foundation (atomic + audit) | 8 / 10 | Solid base; transactions are safe |
| Cap Table sophistication | 3 / 10 | Percentage only |
| Share management | 1 / 10 | No certificates, no counts, no classes |
| Dividend management | 6 / 10 | Cash dividends work end to end |
| Tax & legal compliance | 2 / 10 | Withholding and reserves missing |
| Reporting | 5 / 10 | Basics covered; Statement of Changes in Equity missing |
| **Weighted average** | **4.2 / 10** | Fit for small SMBs; not yet enterprise-grade |

Fits today: small SMBs (2–5 founders, simple cash distributions).
Stretches today: medium companies that need formal share transfers or AGM minutes.
Does not fit today: joint-stock companies, tech startups raising rounds, IPO-bound businesses.

---

## 4. Recommended release sequence

Designed to ship one or two gaps per minor release, smallest blast radius first, so each one is independently testable and revertable.

### v3.75.x — Tax & legal compliance (~ 1 week)

Highest priority because **shipping without it is a known tax violation, not just a missing feature.**

- **v3.75.0** — Withholding tax on dividends (gap 6)
  - Schema: 3 new columns on `dividend_payments`.
  - RPC: rewrite `distribute_dividends_atomic` to post net + withholding + accrual.
  - CoA template: add the withholding tax payable account.
  - UI: rate selector (default 10% listed / 5% unlisted), tax certificate number generator.
  - Migration: backfill historical rows with `withholding_tax_rate = 0` and a flag explaining why.
- **v3.75.1** — Statutory reserves enforcement (gap 7)
  - Pre-distribution governance check that legal reserve has reached its threshold.
  - Auto-allocation of 5% of net profit to legal reserve before distribution is allowed.
  - UI: reserves widget on the shareholders page.
- **v3.75.2** — Statement of Changes in Equity report (gap 16)
  - New report under `/reports/equity-changes`.
  - Period selector, drill-through to capital contributions, dividends, retained earnings delta, reserve movements.

### v3.76.x — Share infrastructure (~ 1 week)

- **v3.76.0** — Number of shares + nominal value (gap 1)
  - Schema additions on `shareholders` + `companies`.
  - One-time backfill: `share_count = round(percentage × authorized_shares)`.
  - All distributions and reports start consuming the count alongside the percentage.
- **v3.76.1** — Share certificates (gap 2)
  - New `share_certificates` table.
  - PDF template with company seal placeholder and signatures.
  - Per-company certificate numbering.
- **v3.76.2** — Authorized vs Issued vs Outstanding (gap 3)
  - Columns on `companies` for authorized, computed views for issued and outstanding.

### v3.77.x — Operations & investor-facing (~ 1 week)

- **v3.77.0** — Share transfer workflow (gap 12)
  - New `share_transfers` table.
  - Multi-step approval (transferor + transferee + admin).
  - Percentage update happens in the same transaction as the certificate reissue.
- **v3.77.1** — Cap table snapshots (gap 11)
  - `cap_table_snapshots` table.
  - Manual snapshot button + scheduled daily snapshot.
  - Investor-facing snapshot export (PDF / Excel).
- **v3.77.2** — UBO disclosure (gap 8)
  - Required when a corporate entity is a shareholder.
  - FATCA / CRS export.

### v3.78.x — Governance & meetings (~ 2 weeks)

- AGM / EGM module (gap 13).
- Meeting minutes, resolutions, attendance, voting (gap 14).
- Capital increase paths (gap 10) and capital reduction workflow (gap 9).
- Dividend type expansion (gap 19).

### v3.79.x — Optional / startup-flavoured (~ 1 week)

- Share classes (gap 4).
- Vesting schedules (gap 15).
- Treasury shares (gap 5).
- Dividend reinvestment plan (gap 20).
- Per-shareholder annual statements (gap 18).

**Total realistic effort:** ~ 6 weeks of focused work, plus a few days of E2E governance regression for each release.

---

## 5. Sequencing rules learned the hard way

When v3.75.x lands, follow these to avoid breaking the live distribution path:

1. **Schema additions are nullable until backfilled.** Never `NOT NULL` a new column on `dividend_payments` without a default in the same migration.
2. **The atomic RPC is the only writer to `dividend_payments` and the journal.** Any new column added to that table must be set inside the RPC, never by the caller.
3. **CoA template additions need a backfill for existing companies.** Account 2155 was added in v3.74.28 — the same pattern applies for the withholding tax payable account.
4. **Touch one table per release.** Distinguish the "schema migration" release from the "behaviour change" release so a rollback is meaningful.
5. **Page rewrites use the Python anchor-script approach.** Edit tool truncated the shareholders page once already. For 1,700-line files, never use a single large Edit replacement.

---

## 6. Testing checklist for each release

- Happy path: distribute, pay, verify journal entries balance, verify per-shareholder ledger.
- Tax path (v3.75.0+): net + withholding + tax payable totals = gross.
- Reserve path (v3.75.1+): legal reserve below threshold blocks distribution with a clear UX message.
- Share transfer path (v3.77.0+): both sides reconciled, certificate reissued, percentage history updated atomically.
- Rollback drill: each migration ships with a tested down migration.

---

## 7. Open questions for the operator

These need the company owner's input before we build, not after:

- Which **withholding tax rate** applies — 10% (listed equivalent) or 5% (unlisted)? Egyptian Tax Authority rules suggest 10% for most SMBs.
- Are we modelling **Egyptian Limited Liability Companies (LLC)** only, or also **Joint-Stock Companies (JSC)**? Share certificates and AGM are only required for JSC.
- Are any of our pilot customers planning to **raise outside investment** in the next 12 months? If so, push share classes and cap table snapshots earlier.
- Do we need **multi-currency capital contributions**? Some founders inject USD into an EGP-functional company.

---

## 8. What ships from this audit today

Nothing. This file is the deliverable.

The next release (v3.75.0) is the first one that touches shareholder code. Until then, the current behaviour stands: cash dividends distribute correctly, percentages enforce 100%, certificates are not produced, withholding is recorded manually by the accountant via journal entry.

---

*Last updated: 2026-06-06 — v3.74.68 audit.*
