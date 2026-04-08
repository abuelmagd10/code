# Intelligent ERP AI Module Design

## Purpose

This document upgrades the current read-only AI assistant into a full Intelligent ERP layer for the existing ERB VitaSlims architecture without breaking any current workflows.

The target state is:

- AI as an interactive operational copilot
- AI as an approval and compliance intelligence layer
- AI as a forecasting and pricing engine
- AI as a governance-safe decision support system
- AI as a replacement for traditional static documentation

## Current Baseline In This Repo

The project already contains an important AI-ready foundation:

- Read-only floating assistant UI in `components/ai-assistant/index.tsx`
- Page guide orchestration in `hooks/use-ai-assistant.ts`
- Route-to-guide mapping and settings in `lib/page-guides.ts`
- Company-level AI settings in `public.company_ai_settings`
- Structured page help content in `public.page_guides`
- Strong governance and hierarchy enforcement in `lib/erp-governance-layer.ts`
- Rich approval workflows for sales delivery and returns
- Enterprise notifications and audit infrastructure already wired through the app

This means we should not build a parallel AI product. We should evolve the existing assistant into a governed ERP copilot.

## Design Principles

1. Non-breaking layer
The AI module must sit on top of current ERP flows and call existing APIs and services instead of bypassing them.

2. Governance first
AI must inherit company, branch, cost center, warehouse, role, and permission scope before it can answer or recommend.

3. Human-in-the-loop for execution
AI may recommend, explain, draft, classify, prioritize, and prepare actions. High-impact financial or inventory actions remain approved by humans unless explicitly enabled later.

4. Explainable decisions
Every recommendation must store why it was made, what data it used, confidence level, and which rule/policy influenced it.

5. Audit everywhere
Every AI interaction, recommendation, approval suggestion, and automated action must be traceable.

6. Domain-specialized intelligence
One general assistant is not enough. The system should route work to domain copilots for sales, inventory, accounting, receivables, returns, pricing, and compliance.

## Target Product Surface

### 1. AI Copilot Panel

Upgrade the current floating assistant from page guide mode into three modes:

- Guide mode
  Uses current `page_guides` and explains how to use the current page.
- Copilot mode
  Answers operational questions using company-safe ERP data.
- Action prep mode
  Prepares approval summaries, return reviews, payment explanations, and anomaly digests without directly executing protected actions.

### 2. Smart Dashboard

Add AI-powered panels to the dashboard:

- executive summary
- top risks today
- approvals needing attention
- branch health summary
- receivables deterioration watch
- low stock and stockout prediction
- margin leakage warnings
- suspicious return behavior

### 3. Intelligent Notifications

Extend the current notification system to include:

- reason for notification
- urgency score
- suggested next step
- role-aware action summary
- AI-generated briefing for managers before approval

### 4. Predictive Analytics

Add forecast modules for:

- sales by item / branch / period
- stock depletion and replenishment risk
- customer payment delay probability
- price elasticity and discount risk
- return probability and fraud likelihood

### 5. Approval Intelligence

For invoice and return workflows, AI should:

- summarize the request
- evaluate risk signals
- highlight exceptions
- recommend approve / reject / escalate
- explain the recommendation with evidence

### 6. ERP Knowledge Layer

Replace static documentation-only behavior with a blended knowledge engine:

- page guides
- governance rules
- accounting patterns
- operational runbooks
- company policies
- approved workflow definitions
- FAQ and task playbooks

## Proposed Architecture

## Layer A: Experience Layer

### Components

- `components/ai-assistant/*`
  Extend existing floating assistant into a tabbed AI workspace.
- `app/dashboard/page.tsx`
  Add AI cards and alert summaries.
- approval pages
  Embed AI recommendation widgets inside invoice, return, and refund approval screens.
- notification center
  Add “Why did I get this?” and “What should I do next?” actions.

### UX Surfaces

- floating copilot
- smart dashboard widgets
- inline approval summaries
- explain-this-record drawer
- forecast center
- anomaly inbox

## Layer B: AI Orchestration Layer

Introduce a new service layer under `lib/ai/`.

### Core modules

- `lib/ai/orchestrator.ts`
  Routes user intent to the correct domain copilot.
- `lib/ai/context-builder.ts`
  Builds scoped company/branch/role context.
- `lib/ai/policy-engine.ts`
  Applies governance, approval, and execution policies.
- `lib/ai/knowledge-service.ts`
  Fetches page guides, policies, and indexed documents.
- `lib/ai/tool-registry.ts`
  Defines which ERP tools the model may call.
- `lib/ai/explainer.ts`
  Generates user-safe explanations for decisions, balances, errors, and workflows.

### Domain copilots

- Sales copilot
- Inventory copilot
- Accounting copilot
- AR / customer balance copilot
- Returns and approvals copilot
- Pricing and forecasting copilot
- Audit and compliance copilot

## Layer C: Safe Tooling Layer

AI must never write directly to core tables.

It may only call:

- existing safe APIs under `app/api/*`
- approved RPC wrappers
- read models / materialized views
- explicit “prepare action” endpoints

### Tool categories

- Read tools
  fetch invoice summary, fetch customer balance, fetch stock state, fetch dashboard stats
- Analysis tools
  detect risk, compare behavior, summarize approvals, explain accounting
- Guarded action tools
  create draft approval memo, create reminder notification, prepare replenishment proposal

### Forbidden direct behavior

- direct SQL mutation from model
- bypassing approval flows
- posting journals directly
- changing inventory directly
- silent autonomous execution of financial actions

## Layer D: AI Data and Memory Layer

New data objects should be introduced as additive tables.

### Proposed tables

#### `ai_conversations`

Stores high-level conversation sessions.

Columns:

- `id`
- `company_id`
- `user_id`
- `branch_id`
- `page_key`
- `mode`
- `status`
- `created_at`
- `updated_at`

#### `ai_messages`

Stores user / assistant messages with safety metadata.

Columns:

- `id`
- `conversation_id`
- `role`
- `content`
- `context_snapshot`
- `tool_calls`
- `safety_flags`
- `created_at`

#### `ai_insights`

Stores generated insights for dashboard and workflows.

Columns:

- `id`
- `company_id`
- `domain`
- `entity_type`
- `entity_id`
- `insight_type`
- `severity`
- `confidence_score`
- `title_ar`
- `title_en`
- `summary_ar`
- `summary_en`
- `explanation`
- `recommended_action`
- `status`
- `expires_at`
- `created_at`

#### `ai_recommendations`

Stores formal approval and workflow recommendations.

Columns:

- `id`
- `company_id`
- `workflow_type`
- `entity_type`
- `entity_id`
- `stage`
- `recommended_decision`
- `confidence_score`
- `risk_score`
- `evidence_payload`
- `policy_hits`
- `generated_by_model`
- `generated_at`
- `accepted_by`
- `accepted_at`

#### `ai_forecasts`

Stores sales, inventory, pricing, and receivable forecasts.

Columns:

- `id`
- `company_id`
- `domain`
- `forecast_key`
- `forecast_date`
- `horizon_days`
- `input_window`
- `prediction_payload`
- `quality_score`
- `created_at`

#### `ai_tool_audit`

Stores tool calls made by AI.

Columns:

- `id`
- `company_id`
- `conversation_id`
- `tool_name`
- `tool_input`
- `tool_output_hash`
- `entity_type`
- `entity_id`
- `executed_by`
- `created_at`

#### `ai_knowledge_documents`

Indexes internal policies and guides for retrieval.

Columns:

- `id`
- `company_id` nullable for global docs
- `document_type`
- `source_path`
- `title`
- `language`
- `visibility_scope`
- `metadata`
- `indexed_at`

## Domain Coverage Map

### Sales

Capabilities:

- explain invoice status and workflow
- summarize sales performance by branch
- detect approval bottlenecks
- explain why invoice posting/payment failed
- recommend follow-up actions

Integration points:

- `app/api/invoices/route.ts`
- `app/api/invoices/[id]/post/route.ts`
- `app/api/invoices/[id]/record-payment/route.ts`
- `app/api/invoices/[id]/warehouse-approve/route.ts`

### Inventory

Capabilities:

- predict stockout risk
- recommend replenishment quantities
- detect suspicious adjustments and returns
- explain inventory movement anomalies
- produce branch/warehouse stock briefings

Integration points:

- `app/api/v2/inventory/route.ts`
- `app/api/v2/analytics/inventory/route.ts`
- `app/api/inventory-audit/route.ts`
- `app/api/inventory/product-availability/route.ts`

### Accounting

Capabilities:

- explain journal effects in plain language
- summarize period close blockers
- detect imbalance risks or stale reconciliation gaps
- explain receivables/payables movement
- prepare approval memos for finance reviewers

Integration points:

- `app/api/dashboard-stats/route.ts`
- `app/api/account-balances/route.ts`
- `app/api/accounting-audit/route.ts`
- `app/api/accounting-validation/route.ts`

### Customers and AR

Capabilities:

- predict late payment probability
- rank risky customers
- recommend collection actions
- explain customer balance composition
- detect over-credit or abnormal refund patterns

Integration points:

- `app/customers/page.tsx`
- `app/api/customer-credits/route.ts`
- `lib/customer-balance.ts`

### Returns and Approvals

Capabilities:

- evaluate return risk
- summarize return request evidence
- detect abuse patterns
- recommend approve / reject / escalate
- notify the right approver with a short decision memo

Integration points:

- `app/api/sales-return-requests/route.ts`
- `app/api/sales-return-requests/[id]/approve/route.ts`
- `app/api/sales-return-requests/[id]/warehouse-approve/route.ts`
- `lib/sales-return-requests.ts`
- `lib/sales-return-request-notifications.ts`

### Pricing and Forecasting

Capabilities:

- suggested discount bands
- margin protection warnings
- branch-level demand forecasting
- price sensitivity hints
- suggested reorder points and safety stock

## Guided Assistance Upgrade Path

The current assistant already does page help. Keep that as Phase 0 behavior.

### Current state

- page-aware
- bilingual
- settings per company
- safe because it is read-only

### Upgrade target

Add a mode switch:

- `guide`
- `copilot`
- `approvals`
- `analytics`

This keeps the current assistant alive while expanding capability.

## Approval Intelligence Design

AI should not replace approval chains. It should strengthen them.

### Example: sales return request

#### Stage 1: management approval

AI analyzes:

- invoice amount
- returned quantity ratio
- customer history
- prior returns frequency
- warehouse branch alignment
- payment state
- margin impact

AI output:

- recommendation: approve / reject / escalate
- risk score
- confidence
- explanation
- missing evidence checklist

#### Stage 2: warehouse approval

AI analyzes:

- physical receipt expectation
- stock pattern
- repeated serial abuse or quantity mismatch
- branch/warehouse consistency

AI output:

- warehouse checklist
- receipt anomaly flags
- suggested next step

### Example: warehouse invoice approval

AI analyzes:

- stock sufficiency
- branch governance
- unusual dispatch quantity
- customer risk
- timing anomaly

AI output:

- approve recommendation
- dispatch warnings
- ops note for warehouse and accountant

## Fraud and Compliance Detection

The compliance copilot should run background scans for:

- abnormal return rates by customer / user / branch
- invoice issued then quickly returned
- repeated partial returns on same SKU
- stock movement without matching operational event
- payment recorded on not-fully-approved workflow states
- unusual discounts, manual overrides, or mismatched branch context
- repeated approval/reject cycles suggesting misuse

Outputs:

- anomaly cards
- escalation notifications
- audit attachments
- periodic compliance digest for executives

## Smart Dashboard Design

### Executive cards

- today’s critical approvals
- top overdue receivables
- branches at risk of stockout
- margin drift by branch
- suspicious returns this week
- period close blockers

### Operational cards

- invoices waiting for warehouse confirmation
- returns waiting for level 1 approval
- low-stock items needing reorder
- customers likely to delay payment

## OpenAI Runtime Strategy

The AI module should use the Responses API as the primary orchestration endpoint.

Recommended model routing:

- `gpt-5.4`
  for high-stakes reasoning, approval recommendations, complex accounting explanations, and cross-domain executive summaries
- `gpt-5.4-mini`
  for interactive copilot chat, notification enrichment, dashboard summaries, and routine guided help
- `gpt-5.4-nano`
  for cheap high-volume classification, tagging, anomaly pre-scoring, routing, and background triage

Recommended tool strategy:

- File search for internal ERP guides, governance docs, accounting policies, and operational runbooks
- Function calling for safe ERP read tools and guarded action-prep tools
- Background mode plus webhooks for long-running forecasting, anomaly batches, and nightly executive digests

Optional later:

- Realtime voice assistant for warehouse and executive users

## Why This Runtime Fits This ERP

- The current ERP already has strong server-side APIs and approval gates, which map well to function calling.
- The existing `page_guides` content can seed the AI knowledge base immediately.
- Governance-heavy workflows benefit from structured, auditable outputs instead of free-form chat only.
- Long-running forecasts and scans should not block UI requests.

## Proposed API Surface

New additive routes:

- `app/api/ai/chat/route.ts`
  main copilot chat endpoint
- `app/api/ai/insights/route.ts`
  dashboard and inbox insights
- `app/api/ai/approvals/evaluate/route.ts`
  approval recommendation engine
- `app/api/ai/notifications/explain/route.ts`
  notification explanation service
- `app/api/ai/forecasts/sales/route.ts`
- `app/api/ai/forecasts/inventory/route.ts`
- `app/api/ai/pricing/recommend/route.ts`
- `app/api/ai/compliance/scan/route.ts`
- `app/api/ai/playbooks/[pageKey]/route.ts`

All of them should call:

- permission and company context resolution first
- governance context builder second
- AI orchestration last

## Security and Governance Controls

### Access control

AI response scope must always be filtered by:

- company
- branch access
- cost center when relevant
- warehouse when relevant
- role permissions

### Tool allow-list

The model must not gain generic DB access.

It may only call registered tools such as:

- `get_invoice_summary`
- `get_customer_balance_explainer`
- `get_pending_approvals`
- `get_stock_risk_snapshot`
- `prepare_return_review`
- `prepare_collection_plan`

### Action classes

- `read_only`
- `recommendation_only`
- `draft_only`
- `guarded_execution`

Guarded execution should remain off by default in production until governance acceptance is complete.

### Audit

Every AI response with operational impact should capture:

- who asked
- what page and company context
- which tools were called
- what recommendation was produced
- whether a human accepted it

## Non-Breaking Rollout Plan

## Phase 0: Upgrade Existing Assistant Foundation

Use existing:

- `company_ai_settings`
- `page_guides`
- `components/ai-assistant/*`

Add:

- new assistant modes
- conversation persistence
- page-context question answering

## Phase 1: Guided Assistance and Explainability

Deliver:

- “How do I do this?” answers
- “Why did this happen?” explanations
- “What should I do next?” operational guidance

No autonomous actions.

## Phase 2: Approval Intelligence

Deliver:

- AI approval memos for invoice warehouse approval
- AI approval memos for sales return requests
- smart role-based notification summaries

Still no autonomous approval.

## Phase 3: Predictive Analytics

Deliver:

- sales forecasts
- stock risk forecasts
- collection risk scoring
- pricing recommendations

## Phase 4: Compliance and Fraud Detection

Deliver:

- anomaly scans
- suspicious workflow detection
- audit-ready incident summaries

## Phase 5: Controlled Automation

Only after governance acceptance:

- auto-draft reminders
- auto-create follow-up tasks
- auto-prioritize approval queues

No direct financial posting without explicit executive signoff.

## Concrete First Implementation Backlog

1. Extend current assistant settings model
- add capability flags beyond `ai_mode`
- add per-company AI feature rollout controls

2. Add `lib/ai/contracts.ts`
- common typed contracts for conversations, insights, forecasts, and approval recommendations

3. Build `app/api/ai/chat/route.ts`
- page-aware, read-only copilot

4. Add `ai_conversations`, `ai_messages`, `ai_tool_audit`
- persistence and audit trail

5. Build retrieval ingestion
- sync `page_guides`
- sync governance docs
- sync accounting docs

6. Build approval evaluator
- start with sales return requests and warehouse delivery approvals

7. Add dashboard insight generator
- show AI insight cards from existing `dashboard-stats` and inventory/accounting routes

## Success Metrics

- lower time-to-approve
- lower support/documentation dependence
- faster onboarding for new users
- fewer invalid returns and approval mistakes
- faster investigation of accounting and inventory issues
- improved receivables follow-up timing
- measurable reduction in human operational errors

## Final Recommendation

The correct path is not “add a chatbot”.

The correct path is:

1. keep the current floating assistant as the safe entry point
2. evolve it into a governed ERP copilot
3. add approval intelligence and operational explainability first
4. add forecasting and anomaly detection second
5. enable selective automation only after audit and governance acceptance

This approach fits the current codebase, preserves existing ERP behavior, and turns the product into a professional Intelligent ERP platform instead of a cosmetic AI add-on.
