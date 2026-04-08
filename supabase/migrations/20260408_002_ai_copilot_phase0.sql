-- =============================================================================
-- Migration: 20260408_002_ai_copilot_phase0.sql
-- Purpose : Add phase-0/1 AI copilot persistence tables so the existing
--           page-guide assistant can evolve into a governed read-only ERP
--           copilot with conversation history and tool audit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Conversations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  page_key TEXT,
  mode TEXT NOT NULL DEFAULT 'copilot'
    CHECK (mode IN ('guide', 'copilot', 'approvals', 'analytics')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'archived')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_company_user
  ON public.ai_conversations(company_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_company_page
  ON public.ai_conversations(company_id, page_key, updated_at DESC);

COMMENT ON TABLE public.ai_conversations IS
  'Governed AI copilot conversations scoped to a company/user/page context.';

COMMENT ON COLUMN public.ai_conversations.page_key IS
  'ERP page context used to ground the copilot answer and page guide retrieval.';

-- -----------------------------------------------------------------------------
-- 2. Messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
  message_kind TEXT NOT NULL DEFAULT 'chat'
    CHECK (message_kind IN ('chat', 'guide', 'policy', 'tool_result', 'fallback')),
  context_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  tool_calls JSONB NOT NULL DEFAULT '[]'::JSONB,
  safety_flags JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
  ON public.ai_messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_messages_company_role
  ON public.ai_messages(company_id, role, created_at DESC);

COMMENT ON TABLE public.ai_messages IS
  'Conversation messages for the ERP copilot, including safe system/tool traces.';

COMMENT ON COLUMN public.ai_messages.context_snapshot IS
  'Scoped ERP context used to generate the message, stored for audit and explainability.';

-- -----------------------------------------------------------------------------
-- 3. Tool audit
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_tool_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.ai_messages(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_audit_company_tool
  ON public.ai_tool_audit(company_id, tool_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_tool_audit_conversation
  ON public.ai_tool_audit(conversation_id, created_at);

COMMENT ON TABLE public.ai_tool_audit IS
  'Audit trail of AI tool invocations, model calls, and governed ERP reads.';

-- -----------------------------------------------------------------------------
-- 4. Touch updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_ai_conversations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ai_conversations_updated_at
  ON public.ai_conversations;

CREATE TRIGGER trg_touch_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_ai_conversations_updated_at();

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_conversations_select_self ON public.ai_conversations;
CREATE POLICY ai_conversations_select_self
  ON public.ai_conversations
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND company_id IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_conversations_insert_self ON public.ai_conversations;
CREATE POLICY ai_conversations_insert_self
  ON public.ai_conversations
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_conversations_update_self ON public.ai_conversations;
CREATE POLICY ai_conversations_update_self
  ON public.ai_conversations
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND company_id IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_messages_select_self ON public.ai_messages;
CREATE POLICY ai_messages_select_self
  ON public.ai_messages
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
    AND conversation_id IN (
      SELECT id
      FROM public.ai_conversations
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_messages_insert_self ON public.ai_messages;
CREATE POLICY ai_messages_insert_self
  ON public.ai_messages
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
    AND conversation_id IN (
      SELECT id
      FROM public.ai_conversations
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_tool_audit_select_self ON public.ai_tool_audit;
CREATE POLICY ai_tool_audit_select_self
  ON public.ai_tool_audit
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND company_id IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_tool_audit_insert_self ON public.ai_tool_audit;
CREATE POLICY ai_tool_audit_insert_self
  ON public.ai_tool_audit
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (
      SELECT company_id
      FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );
