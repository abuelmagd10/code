-- =============================================================================
-- Migration: 20260408_003_ai_copilot_interactive_phase2.sql
-- Purpose : Upgrade the local ERP copilot into an interactive phase by storing
--           assistant response payloads and allowing governed management review
--           of AI conversations and audit traces.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Persist structured assistant response payloads
-- -----------------------------------------------------------------------------
ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS response_meta JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.ai_messages.response_meta IS
  'Structured interactive AI payload (metrics, insights, predicted next steps, quick prompts) for governed session restore and review.';

CREATE INDEX IF NOT EXISTS idx_ai_conversations_company_last_message
  ON public.ai_conversations(company_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_role_created
  ON public.ai_messages(conversation_id, role, created_at);

-- -----------------------------------------------------------------------------
-- 2. Governed reviewer access for management roles
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_review_company_ai(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND LOWER(COALESCE(cm.role, '')) IN ('owner', 'admin', 'general_manager', 'manager')
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_review_company_ai(UUID) TO authenticated;

DROP POLICY IF EXISTS ai_conversations_select_reviewer ON public.ai_conversations;
CREATE POLICY ai_conversations_select_reviewer
  ON public.ai_conversations
  FOR SELECT
  USING (public.can_review_company_ai(company_id));

DROP POLICY IF EXISTS ai_messages_select_reviewer ON public.ai_messages;
CREATE POLICY ai_messages_select_reviewer
  ON public.ai_messages
  FOR SELECT
  USING (public.can_review_company_ai(company_id));

DROP POLICY IF EXISTS ai_tool_audit_select_reviewer ON public.ai_tool_audit;
CREATE POLICY ai_tool_audit_select_reviewer
  ON public.ai_tool_audit
  FOR SELECT
  USING (public.can_review_company_ai(company_id));
