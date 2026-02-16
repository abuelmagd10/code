# Standard ERP Print System - Governance & Specifications

> [!IMPORTANT]
> This document defines the MANDATORY standards for all printed documents (Invoices, Reports, Receipts) in the ERB VitaSlims system.
> **DO NOT DEVIATE** from these specifications without strict approval and system-wide testing.

## 1. Core Principles
1.  **Uniformity**: All documents must use the `lib/print-utils.ts` engine. Custom `window.print()` calls are strictly forbidden.
2.  **A4 Compliance**: The layout is hard-coded for A4 paper size with specific margins.
3.  **Print = PDF**: The HTML generated for printing MUST be identical to the HTML used for PDF generation.
4.  **No "Magic" Styling**: All styling must be controlled via the central CSS in `print-utils.ts` or the authorized utility classes.

## 2. Technical Specifications

### Page & Margins
- **Size**: A4
- **Margins**: `18mm 15mm 18mm 15mm` (Top, Right, Bottom, Left)
- **Header Height**: Fixed `90px` with light gray background (`#f9fafb`).
- **Footer Height**: Fixed `30px` with page numbers.

### Typography
- **Font Family**:
    - **Arabic**: Cairo
    - **English**: Segoe UI, Tahoma, Arial
    - **Numbers**: Courier New (Monospace) for perfect alignment.
- **Font Size**: Base `9pt`, Headers `16pt`/`18pt`.

### Tables
- **Width**: `100%` width with `table-layout: fixed`.
- **Borders**: Thin, crisp borders: `1px solid #e5e7eb`.
- **Headers**:
    - Background: `#f3f4f6`
    - Repeat on every page: `display: table-header-group`
- **Rows**:
    - No page breaks inside rows: `page-break-inside: avoid`
    - Zebra striping: Even rows `#f9fafb`
- **Column Widths (Standard)**:
    - Index (`#`): `50px`
    - Quantity/Units: `70px`
    - Prices/Totals: `100px`+

## 3. Implementation Rules

### ❌ Forbidden Actions
- **Do NOT** change margins in individual CSS files.
- **Do NOT** use `window.print()` directly in components.
- **Do NOT** add random colors to the print output. Keep it professional (Grayscale + Blue/Black accents).
- **Do NOT** use `px` for layout dimensions that affect page breaks; rely on the standard engine.

### ✅ Mandatory Actions
- **Use `openPrintWindow`**: Always import from `@/lib/print-utils`.
- **Clean Input**: Use the standard cleaning logic to remove buttons/inputs.
- **Test RTL**: Always verify the layout in Arabic mode.

## 4. Regression Testing Checklist
Before any release involving print changes, you MUST verify:

- [ ] **A4 Paper Size**: Does it fit perfectly without scaling?
- [ ] **Margins**: Are margins exactly 18mm/15mm?
- [ ] **Multi-page**:
    - Does the header repeat?
    - Is the footer at the bottom of *every* page?
    - Do rows break cleanly (no cut text)?
- [ ] **Data Integrity**: Are all numbers right-aligned and legible?
- [ ] **Cleanliness**: Are there any visible buttons, scrollbars, or UI artifacts?
- [ ] **PDF Match**: Does "Download PDF" look identical to the Print Preview?
