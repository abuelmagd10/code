-- v3.74.670 — Fix: create_notification had TWO overloads → PostgREST ambiguity
-- ------------------------------------------------------------------
-- Root cause of "notifications stopped arriving": two overloaded functions
-- existed —
--   create_notification(... 15 args, no p_kind)   -- older
--   create_notification(... 16 args, + p_kind)     -- current (v3.74.588 kind-aware)
--
-- The app calls `supabase.rpc('create_notification', {...})`. PostgREST could
-- not choose between the two candidates (PGRST203) whenever the argument set
-- did not uniquely match one overload, so EVERY notification insert failed —
-- silently, because the call sites wrap dispatch in try/catch. This affected
-- ALL notifications company-wide (bookings create/confirm/cancel, approvals,
-- warehouse, etc.), not only bookings. Bookings created after the second
-- overload was introduced received zero notifications.
--
-- Fix: drop the redundant 15-arg overload. The 16-arg version is a proper
-- superset (p_kind DEFAULT 'info'), so it serves every call — with or without
-- p_kind — as the single, unambiguous candidate.
-- Applied live via MCP; captured in supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_notification(
  uuid, character varying, uuid, character varying, text, uuid,
  uuid, uuid, uuid, character varying, uuid, character varying, text, text, text
);
